/* =============================================================================
 * State machines — ported verbatim from docs/handoff/reference/schema.js.
 * A status change is legal ONLY if `to` is listed in transitions[from].
 * Terminal states have []. Guards here are mirrored by the DB transition trigger
 * (packages/db) and enforced in the service layer (packages/domain).
 * ========================================================================== */

export const MACHINES = {
  onboarding: {
    states: ["not_started", "in_progress", "abandoned", "completed"],
    initial: "not_started",
    transitions: {
      not_started: ["in_progress"],
      in_progress: ["in_progress", "abandoned", "completed"], // self = save-and-exit (resumable)
      abandoned: ["in_progress"], // resume via magic link
      completed: [],
    },
    resumable: true,
  },

  lead: {
    states: ["new", "qualified", "proposal_sent", "won", "lost"],
    initial: "new",
    transitions: {
      new: ["qualified", "lost"],
      qualified: ["proposal_sent", "lost"],
      proposal_sent: ["won", "lost"],
      won: [],
      lost: ["qualified"],
    },
  },

  clientLifecycle: {
    states: ["prospect", "member", "client_active", "post_launch", "churned", "renewed"],
    initial: "prospect",
    transitions: {
      prospect: ["member"],
      member: ["client_active", "churned"],
      client_active: ["post_launch", "churned"],
      post_launch: ["renewed", "churned"],
      renewed: ["client_active", "post_launch", "churned"],
      churned: ["member"],
    },
  },

  proposal: {
    states: ["draft", "sent", "viewed", "accepted", "change_requested", "revised", "expired"],
    initial: "draft",
    transitions: {
      draft: ["sent"],
      sent: ["viewed", "expired"],
      viewed: ["accepted", "change_requested", "expired"],
      change_requested: ["revised"],
      revised: ["sent"],
      accepted: [],
      expired: ["revised"],
    },
  },

  // Sprint 5C — the binding quote a strategist builds inside a discovery
  // conversation. `draft` and `internal_review` are BrightLoop-only; the client
  // never sees the quote until it is explicitly `sent` (enforced by RLS, not
  // just this machine). `accepted` feeds the proposal machine via `converted`.
  quote: {
    states: [
      "draft",
      "internal_review",
      "sent",
      "viewed",
      "revision_requested",
      "revised",
      "accepted",
      "rejected",
      "expired",
      "converted",
    ],
    initial: "draft",
    transitions: {
      draft: ["internal_review", "sent"],
      internal_review: ["sent", "draft"], // kick back to draft for edits
      sent: ["viewed", "accepted", "rejected", "expired"],
      viewed: ["accepted", "rejected", "revision_requested", "expired"],
      revision_requested: ["revised"],
      revised: ["internal_review", "sent"], // re-review or re-send the revised offer
      accepted: ["converted"], // hand off to a proposal
      rejected: ["revised"], // re-engage with a new offer
      expired: ["revised"],
      converted: [],
    },
  },

  contract: {
    states: ["pending", "sent", "signed_client", "countersigned", "active", "voided"],
    initial: "pending",
    transitions: {
      pending: ["sent"],
      sent: ["signed_client", "voided"],
      signed_client: ["countersigned", "voided"],
      countersigned: ["active"],
      active: [],
      voided: ["sent"],
    },
  },

  invoice: {
    states: ["draft", "sent", "pending", "paid", "overdue", "failed", "refunded"],
    initial: "draft",
    transitions: {
      draft: ["sent"],
      sent: ["pending", "paid"],
      pending: ["paid", "overdue", "failed"],
      overdue: ["paid", "failed"],
      failed: ["pending", "paid"],
      paid: ["refunded"],
      refunded: [],
    },
  },

  payment: {
    states: ["initiated", "processing", "succeeded", "failed", "pending_3ds"],
    initial: "initiated",
    transitions: {
      initiated: ["processing"],
      processing: ["succeeded", "failed", "pending_3ds"],
      pending_3ds: ["succeeded", "failed"],
      failed: ["processing"],
      succeeded: [],
    },
  },

  project: {
    states: ["created", "active", "paused", "delayed", "in_review", "completed", "post_launch"],
    initial: "created",
    transitions: {
      created: ["active"],
      active: ["paused", "delayed", "in_review"],
      paused: ["active"],
      delayed: ["active", "in_review"],
      in_review: ["active", "completed"],
      completed: ["post_launch"],
      post_launch: [],
    },
  },

  milestone: {
    states: [
      "pending",
      "in_progress",
      "waiting_client_approval",
      "revision_requested",
      "approved",
      "completed",
    ],
    initial: "pending",
    transitions: {
      pending: ["in_progress"],
      in_progress: ["waiting_client_approval"],
      waiting_client_approval: ["approved", "revision_requested"],
      revision_requested: ["in_progress"],
      approved: ["completed"],
      completed: [],
    },
  },

  deliverable: {
    states: ["draft", "submitted", "in_review", "approved", "revision_requested", "rejected", "final"],
    initial: "draft",
    transitions: {
      draft: ["submitted"],
      submitted: ["in_review"],
      in_review: ["approved", "revision_requested", "rejected"],
      revision_requested: ["submitted"],
      rejected: ["submitted"],
      approved: ["final"],
      final: [],
    },
  },

  fileUpload: {
    states: ["queued", "uploading", "success", "failed"],
    initial: "queued",
    transitions: {
      queued: ["uploading"],
      uploading: ["success", "failed"],
      failed: ["queued"],
      success: [],
    },
  },

  automation: {
    states: ["active", "running", "success", "failed", "paused"],
    initial: "active",
    transitions: {
      active: ["running", "paused"],
      running: ["success", "failed"],
      success: ["active"],
      failed: ["active", "paused"],
      paused: ["active"],
    },
  },
} as const;

export type MachineName = keyof typeof MACHINES;
export type MachineState<M extends MachineName> = (typeof MACHINES)[M]["states"][number];

type Transitions = Record<string, readonly string[]>;

/**
 * Transition guard. A move is legal only if `to` is listed in
 * `MACHINES[machine].transitions[from]`. Any move not listed is prohibited.
 */
export function can(machine: MachineName, from: string, to: string): boolean {
  const m = MACHINES[machine];
  if (!m) return false;
  const next = (m.transitions as Transitions)[from];
  return Array.isArray(next) && next.includes(to);
}

export function nextStates(machine: MachineName, from: string): readonly string[] {
  return (MACHINES[machine]?.transitions as Transitions | undefined)?.[from] ?? [];
}

export function isTerminal(machine: MachineName, state: string): boolean {
  return nextStates(machine, state).length === 0;
}

export function statesOf(machine: MachineName): readonly string[] {
  return MACHINES[machine].states;
}

export function isValidState(machine: MachineName, state: string): boolean {
  return (MACHINES[machine].states as readonly string[]).includes(state);
}

export const MACHINE_NAMES = Object.keys(MACHINES) as MachineName[];
