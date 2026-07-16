"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModuleContent, ServiceModule } from "@brightloop/schema";
import { recommendPlan, resolveSelection, scoreDimensions, healthScore } from "@brightloop/domain";
import { Alert, Button, Card, Input } from "@brightloop/ui";
import { loadFunnel, clearFunnel } from "../(funnel)/funnel-state";
import { createProspectAccount, type SignupState } from "./actions";
import styles from "../(funnel)/funnel.module.css";
import type { AssessmentQuestion } from "@brightloop/domain";

const EMPTY: SignupState = {};

interface Props {
  questions: AssessmentQuestion[];
  modules: ServiceModule[];
  content: Record<string, ModuleContent>;
  plans: { id: string; modules: string[] }[];
}

/**
 * Prospect signup form. Reads the client-side funnel state, computes the final
 * assessment/configuration payload, and submits it with the account details so
 * the server persists everything atomically.
 */
export function StartForm({ questions, modules, content, plans }: Props) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createProspectAccount, EMPTY);
  const [funnelJson, setFunnelJson] = useState("{}");

  useEffect(() => {
    const f = loadFunnel();
    const scores = scoreDimensions(questions, f.answers);
    const planId = f.plan ?? recommendPlan(scores, f.goal ?? "");
    const plan = plans.find((p) => p.id === planId);
    const moduleIds = [...new Set([...(plan?.modules ?? []), ...f.added])];
    const sel = resolveSelection(modules, (id) => content[id] ?? null, {
      moduleIds,
      choices: f.choices,
      inventory: f.inventory,
    });
    setFunnelJson(
      JSON.stringify({
        answers: f.answers,
        scores,
        healthScore: healthScore(questions, f.answers),
        goal: f.goal,
        plan: planId,
        modules: sel.active.map((r) => r.module.id),
        ownedAssets: Object.entries(f.inventory).filter(([, v]) => v === "have").map(([k]) => k),
        estimateLow: sel.low,
        estimateHigh: sel.high,
      }),
    );
  }, [questions, modules, content, plans]);

  useEffect(() => {
    if (state.ok) {
      clearFunnel();
      router.push("/portal");
    }
  }, [state.ok, router]);

  return (
    <Card>
      <form action={action} className={styles.head} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: "none" }} noValidate>
        <input type="hidden" name="funnel" value={funnelJson} />

        {state.error ? (
          <Alert tone="danger" title="Couldn't create your account">
            {state.error}
          </Alert>
        ) : null}

        <Input label="Your name" name="name" required autoComplete="name" />
        <Input label="Company" name="company" required autoComplete="organization" />
        <Input label="Email" name="email" type="email" required autoComplete="email" />
        <Input
          label="Create a password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 8 characters, with a letter and a number."
        />

        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {pending ? "Setting up…" : "Create account & start the conversation"}
        </Button>

        <p className={styles.estQualifier}>
          Creating an account saves your assessment and configuration, and opens a discovery
          conversation with a BrightLoop strategist. No payment, no obligation.
        </p>
      </form>
    </Card>
  );
}
