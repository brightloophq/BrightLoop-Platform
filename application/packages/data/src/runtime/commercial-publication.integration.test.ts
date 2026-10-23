/** Local-only race coverage for the atomic scanner proposal publication RPC. */
import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createRuntimeServices, runCompetitorIntelligence, type RuntimeResult } from "@brightloop/domain";
import { clientNarrativeSchema, commercialProposalSchema, type CommercialReviewBinding } from "@brightloop/schema";
import { SupabaseRuntimeRepository } from "./adapter.js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_KEY"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const jwtSecret = process.env["SUPABASE_TEST_JWT_SECRET"];
const live = Boolean(url && serviceKey && anonKey && jwtSecret);

function value<T>(result: RuntimeResult<T>): T {
  if (!result.ok) throw new Error(`Publication fixture failed: ${result.code}`);
  return result.value;
}

function ownerToken(subject: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({ role: "authenticated", sub: subject, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600,
    app_metadata: { role: "owner" } });
  return `${head}.${body}.${createHmac("sha256", jwtSecret!).update(`${head}.${body}`).digest("base64url")}`;
}

function clientToken(subject: string, clientId: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({ role: "authenticated", sub: subject, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600,
    app_metadata: { role: "client_admin", client_id: clientId } });
  return `${head}.${body}.${createHmac("sha256", jwtSecret!).update(`${head}.${body}`).digest("base64url")}`;
}

