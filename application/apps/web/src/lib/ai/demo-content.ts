import "server-only";

import type { AiResult } from "@brightloop/ui";
import type { AiActionMeta, AiRoute } from "./matrix";

/**
 * Deterministic, clearly-labeled Demo Mode AI outputs (PX.1e). Evidence-shaped and
 * realistic, but never a live provider call and always `demo: true`. Content is
 * static text keyed by route:action; the executive numbers align with the PX.1b/c
 * demo dataset so the story is coherent.
 */
interface DemoContent {
  readonly body: string;
  readonly evidence: readonly { label: string; href?: string }[];
  readonly confidence: number;
}

const CONTENT: Readonly<Record<string, DemoContent>> = {
  "console:summarize-today": {
    body: "Across your 5 organizations the portfolio is healthy (avg. Business Health 72, Transformation Index 75). 62 signals are in flight, 6 approvals are waiting, and 25 moves have completed this month. The standout is Onixus (Health 84); Green Horizon (59) needs the most attention.",
    evidence: [{ label: "Business Health — portfolio average" }, { label: "Approvals queue (6 pending)", href: "/admin/approvals" }, { label: "Recent activity feed" }],
    confidence: 0.86,
  },
  "console:explain-health": {
    body: "Business Health of 72 is the mean of the latest per-org scores. It's driven up by strong Delivery and Digital domains and held back by Analytics (63) and AI-layer (71) still assembling. Health rose +4 points this quarter as automation coverage climbed.",
    evidence: [{ label: "Per-domain scores (System Map)", href: "/admin/system-map" }, { label: "Health trend (12 mo.)" }],
    confidence: 0.84,
  },
  "console:top-risks": {
    body: "Top risks: (1) Analytics reporting is manual/weekly across two orgs — decisions lag the data; (2) 6 approvals are aging in the queue; (3) fragmented customer data caps the AI layer's ROI. One critical open risk (Green Horizon).",
    evidence: [{ label: "Critical open risks" }, { label: "Stale approvals", href: "/admin/approvals" }, { label: "Analytics domain findings" }],
    confidence: 0.8,
  },
  "console:next-actions": {
    body: "Recommended next actions: automate the two manual Analytics dashboards (clears two high-severity signals), clear the aging approvals, and approve the customer-data consolidation to unlock the AI layer. Highest ROI first.",
    evidence: [{ label: "Recommendations by category" }, { label: "Pipeline funnel (Signal → Execution)" }],
    confidence: 0.82,
  },
  "signals:explain-signal": {
    body: "This signal reflects a repeatable pattern in the underlying metric with medium-to-high confidence. Its evidence points to a process gap rather than a one-off. Severity is set by the state it's reached (Prioritized), not a separate field.",
    evidence: [{ label: "Signal evidence items" }, { label: "Transition history" }],
    confidence: 0.75,
  },
  "signals:action-plan": {
    body: "Draft plan: (1) validate the signal against the source metric, (2) assign an owner, (3) ship the smallest change that addresses the root cause, (4) measure against the baseline in the finding. Estimated 2–3 week cycle.",
    evidence: [{ label: "Related finding + baseline" }, { label: "Owner (by role)" }],
    confidence: 0.72,
  },
  "signals:estimate-impact": {
    body: "Modeled impact is moderate-to-high: addressing the underlying gap is estimated to move the domain score several points and reduce recurring escalations. Financial impact is withheld — cost inputs aren't available for this signal.",
    evidence: [{ label: "Domain score baseline" }],
    confidence: 0.68,
  },
  "analytics:explain-trend": {
    body: "The acquisition funnel is narrowing healthily (128 assessments → 27 activations, a ~21% end-to-end rate). Revenue is trending up (+78% over 12 months). The main drop-off is proposal → contract, where follow-up cadence is the lever.",
    evidence: [{ label: "Acquisition funnel" }, { label: "Revenue trend (12 mo.)" }],
    confidence: 0.83,
  },
  "analytics:summarize-period": {
    body: "This period: 214 leads, 61 accepted proposals, 34 signed contracts, 27 activations, and 52 paid invoices. Event volume is up week-over-week, led by project milestones and deliverable approvals.",
    evidence: [{ label: "Event activity stream" }, { label: "KPI tiles" }],
    confidence: 0.8,
  },
  "approvals:summarize-request": {
    body: "The pending requests cluster around move approvals and one recommendation. Most are low-risk and within policy; one carries a critical-risk dependency and should be reviewed first.",
    evidence: [{ label: "Approvals queue", href: "/admin/approvals" }],
    confidence: 0.79,
  },
  "approvals:highlight-risks": {
    body: "One request touches a critical open risk and should get a second reviewer; the rest are routine. None involve billing, permissions, secrets, or destructive records, so they follow the standard approval flow.",
    evidence: [{ label: "Critical open risks" }, { label: "Approval policy" }],
    confidence: 0.81,
  },
};

const CAPABILITY_LABEL: Record<AiRoute, string> = {
  console: "summary · demo",
  signals: "analysis · demo",
  analytics: "reporting · demo",
  approvals: "approval · demo",
};

const FALLBACK: DemoContent = {
  body: "This is a deterministic Demo Mode preview of the AI experience — no live model was called. In production this action runs on the certified Copilot/capability path over your real data.",
  evidence: [],
  confidence: 0.7,
};

/** Build a labeled, deterministic demo AiResult for a route/action. */
export function demoAiResult(route: AiRoute, key: string, meta: AiActionMeta, now: number): AiResult {
  const content = CONTENT[`${route}:${key}`] ?? FALLBACK;
  return {
    kind: meta.kind,
    title: meta.label,
    body: content.body,
    evidence: content.evidence,
    confidence: content.confidence,
    generatedAt: new Date(now).toISOString(),
    capability: CAPABILITY_LABEL[route],
    advisory: true,
    demo: true,
    executable: null,
  };
}
