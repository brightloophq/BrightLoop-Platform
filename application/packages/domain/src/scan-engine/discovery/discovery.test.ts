import { describe, it, expect } from "vitest";
import { discoveryRequestSchema, robotsPolicySchema, type DiscoveryRetryPolicy } from "@brightloop/schema";
import { discoveryRetryPolicySchema } from "@brightloop/schema";
import { normalizeUrl, canonicalRoot, dedupeUrls, sameNormalized, parseUrl, isSupportedScheme } from "./url.js";
import { resolveDomain, apexOf } from "./resolve.js";
import { evaluateSsrf, isSsrfSafe } from "./security.js";
import { generatePlan, CANONICAL_PATHS } from "./plan.js";
import { parseRobots, isPathAllowed } from "./robots.js";
import { planSession, buildResult, toEvidenceIngress, sourceForKind } from "./session.js";
import { nextState, canTransition, isTerminal, newCheckpoint, applyEvent, completeTarget, resume, shouldRetry, backoffMs, isFatal } from "./statemachine.js";

const NOW = "2026-07-20T00:00:00.000Z";
const policy: DiscoveryRetryPolicy = discoveryRetryPolicySchema.parse({});
const request = (over: Record<string, unknown> = {}) => discoveryRequestSchema.parse({ scanId: "s1", clientId: null, rootUrl: "https://example.com", ...over });

/* ---- URL normalization ---------------------------------------------------- */
describe("URL normalization", () => {
  it("lower-cases scheme+host, strips www + default port + trailing slash", () => {
    const n = normalizeUrl("HTTP://WWW.Example.com:80/Path/");
    expect(n.valid).toBe(true);
    expect(n.scheme).toBe("http");
    expect(n.host).toBe("example.com");
    expect(n.port).toBeNull();
    expect(n.normalized).toBe("http://example.com/Path");
    expect(canonicalRoot("https://a.com/x")).toBe("https://a.com");
  });
  it("rejects empty / invalid / unsupported-scheme", () => {
    expect(normalizeUrl("").reason).toBe("empty");
    expect(normalizeUrl("not a url").reason).toBe("invalid_url");
    expect(normalizeUrl("ftp://example.com").reason).toBe("unsupported_scheme");
    expect(isSupportedScheme("https:")).toBe(true);
    expect(parseUrl("mailto:x@y.com")).toBeNull();
  });
});

/* ---- duplicate detection -------------------------------------------------- */
describe("duplicate detection", () => {
  it("dedupes by normalized form; root slash is equivalent", () => {
    expect(sameNormalized("http://example.com", "http://example.com/")).toBe(true);
    const { unique, duplicates } = dedupeUrls(["http://a.com/", "http://a.com", "https://b.com", "bad"]);
    expect(unique).toEqual(["http://a.com", "https://b.com"]);
    expect(duplicates).toEqual(["http://a.com"]);
  });
});

/* ---- domain resolution ---------------------------------------------------- */
describe("domain resolution (no DNS)", () => {
  it("splits apex / subdomain / path root / tenant scope", () => {
    const d = resolveDomain("https://blog.example.com/posts/1")!;
    expect(d.apex).toBe("example.com");
    expect(d.subdomain).toBe("blog");
    expect(d.pathRoot).toBe("/posts");
    expect(d.tenantScope).toBe("blog");
    expect(resolveDomain("https://www.example.com")!.subdomain).toBeNull(); // www stripped
    expect(apexOf("a.b.c.com")).toBe("c.com");
    expect(resolveDomain("bad")).toBeNull();
  });
});

