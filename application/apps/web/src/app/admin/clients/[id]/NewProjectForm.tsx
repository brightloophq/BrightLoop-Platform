"use client";

import { useState } from "react";
import { Alert, Button, Input } from "@brightloop/ui";
import { createProject } from "../../delivery-actions";

/** Create a delivery project under a specific client. */
export function NewProjectForm({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result = await createProject(formData);
    setPending(false);
    if (result.ok) setOpen(false);
    else setError(result.error ?? "Failed");
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        New project
      </Button>
    );
  }

  return (
    <form action={onSubmit} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="clientId" value={clientId} />
      <div style={{ flex: 1, minWidth: 240 }}>
        <Input label="Project name" name="name" required />
      </div>
      <Button type="submit" variant="primary" size="md" loading={pending}>
        {pending ? "Creating…" : "Create"}
      </Button>
      <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error ? (
        <div style={{ flexBasis: "100%" }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
    </form>
  );
}
