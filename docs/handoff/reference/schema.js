/* =============================================================================
 * BrightLoop Platform — Canonical Data Model & State Machines
 * SINGLE SOURCE OF TRUTH. Demo data files (data.js, dashboard-data.js,
 * admin-data.js) and all future backend code align to these shapes, enums and
 * transitions. Addresses audit issue C-1.
 *
 * Convention: every stateful entity has a `status` drawn from its STATES enum;
 * legal moves are defined in TRANSITIONS[status] -> [allowedNextStatus].
 * `can(entity, next)` validates a transition. Timestamps are ISO-8601 strings.
 * IDs are prefixed ULIDs (usr_, cli_, prj_ …) for readability + sortability.
 * ============================================================================= */

/* ---- ROLES & PERMISSIONS ------------------------------------------------- */
const ROLES = {
  // Internal (BrightLoop)
  owner:         { scope: 'internal', label: 'Owner' },
  admin:         { scope: 'internal', label: 'Admin' },
  team_member:   { scope: 'internal', label: 'Team Member' },
  // External (Client org)
  client_admin:  { scope: 'client',   label: 'Client Admin' },
  client_member: { scope: 'client',   label: 'Client Member' },
};

// Capability matrix — enforced in UI (hide/disable) AND at the data layer (RLS).
const PERMISSIONS = {
  owner:         ['*'],
  admin:         ['clients.*','projects.*','finance.*','marketing.*','automation.*','team.read','analytics.*','settings.*'],
  team_member:   ['projects.read','projects.update','deliverables.*','messages.*','meetings.*','clients.read'],
  client_admin:  ['own.project.read','own.deliverables.approve','own.invoices.pay','own.contract.sign','own.team.invite','own.reports.read','own.settings'],
  client_member: ['own.project.read','own.deliverables.comment','own.reports.read'],
};

/* ---- CORE ENTITIES (field contracts) ------------------------------------- */
const ENTITIES = {
  User:        ['id','name','email','role','clientId','status','avatarUrl','lastActiveAt','invitedAt','acceptedAt'],
  Client:      ['id','company','plan','mrr','lifecycle','healthScore','accountManagerId','createdAt','industry','seats'],
  Lead:        ['id','name','company','email','industry','value','stage','ownerId','source','createdAt'],
  Assessment:  ['id','clientId','answers','scores','healthScore','recommendations','status','submittedAt'],
  Configuration:['id','clientId','assessmentId','modules','ownedAssets','estimateLow','estimateHigh','status','updatedAt'],
  Proposal:    ['id','clientId','configurationId','lineItems','subtotal','deposit','total','status','sentAt','viewedAt','decidedAt','changeNote'],
  Contract:    ['id','proposalId','clientId','sowUrl','clientSignature','countersignature','status','signedAt'],
  Invoice:     ['id','clientId','projectId','type','amount','dueDate','status','issuedAt','paidAt'],
  Payment:     ['id','invoiceId','method','last4','amount','status','processedAt','failureReason'],
  Project:     ['id','clientId','name','status','progress','startDate','targetDate','managerId','milestoneIds'],
  Milestone:   ['id','projectId','title','status','order','dueDate','approvedAt'],
  Deliverable: ['id','projectId','milestoneId','title','type','status','version','fileUrl','feedback','submittedAt'],
  FileUpload:  ['id','ownerId','deliverableId','name','size','mime','status','progress','error','uploadedAt'],
  Automation:  ['id','clientId','name','provider','trigger','status','runs','lastRunAt','lastError'],
  Meeting:     ['id','clientId','title','type','startAt','durationMin','attendees','status','joinUrl'],
  Notification:['id','userId','kind','title','body','entityRef','read','createdAt'],
  Message:     ['id','threadId','authorId','clientId','body','attachments','createdAt'],
  Consent:     ['id','userId','type','granted','version','timestamp','ip'],
};

/* ---- STATE MACHINES ------------------------------------------------------ *
 * Each: STATES (enum) + TRANSITIONS (legal graph). Terminal states have [].   */

