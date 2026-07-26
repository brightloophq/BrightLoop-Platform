# Auxion — Phase D Production Certification (D8)

Final engineering certification of the Phase D **Transformation Execution** platform
(D1 Workspace → D2 Initiative Lifecycle → D3+D4 Execution Management → D5+D6
Planning & Performance → D7 Collaboration). D8 is a certification & hardening
sprint: it adds tests, benchmarks, and documentation, and corrects defects only
where an audit exposed one. It introduces **no new product capability**.

---

## 1. Phase D overview

Five bounded contexts sit on top of the certified Phase A–C intelligence engine.
After a scan produces a certified proposal, a **transformation workspace** is
seeded; **initiatives** move through a lifecycle; work is **executed** (reviews,
tasks, assignments, dependencies); it is **planned & measured** (timelines,
milestones, KPIs, derived progress & workspace health); and teams stay aware via
**collaboration** (activity feed, notifications, subscriptions, mentions, inbox,
read receipts). All internal-only.

## 2. Bounded-context map & dependency direction

```
Schema → Domain (pure) → Repository Ports → Application Use-Cases → Read Models
                                                     ↓
                                              Data Adapters → Database (RLS)
                                                     ↓
                                                  Web UI (server actions)
```

Dependency rules (verified by import audit, D8 PART 1):
- Domain imports **nothing** from `@supabase/*`, `next`, `react`, or app/data/web. Pure + io-free.
- Data adapters implement domain ports; data never imports application.
- Application depends only on domain ports; never imports `next`/web.
- Web routes/actions call application use-cases; the Phase D surface performs **no direct Supabase writes**.
- No circular dependencies. Collaboration does not own execution state; planning does not own task state; workspace does not duplicate initiative state.

> Accepted pre-existing item: legacy **non-Phase-D** onboarding/delivery actions
> (`app/(public)/start`, `app/admin/delivery-actions`) use direct admin writes.
> Out of Phase D scope; not a D8 regression.

## 3. Aggregate inventory

| Context | Aggregates (versioned*) | Append-only records |
|---|---|---|
| Workspace | TransformationWorkspace* | transformation_activity |
| Initiative | Initiative* | — |
| Execution | Review*, Task*, Dependency | Assignment |
| Planning/Perf | Timeline*, Milestone*, KPI* | ProgressSnapshot |
| Collaboration | InboxItem* | Mention, CollabNotification |

`*` = optimistic concurrency via `save(next, expectedVersion)`.

## 4. Lifecycle diagrams (state machines)

- **Workspace**: seeded lifecycle; tenant-owned.
- **Initiative**: `seeded → planned → active → completed → archived` (archived terminal).
- **Review**: `pending → approved | changes_requested | rejected`; `changes_requested → approved`; approved/rejected terminal.
- **Task**: `todo → in_progress → blocked → completed` (completed terminal).
- **Timeline**: `planned → active → completed`; `planned|active → cancelled`; completed/cancelled terminal. Variance derived, never stored-and-edited.
- **Milestone**: `pending → completed | missed` (both terminal).
- **Inbox**: `unread ⇄ read`; `unread|read → archived`; `unread|read → dismissed`. **archived + dismissed both terminal** (corrected in D8).

## 5. Capability matrix (Phase D)

| Capability | owner | admin | team_member | client_* |
|---|---|---|---|---|
| transformation.read/write | ✅ | ✅ | ✅ | ❌ |
| initiative.read/write | ✅ | ✅ | ✅ | ❌ |
| review.read/write | ✅ | ✅ | ✅ | ❌ |
| task.read/write | ✅ | ✅ | ✅ | ❌ |
| assignment.write / dependency.write | ✅ | ✅ | ✅ | ❌ |
| timeline / milestone / kpi .read/write | ✅ | ✅ | ✅ | ❌ |
| progress.read | ✅ | ✅ | ✅ | ❌ |
| notification / subscription / mention .read/write | ✅ | ✅ | ✅ | ❌ |
| transformation.approve | ✅ | ✅ | ❌ | ❌ |

owner via `*`; admin via namespace wildcards; team_member via explicit grants
(no approval authority). **Client roles hold zero Phase D capabilities** — Phase D
is internal-only. Proven exhaustively by `authorization-matrix.test.ts`.

## 6. Repository-port map

`TransformationExecutionRepositories` (11): workspaces, initiatives, activities,
reviews, tasks, assignments, dependencies, timelines, milestones, kpis, progress.
`CollaborationRepositories` (5): subscriptions, mentions, notifications, inbox,
readReceipts. Both optional on `AppContext`, asserted via `requireExecution` /
`requireCollaboration` (clean 503 when unwired).

## 7. Database-table map

`transformation_workspace`, `transformation_initiative`, `transformation_activity`
(+`actor_id`), `transformation_review`, `transformation_task`,
`transformation_assignment`, `transformation_dependency`, `transformation_timeline`,
`transformation_milestone`, `transformation_kpi`, `transformation_progress_snapshot`,
`collaboration_subscription`, `collaboration_mention`, `collaboration_notification`,
`collaboration_inbox_item`, `collaboration_read_receipt`.

## 8. RLS model

Every Phase D table: RLS **enabled**, internal-only via `bl_is_internal()`.
`for all` policies on mutable tables; **select+insert-only** policies on append-only
tables. Client roles read zero rows (pgTAP-proven per context). Per-user privacy
(inbox/notification/subscription/receipt ownership) is enforced in the
**application layer** (`userId === actor.userId`), inside the internal-only RLS
boundary — accepted for the current internal-only production scope; documented as
a future hardening item (per-user RLS predicates) if collaboration data is ever
exposed beyond internal operators.

