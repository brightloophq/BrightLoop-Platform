/* =============================================================================
 * Prompt lifecycle + templating + safety (Phase E · Sprint E1) — PURE.
 *
 * Prompt edits NEVER overwrite history: every edit appends a new immutable
 * PromptVersion. A prompt's status is a state machine (draft → active →
 * deprecated → archived); publishing a version marks it active and points the
 * prompt at it; rollback re-points to an older version. Templates are
 * `{{variable}}`; safety validates variables/size before any execution.
 * ========================================================================== */

import type { Prompt, PromptStatus, PromptVersion } from "@brightloop/schema";

/* ---- prompt status state machine ------------------------------------------- */

export const PROMPT_TRANSITIONS: Record<PromptStatus, readonly PromptStatus[]> = {
  draft: ["active", "archived"],
  active: ["deprecated", "archived"],
  deprecated: ["active", "archived"],
  archived: [],
};
export function canTransitionPrompt(from: PromptStatus, to: PromptStatus): boolean {
  return PROMPT_TRANSITIONS[from].includes(to);
}

export interface BuildPromptInput {
  id: string; workspaceId: string; clientId: string | null;
  name: string; description?: string | null; tags?: readonly string[];
  ownerUserId: string; now: string;
}
export function buildPrompt(input: BuildPromptInput): Prompt {
  return {
    id: input.id, workspaceId: input.workspaceId, clientId: input.clientId,
    name: input.name.slice(0, 160), description: input.description ?? null, tags: [...(input.tags ?? [])],
    ownerUserId: input.ownerUserId, status: "draft", activeVersion: null, version: 1,
    createdAt: input.now, updatedAt: input.now,
  };
}

/* ---- templating ------------------------------------------------------------ */

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Extract the unique `{{variable}}` names a template declares, in order. Pure. */
export function extractVariables(template: string): string[] {
  const out: string[] = [];
  for (const match of template.matchAll(VARIABLE_RE)) {
    const name = match[1];
    if (name !== undefined && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Variable names present in the template but missing from `values`. Pure. */
export function missingVariables(template: string, values: Readonly<Record<string, unknown>>): string[] {
  return extractVariables(template).filter((v) => values[v] === undefined || values[v] === null || values[v] === "");
}

/** Interpolate `{{variable}}` with values. Unknown vars are left untouched. Pure. */
export function renderPromptTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(VARIABLE_RE, (whole, name: string) => (name in values ? values[name]! : whole));
}

/* ---- version builder ------------------------------------------------------- */

export interface BuildVersionInput {
  id: string; promptId: string; workspaceId: string; clientId: string | null;
  version: number; systemPrompt?: string; userTemplate?: string;
  temperature?: number; maxTokens?: number;
  providerPreference?: PromptVersion["providerPreference"]; model?: string | null;
  notes?: string | null; createdByUserId: string; now: string;
}
/** Build the next immutable version, auto-deriving declared variables. Pure. */
export function buildVersion(input: BuildVersionInput): PromptVersion {
  const systemPrompt = input.systemPrompt ?? "";
  const userTemplate = input.userTemplate ?? "";
  return {
    id: input.id, promptId: input.promptId, workspaceId: input.workspaceId, clientId: input.clientId,
    version: input.version, systemPrompt, userTemplate,
    variables: extractVariables(`${systemPrompt}\n${userTemplate}`),
    temperature: input.temperature ?? 0.7, maxTokens: input.maxTokens ?? 1024,
    providerPreference: input.providerPreference ?? null, model: input.model ?? null,
    status: "draft", notes: input.notes ?? null, createdByUserId: input.createdByUserId, createdAt: input.now,
  };
}

/* ---- safety validation ----------------------------------------------------- */

export type PromptValidationError =
  | { code: "empty_prompt"; message: string }
  | { code: "missing_variables"; message: string; variables: string[] }
  | { code: "prompt_too_large"; message: string }
  | { code: "token_overflow"; message: string };

/** Max characters for a rendered prompt (defence-in-depth before token overflow). */
export const MAX_PROMPT_CHARS = 400_000;

export interface ValidatePromptInput {
  systemPrompt: string;
  userTemplate: string;
  values: Readonly<Record<string, string>>;
  /** The model's context window (tokens); rendered prompt must fit with headroom. */
  contextWindow: number;
  maxTokens: number;
  estimateTokens: (text: string) => number;
}

/**
 * Validate a prompt is safe to execute. Returns the rendered prompt on success, or
 * the first typed error. Pure — the caller supplies the token estimator. Pure.
 */
export function validatePrompt(input: ValidatePromptInput): { ok: true; rendered: string } | { ok: false; error: PromptValidationError } {
  const rendered = renderPromptTemplate(input.userTemplate, input.values);
  const combined = `${input.systemPrompt}\n${rendered}`;
  if (input.systemPrompt.trim() === "" && rendered.trim() === "") return { ok: false, error: { code: "empty_prompt", message: "Prompt is empty" } };
  const missing = missingVariables(input.userTemplate, input.values);
  if (missing.length > 0) return { ok: false, error: { code: "missing_variables", message: `Missing variables: ${missing.join(", ")}`, variables: missing } };
  if (combined.length > MAX_PROMPT_CHARS) return { ok: false, error: { code: "prompt_too_large", message: `Prompt exceeds ${MAX_PROMPT_CHARS} chars` } };
  const promptTokens = input.estimateTokens(combined);
  if (promptTokens + input.maxTokens > input.contextWindow) return { ok: false, error: { code: "token_overflow", message: `Prompt (${promptTokens}) + maxTokens (${input.maxTokens}) exceeds context window (${input.contextWindow})` } };
  return { ok: true, rendered };
}
