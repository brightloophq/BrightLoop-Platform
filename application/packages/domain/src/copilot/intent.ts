/* =============================================================================
 * Copilot intent detection (Phase F · Sprint F2) — PURE.
 *
 * A deterministic classifier + slash-command parser. No LLM, no io, no
 * randomness — the same input always yields the same intent (safe to replay and
 * to unit test). The application maps the intent to a capability via the registry.
 * ========================================================================== */

import type { CopilotIntent } from "@brightloop/schema";

export interface IntentResult {
  intent: CopilotIntent;
  /** True when the message began with a slash command. */
  isCommand: boolean;
  /** The slash command word (without the slash), if any. */
  command: string | null;
  /** The remaining text after a command / the trimmed message. */
  text: string;
}

/** Slash commands → intent. */
const COMMAND_INTENT: Record<string, CopilotIntent> = {
  report: "reporting",
  strategy: "analysis",
  plan: "planning",
  automation: "automation",
  mission: "command",
  search: "search",
  approve: "approval",
  help: "clarification",
  context: "summary",
};
export const COPILOT_COMMANDS = Object.keys(COMMAND_INTENT).map((c) => `/${c}`);

// Patterns use leading \b (whole-word start) but NOT a trailing \b, so word STEMS
// (approv → approvals, automat → automation, summar → summary) match correctly.
const RULES: { intent: CopilotIntent; re: RegExp }[] = [
  { intent: "reporting", re: /\b(report\w*|weekly summary|monthly summary|kpi dashboard|generate.*(report|summar))/i },
  { intent: "planning", re: /\b(execution plan|create.*plan|generate.*plan|plan the|initiative\w*|milestone\w*|timeline)/i },
  { intent: "automation", re: /\b(automat\w*|workflow\w*|deployment|simulate)/i },
  { intent: "approval", re: /\b(approv\w*|pending decision\w*|sign[- ]?off|review.*approv)/i },
  { intent: "analysis", re: /\b(risk\w*|behind schedule|why is|analy[sz]e\w*|compare|prioriti[sz]\w*|what should we|recommend\w*)/i },
  { intent: "explanation", re: /\b(explain\w*|how come|walk me through)/i },
  { intent: "summary", re: /\b(what happened|summar\w*|overview|status|catch me up|state of)/i },
  { intent: "search", re: /\b(search\w*|find|look up|where is)/i },
  { intent: "navigation", re: /\b(go to|open|navigate|show me the|take me to)/i },
  { intent: "escalation", re: /\b(escalat\w*|urgent|blocked|stuck)/i },
];

/** Detect the intent of a user message. Deterministic. */
export function detectIntent(raw: string): IntentResult {
  const text = raw.trim();
  if (text.startsWith("/")) {
    const [word, ...rest] = text.slice(1).split(/\s+/);
    const command = (word ?? "").toLowerCase();
    return { intent: COMMAND_INTENT[command] ?? "clarification", isCommand: true, command, text: rest.join(" ") };
  }
  for (const rule of RULES) if (rule.re.test(text)) return { intent: rule.intent, isCommand: false, command: null, text };
  // Bare questions default to "question"; everything else is a command-ish ask.
  if (/[?]\s*$/.test(text) || /^(what|why|how|when|who|which|where|is|are|can|do|does|should)\b/i.test(text)) {
    return { intent: "question", isCommand: false, command: null, text };
  }
  return { intent: "command", isCommand: false, command: null, text };
}
