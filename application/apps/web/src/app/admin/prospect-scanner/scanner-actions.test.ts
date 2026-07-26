/* =============================================================================
 * Prospect Scanner action + surface tests (Phase C · Sprint C4 §17).
 *
 * Exercises the real server actions through the real C1 use-cases against the
 * deterministic in-memory runtime. Only the SESSION seam is doubled. No network,
 * no provider, no paid call.
 * ========================================================================== */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Actor, RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";

const session = vi.hoisted(() => ({ actor: null as Actor | null, services: null as RuntimeServices | null }));
const redirects = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: async () => session.actor }));
vi.mock("@/lib/repositories", () => ({ getRuntimeServices: async () => session.services, getExecutionRepositories: async () => ({ workspaces: {}, initiatives: {}, activities: {} }), getCollaborationRepositories: async () => ({ subscriptions: {}, mentions: {}, notifications: {}, inbox: {}, readReceipts: {} }), getAiFoundationRepositories: async () => ({ providers: {}, prompts: {}, promptVersions: {}, executions: {}, results: {}, usage: {}, costs: {}, audit: {}, conversations: {}, messages: {}, evaluations: {} }), getAiProviderRegistry: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    redirects.calls.push(url);
    throw new Error("NEXT_REDIRECT");
  },
}));

import { createProspectScanAction, cancelProspectScanAction, retryProspectScanAction, createProspectScanState } from "./scanner-actions";

const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "t_acme" };

let counter = 0;

function form(overrides: Record<string, string> = {}, omit: string[] = []): FormData {
  const base: Record<string, string> = {
    clientId: "t_acme",
    websiteUrl: "https://example.com",
    businessName: "Example Co",
    maxPages: "5",
    reasoningMode: "standard",
    costAcknowledged: "yes",
    scanAuthorized: "yes",
    ...overrides,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) {
    if (omit.includes(k) || v === "") continue;
    fd.set(k, v);
  }
  return fd;
}