## 9. Append-only records

`transformation_activity`, `transformation_assignment`,
`transformation_progress_snapshot`, `collaboration_mention`,
`collaboration_notification`. Enforced by (a) no mutation method on the port,
(b) no update/delete grant, (c) no update/delete RLS policy, (d) the
`bl_txexec_append_only()` trigger (`before update or delete`) raising `P0001`.
pgTAP exercises the trigger as table owner after `reset role` (so RLS does not
hide rows and falsely pass).

## 10. Concurrency model

Optimistic: `save(next, expectedVersion)` matches `id + version`; zero rows →
`conflict` → mapped to `ConflictError` (409). Two writers at version N: one wins
(N→N+1), the stale one conflicts and does not overwrite, and no duplicate activity
is appended for the rejected write. Certified in `certification-flows.test.ts`
(FLOW D) across review/task/timeline/milestone/kpi and the existing suites.

## 11. Idempotency behavior

| Command | Behavior |
|---|---|
| exact-target lifecycle retry (approve/complete/transition already-in-state) | idempotent success (no version bump, activity replay via content-addressed `commandId`) |
| duplicate subscribe | deterministic ConflictError (unique index) |
| repeated unsubscribe | idempotent (delete is no-op if absent) |
| mark read/unread same target | idempotent |
| markEntityRead | idempotent (skips if receipt exists) |
| calculateProgress / calculateWorkspaceHealth | intentional append-only repeat (new snapshot each call; history) |
| createMention | append-only repeat (each note is a distinct record) |

Activity append is idempotent on `commandId`; replays are no-ops.

## 12. Read-model inventory

Workspace Summary, Initiative Summary, Execution Rollup, Initiative/Workspace
Performance (timeline+milestones+progress; KPIs+timelines+per-initiative progress+
health), Activity Feed (filter+cursor pagination), User Inbox (+unread/total),
Notification Summary, Subscription Summary. All read-only; consistency asserted in
`performance.test.ts` (totals, unread exclusions, deterministic latest-snapshot,
pagination without skip/dup, bounded progress).

## 13. Progress formula

Weighted, derived, clamped `[0,100]` int:
`review 20 + tasks 40·(done/total) + dependencies 10 + milestones 20·(done/total) + timeline 10`.
Workspace progress = mean of initiative progresses. Never manually editable —
`progress.read` gates the calculate use-cases; there is no `progress.write`.

## 14. Health policy

Derived from review/task/dependency completion ratios + aggregate timeline variance
+ KPI statuses → `healthy | warning | critical` with reasons. **Critical**: task
completion <30%, any off-track KPI, or timeline >14 days late. **Warning**: task
<60%, review <50%, unsatisfied dependencies, any at-risk KPI, or any lateness.

## 15. Collaboration model

Activity feed over the existing append-only log (+`actor_id`). Notifications
generated from events (never external): one per recipient, actor never
self-notified, recipients de-duplicated. Subscriptions resolve recipients; mentions
resolve caller-supplied user ids (no internal-user directory yet). Inbox wraps a
notification with mutable status under optimistic concurrency. Read receipts are
per-user, per-entity.

## 16. Known limitations (accepted for internal-only production)

- Per-user collaboration privacy is application-enforced within internal-only RLS.
- D3–D6 mutations do not yet auto-invoke `notifyEvent` (reusable emitter ready).
- Mention resolution requires caller-supplied user ids.
- Pre-D7 activities have null `actorId`.
- No external delivery / realtime transport (by design).

## 17. Production operations & recovery

- **Failed deployment / rollback**: redeploy the prior green commit; app is
  stateless; DB is forward-compatible (additive migrations only).
- **Failed migration**: migrations are **additive & forward-fix only** (no unsafe
  down migrations). Fix forward with a new additive migration; never hand-edit
  applied history.
- **Generated-type drift**: download the CI `generated-db-types` artifact, commit
  it verbatim (never hand-edit), re-run the gate.
- **Stuck version conflict**: the client reloads the aggregate and retries; conflicts
  are explicit `ConflictError` (409), never silent overwrites.
- **Partial collaboration write**: notifications/inbox are append/insert; a retry
  re-runs the use-case; append-only history stays coherent; no harmful duplicate
  durable effect (subscribe dedups, activity replays on `commandId`).
- **Unavailable Supabase**: repositories return infrastructure errors mapped to a
  generic 5xx; `requireExecution`/`requireCollaboration` yield a clean 503 when
  unwired. No secret leaks in error output.

## 18. Deferred roadmap (out of Phase D scope)

Per-user RLS predicates; external delivery channels (email/Slack/SMS/push);
realtime transport; automation workflows; AI summaries; client portal; exports;
auto-notify wiring into D3–D6 mutations; internal-user directory for mention
resolution.

## 19. Verification summary (see PR for exact totals)

Local gate green: `pnpm -w typecheck` (17/17), `lint` (17/17), `test` (all
packages), `build` (9/9). Migration/pgTAP/RLS/adapter/type-drift/gitleaks verified
in CI. Certification suites: authorization matrix, E2E flows A–E, tenant isolation,
concurrency, idempotency, read-model consistency, and a factory-based performance
benchmark (no committed fixtures).