async function conversionFixture() {
  const service = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const ownerAuthId = randomUUID();
  const clientAuthId = randomUUID();
  const ownerEmail = `publication-owner-${ownerAuthId}@auxion.example.test`;
  const clientEmail = `publication-client-${clientAuthId}@auxion.example.test`;
  const ownerAuth = await service.auth.admin.createUser({ id: ownerAuthId, email: ownerEmail, password: `Local-${randomUUID()}!`, email_confirm: true, app_metadata: { role: "owner" } });
  const clientAuth = await service.auth.admin.createUser({ id: clientAuthId, email: clientEmail, password: `Local-${randomUUID()}!`, email_confirm: true,
    app_metadata: { role: "client_admin", client_id: `cli_${clientAuthId.replaceAll("-", "")}` } });
  if (ownerAuth.error || clientAuth.error) throw new Error("Local auth fixture creation failed");
  const ownerId = `usr_${ownerAuthId.replaceAll("-", "")}`;
  const clientId = `cli_${clientAuthId.replaceAll("-", "")}`;
  const clientUserId = `usr_${clientAuthId.replaceAll("-", "")}`;
  await service.from("clients").insert({ id: clientId, company: "Publication integration fixture", industry: "Services", lifecycle: "member" }).throwOnError();
  await service.from("users").insert([
    { id: ownerId, auth_user_id: ownerAuthId, name: "Publication owner", email: ownerEmail, role: "owner", status: "active" },
    { id: clientUserId, auth_user_id: clientAuthId, name: "Publication recipient", email: clientEmail, role: "client_admin", client_id: clientId, status: "active" },
  ]).throwOnError();

  const scanId = `publication_${randomUUID()}`;
  const base = { scanId, clientId, version: 1 };
  const serviceRepo = new SupabaseRuntimeRepository(service);
  const ids = (prefix: string) => `${prefix}_${randomUUID()}`;
  const serviceServices = createRuntimeServices({ repo: serviceRepo, ids });
  const run = value(await serviceServices.runs.createRun({ clientId, scanId, metadata: { businessName: "Publication integration fixture" } }));
  value(await serviceServices.runs.completeRun(run.id));
  const report = value(await serviceServices.artifacts.persist({ ...base, runId: run.id, kind: "internal_intelligence_report", validationStatus: "valid",
    envelope: { executiveOverview: "Private report for local verification.", risks: [], opportunities: [], confidence: { value: 80, band: "high" } } }));
  const competitor = runCompetitorIntelligence({ scanId, evidence: [], now: new Date().toISOString() });
  const competitorArtifact = value(await serviceServices.artifacts.persist({ ...base, runId: run.id, kind: "competitor_snapshot", validationStatus: "valid",
    envelope: competitor as unknown as Record<string, unknown>, checksum: competitor.checksum }));
  const now = new Date().toISOString();
  const proposalEnvelope = commercialProposalSchema.parse({ id: `cp_${randomUUID()}`, scanId, clientId, status: "draft_ready", commercialState: "priced",
    executiveSummary: "Reviewed summary", observedSituation: "Reviewed observation", keyIssues: [], opportunities: [],
    recommendedWork: [{ sourceId: "work1", title: "Improve performance", solution: "Optimize pages", priority: "high", effort: "medium", evidenceIds: ["evidence1"] }],
    proposedNextStep: "Review the proposal", supportingEvidenceIds: ["evidence1"], confidence: { value: 80, band: "high" },
    sourceArtifacts: [report.id], checksum: `proposal_${randomUUID()}`, generatedAt: now,
    pricing: { currency: "USD", items: [{ sourceId: "work1", pricingType: "one_time", amountMinor: 5000, quantity: 2 }], discountMinor: 1000,
      subtotalOneTimeMinor: 10000, totalOneTimeMinor: 9000, totalRecurringMonthlyMinor: 0, validUntil: "2099-12-31", pricedBy: ownerAuthId, pricedAt: now } });
  const proposal = value(await serviceServices.proposals.save({ ...base, runId: run.id, status: "needs_review", sourceArtifactIds: [report.id], envelope: proposalEnvelope, checksum: proposalEnvelope.checksum }));
  const narrativeEnvelope = clientNarrativeSchema.parse({ id: `cn_${randomUUID()}`, scanId, clientId, audience: "client", status: "ready",
    sections: [{ key: "observed", heading: "Overview", paragraphs: ["Approved client narrative."], supportingArtifacts: [report.id] }],
    confidence: { value: 80, band: "high" }, sourceArtifacts: [report.id, proposal.id], checksum: `narrative_${randomUUID()}`, generatedAt: now });
  const narrative = value(await serviceServices.narratives.save({ ...base, runId: run.id, audience: "client", status: "needs_review",
    sourceArtifactIds: [report.id], envelope: narrativeEnvelope, checksum: narrativeEnvelope.checksum }));

  const ownerClient = createClient(url!, anonKey!, { global: { headers: { Authorization: `Bearer ${ownerToken(ownerAuthId)}` } }, auth: { persistSession: false } });
  const clientClient = createClient(url!, anonKey!, { global: { headers: { Authorization: `Bearer ${clientToken(clientAuthId, clientId)}` } }, auth: { persistSession: false } });
  const ownerServices = createRuntimeServices({ repo: new SupabaseRuntimeRepository(ownerClient), ids });
  const ref = (source: { id: string; version: number; checksum: string }) => ({ id: source.id, version: source.version, checksum: source.checksum });
  const binding: CommercialReviewBinding = { schemaVersion: 1, proposal: ref(proposal), narrative: ref(narrative), report: ref(report),
    competitor: ref(competitorArtifact), coreProposal: null };
  const review = await ownerServices.events.emit({ eventType: "runtime.review.approved", aggregateType: "intelligence_run", aggregateId: run.id,
    runId: run.id, scanId, clientId, payload: { by: ownerAuthId, binding } });
  if (!review.ok) throw new Error(`Local approval fixture failed: ${review.code}`);
  const conversion = await ownerClient.rpc("bl_convert_scanner_package", { p_run_id: run.id, p_idempotency_key: `${run.id}-conversion-key-001` });
  if (conversion.error || !conversion.data || typeof conversion.data !== "object") throw new Error("Local conversion fixture failed");
  const proposalId = (conversion.data as { proposalId?: string }).proposalId;
  if (!proposalId) throw new Error("Conversion did not return a proposal id");
  return { ownerClient, clientClient, service, serviceServices, ownerServices, runId: run.id, scanId, proposal,
    proposalEnvelope, report, competitorArtifact, narrative, ownerAuthId, proposalId, clientId, clientUserId };
}

