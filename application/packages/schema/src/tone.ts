/* =============================================================================
 * Status → design-system tone map — ported verbatim from schema.js.
 * The UI must always derive status color from `toneFor(status)`, never invent it.
 *
 * NOTE (reconciliation): schema.js emits the tone `blue` for in-flight statuses.
 * The Badge component (packages/ui) accepts this as part of its tone superset.
 * ========================================================================== */

export type Tone = "success" | "blue" | "cyan" | "warning" | "danger" | "neutral";

export const STATUS_TONE: Record<string, Tone> = {
  // positive
  completed: "success",
  approved: "success",
  paid: "success",
  succeeded: "success",
  active: "success",
  won: "success",
  final: "success",
  countersigned: "success",
  // in-flight / waiting
  in_progress: "blue",
  running: "blue",
  processing: "blue",
  sent: "blue",
  viewed: "blue",
  member: "blue",
  client_active: "blue",
  waiting_client_approval: "warning",
  pending: "warning",
  pending_3ds: "warning",
  in_review: "warning",
  delayed: "warning",
  paused: "warning",
  abandoned: "warning",
  // negative
  failed: "danger",
  rejected: "danger",
  overdue: "danger",
  voided: "danger",
  lost: "danger",
  churned: "danger",
  // neutral
  draft: "neutral",
  not_started: "neutral",
  created: "neutral",
  queued: "neutral",
};

export const toneFor = (status: string): Tone => STATUS_TONE[status] ?? "neutral";
