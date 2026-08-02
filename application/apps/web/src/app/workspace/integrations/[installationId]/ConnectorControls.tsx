"use client";

/**
 * Connector controls (Phase F · Sprint F4.1). The write surface for one connector:
 * validate, health-check, enable/disable, revoke. Each button calls a server
 * action; only a safe ApplicationError message is ever surfaced. Available actions
 * are gated by the installation's lifecycle status.
 */

import { useState, useTransition } from "react";
import { Alert, Button } from "@brightloop/ui";
import {
  checkConnectorHealthAction, disableConnectorAction, enableConnectorAction, revokeConnectorAction,
  validateConnectorAction, type ActionResult,
} from "../actions";

export function ConnectorControls({ installationId, status }: { installationId: string; status: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const act = (fn: (id: string) => Promise<ActionResult>, ok: string) => () => start(async () => {
    setMsg(null);
    const r = await fn(installationId);
    setMsg(r.ok ? { tone: "success", text: ok } : { tone: "danger", text: r.error ?? "The action failed." });
  });

  const terminal = status === "revoked";
  const canValidate = !terminal && status !== "disabled";
  const canDisable = status === "connected" || status === "degraded" || status === "validating" || status === "error";
  const canEnable = status === "disabled";

  return (
    <section style={{ marginBottom: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <Button variant="secondary" disabled={pending || !canValidate} onClick={act(validateConnectorAction, "Connection validated.")}>Validate</Button>
        <Button variant="secondary" disabled={pending || terminal} onClick={act(checkConnectorHealthAction, "Health checked.")}>Check health</Button>
        {canEnable && <Button variant="secondary" disabled={pending} onClick={act(enableConnectorAction, "Connector enabled.")}>Enable</Button>}
        {canDisable && <Button variant="secondary" disabled={pending} onClick={act(disableConnectorAction, "Connector disabled.")}>Disable</Button>}
        <Button variant="ghost" disabled={pending || terminal} onClick={act(revokeConnectorAction, "Connector revoked.")}>Revoke</Button>
      </div>
    </section>
  );
}
