/* =============================================================================
 * Transformation row mappers — database (snake_case) ⇄ domain (camelCase).
 *
 * The one place the casing translation happens. Reads coerce defensively (a bad
 * jsonb value becomes [] / null, never a crash); writes produce snake_case insert
 * payloads. Mappers are the type-safe boundary around the (currently untyped)
 * Supabase access for these tables — see repository.ts.
 * ========================================================================== */

import type {
  Signal,
  Insight,
  Recommendation,
  Approval,
  Move,
  ExecutionRecord,
  Measurement,
  Learning,
  OperationalRisk,
  KnowledgeAsset,
  BusinessHealthRecord,
  TransformationIndexRecord,
  EvidenceItem,
  AiProvenance,
} from "@brightloop/schema";

type Row = Record<string, unknown>;

/* ---- coercion helpers ----------------------------------------------------- */

const str = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : typeof v === "number" ? v : Number(v);

/** jsonb → EvidenceItem[]. Malformed entries are dropped. */
function evidence(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return [];
    const o = raw as Record<string, unknown>;
    if (typeof o["kind"] !== "string" || typeof o["ref"] !== "string") return [];
    const item: EvidenceItem = { kind: o["kind"] as EvidenceItem["kind"], ref: o["ref"] };
    if (typeof o["label"] === "string") item.label = o["label"];
    if (typeof o["detail"] === "string") item.detail = o["detail"];
    return [item];
  });
}

/** jsonb → Record<string, number>. Non-numeric values are dropped. */
function numberMap(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number") out[k] = v;
  }
  return out;
}

/** The AI provenance columns → AiProvenance | null (null = human-authored). */
function aiProvenance(row: Row): AiProvenance | null {
  if (typeof row["ai_model"] !== "string" || typeof row["ai_prompt_version"] !== "string") return null;
  const p: AiProvenance = {
    modelId: row["ai_model"],
    promptVersion: row["ai_prompt_version"],
    generatedAt: str(row["ai_generated_at"]),
  };
  const conf = numOrNull(row["ai_confidence"]);
  if (conf !== null) p.confidence = conf;
  if (typeof row["ai_params"] === "object" && row["ai_params"] !== null) {
    p.params = row["ai_params"] as Record<string, unknown>;
  }
  if (typeof row["ai_provider"] === "string") {
    (p.params ??= {})["provider"] = row["ai_provider"];
  }
  if (typeof row["ai_generation_id"] === "string") p.generationId = row["ai_generation_id"];
  return p;
}

/* ---- row → domain --------------------------------------------------------- */

