/**
 * Workspace Copilot — presentation helpers (Phase F · Sprint F2).
 *
 * PURE. Smart-command parsing, streaming-state labels, conversation grouping and
 * a minimal safe markdown-to-blocks renderer live here so the Copilot components
 * stay thin and the logic is unit-tested (repo convention). No React, no io. The
 * Copilot itself is a presentation layer over Phases D & E — this file never
 * reaches data; it only shapes what the components draw.
 */

/** The slash commands the composer understands (mirrors the application's command set). */
export const SMART_COMMANDS = [
  { command: "report", hint: "Generate or discuss an executive report" },
  { command: "strategy", hint: "Analyze or refresh the strategy" },
  { command: "plan", hint: "Review the execution plan" },
  { command: "automation", hint: "Build or inspect an automation" },
  { command: "deploy", hint: "Review a runtime deployment" },
  { command: "runtime", hint: "Check runtime status + health" },
  { command: "executions", hint: "See recent runtime executions" },
  { command: "health", hint: "Is the runtime healthy?" },
  { command: "mission", hint: "Continue or inspect an agent mission" },
  { command: "search", hint: "Search this conversation" },
  { command: "approve", hint: "Review pending approvals" },
  { command: "context", hint: "Summarize the current workspace context" },
  { command: "help", hint: "What can the Copilot do?" },
] as const;

export type SmartCommand = (typeof SMART_COMMANDS)[number]["command"];

export interface ParsedInput {
  /** The recognized slash command, if the input opened with one. */
  command: SmartCommand | null;
  /** The remaining text after the command (or the whole input when no command). */
  text: string;
  /** True when the input is a bare "/" prefix the composer should autocomplete. */
  isCommandDraft: boolean;
}

/** Parse a composer input into an optional slash command + text. */
export function parseSmartInput(raw: string): ParsedInput {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return { command: null, text: trimmed, isCommandDraft: false };
  const m = /^\/([a-z]+)\b\s*(.*)$/is.exec(trimmed);
  if (m === null) return { command: null, text: "", isCommandDraft: true };
  const word = m[1]!.toLowerCase();
  const known = SMART_COMMANDS.find((c) => c.command === word);
  if (known === undefined) return { command: null, text: trimmed, isCommandDraft: false };
  return { command: known.command, text: (m[2] ?? "").trim(), isCommandDraft: false };
}

/** Suggest slash commands matching a partial "/xxx" draft (for the composer menu). */
export function suggestCommands(raw: string): typeof SMART_COMMANDS[number][] {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return [];
  const frag = trimmed.slice(1).toLowerCase();
  return SMART_COMMANDS.filter((c) => c.command.startsWith(frag));
}

/** A human label for a streaming lifecycle state. */
export function streamingLabel(state: string): string {
  switch (state) {
    case "thinking": return "Thinking…";
    case "running_capability": return "Running capability…";
    case "waiting_approval": return "Waiting for approval";
    case "completed": return "Completed";
    case "failed": return "Couldn’t complete";
    default: return state;
  }
}

/** Whether a message state represents an in-flight (non-terminal) turn. */
export function isStreaming(state: string): boolean {
  return state === "thinking" || state === "running_capability" || state === "waiting_approval";
}

export interface ConversationLike { id: string; pinned: boolean; updatedAt: string; status: string }

/** Split conversations into pinned + recent (active only), each newest-first. */
export function groupConversations<T extends ConversationLike>(list: readonly T[]): { pinned: T[]; recent: T[] } {
  const active = list.filter((c) => c.status !== "archived");
  const byRecent = (a: T, b: T) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0);
  return { pinned: active.filter((c) => c.pinned).sort(byRecent), recent: active.filter((c) => !c.pinned).sort(byRecent) };
}

/* ---- minimal, safe markdown → blocks (no dangerouslySetInnerHTML) ---------- */

export type InlineToken = { text: string; bold: boolean; code: boolean };
export type MarkdownBlock =
  | { type: "heading"; level: number; spans: InlineToken[] }
  | { type: "bullet"; spans: InlineToken[] }
  | { type: "ordered"; index: number; spans: InlineToken[] }
  | { type: "code"; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "paragraph"; spans: InlineToken[] };

/** Tokenize inline **bold** and `code` runs (everything else is plain text). */
export function inlineTokens(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) tokens.push({ text: line.slice(last, m.index), bold: false, code: false });
    if (m[2] !== undefined) tokens.push({ text: m[2], bold: true, code: false });
    else if (m[3] !== undefined) tokens.push({ text: m[3], bold: false, code: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) tokens.push({ text: line.slice(last), bold: false, code: false });
  return tokens.length > 0 ? tokens : [{ text: line, bold: false, code: false }];
}

function splitRow(line: string): string[] {
  return line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}
const isDivider = (line: string): boolean => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line);

/** Render assistant content into safe structured blocks (headings/lists/code/tables). */
export function renderMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") { i += 1; continue; }
    // fenced code
    if (line.trim().startsWith("```")) {
      const buf: string[] = []; i += 1;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) { buf.push(lines[i]!); i += 1; }
      i += 1;
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    // table: a header row followed by a divider row
    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1]!)) {
      const header = splitRow(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== "") { rows.push(splitRow(lines[i]!)); i += 1; }
      blocks.push({ type: "table", header, rows });
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) { blocks.push({ type: "heading", level: heading[1]!.length, spans: inlineTokens(heading[2]!) }); i += 1; continue; }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) { blocks.push({ type: "bullet", spans: inlineTokens(bullet[1]!) }); i += 1; continue; }
    const ordered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (ordered) { blocks.push({ type: "ordered", index: Number(ordered[1]), spans: inlineTokens(ordered[2]!) }); i += 1; continue; }
    blocks.push({ type: "paragraph", spans: inlineTokens(line) });
    i += 1;
  }
  return blocks;
}
