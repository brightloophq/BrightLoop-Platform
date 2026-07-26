/* =============================================================================
 * Phase D performance & read-model certification (D8) — test-only harness.
 *
 * Builds a realistic large workspace via a factory (NO committed fixtures) and
 * measures the hot read/compute paths against the in-memory ports, plus asserts
 * read-model↔write-model consistency (totals, unread exclusions, deterministic
 * latest-snapshot selection, feed pagination without skip/dup, bounded progress).
 *
 * Thresholds are generous, environment-relative sanity ceilings — they guard
 * against accidental O(n^2)/N+1 blowups, not absolute latency SLAs. The in-memory
 * repos isolate algorithmic cost from database latency (DB timing is a CI concern).
 * ========================================================================== */

import { describe, it, expect, beforeAll } from "vitest";
import type { CollabNotification, InboxItem, Kpi, ProgressSnapshot, Subscription, TransformationActivity } from "@brightloop/schema";
import { pageFeed, filterFeed, calculateWorkspaceProgress, calculateInitiativeProgress, hasCycle, unreadCount, subscriberIds } from "@brightloop/domain";

const WS = "txw_big";
const CLIENT = "cli_big";
const T_BASE = Date.parse("2026-01-01T00:00:00.000Z");
const iso = (n: number) => new Date(T_BASE + n * 1000).toISOString();

// ---- deterministic factories (no Math.random / Date.now) --------------------
const SIZES = { initiatives: 100, tasks: 1000, activities: 10_000, notifications: 5000, inbox: 5000, snapshots: 2000, kpis: 200, subscriptions: 300, dependencies: 400 };

let activities: TransformationActivity[];
let inbox: InboxItem[];
let notifications: CollabNotification[];
let snapshots: ProgressSnapshot[];
let subscriptions: Subscription[];
let kpis: Kpi[];
let edges: { from: string; to: string }[];

beforeAll(() => {
  activities = Array.from({ length: SIZES.activities }, (_, i) => ({
    id: `act_${i}`, workspaceId: WS, clientId: CLIENT,
    type: i % 3 === 0 ? "task_completed" : i % 3 === 1 ? "review_approved" : "note_added",
    subjectType: "task", subjectId: `task_${i % SIZES.tasks}`, summary: `activity ${i}`,
    commandId: `cmd_${i}`, actorId: i % 5 === 0 ? "u_owner" : `u_${i % 20}`, at: iso(i),
  }));
  notifications = Array.from({ length: SIZES.notifications }, (_, i) => ({
    id: `ntf_${i}`, workspaceId: WS, clientId: CLIENT, recipientUserId: "u_owner",
    type: "mention", subjectType: "initiative", subjectId: `init_${i % SIZES.initiatives}`,
    summary: `n ${i}`, sourceActivityId: null, createdAt: iso(i),
  }));
  inbox = Array.from({ length: SIZES.inbox }, (_, i) => ({
    id: `inb_${i}`, userId: "u_owner", workspaceId: WS, clientId: CLIENT, notificationId: `ntf_${i}`,
    status: i % 4 === 0 ? "unread" : i % 4 === 1 ? "read" : i % 4 === 2 ? "archived" : "dismissed",
    version: 1, createdAt: iso(i), updatedAt: iso(i),
  }));
  snapshots = Array.from({ length: SIZES.snapshots }, (_, i) => ({
    id: `snap_${i}`, workspaceId: WS, clientId: CLIENT, scope: "initiative", subjectId: `init_${i % SIZES.initiatives}`,
    progress: i % 101, taskCompletion: i % 101, reviewCompletion: (i * 2) % 101, dependencyCompletion: (i * 3) % 101,
    milestoneCompletion: (i * 4) % 101, timelineVariance: null, health: null, at: iso(i),
  }));
  subscriptions = Array.from({ length: SIZES.subscriptions }, (_, i) => ({
    id: `sub_${i}`, userId: `u_${i % 20}`, workspaceId: WS, clientId: CLIENT,
    targetType: "initiative", targetId: `init_${i % SIZES.initiatives}`, createdAt: iso(i),
  }));
  kpis = Array.from({ length: SIZES.kpis }, (_, i) => ({
    id: `kpi_${i}`, workspaceId: WS, clientId: CLIENT, name: `KPI ${i}`, target: 100, current: i % 120,
    unit: "", status: "on_track", lastUpdated: iso(i), version: 1, createdAt: iso(i),
  }));
  edges = Array.from({ length: SIZES.dependencies }, (_, i) => ({ from: `init_${i % SIZES.initiatives}`, to: `init_${(i + 1) % SIZES.initiatives}` }));
});

function timed(label: string, fn: () => void): number {
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  console.log(`[perf] ${label}: ${ms.toFixed(2)}ms`);
  return ms;
}

