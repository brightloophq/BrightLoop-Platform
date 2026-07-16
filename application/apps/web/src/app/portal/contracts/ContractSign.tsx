"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@brightloop/ui";
import { signContract } from "../../portal-sales-actions";

export interface PortalContract {
  id: string;
  status: string;
  client_signature: string | null;
  sow_url: string | null;
}

const TONE: Record<string, "warning" | "success" | "neutral" | "danger"> = {
  sent: "warning", signed_client: "warning", countersigned: "success", active: "success", voided: "danger",
};

/**
 * Client contract signing. In mock e-sign mode the client types their full name
 * as the signature (recorded via the bl_client_contract_sign RPC). A pending
 * contract is not visible here (RLS); only a `sent` one can be signed.
 */
export function ContractSign({ contracts }: { contracts: PortalContract[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sign(id: string) {
    if (!name.trim()) { setError("Type your full name to sign."); return; }
    setBusy(true); setError(null);
    const res = await signContract(id, name.trim());
    setBusy(false);
    if (res.ok) { setName(""); router.refresh(); } else setError(res.error ?? "Couldn't record your signature.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {contracts.map((c) => (
        <Card key={c.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
            <strong>Statement of Work</strong>
            <Badge tone={TONE[c.status] ?? "neutral"} dot>{c.status.replace(/_/g, " ")}</Badge>
          </div>
          {c.sow_url ? <p style={{ fontSize: "var(--fs-sm)", marginTop: "var(--space-2)" }}><a href={c.sow_url}>Review the SOW document</a></p> : null}

          {c.status === "sent" ? (
            <div style={{ marginTop: "var(--space-3)" }}>
              <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>
                Type your full legal name to sign. This is your electronic signature.
              </p>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="Full name" style={{ flex: 1 }} />
                <Button variant="primary" size="sm" disabled={busy} onClick={() => sign(c.id)}>Sign</Button>
              </div>
            </div>
          ) : c.status === "signed_client" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>Signed as <strong>{c.client_signature}</strong> — awaiting BrightLoop countersignature.</p>
          ) : c.status === "active" ? (
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-success, #1a7f4b)", marginTop: "var(--space-2)" }}>Contract is active. Signed by {c.client_signature} and countersigned by BrightLoop.</p>
          ) : null}
        </Card>
      ))}
      {error ? <p style={{ color: "var(--text-danger, #c0392b)", fontSize: "var(--fs-sm)" }}>{error}</p> : null}
    </div>
  );
}
