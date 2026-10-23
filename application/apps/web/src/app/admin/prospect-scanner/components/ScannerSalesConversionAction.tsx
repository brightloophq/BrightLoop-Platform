"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, OperationalPanel, SectionRule } from "@brightloop/ui";

interface ConversionStatus {
  eligible: boolean;
  reason: string;
  conversion: { id: string; proposalId: string; convertedAt: string } | null;
}

interface ConversionResult {
  conversionId: string;
  proposalId: string;
  replayed: boolean;
}

export function ScannerSalesConversionAction({ runId, canConvert }: { runId: string; canConvert: boolean }) {
  const [status, setStatus] = useState<ConversionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/internal/runtime/package-conversion?runId=${encodeURIComponent(runId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Conversion eligibility could not be loaded.");
      setStatus(await response.json() as ConversionStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Conversion eligibility could not be loaded.");
    }
  }, [runId]);

  useEffect(() => {
    if (!canConvert) return;
    void refresh();
    const refreshForRun = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.runId === runId) void refresh();
    };
    window.addEventListener("auxion:commercial-review-updated", refreshForRun);
    window.addEventListener("auxion:proposal-pricing-saved", refreshForRun);
    return () => {
      window.removeEventListener("auxion:commercial-review-updated", refreshForRun);
      window.removeEventListener("auxion:proposal-pricing-saved", refreshForRun);
    };
  }, [canConvert, refresh, runId]);

  async function convert() {
    if (!status?.eligible || busy) return;
    setBusy(true);
    setError(null);
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/internal/runtime/package-conversion", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, idempotencyKey: idempotencyKey.current }),
      });
      const payload = await response.json().catch(() => null) as (ConversionResult & { error?: { message?: string } }) | null;
      if (!response.ok || !payload?.proposalId) {
        setError(payload?.error?.message ?? "Conversion did not complete. Refresh the package and retry.");
        if (response.status === 409) await refresh();
        return;
      }
      setStatus((previous) => previous ? { ...previous, conversion: {
        id: payload.conversionId, proposalId: payload.proposalId, convertedAt: new Date().toISOString(),
      } } : previous);
      idempotencyKey.current = null;
    } catch {
      // Keep the same key after a network failure so a retry resolves to the
      // original database transaction if its response was lost.
      setError("The conversion response was interrupted. Retry safely to check the existing result.");
    } finally {
      setBusy(false);
    }
  }

  if (!canConvert) return null;

  return (
    <OperationalPanel>
      <SectionRule index="13" label="Sales conversion" meta="private draft · no delivery" />
      {error ? <div role="alert" style={{ marginTop: "var(--space-3)" }}><Alert tone="danger" title="Conversion unavailable">{error}</Alert></div> : null}
      {status?.conversion ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <Alert tone="neutral" title="Private sales draft created">
            This proposal remains internal until an administrator explicitly sends it.
          </Alert>
          <p style={{ marginTop: "var(--space-3)" }}>
            <Link href={`/admin/proposals/${encodeURIComponent(status.conversion.proposalId)}`}>Open sales proposal</Link>
          </p>
        </div>
      ) : (
        <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <Button variant="primary" disabled={!status?.eligible || busy || status === null} onClick={convert}>
            {busy ? "Converting…" : "Convert to sales draft"}
          </Button>
          <span aria-live="polite" style={{ color: "var(--text-muted)", fontSize: "var(--fs-sm)" }}>
            {status?.eligible ? "Current approval and valid terms are confirmed." : status?.reason ?? "Checking current approval and commercial terms…"}
          </span>
        </div>
      )}
    </OperationalPanel>
  );
}