export const toSignal = (r: Row): Signal => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  title: str(r["title"]),
  detail: strOrNull(r["detail"]),
  status: str(r["status"]) as Signal["status"],
  sourceRef: strOrNull(r["source_ref"]),
  evidence: evidence(r["evidence"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toInsight = (r: Row): Insight => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  signalId: str(r["signal_id"]),
  summary: str(r["summary"]),
  detail: strOrNull(r["detail"]),
  status: str(r["status"]) as Insight["status"],
  evidence: evidence(r["evidence"]),
  confidence: numOrNull(r["confidence"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toRecommendation = (r: Row): Recommendation => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  insightId: str(r["insight_id"]),
  summary: str(r["summary"]),
  rationale: str(r["rationale"]),
  expectedOutcome: strOrNull(r["expected_outcome"]),
  status: str(r["status"]) as Recommendation["status"],
  evidence: evidence(r["evidence"]),
  confidence: numOrNull(r["confidence"]),
  aiProvenance: aiProvenance(r),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toApproval = (r: Row): Approval => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  subjectType: str(r["subject_type"]) as Approval["subjectType"],
  subjectId: str(r["subject_id"]),
  decision: str(r["decision"]) as Approval["decision"],
  approverUserId: strOrNull(r["approver_user_id"]),
  reason: strOrNull(r["reason"]),
  requestedAt: str(r["requested_at"]),
  decidedAt: strOrNull(r["decided_at"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toMove = (r: Row): Move => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  title: str(r["title"]),
  intent: str(r["intent"]),
  expectedOutcome: strOrNull(r["expected_outcome"]),
  status: str(r["status"]) as Move["status"],
  recommendationId: strOrNull(r["recommendation_id"]),
  approvalId: strOrNull(r["approval_id"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toExecutionRecord = (r: Row): ExecutionRecord => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  moveId: str(r["move_id"]),
  status: str(r["status"]) as ExecutionRecord["status"],
  idempotencyKey: strOrNull(r["idempotency_key"]),
  attempts: num(r["attempts"]),
  lastError: strOrNull(r["last_error"]),
  startedAt: strOrNull(r["started_at"]),
  finishedAt: strOrNull(r["finished_at"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toMeasurement = (r: Row): Measurement => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  moveId: str(r["move_id"]),
  metricKey: str(r["metric_key"]),
  target: numOrNull(r["target"]),
  observed: num(r["observed"]),
  delta: numOrNull(r["delta"]),
  unit: strOrNull(r["unit"]),
  measuredAt: str(r["measured_at"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toLearning = (r: Row): Learning => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  summary: str(r["summary"]),
  detail: strOrNull(r["detail"]),
  moveId: strOrNull(r["move_id"]),
  measurementId: strOrNull(r["measurement_id"]),
  capturedAt: str(r["captured_at"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toOperationalRisk = (r: Row): OperationalRisk => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  title: str(r["title"]),
  detail: strOrNull(r["detail"]),
  status: str(r["status"]) as OperationalRisk["status"],
  severity: str(r["severity"]) as OperationalRisk["severity"],
  likelihood: str(r["likelihood"]) as OperationalRisk["likelihood"],
  signalId: strOrNull(r["signal_id"]),
  moveId: strOrNull(r["move_id"]),
  ownerUserId: strOrNull(r["owner_user_id"]),
  evidence: evidence(r["evidence"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toKnowledgeAsset = (r: Row): KnowledgeAsset => ({
  id: str(r["id"]),
  clientId: strOrNull(r["client_id"]),
  title: str(r["title"]),
  kind: str(r["kind"]) as KnowledgeAsset["kind"],
  body: str(r["body"]),
  status: str(r["status"]) as KnowledgeAsset["status"],
  sourceRef: strOrNull(r["source_ref"]),
  createdBy: strOrNull(r["created_by"]),
  createdAt: str(r["created_at"]),
});

export const toBusinessHealthRecord = (r: Row): BusinessHealthRecord => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  dimensions: numberMap(r["dimensions"]),
  score: num(r["score"]),
  basis: strOrNull(r["basis"]),
  capturedAt: str(r["captured_at"]),
  createdAt: str(r["created_at"]),
});

export const toTransformationIndexRecord = (r: Row): TransformationIndexRecord => ({
  id: str(r["id"]),
  clientId: str(r["client_id"]),
  value: num(r["value"]),
  delta: numOrNull(r["delta"]),
  basis: strOrNull(r["basis"]),
  at: str(r["at"]),
  createdAt: str(r["created_at"]),
});

/* ---- domain → row (insert payloads, snake_case) --------------------------- */

export const signalRow = (s: Signal): Row => ({
  id: s.id, client_id: s.clientId, title: s.title, detail: s.detail, status: s.status,
  source_ref: s.sourceRef, evidence: s.evidence, created_by: s.createdBy, created_at: s.createdAt,
});

export const insightRow = (i: Insight): Row => ({
  id: i.id, client_id: i.clientId, signal_id: i.signalId, summary: i.summary, detail: i.detail,
  status: i.status, evidence: i.evidence, confidence: i.confidence, created_by: i.createdBy, created_at: i.createdAt,
});

export const recommendationRow = (r: Recommendation): Row => ({
  id: r.id, client_id: r.clientId, insight_id: r.insightId, summary: r.summary, rationale: r.rationale,
  expected_outcome: r.expectedOutcome, status: r.status, evidence: r.evidence, confidence: r.confidence,
  ai_provider: r.aiProvenance?.params?.["provider"] ?? null,
  ai_model: r.aiProvenance?.modelId ?? null,
  ai_prompt_version: r.aiProvenance?.promptVersion ?? null,
  ai_generated_at: r.aiProvenance?.generatedAt ?? null,
  ai_confidence: r.aiProvenance?.confidence ?? null,
  ai_params: r.aiProvenance?.params ?? null,
  ai_generation_id: r.aiProvenance?.generationId ?? null,
  created_by: r.createdBy, created_at: r.createdAt,
});

export const approvalRow = (a: Approval): Row => ({
  id: a.id, client_id: a.clientId, subject_type: a.subjectType, subject_id: a.subjectId,
  decision: a.decision, approver_user_id: a.approverUserId, reason: a.reason,
  requested_at: a.requestedAt, decided_at: a.decidedAt, created_by: a.createdBy, created_at: a.createdAt,
});

export const moveRow = (m: Move): Row => ({
  id: m.id, client_id: m.clientId, title: m.title, intent: m.intent, expected_outcome: m.expectedOutcome,
  status: m.status, recommendation_id: m.recommendationId, approval_id: m.approvalId,
  created_by: m.createdBy, created_at: m.createdAt,
});

export const executionRow = (e: ExecutionRecord): Row => ({
  id: e.id, client_id: e.clientId, move_id: e.moveId, status: e.status, idempotency_key: e.idempotencyKey,
  attempts: e.attempts, last_error: e.lastError, started_at: e.startedAt, finished_at: e.finishedAt,
  created_by: e.createdBy, created_at: e.createdAt,
});

export const measurementRow = (m: Measurement): Row => ({
  id: m.id, client_id: m.clientId, move_id: m.moveId, metric_key: m.metricKey, target: m.target,
  observed: m.observed, delta: m.delta, unit: m.unit, measured_at: m.measuredAt,
  created_by: m.createdBy, created_at: m.createdAt,
});

export const learningRow = (l: Learning): Row => ({
  id: l.id, client_id: l.clientId, summary: l.summary, detail: l.detail, move_id: l.moveId,
  measurement_id: l.measurementId, captured_at: l.capturedAt, created_by: l.createdBy, created_at: l.createdAt,
});

export const operationalRiskRow = (r: OperationalRisk): Row => ({
  id: r.id, client_id: r.clientId, title: r.title, detail: r.detail, status: r.status,
  severity: r.severity, likelihood: r.likelihood, signal_id: r.signalId, move_id: r.moveId,
  owner_user_id: r.ownerUserId, evidence: r.evidence, created_by: r.createdBy, created_at: r.createdAt,
});

export const knowledgeAssetRow = (k: KnowledgeAsset): Row => ({
  id: k.id, client_id: k.clientId, title: k.title, kind: k.kind, body: k.body, status: k.status,
  source_ref: k.sourceRef, created_by: k.createdBy, created_at: k.createdAt,
});

export const businessHealthRow = (b: BusinessHealthRecord): Row => ({
  id: b.id, client_id: b.clientId, dimensions: b.dimensions, score: b.score, basis: b.basis,
  captured_at: b.capturedAt, created_at: b.createdAt,
});

export const transformationIndexRow = (t: TransformationIndexRecord): Row => ({
  id: t.id, client_id: t.clientId, value: t.value, delta: t.delta, basis: t.basis, at: t.at, created_at: t.createdAt,
});
