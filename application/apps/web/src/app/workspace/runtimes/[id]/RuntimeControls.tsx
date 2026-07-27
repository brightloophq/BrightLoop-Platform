"use client";

/** Runtime validate + health-check controls (Phase F · Sprint F3). Thin: drives
 *  the runtime server actions via a transition and surfaces safe errors only. */

import { useState, useTransition } from "react";
import { Icon } from "@brightloop/ui";
import { checkRuntimeHealthAction, validateRuntimeAction, type ActionResult } from "../actions";
import controls from "./controls.module.css";

export function RuntimeControls({ runtimeId }: { runtimeId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = (fn: () => Promise<ActionResult>, ok: string) => {
    setMsg(null); setError(null);
    start(async () => { const r = await fn(); if (r.ok) setMsg(ok); else setError(r.error ?? "That action could not be completed."); });
  };

  return (
    <div className={controls.bar}>
      <button className={controls.btn} disabled={pending} onClick={() => act(() => validateRuntimeAction(runtimeId), "Runtime validated.")}><Icon name="check-circle" size={14} /> Validate connection</button>
      <button className={controls.btn} disabled={pending} onClick={() => act(() => checkRuntimeHealthAction(runtimeId), "Health checked.")}><Icon name="activity" size={14} /> Check health</button>
      {msg && <span className={controls.ok}>{msg}</span>}
      {error && <span className={controls.err}>{error}</span>}
    </div>
  );
}
