"use client";

/**
 * Deployment controls (Phase F · Sprint F3). Renders only the actions valid for the
 * current lifecycle status and routes each through the runtime server actions. The
 * SERVER enforces authorization + approval + policy — the UI never deploys directly,
 * and rollback restores a previous immutable version (never a rebuild). Errors that
 * cross back are safe canonical messages only.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@brightloop/ui";
import {
  activateAction, approveDeploymentAction, deployAction, pauseAction, reconcileAction, requestApprovalAction,
  resumeAction, retryAction, rollbackAction, validateDeploymentAction, type ActionResult,
} from "../../runtimes/actions";
import controls from "../../runtimes/[id]/controls.module.css";

interface Props { deploymentId: string; status: string; workspaceId: string; previousDeploymentId: string | null }

export function DeploymentControls({ deploymentId, status, workspaceId, previousDeploymentId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<ActionResult>, ok: string) => {
    setMsg(null); setError(null);
    start(async () => { const r = await fn(); if (r.ok) { setMsg(ok); router.refresh(); } else setError(r.error ?? "That action could not be completed."); });
  };

  const btn = (label: string, icon: string, fn: () => Promise<ActionResult>, okMsg: string, cls = "") => (
    <button className={`${controls.btn} ${cls}`} disabled={pending} onClick={() => act(fn, okMsg)}><Icon name={icon} size={14} /> {label}</button>
  );

  return (
    <div className={controls.bar}>
      {(status === "draft" || status === "validating") && btn("Validate", "check-circle", () => validateDeploymentAction(deploymentId), "Validated.")}
      {status === "awaiting_approval" && btn("Approve", "check-circle", () => approveDeploymentAction(deploymentId), "Approved — ready to deploy.", controls.btnPrimary)}
      {(status === "draft" || status === "validating") && btn("Request approval", "lock", () => requestApprovalAction(deploymentId), "Approval requested.")}
      {status === "queued" && btn("Deploy", "rocket", () => deployAction(deploymentId), "Deployed.", controls.btnPrimary)}
      {status === "deployed" && btn("Activate", "check-circle", () => activateAction(deploymentId), "Activated.", controls.btnPrimary)}
      {status === "active" && btn("Pause", "lock", () => pauseAction(deploymentId), "Paused — new runs blocked.")}
      {status === "paused" && btn("Resume", "rocket", () => resumeAction(deploymentId), "Resumed.")}
      {status === "failed" && btn("Retry", "arrow-right", () => retryAction(deploymentId), "Retried.")}
      {(status === "deployed" || status === "active" || status === "degraded") && btn("Reconcile", "activity", () => reconcileAction(deploymentId), "Reconciled.")}
      {status === "active" && previousDeploymentId && btn("Roll back", "arrow-left", () => rollbackAction(workspaceId, deploymentId, previousDeploymentId, "manual rollback"), "Rolled back to the previous version.", controls.btnDanger)}
      {msg && <span className={controls.ok}>{msg}</span>}
      {error && <span className={controls.err}>{error}</span>}
    </div>
  );
}
