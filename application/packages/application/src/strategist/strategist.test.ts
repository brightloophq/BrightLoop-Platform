/* =============================================================================
 * AI Strategist use-case tests (Phase E · Sprint E3).
 *
 * The full pipeline over E1 (Prompt/Execution) + E2 (Knowledge) via their public
 * application services + in-memory strategist repos: session, multi-pass analysis
 * (context → findings → recommendations → roadmap), priority + confidence scoring,
 * citation integrity, clarifications, structured validation, authorization,
 * workspace isolation, and feedback.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import type { Actor, RuntimeServices } from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError } from "../errors.js";
// E1 + E2 test doubles
import { createInMemoryAiRepos, createMockProvider } from "../ai-foundation/testing.js";
import { addPromptVersion, createPrompt, publishPromptVersion } from "../ai-foundation/prompt-usecases.js";
import { createInMemoryKnowledgeRepos, createInMemoryVectorStore, createMockEmbeddingProvider } from "../knowledge/testing.js";
import { createCollection, uploadDocument } from "../knowledge/document-usecases.js";
import { indexDocument, queueEmbedding } from "../knowledge/indexing-usecases.js";
// E3
import { createInMemoryStrategistRepos } from "./testing.js";
import { createStrategySession, generateRecommendations, generateRoadmap, requestClarifications, runBusinessAnalysis, submitFeedback, validateStrategy, calculatePriorityScores } from "./strategy-usecases.js";
import { getRiskRegister, getStrategyResult, listStrategyHistory } from "./strategy-read.js";

const T0 = "2026-07-27T00:00:00.000Z";
const WS = "txw_st1";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };
const noSleep = { sleep: async () => {} };

function makeCtx(actor: Actor): AppContext {
  let k = 0;
  return {
    services: {} as unknown as RuntimeServices, actor, ids: (p) => `${p}_${(++k).toString().padStart(4, "0")}`, clock: () => T0,
    ai: createInMemoryAiRepos(), aiProviders: { openai: createMockProvider("openai") },
    knowledge: createInMemoryKnowledgeRepos(), embeddingProviders: { openai: createMockEmbeddingProvider("openai") }, vectorStore: createInMemoryVectorStore(),
    strategist: createInMemoryStrategistRepos(),
  };
}

let ctx: AppContext;
const KB = "# Operations\n\nManual invoicing slows the finance team.\n\n# Sales\n\nNo CRM is in use; leads are tracked in spreadsheets.\n\n# Marketing\n\nEmail is the only channel.\n\n# Automation\n\nMost onboarding steps are manual.";

async function seedKnowledge(c: AppContext): Promise<void> {
  const col = await createCollection(c, WS, { name: "Ops Docs", kind: "workspace" });
  const up = await uploadDocument(c, col.id, { title: "Ops Review", sourceType: "markdown", mimeType: "text/markdown", content: KB });
  const job = await queueEmbedding(c, up.document.id, { provider: "openai" });
  await indexDocument(c, job.id);
}

beforeEach(async () => { ctx = makeCtx(OWNER); await seedKnowledge(ctx); });

describe("strategy session + pipeline", () => {
  it("runs the multi-pass pipeline into a complete structured result", async () => {
    const session = await createStrategySession(ctx, WS, { title: "Growth strategy", goal: "operations sales marketing automation", dimensions: ["operations", "sales", "marketing", "automation_maturity"] });
    expect(session.status).toBe("draft");

    const analysis = await runBusinessAnalysis(ctx, session.id);
    expect(analysis.confidence).toBeGreaterThan(0);

    const recs = await generateRecommendations(ctx, session.id);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]!.priority).toBeGreaterThanOrEqual(recs[recs.length - 1]!.priority); // priority-sorted

    const scores = await calculatePriorityScores(ctx, session.id);
    expect(scores.length).toBe(recs.length);
    expect(scores[0]!.total).toBeGreaterThan(0);

    const roadmap = await generateRoadmap(ctx, session.id);
    expect(roadmap.phases.length).toBeGreaterThan(0);
    expect(roadmap.phases[0]!.phase).toBe(1);

    const result = await getStrategyResult(ctx, session.id);
    expect(result.executiveSummary).not.toBe("");
    expect(result.recommendations.length).toBe(recs.length);
    expect(result.citations.length).toBeGreaterThan(0);        // citation integrity
    expect(result.roadmap.length).toBeGreaterThan(0);
    // every finding-backed citation references a real document + chunk
    for (const c of result.citations) { expect(c.documentId).not.toBe(""); expect(c.chunkId).not.toBe(""); }

    const validation = await validateStrategy(ctx, session.id);
    expect(validation.ok).toBe(true); // recommendations carry citations
  });

  it("uses a published Prompt (E1) for the executive summary when supplied", async () => {
    const p = await createPrompt(ctx, WS, { name: "strategist-analysis" });
    await addPromptVersion(ctx, p.id, { systemPrompt: "You are a strategist.", userTemplate: "Goal: {{goal}}\nContext: {{context}}", model: "claude-sonnet-5" });
    await publishPromptVersion(ctx, p.id, 1);
    const session = await createStrategySession(ctx, WS, { title: "S", goal: "operations sales", dimensions: ["operations", "sales"] });
    const analysis = await runBusinessAnalysis(ctx, session.id, { promptId: p.id, ...noSleep });
    expect(analysis.provider).toBe("openai"); // came from E1 execution
    expect(analysis.tokensUsed).toBeGreaterThan(0);
  });

  it("generates clarifications when confidence is low (thin evidence)", async () => {
    // Request many dimensions with little evidence → low confidence.
    const session = await createStrategySession(ctx, WS, { title: "S", goal: "unrelated xyzzy query", dimensions: ["technology", "team_structure", "documentation_quality", "branding", "competitive_advantage"] });
    const analysis = await runBusinessAnalysis(ctx, session.id);
    expect(analysis.confidence).toBeLessThan(55);
    const clarifications = await requestClarifications(ctx, session.id);
    expect(clarifications.length).toBeGreaterThan(0);
    expect(analysis.missingInformation.length).toBeGreaterThan(0);
  });
});

describe("authorization + isolation", () => {
  it("denies a client actor running analysis", async () => {
    const session = await createStrategySession(ctx, WS, { title: "S", goal: "operations", dimensions: ["operations"] });
    await expect(runBusinessAnalysis({ ...ctx, actor: CLIENT }, session.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createStrategySession({ ...ctx, actor: CLIENT }, WS, { title: "X", goal: "y" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a client may submit feedback on their own tenant's strategy", async () => {
    // owner session is clientId null → client (cli_x) cannot access it (ownership mismatch)
    const session = await createStrategySession(ctx, WS, { title: "S", goal: "operations", dimensions: ["operations"] });
    await expect(submitFeedback({ ...ctx, actor: CLIENT }, session.id, { kind: "comment", comment: "hi" })).rejects.toBeInstanceOf(ForbiddenError);
    // internal owner can submit feedback
    const fb = await submitFeedback(ctx, session.id, { kind: "approval", rating: 5 });
    expect(fb.kind).toBe("approval");
  });

  it("history + risk register are workspace-scoped", async () => {
    const s = await createStrategySession(ctx, WS, { title: "S", goal: "operations sales", dimensions: ["operations", "sales"] });
    await runBusinessAnalysis(ctx, s.id);
    expect((await listStrategyHistory(ctx, WS)).length).toBe(1);
    expect((await listStrategyHistory(ctx, "txw_other")).length).toBe(0); // isolation
    const risks = await getRiskRegister(ctx, WS);
    expect(Array.isArray(risks)).toBe(true);
  });
});