const MACHINES = {
  onboarding: {
    states: ['not_started','in_progress','abandoned','completed'],
    initial: 'not_started',
    transitions: {
      not_started:['in_progress'],
      in_progress:['in_progress','abandoned','completed'], // self = save-and-exit (resumable)
      abandoned:['in_progress'],                            // resume via magic link
      completed:[],
    },
    // Edge: abandon → return. Persist step + answers; email nudge after 24h/72h.
    resumable: true,
  },

  lead: {
    states: ['new','qualified','proposal_sent','won','lost'],
    initial: 'new',
    transitions: { new:['qualified','lost'], qualified:['proposal_sent','lost'], proposal_sent:['won','lost'], won:[], lost:['qualified'] },
  },

  clientLifecycle: {
    states: ['prospect','member','client_active','post_launch','churned','renewed'],
    initial: 'prospect',
    // prospect(browsing)→member(account, pre-payment)→client_active(paid)→post_launch→renewed/churned
    transitions: {
      prospect:['member'], member:['client_active','churned'],
      client_active:['post_launch','churned'], post_launch:['renewed','churned'],
      renewed:['client_active','post_launch','churned'], churned:['member'],
    },
  },

  proposal: {
    states: ['draft','sent','viewed','accepted','change_requested','revised','expired'],
    initial: 'draft',
    transitions: {
      draft:['sent'], sent:['viewed','expired'], viewed:['accepted','change_requested','expired'],
      change_requested:['revised'], revised:['sent'],       // re-issue after edits
      accepted:[], expired:['revised'],
    },
    // Edge: change after acceptance → clone to 'revised' (v2), original stays accepted/superseded.
  },

  contract: {
    states: ['pending','sent','signed_client','countersigned','active','voided'],
    initial: 'pending',
    transitions: {
      pending:['sent'], sent:['signed_client','voided'],
      signed_client:['countersigned','voided'], countersigned:['active'], active:[], voided:['sent'],
    },
    // Edge: not signed → blocks project kickoff; reminder cadence; proposal stays 'accepted'.
  },

  invoice: {
    states: ['draft','sent','pending','paid','overdue','failed','refunded'],
    initial: 'draft',
    transitions: {
      draft:['sent'], sent:['pending','paid'], pending:['paid','overdue','failed'],
      overdue:['paid','failed'], failed:['pending','paid'], paid:['refunded'], refunded:[],
    },
    // Edge: overdue → dunning (email + dashboard banner + soft project hold at N+7).
  },

  payment: {
    states: ['initiated','processing','succeeded','failed','pending_3ds'],
    initial: 'initiated',
    transitions: {
      initiated:['processing'], processing:['succeeded','failed','pending_3ds'],
      pending_3ds:['succeeded','failed'], failed:['processing'], succeeded:[],
    },
    // Edge: failed → inline retry + alternate method, invoice stays unpaid, no activation.
    //       pending_3ds/ACH → "payment processing" waiting state, activation deferred.
  },

  project: {
    states: ['created','active','paused','delayed','in_review','completed','post_launch'],
    initial: 'created',
    transitions: {
      created:['active'], active:['paused','delayed','in_review'],
      paused:['active'], delayed:['active','in_review'], in_review:['active','completed'],
      completed:['post_launch'], post_launch:[],
    },
    // Edge: paused/delayed → banner + revised target date + reason; timeline shows hold.
    //       multiple projects per client → project switcher; dashboard aggregates.
  },

  milestone: {
    states: ['pending','in_progress','waiting_client_approval','revision_requested','approved','completed'],
    initial: 'pending',
    transitions: {
      pending:['in_progress'], in_progress:['waiting_client_approval'],
      waiting_client_approval:['approved','revision_requested'],
      revision_requested:['in_progress'], approved:['completed'], completed:[],
    },
    // Edge: waiting_client_approval → client action card + SLA nudge; blocks dependent work.
  },

  deliverable: {
    states: ['draft','submitted','in_review','approved','revision_requested','rejected','final'],
    initial: 'draft',
    transitions: {
      draft:['submitted'], submitted:['in_review'],
      in_review:['approved','revision_requested','rejected'],
      revision_requested:['submitted'], rejected:['submitted'],  // new version
      approved:['final'], final:[],
    },
    // Edge: revision/reject → captures feedback, bumps version, reopens upload.
  },

  fileUpload: {
    states: ['queued','uploading','success','failed'],
    initial: 'queued',
    transitions: { queued:['uploading'], uploading:['success','failed'], failed:['queued'], success:[] },
    // Edge: failed → per-file retry, keep others, show reason (size/type/network).
  },

  automation: {
    states: ['active','running','success','failed','paused'],
    initial: 'active',
    transitions: {
      active:['running','paused'], running:['success','failed'],
      success:['active'], failed:['active','paused'], paused:['active'],
    },
    // Edge: failed → alert to admin, error surfaced, retry/mute; client sees "attention needed".
  },
};

/* ---- TRANSITION GUARD ---------------------------------------------------- */
function can(machineName, from, to) {
  const m = MACHINES[machineName];
  return !!m && Array.isArray(m.transitions[from]) && m.transitions[from].includes(to);
}
function nextStates(machineName, from) {
  return (MACHINES[machineName]?.transitions[from]) || [];
}
function isTerminal(machineName, state) {
  return nextStates(machineName, state).length === 0;
}

/* ---- UI STATE TOKENS (status → tone) ------------------------------------- *
 * Maps any status to a design-system Badge/Alert tone for consistent display. */
const STATUS_TONE = {
  // positive
  completed:'success', approved:'success', paid:'success', succeeded:'success', active:'success', won:'success', final:'success', countersigned:'success',
  // in-flight / waiting
  in_progress:'blue', running:'blue', processing:'blue', sent:'blue', viewed:'blue', member:'blue', client_active:'blue',
  waiting_client_approval:'warning', pending:'warning', pending_3ds:'warning', in_review:'warning', delayed:'warning', paused:'warning', abandoned:'warning',
  // negative
  failed:'danger', rejected:'danger', overdue:'danger', voided:'danger', lost:'danger', churned:'danger',
  // neutral
  draft:'neutral', not_started:'neutral', created:'neutral', queued:'neutral',
};
const toneFor = (status) => STATUS_TONE[status] || 'neutral';