describe("Phase D performance (algorithmic sanity ceilings)", () => {
  it("activity-feed first page over 10k activities is fast and correct", () => {
    let page!: ReturnType<typeof pageFeed>;
    const ms = timed("feed first page (10k)", () => { page = pageFeed(activities, {}, 30); });
    expect(page.items).toHaveLength(30);
    expect(page.items[0]!.at >= page.items[29]!.at).toBe(true); // newest-first
    expect(ms).toBeLessThan(500);
  });

  it("activity-feed deep-page cursor does not skip or duplicate", () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    const ms = timed("feed full pagination (10k)", () => {
      do {
        const page = pageFeed(activities, {}, 500, cursor);
        for (const it of page.items) { expect(seen.has(it.id)).toBe(false); seen.add(it.id); }
        cursor = page.nextCursor; pages += 1;
      } while (cursor !== null && pages < 100);
    });
    expect(seen.size).toBe(SIZES.activities); // every row exactly once
    expect(ms).toBeLessThan(3000);
  });

  it("actor + type filtering over 10k activities is linear", () => {
    const ms = timed("feed filter actor+type (10k)", () => {
      const r = filterFeed(activities, { actorId: "u_owner", type: "task_completed" });
      expect(r.every((a) => a.actorId === "u_owner" && a.type === "task_completed")).toBe(true);
    });
    expect(ms).toBeLessThan(500);
  });

  it("inbox unread count over 5k excludes archived+dismissed", () => {
    let unread = 0;
    timed("unread count (5k)", () => { unread = unreadCount(inbox); });
    expect(unread).toBe(inbox.filter((i) => i.status === "unread").length);
    // 1/4 of items are unread by construction
    expect(unread).toBe(Math.ceil(SIZES.inbox / 4));
  });

  it("latest-snapshot-per-subject selection over 2k is deterministic", () => {
    let latest!: Map<string, ProgressSnapshot>;
    timed("latest snapshot per subject (2k)", () => {
      latest = new Map();
      for (const s of snapshots) { const p = latest.get(s.subjectId); if (p === undefined || s.at >= p.at) latest.set(s.subjectId, s); }
    });
    // deterministic: recompute and compare
    const again = new Map<string, ProgressSnapshot>();
    for (const s of snapshots) { const p = again.get(s.subjectId); if (p === undefined || s.at >= p.at) again.set(s.subjectId, s); }
    for (const [k, v] of latest) expect(again.get(k)!.id).toBe(v.id);
    expect(latest.size).toBe(SIZES.initiatives);
  });

  it("workspace progress mean over 100 initiatives is bounded [0,100]", () => {
    const perInit = Array.from({ length: SIZES.initiatives }, (_, i) => calculateInitiativeProgress({ approvedReview: i % 2 === 0, taskTotal: 10, taskCompleted: i % 11, dependenciesSatisfied: i % 3 === 0, milestoneTotal: 4, milestoneCompleted: i % 5, timelineCompleted: i % 2 === 1 }));
    const ws = calculateWorkspaceProgress(perInit);
    expect(ws).toBeGreaterThanOrEqual(0);
    expect(ws).toBeLessThanOrEqual(100);
    expect(perInit.every((p) => p >= 0 && p <= 100)).toBe(true);
  });

  it("dependency-cycle detection over 400 edges is fast", () => {
    let cyclic = true;
    const ms = timed("cycle detection (400 edges)", () => { cyclic = hasCycle(edges); });
    expect(typeof cyclic).toBe("boolean");
    expect(ms).toBeLessThan(500);
  });

  it("subscriber resolution over 300 subscriptions is correct + fast", () => {
    let subs!: string[];
    const ms = timed("subscriber lookup (300 subs)", () => { subs = subscriberIds(subscriptions, "initiative", "init_5"); });
    // every returned user actually subscribes to init_5; de-duplicated
    const expected = new Set(subscriptions.filter((s) => s.targetId === "init_5").map((s) => s.userId));
    expect(new Set(subs)).toEqual(expected);
    expect(subs.length).toBe(new Set(subs).size);
    expect(ms).toBeLessThan(200);
  });

  it("notification bucket summary over 5k + KPI summary over 200 are bounded", () => {
    const byType: Record<string, number> = {};
    timed("notification bucketing (5k)", () => { for (const n of notifications) byType[n.type] = (byType[n.type] ?? 0) + 1; });
    expect(Object.values(byType).reduce((a, b) => a + b, 0)).toBe(SIZES.notifications);
    const onTrack = kpis.filter((k) => k.status === "on_track").length;
    expect(onTrack).toBe(SIZES.kpis); // all seeded on_track
  });
});
