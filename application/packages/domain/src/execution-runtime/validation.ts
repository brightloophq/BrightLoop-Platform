/* =============================================================================
 * Execution Runtime — package validation, hashing, incompatibility (F3). PURE.
 *
 * Reads the provider-NEUTRAL E5 deployment-package payload defensively (it arrives
 * as an opaque record through the E5 public DTO) and validates it can be deployed.
 * When constructs cannot be represented for a target, a structured incompatibility
 * report is returned and deployment must fail BEFORE any provider call. Hashing is
 * a deterministic pure function (no crypto import, no io).
 * ========================================================================== */

/* ---- deterministic hash (FNV-1a, 32-bit, hex) ------------------------------ */

export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* ---- neutral payload view -------------------------------------------------- */

export interface NeutralNode { key: string; kind: string; next: string[]; refId: string | null }
export interface NeutralPackage {
  schemaVersion: string;
  target: string;
  workflowName: string;
  entryStepKey: string | null;
  nodes: NeutralNode[];
  triggers: { kind: string; name: string }[];
  actions: { kind: string; name: string }[];
  variables: { key: string; scope: string; type: string }[];
  integrations: { provider: string; capability: string }[];
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

/** Defensively read the opaque E5 payload into a typed neutral view. */
export function readNeutralPackage(payload: Record<string, unknown>): NeutralPackage {
  const workflow = (payload["workflow"] ?? {}) as Record<string, unknown>;
  return {
    schemaVersion: str(payload["schemaVersion"]),
    target: str(payload["target"]),
    workflowName: str(workflow["name"], "workflow"),
    entryStepKey: workflow["entryStepKey"] === null || workflow["entryStepKey"] === undefined ? null : str(workflow["entryStepKey"]),
    nodes: arr(payload["nodes"]).map((n) => { const o = n as Record<string, unknown>; return { key: str(o["key"]), kind: str(o["kind"]), next: arr(o["next"]).map((x) => str(x)), refId: o["refId"] === undefined || o["refId"] === null ? null : str(o["refId"]) }; }),
    triggers: arr(payload["triggers"]).map((t) => { const o = t as Record<string, unknown>; return { kind: str(o["kind"]), name: str(o["name"]) }; }),
    actions: arr(payload["actions"]).map((a) => { const o = a as Record<string, unknown>; return { kind: str(o["kind"]), name: str(o["name"]) }; }),
    variables: arr(payload["variables"]).map((v) => { const o = v as Record<string, unknown>; return { key: str(o["key"]), scope: str(o["scope"]), type: str(o["type"]) }; }),
    integrations: arr(payload["integrations"]).map((i) => { const o = i as Record<string, unknown>; return { provider: str(o["provider"]), capability: str(o["capability"]) }; }),
  };
}

/* ---- structural validation ------------------------------------------------- */

export interface PackageValidationResult { ok: boolean; issues: string[] }

/** Validate the neutral workflow is structurally deployable (before any provider call). */
export function validateNeutralPackage(pkg: NeutralPackage): PackageValidationResult {
  const issues: string[] = [];
  if (pkg.schemaVersion === "") issues.push("missing schemaVersion");
  if (pkg.nodes.length === 0) issues.push("workflow has no nodes");
  if (pkg.triggers.length === 0) issues.push("workflow has no trigger");
  const keys = new Set(pkg.nodes.map((n) => n.key));
  if (pkg.entryStepKey !== null && !keys.has(pkg.entryStepKey)) issues.push(`entry step ${pkg.entryStepKey} not found`);
  for (const n of pkg.nodes) for (const nx of n.next) if (!keys.has(nx)) issues.push(`node ${n.key} points at unknown step ${nx}`);
  if (new Set(pkg.nodes.map((n) => n.key)).size !== pkg.nodes.length) issues.push("duplicate node keys");
  return { ok: issues.length === 0, issues };
}

/* ---- provider incompatibility (parameterized by the target's support sets) -- */

export interface IncompatibilityItem { kind: "trigger" | "action" | "variable" | "branch" | "node"; subject: string; reason: string; remediation: string }
export interface IncompatibilityReport { compatible: boolean; items: IncompatibilityItem[] }

export interface TargetSupport {
  triggerKinds: ReadonlySet<string>;
  actionKinds: ReadonlySet<string>;
  variableTypes: ReadonlySet<string>;
  /** Node kinds the target can represent (e.g. no native "loop"). */
  nodeKinds: ReadonlySet<string>;
}

/**
 * Detect constructs the target cannot represent. The target's support sets are
 * supplied by its adapter/translator, keeping this pure + provider-neutral. Never
 * silently omits: every unsupported construct is reported with a remediation.
 */
export function detectIncompatibilities(pkg: NeutralPackage, support: TargetSupport): IncompatibilityReport {
  const items: IncompatibilityItem[] = [];
  for (const t of pkg.triggers) if (!support.triggerKinds.has(t.kind)) items.push({ kind: "trigger", subject: t.kind, reason: `trigger "${t.kind}" is not supported by the target`, remediation: "replace with a supported trigger or a webhook" });
  for (const a of pkg.actions) if (!support.actionKinds.has(a.kind)) items.push({ kind: "action", subject: a.kind, reason: `action "${a.kind}" is not supported by the target`, remediation: "use an HTTP request or a supported action" });
  for (const v of pkg.variables) if (!support.variableTypes.has(v.type)) items.push({ kind: "variable", subject: `${v.key}:${v.type}`, reason: `variable type "${v.type}" is not supported`, remediation: "convert to a supported type" });
  for (const n of pkg.nodes) if (!support.nodeKinds.has(n.kind)) items.push({ kind: "node", subject: `${n.key}:${n.kind}`, reason: `node kind "${n.kind}" is not supported`, remediation: "decompose into supported nodes" });
  return { compatible: items.length === 0, items };
}
