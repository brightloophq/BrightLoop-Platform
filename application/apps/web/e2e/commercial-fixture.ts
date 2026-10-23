import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createRuntimeServices, runCompetitorIntelligence, type RuntimeResult } from "@brightloop/domain";
import { SupabaseRuntimeRepository } from "@brightloop/data";
import { commercialProposalSchema, clientNarrativeSchema } from "@brightloop/schema";
import { expect, type Page } from "@playwright/test";

function value<T>(result: RuntimeResult<T>): T {
  if (!result.ok) throw new Error(`Browser fixture failed: ${result.code}`);
  return result.value;
}

/** Real local auth + persisted version fixtures; no production auth bypass.
 * Retained for diagnosis: immutable history intentionally forbids cleanup deletes.
 */
export async function commercialFixture(role: "owner" | "team_member" = "owner", expiry: string | null = "2099-12-31", options: { client?: boolean; currency?: string } = {}) {
  const url = process.env["SUPABASE_TEST_URL"];
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname) || !process.env["AUXION_DISPOSABLE_PROJECT"]) throw new Error("Disposable loopback database required");
  const service = createClient(url, process.env["SUPABASE_TEST_SERVICE_KEY"]!, { auth: { persistSession: false } });
  const id = randomUUID();
  const email = `browser-${id}@auxion.example.test`;
  const password = `Local-${randomUUID()}!`;
  const auth = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role } });
  if (auth.error || !auth.data.user) throw new Error("Local auth fixture creation failed");
  // Also supports deployments that enable the project's custom-access-token hook.
  await service.from("users").insert({ id: auth.data.user.id, auth_user_id: auth.data.user.id,
    name: "Browser acceptance", email, role, status: "active" }).throwOnError();
  const clientId = options.client ? `cli_${id.replaceAll("-", "")}` : null;
  if (clientId) await service.from("clients").insert({ id: clientId, company: "Browser acceptance fixture", industry: "Services" }).throwOnError();
  const services = createRuntimeServices({ repo: new SupabaseRuntimeRepository(service), ids: (p) => `${p}_${randomUUID()}` });
  const run = value(await services.runs.createRun({ clientId, scanId: `browser_${id}`, metadata: { businessName: "Browser acceptance fixture" } }));
  value(await services.runs.completeRun(run.id));
  const base = { runId: run.id, clientId: null, scanId: run.scanId, version: 1 };
  const report = value(await services.artifacts.persist({ ...base, kind: "internal_intelligence_report", validationStatus: "valid",
    envelope: { executiveOverview: "Local commercial acceptance fixture.", risks: [], opportunities: [], confidence: { value: 70, band: "high" } } }));
  const competitor = runCompetitorIntelligence({ scanId: run.scanId, evidence: [], now: new Date().toISOString() });
  value(await services.artifacts.persist({ ...base, kind: "competitor_snapshot", validationStatus: "valid", envelope: competitor as unknown as Record<string, unknown>, checksum: competitor.checksum }));
  const now = new Date().toISOString();
  const proposalEnvelope = commercialProposalSchema.parse({ id: `cp_${id}`, scanId: run.scanId, clientId: null,
    status: "draft_ready", commercialState: "priced", executiveSummary: "Local commercial acceptance fixture.", observedSituation: "Verified local evidence.",
    keyIssues: [], opportunities: [], recommendedWork: [{ sourceId: "work1", title: "Improve performance", solution: "Optimize pages", priority: "high", effort: "Medium", evidenceIds: ["ev1"] }],
    proposedNextStep: "Review the commercial package.", supportingEvidenceIds: ["ev1"], confidence: { value: 70, band: "high" },
    sourceArtifacts: [report.id], checksum: `proposal_${id}`, generatedAt: now,
    pricing: { currency: options.currency ?? "USD", items: [{ sourceId: "work1", pricingType: "one_time", amountMinor: 10000, quantity: 3, adminNotes: "Retain this line note" }], discountMinor: 500,
      subtotalOneTimeMinor: 30000, totalOneTimeMinor: 29500, totalRecurringMonthlyMinor: 0, validUntil: expiry, commercialNotes: "Keep these proposal notes", pricedBy: auth.data.user.id, pricedAt: now } });
  const proposal = value(await services.proposals.save({ ...base, status: "needs_review", sourceArtifactIds: [report.id], envelope: proposalEnvelope, checksum: proposalEnvelope.checksum }));
  const narrativeEnvelope = clientNarrativeSchema.parse({ id: `cn_${id}`, scanId: run.scanId, clientId: null, audience: "client", status: "ready", sections: [
    { key: "observed", heading: "What we observed", paragraphs: ["Local acceptance evidence."], supportingArtifacts: [report.id] }],
    confidence: { value: 70, band: "high" }, sourceArtifacts: [report.id, proposal.id], checksum: `narrative_${id}`, generatedAt: now });
  const narrative = value(await services.narratives.save({ ...base, audience: "client", status: "needs_review", sourceArtifactIds: [report.id], envelope: narrativeEnvelope, checksum: narrativeEnvelope.checksum }));
  // Mark the already-generated commercial workflow's first job complete using its
  // real idempotency key, so page reads cannot regenerate these reviewed fixtures.
  const job = value(await services.queue.enqueue({ jobType: "commercial_intelligence", runId: run.id, scanId: run.scanId, clientId: null, stage: "competitor_intelligence" }));
  await service.from("job_queue").update({ status: "completed" }).eq("id", job.id).throwOnError();
  const reviseNarrative = async () => value(await services.narratives.save({ ...base, version: 2, audience: "client", status: "needs_review",
    sourceArtifactIds: [report.id], supersedesId: narrative.id, checksum: `narrative_${id}_v2`, envelope: { ...narrativeEnvelope, checksum: `narrative_${id}_v2`, sections: [
      { ...narrativeEnvelope.sections[0]!, paragraphs: ["Revised local acceptance narrative."] }] } }));
  const reviseProposal = async () => value(await services.proposals.save({ ...base, version: 2, status: "needs_review", sourceArtifactIds: [report.id],
    supersedesId: proposal.id, envelope: { ...proposalEnvelope, checksum: `proposal_${id}_v2`, pricing: { ...proposalEnvelope.pricing!, items: [{ ...proposalEnvelope.pricing!.items[0]!, amountMinor: 11000 }], subtotalOneTimeMinor: 33000, totalOneTimeMinor: 32500 } } }));
  return { runId: run.id, email, password, clientId, reviseNarrative, reviseProposal };
}

