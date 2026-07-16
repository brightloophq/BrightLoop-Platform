"use client";

import { useState } from "react";
import { Alert, Button, Input } from "@brightloop/ui";
import { createDeliverable, createMilestone } from "../../delivery-actions";
import styles from "../../cms.module.css";

interface MilestoneProps {
  projectId: string;
}

export function AddMilestone({ projectId }: MilestoneProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(fd: FormData) {
    setPending(true);
    setError(null);
    const r = await createMilestone(fd);
    setPending(false);
    if (r.ok) setOpen(false);
    else setError(r.error ?? "Failed");
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Add milestone
      </Button>
    );
  }

  return (
    <form action={onSubmit} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="projectId" value={projectId} />
      <div style={{ flex: 1, minWidth: 220 }}>
        <Input label="Milestone title" name="title" required />
      </div>
      <Input label="Due date" name="dueDate" type="date" optional />
      <Button type="submit" variant="primary" size="md" loading={pending}>
        {pending ? "Adding…" : "Add"}
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

interface DeliverableProps {
  projectId: string;
  milestones: { id: string; title: string }[];
}

export function AddDeliverable({ projectId, milestones }: DeliverableProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(fd: FormData) {
    setPending(true);
    setError(null);
    const r = await createDeliverable(fd);
    setPending(false);
    if (r.ok) setOpen(false);
    else setError(r.error ?? "Failed");
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Add deliverable
      </Button>
    );
  }

  return (
    <form action={onSubmit} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="projectId" value={projectId} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <Input label="Deliverable title" name="title" required />
      </div>
      <Input label="Type" name="type" optional placeholder="Design, PDF, …" />
      <div>
        <label className={styles.hint} htmlFor="milestoneId">
          Milestone
        </label>
        <select id="milestoneId" name="milestoneId" className={styles.select} style={{ height: 44 }}>
          <option value="">— none —</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="primary" size="md" loading={pending}>
        {pending ? "Adding…" : "Add"}
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