describe.skipIf(!live)("scanner proposal publication concurrency", () => {
  it("serializes concurrent publication retries and creates exactly one portal publication", async () => {
    if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Disposable loopback API required");
    const f = await conversionFixture();
    const args = {
      p_proposal_id: f.proposalId, p_expected_client_id: f.clientId, p_recipient_user_id: f.clientUserId,
      p_expected_currency: "USD", p_expected_total_minor: 9000, p_expected_valid_until: "2099-12-31",
    };
    const results = await Promise.all([
      f.ownerClient.rpc("bl_publish_scanner_sales_proposal", args),
      f.ownerClient.rpc("bl_publish_scanner_sales_proposal", args),
    ]);
    expect(results.map((result) => result.error)).toEqual([null, null]);
    const payloads = results.map((result) => result.data as { published: boolean; replayed: boolean });
    expect(payloads.every((payload) => payload.published)).toBe(true);
    expect(payloads.filter((payload) => !payload.replayed)).toHaveLength(1);
    expect(payloads.filter((payload) => payload.replayed)).toHaveLength(1);
    const count = await f.ownerClient.from("scanner_sales_publications").select("id", { count: "exact", head: true }).eq("proposal_id", f.proposalId);
    expect(count.error).toBeNull();
    expect(count.count).toBe(1);
  });

  it("makes acceptance idempotent and serializes acceptance against successor publication", async () => {
    if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Disposable loopback API required");
    const f = await conversionFixture();
    const publishOriginal = await f.ownerClient.rpc("bl_publish_scanner_sales_proposal", {
      p_proposal_id: f.proposalId, p_expected_client_id: f.clientId, p_recipient_user_id: f.clientUserId,
      p_expected_currency: "USD", p_expected_total_minor: 9000, p_expected_valid_until: "2099-12-31",
    });
    expect(publishOriginal.error).toBeNull();
    const portal = await f.clientClient.rpc("bl_client_scanner_proposal_contents");
    expect(portal.error).toBeNull();
    const first = (portal.data as { proposalId: string; snapshotChecksum: string }[]).find((offer) => offer.proposalId === f.proposalId);
    expect(first?.snapshotChecksum).toMatch(/^[0-9a-f]{64}$/);
    const duplicateAccepts = await Promise.all([
      f.clientClient.rpc("bl_client_scanner_proposal_response", {
        p_proposal_id: f.proposalId, p_action: "accept", p_expected_snapshot_checksum: first!.snapshotChecksum, p_note: "",
      }),
      f.clientClient.rpc("bl_client_scanner_proposal_response", {
        p_proposal_id: f.proposalId, p_action: "accept", p_expected_snapshot_checksum: first!.snapshotChecksum, p_note: "",
      }),
    ]);
    expect(duplicateAccepts.map((result) => result.error)).toEqual([null, null]);
    const accepted = duplicateAccepts.map((result) => result.data as { replayed: boolean; status: string });
    expect(accepted.every((result) => result.status === "accepted")).toBe(true);
    expect(accepted.filter((result) => !result.replayed)).toHaveLength(1);
    const acceptedRows = await f.ownerClient.from("scanner_sales_client_responses").select("id", { count: "exact", head: true })
      .eq("proposal_id", f.proposalId).eq("response_kind", "accepted");
    expect(acceptedRows.count).toBe(1);
    expect(acceptedRows.error).toBeNull();

    const g = await conversionFixture();
    const original = await g.ownerClient.rpc("bl_publish_scanner_sales_proposal", {
      p_proposal_id: g.proposalId, p_expected_client_id: g.clientId, p_recipient_user_id: g.clientUserId,
      p_expected_currency: "USD", p_expected_total_minor: 9000, p_expected_valid_until: "2099-12-31",
    });
    expect(original.error).toBeNull();
    const gPortal = await g.clientClient.rpc("bl_client_scanner_proposal_contents");
    expect(gPortal.error).toBeNull();
    const gCurrent = (gPortal.data as { proposalId: string; snapshotChecksum: string }[]).find((offer) => offer.proposalId === g.proposalId);
    expect(gCurrent?.snapshotChecksum).toMatch(/^[0-9a-f]{64}$/);
    const revisionId = randomUUID();
    const revisedEnvelope = commercialProposalSchema.parse({ ...g.proposalEnvelope, id: `cp_${revisionId}`,
      checksum: `proposal_${revisionId}`, generatedAt: new Date().toISOString(),
      pricing: { ...g.proposalEnvelope.pricing!, items: [{ ...g.proposalEnvelope.pricing!.items[0]!, amountMinor: 5100 }],
        subtotalOneTimeMinor: 10200, totalOneTimeMinor: 9200 } });
    value(await g.serviceServices.proposals.save({ scanId: g.scanId, clientId: g.clientId, runId: g.runId,
      version: 2, supersedesId: g.proposal.id, status: "needs_review", sourceArtifactIds: [g.report.id],
      envelope: revisedEnvelope, checksum: revisedEnvelope.checksum }));
    const [proposalSource, narrativeSource, reportSource, competitorSource] = await Promise.all([
      g.service.from("proposal_versions").select("id,version,checksum").eq("run_id", g.runId).order("version", { ascending: false }).limit(1).single(),
      g.service.from("narrative_versions").select("id,version,checksum").eq("run_id", g.runId).eq("audience", "client").order("version", { ascending: false }).limit(1).single(),
      g.service.from("intelligence_artifacts").select("id,version,checksum").eq("run_id", g.runId).eq("kind", "internal_intelligence_report").order("version", { ascending: false }).limit(1).single(),
      g.service.from("intelligence_artifacts").select("id,version,checksum").eq("run_id", g.runId).eq("kind", "competitor_snapshot").order("version", { ascending: false }).limit(1).single(),
    ]);
    if (proposalSource.error || narrativeSource.error || reportSource.error || competitorSource.error) throw new Error("Revision binding source lookup failed");
    const binding: CommercialReviewBinding = { schemaVersion: 1,
      proposal: { id: proposalSource.data.id, version: proposalSource.data.version, checksum: proposalSource.data.checksum },
      narrative: { id: narrativeSource.data.id, version: narrativeSource.data.version, checksum: narrativeSource.data.checksum },
      report: { id: reportSource.data.id, version: reportSource.data.version, checksum: reportSource.data.checksum },
      competitor: { id: competitorSource.data.id, version: competitorSource.data.version, checksum: competitorSource.data.checksum }, coreProposal: null };
    const review = await g.ownerServices.events.emit({ eventType: "runtime.review.approved", aggregateType: "intelligence_run",
      aggregateId: g.runId, runId: g.runId, scanId: g.scanId, clientId: g.clientId,
      payload: { by: g.ownerAuthId, binding } });
    if (!review.ok) throw new Error(`Revision approval fixture failed: ${review.code}`);
    const revision = await g.ownerClient.rpc("bl_create_scanner_sales_revision", { p_predecessor_proposal_id: g.proposalId });
    expect(revision.error).toBeNull();
    const nextProposalId = (revision.data as { proposalId: string }).proposalId;
    const [acceptCurrent, publishSuccessor] = await Promise.all([
      g.clientClient.rpc("bl_client_scanner_proposal_response", {
        p_proposal_id: g.proposalId, p_action: "accept", p_expected_snapshot_checksum: gCurrent!.snapshotChecksum, p_note: "",
      }),
      g.ownerClient.rpc("bl_publish_scanner_sales_proposal", {
        p_proposal_id: nextProposalId, p_expected_client_id: g.clientId, p_recipient_user_id: g.clientUserId,
        p_expected_currency: "USD", p_expected_total_minor: 9200, p_expected_valid_until: "2099-12-31",
      }),
    ]);
    expect(Number(!acceptCurrent.error) + Number(!publishSuccessor.error)).toBe(1);
    if (!acceptCurrent.error) expect(acceptCurrent.data).toMatchObject({ status: "accepted" });
    else expect(acceptCurrent.error.code).toBe("40001");
    if (!publishSuccessor.error) expect(publishSuccessor.data).toMatchObject({ published: true });
    else expect(publishSuccessor.error.code).toBe("55000");
    const conversion = await g.ownerClient.from("scanner_sales_conversions").select("id").eq("run_id", g.runId).single();
    expect(conversion.error).toBeNull();
    const head = await g.ownerClient.from("scanner_sales_offer_heads").select("proposal_id").eq("conversion_id", conversion.data!.id).single();
    expect(head.error).toBeNull();
    expect(head.data?.proposal_id).toBe(!acceptCurrent.error ? g.proposalId : nextProposalId);
  });
});
