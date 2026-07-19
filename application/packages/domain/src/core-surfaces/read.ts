/* =============================================================================
 * Core surfaces read models (Phase 1B) — pure, UI- and DB-free.
 *
 * The canonical System is seven DOMAINS assembled toward a target Index (Auxion
 * DNA §02/§03; PDFs 01–03). This file owns the READ side: the shared System Map
 * view (used by Business Scan, Activation, and the Console), the Business Scan
 * diagnosis view, the Activation assembly view, plus read/write authorization
 * helpers. All pure + deterministic + unit-testable. Writes flow through the
 * CoreSurfaceService.
 * ========================================================================== */

import {
  DOMAIN_KEYS,
  DOMAIN_META,
  type Domain,
  type DomainKey,
  type DomainStatus,
  type BusinessScan,
  type ScanFinding,
  type FindingPriority,
} from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { assertCapability } from "../capabilities.js";

/* ---- authorization -------------------------------------------------------- */

export const CORE_READ_CAP = "transformation.read";
export const SCAN_WRITE_CAP = "transformation.scan.write";
export const ACTIVATION_WRITE_CAP = "transformation.activation.write";

/** Core surfaces are internal-only (RLS enforces it). */
export function assertCoreSurfacesRead(actor: Actor): void {
  assertCapability(actor, CORE_READ_CAP);
}
/** Owner/admin (transformation.*) or team_member (explicit) may diagnose/scan. */
export function canWriteScans(actor: Actor): boolean {
  return actor.role === "owner" || actor.role === "admin" || actor.role === "team_member";
}
/** Same internal set may drive Activation (bringing domains Operating). */
export function canActivate(actor: Actor): boolean {
  return canWriteScans(actor);
}

/* ---- System Map (shared instrument) --------------------------------------- */

export const DOMAIN_TARGET_DEFAULT = 92;

export interface SystemMapNode {
  key: DomainKey;
  code: string; // "WEB"
  label: string; // "Digital"
  status: DomainStatus;
  /** Lit (amber) when Operating; planned/dashed otherwise. */
  lit: boolean;
  score: number | null;
}

export interface SystemMapView {
  /** Always the canonical seven, in canonical order — missing rows default to unlit. */
  nodes: SystemMapNode[];
  operatingCount: number;
  index: {
    /** 0–100 composite (mean of scored domains; 0 when none scored). */
    value: number;
    target: number;
    /** value/target as 0–1, clamped. Drives the gauge arc. */
    pct: number;
    delta: number | null;
  };
}

/** Which score field the map should read (baseline for a fresh scan, current for a live System). */
export type ScoreBasis = "baseline" | "current";

/**
 * Build the canonical System Map from a client's domain rows. Deterministic: the
 * seven nodes are always present in `DOMAIN_KEYS` order; a missing row is treated
 * as not_operating with a null score. The composite Index is the rounded mean of
 * the non-null scores under `basis` (0 when none are scored).
 */
export function buildSystemMapView(
  domains: readonly Domain[],
  opts: { basis?: ScoreBasis; target?: number; delta?: number | null } = {},
): SystemMapView {
  const basis = opts.basis ?? "current";
  const target = opts.target ?? DOMAIN_TARGET_DEFAULT;
  const byKey = new Map<DomainKey, Domain>();
  for (const d of domains) byKey.set(d.key, d);

  const nodes: SystemMapNode[] = DOMAIN_KEYS.map((key) => {
    const d = byKey.get(key);
    const status: DomainStatus = d?.status ?? "not_operating";
    const score = d ? (basis === "baseline" ? d.baselineScore : d.currentScore) : null;
    return { key, code: DOMAIN_META[key].code, label: DOMAIN_META[key].label, status, lit: status === "operating", score };
  });

  const scored = nodes.map((n) => n.score).filter((s): s is number => s !== null);
  const value = scored.length > 0 ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : 0;
  const pct = target > 0 ? Math.max(0, Math.min(1, value / target)) : 0;

  return {
    nodes,
    operatingCount: nodes.filter((n) => n.lit).length,
    index: { value, target, pct, delta: opts.delta ?? null },
  };
}

/* ---- Business Scan (Diagnose — PDF 01) ------------------------------------ */

const PRIORITY_RANK: Record<FindingPriority, number> = { high: 0, medium: 1, low: 2 };

export interface ScanFindingRow {
  domainKey: DomainKey;
  domainCode: string;
  domainLabel: string;
  finding: string;
  baseline: string | null;
  priority: FindingPriority;
}

export interface BusinessScanView {
  scan: BusinessScan;
  systemMap: SystemMapView; // baseline basis
  /** Diagnosis ledger, highest priority first (stable within a priority). */
  findings: ScanFindingRow[];
  /** "N gaps to close" — findings that are not low priority. */
  gapCount: number;
}

export function buildBusinessScanView(
  scan: BusinessScan,
  domains: readonly Domain[],
  findings: readonly ScanFinding[],
): BusinessScanView {
  const rows: ScanFindingRow[] = findings
    .map((f) => ({
      domainKey: f.domainKey,
      domainCode: DOMAIN_META[f.domainKey].code,
      domainLabel: DOMAIN_META[f.domainKey].label,
      finding: f.finding,
      baseline: f.baseline,
      priority: f.priority,
    }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return {
    scan,
    systemMap: buildSystemMapView(domains, { basis: "baseline", target: scan.targetIndex }),
    findings: rows,
    gapCount: rows.filter((r) => r.priority !== "low").length,
  };
}

/* ---- Activation (Activate — PDF 02) --------------------------------------- */

export interface ActivationStep {
  key: DomainKey;
  code: string;
  label: string;
  status: DomainStatus;
  live: boolean;
}

export interface ActivationView {
  systemMap: SystemMapView; // current basis
  /** The assembly sequence — one row per domain, canonical order. */
  steps: ActivationStep[];
  operatingCount: number;
  total: number;
  /** True when all seven domains are Operating. */
  complete: boolean;
}

export function buildActivationView(
  domains: readonly Domain[],
  opts: { target?: number; delta?: number | null } = {},
): ActivationView {
  const systemMap = buildSystemMapView(domains, { basis: "current", ...opts });
  const steps: ActivationStep[] = systemMap.nodes.map((n) => ({
    key: n.key,
    code: n.code,
    label: n.label,
    status: n.status,
    live: n.status === "operating",
  }));
  const operatingCount = systemMap.operatingCount;
  return { systemMap, steps, operatingCount, total: DOMAIN_KEYS.length, complete: operatingCount === DOMAIN_KEYS.length };
}