/* ---- SSRF security -------------------------------------------------------- */
describe("SSRF security contracts", () => {
  it("flags loopback / localhost / rfc1918 / link-local / schemes / credentials", () => {
    expect(evaluateSsrf("http://127.0.0.1/").reasons).toContain("loopback");
    expect(evaluateSsrf("http://localhost/").reasons).toContain("localhost");
    expect(evaluateSsrf("http://10.1.2.3/").reasons).toContain("private_rfc1918");
    expect(evaluateSsrf("http://172.16.0.1/").reasons).toContain("private_rfc1918");
    expect(evaluateSsrf("http://192.168.0.1/").reasons).toContain("private_rfc1918");
    expect(evaluateSsrf("http://169.254.1.1/").reasons).toContain("link_local");
    expect(evaluateSsrf("file:///etc/passwd").reasons).toContain("file_scheme");
    expect(evaluateSsrf("ftp://example.com/").reasons).toContain("ftp_scheme");
    expect(evaluateSsrf("http://user:pass@example.com/").reasons).toContain("credentials_in_url");
    expect(evaluateSsrf("gopher://x").reasons).toContain("unsupported_scheme");
  });
  it("allows a clean public https URL", () => {
    const v = evaluateSsrf("https://example.com/about");
    expect(v.allowed).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(isSsrfSafe("https://example.com")).toBe(true);
  });
});

/* ---- crawl plan ----------------------------------------------------------- */
describe("crawl plan generation", () => {
  it("homepage first, priority-ordered, canonical set", () => {
    const plan = generatePlan("https://example.com");
    expect(plan.targets[0]).toMatchObject({ kind: "homepage", path: "/", priority: 0, depth: 0 });
    expect(plan.targets).toHaveLength(CANONICAL_PATHS.length);
    const priorities = plan.targets.map((t) => t.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b)); // non-decreasing
  });
  it("custom paths, maxPages cap, maxDepth filter", () => {
    expect(generatePlan("https://x.com", { customPaths: ["team"] }).targets.some((t) => t.kind === "custom" && t.path === "/team")).toBe(true);
    expect(generatePlan("https://x.com", { maxPages: 3 }).targets).toHaveLength(3);
    expect(generatePlan("https://x.com", { maxDepth: 0 }).targets.map((t) => t.kind)).toEqual(["homepage"]);
    expect(generatePlan("https://x.com")).toEqual(generatePlan("https://x.com")); // deterministic
  });
});

/* ---- robots policy -------------------------------------------------------- */
describe("robots policy parsing (no fetching)", () => {
  it("parses disallow/allow/sitemap/crawl-delay for the matching agent", () => {
    const p = parseRobots("User-agent: *\nDisallow: /admin\nAllow: /admin/public\nSitemap: https://x/sitemap.xml\nCrawl-delay: 5", "AuxionBot");
    expect(p.allowAll).toBe(false);
    expect(p.blockedPaths).toEqual(["/admin"]);
    expect(p.sitemaps).toEqual(["https://x/sitemap.xml"]);
    expect(p.crawlDelaySeconds).toBe(5);
    expect(isPathAllowed(p, "/admin")).toBe(false);
    expect(isPathAllowed(p, "/admin/public")).toBe(true); // longer Allow overrides
    expect(isPathAllowed(p, "/")).toBe(true);
  });
  it("only the matching user-agent group applies", () => {
    const p = parseRobots("User-agent: OtherBot\nDisallow: /\nUser-agent: *\nDisallow: /private", "AuxionBot");
    expect(p.blockedPaths).toEqual(["/private"]);
    expect(isPathAllowed(p, "/anything")).toBe(true);
  });
});

/* ---- state machine -------------------------------------------------------- */
describe("discovery state machine", () => {
  it("legal transitions only; terminal states are sinks", () => {
    expect(nextState("pending", "start")).toBe("running");
    expect(nextState("running", "pause")).toBe("paused");
    expect(nextState("paused", "resume")).toBe("running");
    expect(nextState("running", "complete")).toBe("completed");
    expect(nextState("completed", "start")).toBeNull();
    expect(canTransition("pending", "pause")).toBe(false);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("running")).toBe(false);
  });
});

