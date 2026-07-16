"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@brightloop/ui";
import { payInvoice } from "../../portal-sales-actions";

/**
 * Pay an outstanding invoice. In mock/test mode the deterministic provider
 * settles immediately (invoice → paid, and activation if the contract is active);
 * with a real Stripe key this would confirm a PaymentIntent client-side and the
 * webhook would settle.
 */
export function PayButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
      <Button
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setError(null);
          const res = await payInvoice(invoiceId);
          setBusy(false);
          if (res.ok) router.refresh(); else setError(res.error ?? "Payment failed.");
        }}
      >
        {busy ? "Processing…" : "Pay now"}
      </Button>
      {error ? <span style={{ color: "var(--text-danger, #c0392b)", fontSize: "var(--fs-xs)" }}>{error}</span> : null}
    </span>
  );
}