beforeEach(() => {
  counter = 0;
  redirects.calls = [];
  const repo = new InMemoryRuntimeRepository(() => new Date().toISOString());
  session.services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++counter).toString().padStart(5, "0")}` });
  session.actor = OWNER;
});

/* ===== authorization ========================================================= */
describe("authorization", () => {
  it("refuses an unauthenticated caller", async () => {
    session.actor = null;
    const result = await createProspectScanAction(form());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not signed in/i);
  });

  it("allows an internal owner", async () => {
    const result = await createProspectScanAction(form());
    expect(result.ok).toBe(true);
    expect(result.id).toBeTruthy();
  });

  it("allows an internal team_member (operations role)", async () => {
    session.actor = TEAM;
    const result = await createProspectScanAction(form());
    expect(result.ok).toBe(true);
  });

  it("denies a client role — the scanner is internal only", async () => {
    session.actor = CLIENT;
    const result = await createProspectScanAction(form());
    expect(result.ok).toBe(false);
    expect(result.id).toBeUndefined();
  });

  it("denies a client role on cancel and retry too", async () => {
    const created = await createProspectScanAction(form());
    session.actor = CLIENT;
    expect((await cancelProspectScanAction(created.id!)).ok).toBe(false);
    expect((await retryProspectScanAction(created.id!)).ok).toBe(false);
  });
});

/* ===== creation + validation ================================================= */
describe("scan creation", () => {
  it("stores the prospect envelope on the run so the crawler can read the target", async () => {
    const result = await createProspectScanAction(form({ businessName: "Acme", industry: "Retail" }));
    expect(result.ok).toBe(true);
    const run = await session.services!.runs.getRun(result.id!);
    expect(run.ok).toBe(true);
    if (run.ok) {
      expect(run.value.metadata).toMatchObject({ rootUrl: "https://example.com", businessName: "Acme", industry: "Retail", maxPages: 5 });
    }
  });

  it("rejects an invalid target BEFORE creating anything", async () => {
    const result = await createProspectScanAction(form({ websiteUrl: "http://127.0.0.1" }));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.["websiteUrl"]).toBeDefined();
    const listed = await session.services!.runs.list({ limit: 10 });
    if (listed.ok) expect(listed.value).toHaveLength(0);
  });

  it("returns every field error at once without creating a run", async () => {
    const result = await createProspectScanAction(form({}, ["websiteUrl", "scanAuthorized"]));
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["websiteUrl", "scanAuthorized"]));
  });

  it("queues the first stage but executes nothing", async () => {
    const result = await createProspectScanAction(form());
    const run = await session.services!.runs.getRun(result.id!);
    if (run.ok) {
      // Created and queued — never advanced by the act of creating.
      expect(run.value.status).toBe("pending");
      expect(run.value.completedAt).toBeNull();
    }
  });
});

/* ===== duplicate submission =================================================== */
describe("duplicate submission", () => {
  it("creates a distinct scan per submit and never reuses a run id", async () => {
    const a = await createProspectScanAction(form());
    const b = await createProspectScanAction(form());
    expect(a.ok && b.ok).toBe(true);
    expect(a.id).not.toBe(b.id);
  });

  it("redirects into the new workspace on success (one navigation, one scan)", async () => {
    await expect(createProspectScanState({ ok: false }, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(redirects.calls).toHaveLength(1);
    expect(redirects.calls[0]).toMatch(/^\/admin\/prospect-scanner\/run_/);
  });

  it("returns state (no redirect) when validation fails, so the form can re-render errors", async () => {
    const state = await createProspectScanState({ ok: false }, form({}, ["websiteUrl"]));
    expect(state.ok).toBe(false);
    expect(redirects.calls).toHaveLength(0);
  });
});

/* ===== cancel / retry ========================================================= */
describe("cancel and retry", () => {
  it("cancels a live scan", async () => {
    const created = await createProspectScanAction(form());
    const result = await cancelProspectScanAction(created.id!);
    expect(result.ok).toBe(true);
    const run = await session.services!.runs.getRun(created.id!);
    if (run.ok) expect(run.value.status).toBe("cancelled");
  });

  it("reports a canonical error instead of throwing when retry is ineligible", async () => {
    const created = await createProspectScanAction(form());
    const result = await retryProspectScanAction(created.id!);
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error).not.toMatch(/stack|SQLSTATE|at Object/i);
  });

  it("reports a canonical error for an unknown run rather than leaking existence", async () => {
    const result = await cancelProspectScanAction("run_does_not_exist");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

/* ===== surface invariants ===================================================== */
describe("surface invariants", () => {
  const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
  /** Strip comments so these assertions test CODE, not the prose describing it. */
  const code = (relative: string) => read(relative).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const componentFiles = [
    "components/ScanHeader.tsx",
    "components/ScanControls.tsx",
    "components/StageReadiness.tsx",
    "components/DiscoverySummary.tsx",
    "components/PageEvidenceTable.tsx",
    "components/EvidenceCoverage.tsx",
    "components/ReasoningReadiness.tsx",
    "components/ExecutionResult.tsx",
    "components/RuntimeTimeline.tsx",
    "components/StructuredArtifactView.tsx",
    "components/ProspectSummary.tsx",
    "components/ProspectScanForm.tsx",
    "components/KillSwitches.tsx",
  ];

  it("never renders raw HTML anywhere in the scanner", () => {
    for (const file of componentFiles) {
      expect(code(file), file).not.toContain("dangerouslySetInnerHTML");
    }
    expect(code("page.tsx")).not.toContain("dangerouslySetInnerHTML");
    expect(code("[id]/page.tsx")).not.toContain("dangerouslySetInnerHTML");
  });

  it("starts no timer, interval, or polling loop", () => {
    for (const file of componentFiles) {
      const source = code(file);
      expect(source, file).not.toMatch(/setInterval|setTimeout|requestAnimationFrame|new WebSocket|EventSource/);
    }
  });

  it("executes stages only through the internal run-once entry point", () => {
    const controls = read("components/ScanControls.tsx");
    const endpoints = controls.match(/fetch\(\s*"([^"]+)"/g) ?? [];
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0]).toContain("/api/internal/runtime/run-once");
  });

  it("supports reduced motion and mobile layouts in the stylesheet", () => {
    const css = read("scanner.module.css");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("@media (max-width: 900px)");
  });

  it("labels interactive regions for assistive technology", () => {
    expect(read("components/KillSwitches.tsx")).toContain('aria-label="Runtime kill switches"');
    expect(read("components/ScanControls.tsx")).toContain('role="alert"');
    expect(read("components/ScanControls.tsx")).toContain('aria-live="polite"');
    expect(read("page.tsx")).toContain("aria-busy");
  });

  it("gates both scanner pages on an internal capability", () => {
    for (const file of ["page.tsx", "[id]/page.tsx"]) {
      const source = read(file);
      expect(source, file).toContain('requireSurface("admin")');
      expect(source, file).toContain("assertCapability");
    }
  });
});