/* ---- checkpoint resume ---------------------------------------------------- */
describe("checkpoint + resume", () => {
  it("tracks completed/pending; resume replays only pending and bumps attempt", () => {
    let cp = newCheckpoint("sess", ["a", "b"], NOW);
    expect(cp.state).toBe("pending");
    cp = applyEvent(cp, "start", NOW);
    expect(cp.state).toBe("running");
    cp = completeTarget(cp, "a", NOW);
    expect(cp.completedTargetIds).toEqual(["a"]);
    expect(cp.pendingTargetIds).toEqual(["b"]);
    cp = applyEvent(cp, "pause", NOW);
    const resumed = resume(cp, NOW);
    expect(resumed.state).toBe("running");
    expect(resumed.attempt).toBe(1);
    expect(resumed.pendingTargetIds).toEqual(["b"]); // completed work not repeated
    expect(applyEvent(cp, "start", NOW)).toEqual(cp); // illegal event → unchanged
  });
});

/* ---- retry policy --------------------------------------------------------- */
describe("retry policy", () => {
  it("distinguishes fatal vs retryable; exponential backoff exhausts", () => {
    expect(shouldRetry(0, "timeout", policy)).toBe(true);
    expect(shouldRetry(0, "ssrf_blocked", policy)).toBe(false); // fatal
    expect(shouldRetry(policy.maxRetries, "timeout", policy)).toBe(false); // exhausted
    expect(isFatal("robots_disallow", policy)).toBe(true);
    expect(backoffMs(1, policy)).toBe(1000);
    expect(backoffMs(2, policy)).toBe(2000);
    expect(backoffMs(policy.maxRetries + 1, policy)).toBeNull();
  });
});

/* ---- session orchestration + manifest + ingress --------------------------- */
describe("session orchestration", () => {
  it("plans a pending session over all targets", () => {
    const s = planSession(request(), NOW);
    expect(s.id).toBe("disc:s1");
    expect(s.checkpoint.state).toBe("pending");
    expect(s.checkpoint.pendingTargetIds).toHaveLength(s.plan.targets.length);
  });
  it("builds a result: clean root → all allowed; deterministic checksum", () => {
    const s = planSession(request(), NOW);
    const r = buildResult(s, NOW);
    expect(r.summary.allowed).toBe(s.plan.targets.length);
    expect(r.summary.excluded).toBe(0);
    expect(r.manifest.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(buildResult(s, NOW)).toEqual(r); // deterministic
    expect(buildResult(planSession(request({ rootUrl: "https://other.com" }), NOW), NOW).manifest.checksum).not.toBe(r.manifest.checksum);
  });
  it("SSRF excludes a private root; robots excludes a blocked path", () => {
    const ssrf = buildResult(planSession(request({ rootUrl: "http://localhost" }), NOW), NOW);
    expect(ssrf.summary.ssrfBlocked).toBeGreaterThan(0);
    expect(ssrf.summary.allowed).toBe(0);
    const s = planSession(request(), NOW);
    const withRobots = { ...s, robots: parseRobots("User-agent: *\nDisallow: /about") };
    const r = buildResult(withRobots, NOW);
    expect(r.summary.blockedByRobots).toBe(1);
    expect(r.excluded.some((e) => e.reason === "robots_disallow")).toBe(true);
  });
  it("EvidenceIngress maps targets to sources (homepage→website, else→pages)", () => {
    const r = buildResult(planSession(request(), NOW), NOW);
    const ingress = toEvidenceIngress(r);
    expect(ingress.items).toHaveLength(r.targets.length);
    expect(ingress.items.find((i) => i.kind === "homepage")!.source).toBe("website");
    expect(ingress.items.find((i) => i.kind === "about")!.source).toBe("pages");
    expect(ingress.items[0]!.provenanceHint).toMatchObject({ method: "crawl", stage: "discovery" });
    expect(sourceForKind("pricing")).toBe("pages");
  });
  it("edge case: empty custom paths + valid schema output", () => {
    const r = buildResult(planSession(request({ customPaths: [] }), NOW), NOW);
    expect(robotsPolicySchema.parse(parseRobots(""))).toBeDefined();
    expect(r.metrics.uniqueHosts).toBe(1);
  });
});