export async function signIn(page: Page, fixture: Awaited<ReturnType<typeof commercialFixture>>) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin/prospect-scanner/${fixture.runId}`);
}

export async function clientPortalFixture(clientId: string) {
  const url = process.env["SUPABASE_TEST_URL"]!;
  const service = createClient(url, process.env["SUPABASE_TEST_SERVICE_KEY"]!, { auth: { persistSession: false } });
  const id = randomUUID();
  const email = `browser-client-${id}@auxion.example.test`;
  const password = `Local-${randomUUID()}!`;
  const auth = await service.auth.admin.createUser({ email, password, email_confirm: true,
    app_metadata: { role: "client_admin", client_id: clientId } });
  if (auth.error || !auth.data.user) throw new Error("Local client portal fixture creation failed");
  await service.from("users").insert({ id: auth.data.user.id, auth_user_id: auth.data.user.id,
    name: "Browser client fixture", email, role: "client_admin", client_id: clientId, status: "active" }).throwOnError();
  await service.from("clients").update({ lifecycle: "member" }).eq("id", clientId).throwOnError();
  return { email, password };
}

export async function signInClient(page: Page, fixture: Awaited<ReturnType<typeof clientPortalFixture>>) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(fixture.email);
  await page.getByLabel("Password", { exact: true }).fill(fixture.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await page.goto("/portal/proposals");
}

export const packagePanel = (page: Page) => page.locator("section").filter({ has: page.getByText("Prospect package", { exact: true }) }).last();
