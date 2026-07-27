/* =============================================================================
 * Copilot response composition (Phase F · Sprint F2) — PURE.
 *
 * Deterministic markdown composition. Facts come ONLY from the caller (assembled
 * from read models / capability results) — this module never invents content, so
 * a Copilot answer can never hallucinate. Error answers explain + offer next
 * steps without leaking internals. No io.
 * ========================================================================== */

export interface AnswerBlock {
  headline: string;
  bullets?: string[];
  table?: { columns: string[]; rows: string[][] };
  note?: string;
}

const esc = (s: string): string => s.replace(/\|/g, "\\|");

/** Render a structured answer as GitHub-flavoured markdown. */
export function renderAnswer(block: AnswerBlock): string {
  const parts: string[] = [`**${block.headline}**`];
  if (block.bullets && block.bullets.length > 0) parts.push(block.bullets.map((b) => `- ${b}`).join("\n"));
  if (block.table && block.table.rows.length > 0) {
    const { columns, rows } = block.table;
    parts.push([`| ${columns.map(esc).join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n"));
  }
  if (block.note) parts.push(`_${block.note}_`);
  return parts.join("\n\n");
}

/** An error answer: explain why, offer alternatives, never expose a stack trace. */
export function renderErrorAnswer(reason: string, alternatives: readonly string[]): string {
  const parts = [`I couldn't complete that: ${reason}.`];
  if (alternatives.length > 0) parts.push(`Here's what you can try instead:\n${alternatives.map((a) => `- ${a}`).join("\n")}`);
  return parts.join("\n\n");
}

/** A short confirmation that a capability ran, with a reference to its output. */
export function renderCapabilityResult(summary: string, refLabel: string | null): string {
  return refLabel ? `${summary}\n\n_Reference: ${refLabel}_` : summary;
}
