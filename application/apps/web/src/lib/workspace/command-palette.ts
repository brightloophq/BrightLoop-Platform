/**
 * Workspace Experience — command palette model (Phase F · Sprint F1).
 *
 * PURE. A keyboard-driven launcher over the client surfaces. Commands are
 * navigation-only this sprint (no side-effectful actions — publishing/deploying
 * stays behind explicit surfaces). Matching + ranking are unit tested. No React.
 */

export interface WorkspaceCommand {
  id: string;
  label: string;
  hint: string;
  group: "Navigate" | "Create" | "Search";
  href: string;
  keywords: readonly string[];
}

export const WORKSPACE_COMMANDS: readonly WorkspaceCommand[] = [
  { id: "go-dashboard", label: "Go to Dashboard", hint: "Overview", group: "Navigate", href: "/workspace", keywords: ["home", "overview", "workspace"] },
  { id: "go-projects", label: "Go to Projects", hint: "All projects", group: "Navigate", href: "/workspace/projects", keywords: ["project", "initiatives"] },
  { id: "go-ai-team", label: "Open AI Team", hint: "Specialist agents", group: "Navigate", href: "/workspace/ai-team", keywords: ["agents", "coordinator", "strategist", "team"] },
  { id: "go-copilot", label: "Ask the Copilot", hint: "Conversational assistant", group: "Navigate", href: "/workspace/copilot", keywords: ["copilot", "ask", "assistant", "chat", "help"] },
  { id: "go-automations", label: "View Automations", hint: "Workflows", group: "Navigate", href: "/workspace/automations", keywords: ["workflow", "automation", "intent"] },
  { id: "go-deployments", label: "Open Deployment Center", hint: "Runtime deployments", group: "Navigate", href: "/workspace/deployments", keywords: ["deploy", "deployment", "runtime", "release", "rollback"] },
  { id: "go-runtimes", label: "View Runtimes", hint: "n8n + health", group: "Navigate", href: "/workspace/runtimes", keywords: ["runtime", "n8n", "health", "provider"] },
  { id: "go-integrations", label: "Open Integrations", hint: "Connectors + marketplace", group: "Navigate", href: "/workspace/integrations", keywords: ["integration", "connector", "marketplace", "oauth", "webhook", "install"] },
  { id: "go-executions", label: "Open Execution Monitor", hint: "Runtime runs", group: "Navigate", href: "/workspace/executions", keywords: ["execution", "run", "monitor", "failure"] },
  { id: "go-reports", label: "Open Reports", hint: "Executive reporting", group: "Navigate", href: "/workspace/reports", keywords: ["report", "kpi", "insight", "forecast"] },
  { id: "go-approvals", label: "View Approvals", hint: "Pending decisions", group: "Navigate", href: "/workspace/approvals", keywords: ["approval", "review", "decision", "sign off"] },
  { id: "go-activity", label: "Open Activity", hint: "Timeline", group: "Navigate", href: "/workspace/activity", keywords: ["activity", "feed", "timeline", "events"] },
  { id: "go-settings", label: "Open Settings", hint: "Workspace settings", group: "Navigate", href: "/workspace/settings", keywords: ["settings", "profile", "preferences"] },
  { id: "new-project", label: "Create project", hint: "Start something new", group: "Create", href: "/workspace/projects?new=1", keywords: ["new", "create", "project", "add"] },
  { id: "new-report", label: "Generate report", hint: "Executive summary", group: "Create", href: "/workspace/reports?generate=1", keywords: ["generate", "report", "new"] },
  { id: "start-mission", label: "Start a mission", hint: "AI orchestration", group: "Create", href: "/workspace/ai-team?mission=1", keywords: ["mission", "agent", "orchestrate", "start"] },
  { id: "open-search", label: "Search everything", hint: "Projects, reports, missions…", group: "Search", href: "/workspace/search", keywords: ["search", "find", "lookup"] },
];

/** True when every char of `query` appears in order within `text` (subsequence). */
export function subsequenceMatch(text: string, query: string): boolean {
  let i = 0;
  for (const ch of text) { if (i < query.length && ch === query[i]) i += 1; }
  return i === query.length;
}

/** A fuzzy score: lower is better. Consecutive + early matches rank higher. */
function score(text: string, query: string): number {
  let i = 0, last = -1, gaps = 0;
  for (let p = 0; p < text.length && i < query.length; p += 1) {
    if (text[p] === query[i]) { if (last >= 0) gaps += p - last - 1; last = p; i += 1; }
  }
  return gaps + (last === -1 ? 999 : last);
}

/** Filter + rank the commands for a query (empty query returns all, in order). */
export function filterCommands(query: string, commands: readonly WorkspaceCommand[] = WORKSPACE_COMMANDS): WorkspaceCommand[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...commands];
  return commands
    .map((c) => ({ c, hay: [c.label, ...c.keywords].join(" ").toLowerCase() }))
    .filter(({ hay }) => subsequenceMatch(hay, q))
    .map(({ c, hay }) => ({ c, s: score(hay, q) }))
    .sort((a, b) => a.s - b.s || a.c.label.localeCompare(b.c.label))
    .map(({ c }) => c);
}
