"use client";

/**
 * Install form (Phase F · Sprint F4.1). Renders a connector's declared config
 * fields, collects values (secret fields as password inputs — never echoed back),
 * and calls `installConnectorAction`. On success it navigates to the new
 * installation. All validation + the secret boundary live in the use-case.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input } from "@brightloop/ui";
import type { ConfigFieldDTO } from "@brightloop/application";
import { installConnectorAction } from "../../actions";

export function InstallForm({ connectorId, defaultName, fields }: { connectorId: string; defaultName: string; fields: ConfigFieldDTO[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState(defaultName);

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  function submit() {
    setError(null);
    const config: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.key];
      if (raw === undefined || raw === "") continue;
      config[f.key] = f.type === "number" ? Number(raw) : f.type === "boolean" ? raw === "true" : raw;
    }
    start(async () => {
      const res = await installConnectorAction(connectorId, config, displayName);
      if (res.ok && res.installationId) router.push(`/workspace/integrations/${res.installationId}`);
      else setError(res.error ?? "The connector could not be installed.");
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", maxWidth: 520 }}>
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      {fields.map((f) => (
        f.type === "enum"
          ? <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: "var(--fw-medium)" as unknown as number }}>{f.label}{f.required ? "" : " (optional)"}</span>
              <select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} style={{ padding: "var(--space-2) var(--space-3)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--radius-md)", color: "var(--ink)" }}>
                <option value="">Select…</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          : <Input key={f.key} label={`${f.label}${f.secret ? " (secret)" : ""}`} optional={!f.required} hint={f.helpText ?? undefined} type={f.secret || f.type === "secret" ? "password" : f.type === "number" ? "number" : "text"} value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
      ))}
      <div><Button type="submit" disabled={pending}>{pending ? "Installing…" : "Install connector"}</Button></div>
    </form>
  );
}
