/* =============================================================================
 * Assessment route integration tests (Phase C · Sprint C6).
 *
 * Exercises the real route handlers → @brightloop/application → in-memory runtime.
 * Only the session seam is doubled. Proves authorization, the blocked/completed
 * outcomes over the wire, and that a client role is denied. No network, no
 * provider.
 * ========================================================================== */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Actor, RuntimeServices } from "@brightloop/domain";
import { createRuntimeServices, InMemoryRuntimeRepository } from "@brightloop/domain";

const session = vi.hoisted(() => ({ actor: null as Actor | null, services: null as RuntimeServices | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getActor: async () => session.actor }));
vi.mock("@/lib/repositories", () => ({ getRuntimeServices: async () => session.services, getExecutionRepositories: async () => ({ workspaces: {}, initiatives: {}, activities: {} }), getCollaborationRepositories: async () => ({ subscriptions: {}, mentions: {}, notifications: {}, inbox: {}, readReceipts: {} }), getAiFoundationRepositories: async () => ({ providers: {}, prompts: {}, promptVersions: {}, executions: {}, results: {}, usage: {}, costs: {}, audit: {}, conversations: {}, messages: {}, evaluations: {} }), getAiProviderRegistry: () => ({}), getKnowledgeRepositories: async () => ({ collections: {}, documents: {}, versions: {}, chunks: {}, vectors: {}, jobs: {}, sessions: {}, contexts: {}, citations: {}, permissions: {}, sources: {} }), getEmbeddingProviderRegistry: () => ({}), getVectorStore: async () => ({}) }));

import { POST as assessRoute } from "./[id]/assess/route";
import { GET as assessmentRoute } from "./[id]/assessment/route";

const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "t_acme" };

let counter = 0;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

const MANIFEST = {
  kind: "discovery_manifest",
  observability: { planned: 1, allowed: 1, fetched: 1, excluded: 0, failed: 0, robotsBlocked: 0, ssrfBlocked: 0, bytesFetched: 1000, redirectCount: 0, durationMs: 10, robotsFetched: true, injectionFlaggedPages: 0, contentTypes: { "text/html": 1 } },
  pages: [
    {
      targetId: "t:homepage", requestedUrl: "https://acme.test/", finalUrl: "https://acme.test/", status: 200, kind: "homepage", outcome: "ok", reason: null, bytes: 1000, lastModified: "2026-07-24T00:00:00.000Z", collectedAt: "2026-07-24T00:00:00.000Z",
      extract: { title: "Acme", metaDescription: "d", canonicalUrl: "https://acme.test/", language: "en", headings: ["h"], visibleText: "consulting services", internalLinks: ["https://acme.test/about"], externalLinks: [], forms: [{ method: "post", action: "/x", inputCount: 1 }], emails: ["a@acme.test"], phones: [], socialLinks: ["https://facebook.com/acme"], jsonLdTypes: ["Organization"], seo: { hasTitle: true, hasMetaDescription: true, hasCanonical: true, hasH1: true, h1Count: 1, wordCount: 700 }, accessibility: { imageCount: 4, imagesWithAlt: 4, hasLangAttribute: true, hasViewportMeta: true } },
    },
  ],
};

beforeEach(() => {
  counter = 0;
  const now = () => "2026-07-24T00:00:00.000Z";
  const repo = new InMemoryRuntimeRepository(now);
  session.services = createRuntimeServices({ repo, ids: (p) => `${p}_${(++counter).toString().padStart(5, "0")}`, clock: now });
  session.actor = OWNER;
});

async function seed(withManifest: boolean): Promise<string> {
  const created = await session.services!.coordinator.initializeRun({ clientId: "t_acme", scanId: "scan", metadata: {}, deadline: null });
  if (!created.ok) throw new Error("seed");
  const runId = created.value.run.id;
  if (withManifest) await session.services!.artifacts.persist({ runId, clientId: "t_acme", scanId: "scan", kind: "discovery_manifest", envelope: MANIFEST, validationStatus: "valid" });
  return runId;
}

describe("POST /api/scans/:id/assess", () => {
  it("401s when unauthenticated", async () => {
    session.actor = null;
    const res = await assessRoute(new Request("http://x", { method: "POST" }), params("run_x"));
    expect(res.status).toBe(401);
  });

  it("denies a client role (403)", async () => {
    const runId = await seed(true);
    session.actor = CLIENT;
    const res = await assessRoute(new Request("http://x", { method: "POST" }), params(runId));
    expect(res.status).toBe(403);
  });

  it("returns a blocked outcome when no discovery manifest exists", async () => {
    const runId = await seed(false);
    const res = await assessRoute(new Request("http://x", { method: "POST" }), params(runId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("blocked");
    expect(body.blockedReason).toBe("discovery_manifest_missing");
  });

  it("completes and produces reviewable artifacts", async () => {
    const runId = await seed(true);
    const res = await assessRoute(new Request("http://x", { method: "POST" }), params(runId));
    const body = await res.json();
    expect(["completed", "completed_with_gaps"]).toContain(body.status);
    expect(body.reviewRequired).toBe(true);
    expect(body.artifactIds.report).toBeTruthy();

    const read = await assessmentRoute(new Request("http://x"), params(runId));
    const dto = await read.json();
    expect(dto.present).toBe(true);
    expect(dto.reviewRequired).toBe(true);
    expect(dto.report.validationStatus).toBe("unvalidated");
  });
});
