"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ModuleContent, ServiceModule } from "@brightloop/schema";
import {
  ESTIMATE_DISCLAIMER,
  formatRange,
  healthBand,
  healthScore,
  isAssessmentComplete,
  recommendPlan,
  resolveSelection,
  scoreDimensions,
  type AssessmentQuestion,
  type Choice,
} from "@brightloop/domain";
import { Alert, Badge, Button, Card, Container, Eyebrow, Icon } from "@brightloop/ui";
import {
  EMPTY_FUNNEL,
  loadFunnel,
  saveFunnel,
  type FunnelState,
} from "./funnel-state";
import styles from "./funnel.module.css";

export interface FunnelCatalog {
  questions: AssessmentQuestion[];
  goals: { id: string; label: string; icon: string }[];
  plans: { id: string; name: string; tag: string; blurb: string; modules: string[] }[];
  modules: ServiceModule[];
  content: Record<string, ModuleContent>;
  assets: { key: string; label: string; icon: string }[];
  disciplines: readonly string[];
}

type Step = "assessment" | "configurator" | "recommendation" | "roadmap";
const ORDER: Step[] = ["assessment", "configurator", "recommendation", "roadmap"];
const LABELS: Record<Step, string> = {
  assessment: "Assessment",
  configurator: "Configure",
  recommendation: "Recommendation",
  roadmap: "Roadmap",
};

export function FunnelWizard({ step, catalog }: { step: Step; catalog: FunnelCatalog }) {
  const router = useRouter();
  const [state, setState] = useState<FunnelState>(EMPTY_FUNNEL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadFunnel());
    setHydrated(true);
  }, []);

  const update = (patch: Partial<FunnelState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveFunnel(next);
      return next;
    });
  };

  // Derived: recommended plan + selection + estimate.
  const scores = useMemo(() => scoreDimensions(catalog.questions, state.answers), [catalog.questions, state.answers]);
  const recommendedPlanId = useMemo(
    () => state.plan ?? recommendPlan(scores, state.goal ?? ""),
    [scores, state.goal, state.plan],
  );
  const activePlan = catalog.plans.find((p) => p.id === recommendedPlanId) ?? catalog.plans[0];
  const selectedModuleIds = useMemo(() => {
    const set = new Set(activePlan?.modules ?? []);
    for (const id of state.added) set.add(id);
    return [...set];
  }, [activePlan, state.added]);

  const selection = useMemo(
    () =>
      resolveSelection(catalog.modules, (mid) => catalog.content[mid] ?? null, {
        moduleIds: selectedModuleIds,
        choices: state.choices,
        inventory: state.inventory,
      }),
    [catalog.modules, catalog.content, selectedModuleIds, state.choices, state.inventory],
  );

  const goTo = (s: Step) => router.push(`/${s}`);

  if (!hydrated) {
    return (
      <Container width="wide">
        <div className={styles.shell} aria-busy="true" />
      </Container>
    );
  }

  return (
    <Container width="wide">
      <div className={styles.shell}>
        {/* progress rail */}
        <nav className={styles.rail} aria-label="Funnel progress">
          {ORDER.map((s, i) => {
            const isActive = s === step;
            const done = ORDER.indexOf(step) > i;
            return (
              <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                <Link href={`/${s}`} className={[styles.step, isActive ? styles.stepActive : done ? styles.stepDone : null].filter(Boolean).join(" ")}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  {LABELS[s]}
                </Link>
                {i < ORDER.length - 1 ? <span className={styles.stepSep}>→</span> : null}
              </span>
            );
          })}
        </nav>

        {step === "assessment" ? (
          <AssessmentStep catalog={catalog} state={state} update={update} onNext={() => goTo("configurator")} />
        ) : null}
        {step === "configurator" ? (
          <ConfiguratorStep catalog={catalog} state={state} update={update} selection={selection} onNext={() => goTo("recommendation")} onBack={() => goTo("assessment")} />
        ) : null}
        {step === "recommendation" ? (
          <RecommendationStep catalog={catalog} state={state} scores={scores} plan={activePlan} selection={selection} onNext={() => goTo("roadmap")} onBack={() => goTo("configurator")} />
        ) : null}
        {step === "roadmap" ? (
          <RoadmapStep selection={selection} state={state} plan={activePlan} onBack={() => goTo("recommendation")} />
        ) : null}
      </div>
    </Container>
  );
}

/* ---- Step 1: Assessment ---------------------------------------------------- */
function AssessmentStep({ catalog, state, update, onNext }: { catalog: FunnelCatalog; state: FunnelState; update: (p: Partial<FunnelState>) => void; onNext: () => void }) {
  const complete = isAssessmentComplete(catalog.questions, state.answers) && Boolean(state.goal);
  const score = healthScore(catalog.questions, state.answers);

  return (
    <>
      <div className={styles.head}>
        <Eyebrow>Step 1 · Business Health Assessment</Eyebrow>
        <h1 className={styles.title}>Where does your business stand?</h1>
        <p className={styles.lede}>Five questions across the loop. Your answers compute a Health Score — no guesswork, no fabricated numbers.</p>
      </div>

      <div className={styles.questions}>
        {catalog.questions.map((q) => (
          <Card key={q.id}>
            <h2 className={styles.question}>{q.q}</h2>
            <div className={styles.options}>
              {q.options.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={[styles.option, state.answers[q.id] === o.score ? styles.optionSel : null].filter(Boolean).join(" ")}
                  onClick={() => update({ answers: { ...state.answers, [q.id]: o.score } })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Card>
        ))}

        <Card>
          <h2 className={styles.question}>What&apos;s your main goal right now?</h2>
          <div className={styles.goals}>
            {catalog.goals.map((g) => (
              <button
                key={g.id}
                type="button"
                className={[styles.option, state.goal === g.id ? styles.optionSel : null].filter(Boolean).join(" ")}
                onClick={() => update({ goal: g.id })}
              >
                <Icon name={g.icon} size={16} /> {g.label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {score !== null ? (
        <div style={{ marginTop: "var(--space-5)" }}>
          <Alert tone="info" title={`Health Score so far: ${score} · ${healthBand(score)}`}>
            Computed from your answers. It updates as you answer more.
          </Alert>
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button variant="primary" size="lg" disabled={!complete} onClick={onNext}>
          Continue to configure
        </Button>
      </div>
    </>
  );
}

/* ---- Step 2: Configurator -------------------------------------------------- */
function ConfiguratorStep({ catalog, state, update, selection, onNext, onBack }: { catalog: FunnelCatalog; state: FunnelState; update: (p: Partial<FunnelState>) => void; selection: ReturnType<typeof resolveSelection>; onNext: () => void; onBack: () => void }) {
  const byDiscipline = catalog.disciplines.map((d) => ({
    discipline: d,
    modules: selection.rows.filter((r) => r.module.stage === d),
  }));

  const setChoice = (id: string, choice: Choice) => update({ choices: { ...state.choices, [id]: choice } });

  return (
    <>
      <div className={styles.head}>
        <Eyebrow>Step 2 · Configure your package</Eyebrow>
        <h1 className={styles.title}>Tell us what you already have</h1>
        <p className={styles.lede}>We remove what you own from the build, so you only pay for what you actually need. The estimate is a range for your planning — your real quote is built with a strategist.</p>
      </div>

      <div className={styles.configLayout}>
        <div>
          {byDiscipline.map(({ discipline, modules }) =>
            modules.length === 0 ? null : (
              <div key={discipline} className={styles.discipline}>
                <div className={styles.disciplineName}>{discipline}</div>
                {modules.map((r) => (
                  <div key={r.module.id} className={styles.moduleRow}>
                    <div>
                      <span className={styles.moduleName}>{r.module.name}</span>{" "}
                      <Badge tone={r.status === "Keep" ? "success" : r.status === "Improve" ? "cyan" : r.status === "Replace" ? "warning" : "blue"}>
                        {r.status}
                      </Badge>
                    </div>
                    <div className={styles.choiceRow}>
                      {(["have", "upgrade", "need"] as Choice[]).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={[styles.choiceBtn, r.choice === c ? styles.choiceBtnSel : null].filter(Boolean).join(" ")}
                          onClick={() => setChoice(r.module.id, c)}
                        >
                          {c === "have" ? "Have it" : c === "upgrade" ? "Upgrade" : "Build it"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ),
          )}
        </div>

        <aside className={styles.estimateRail}>
          <span className={styles.estLabel}>Estimated range</span>
          <span className={styles.estRange}>{formatRange([selection.low, selection.high])}</span>
          <span className={styles.estQualifier}>{ESTIMATE_DISCLAIMER}</span>
          {selection.savedHigh > 0 ? (
            <div className={styles.saving}>
              You&apos;re saving ~{formatRange([selection.savedLow, selection.savedHigh])} on things you already have.
            </div>
          ) : null}
        </aside>
      </div>

      <div className={styles.actions}>
        <Button variant="ghost" size="lg" onClick={onBack}>Back</Button>
        <Button variant="primary" size="lg" disabled={selection.active.length === 0} onClick={onNext}>
          See your recommendation
        </Button>
      </div>
    </>
  );
}

/* ---- Step 3: Recommendation ------------------------------------------------ */
function RecommendationStep({ scores, plan, selection, onNext, onBack }: { catalog: FunnelCatalog; state: FunnelState; scores: Record<string, number>; plan: FunnelCatalog["plans"][number] | undefined; selection: ReturnType<typeof resolveSelection>; onNext: () => void; onBack: () => void }) {
  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];

  return (
    <>
      <div className={styles.head}>
        <Eyebrow>Step 3 · Your recommendation</Eyebrow>
        <h1 className={styles.title}>{plan?.name ?? "Your plan"}</h1>
        <p className={styles.lede}>{plan?.blurb}</p>
      </div>

      <Card className={styles.recCard}>
        {weakest ? (
          <Alert tone="info" title={`Your weakest link is ${weakest[0]}`}>
            We&apos;ve prioritised the work that closes that gap first. This is a rule-based
            recommendation from your answers — no invented ROI figures.
          </Alert>
        ) : null}

        <div>
          <h2 className={styles.disciplineName}>Priority-ordered work</h2>
          {selection.active.map((r) => (
            <div key={r.module.id} className={styles.moduleRow}>
              <span className={styles.moduleName}>{r.module.name}</span>
              <Badge tone="neutral">{r.status}</Badge>
            </div>
          ))}
        </div>

        <div>
          <span className={styles.estLabel}>Estimated range</span>
          <span className={styles.estRange}>{formatRange([selection.low, selection.high])}</span>
          <span className={styles.estQualifier}>{ESTIMATE_DISCLAIMER}</span>
        </div>
      </Card>

      <div className={styles.actions}>
        <Button variant="ghost" size="lg" onClick={onBack}>Back</Button>
        <Button variant="primary" size="lg" onClick={onNext}>See your roadmap</Button>
      </div>
    </>
  );
}

/* ---- Step 4: Roadmap ------------------------------------------------------- */
function RoadmapStep({ selection, plan, onBack }: { selection: ReturnType<typeof resolveSelection>; state: FunnelState; plan: FunnelCatalog["plans"][number] | undefined; onBack: () => void }) {
  // Group active work into loop-ordered phases.
  const phases = ["Brand", "Build", "Automate", "Grow"]
    .map((d) => ({ discipline: d, items: selection.active.filter((r) => r.module.stage === d) }))
    .filter((p) => p.items.length > 0);

  return (
    <>
      <div className={styles.head}>
        <Eyebrow>Step 4 · Your growth roadmap</Eyebrow>
        <h1 className={styles.title}>Here&apos;s the path</h1>
        <p className={styles.lede}>Phased across the loop. The next step is a conversation with a real BrightLoop strategist — who builds your actual quote with you.</p>
      </div>

      <Card>
        {phases.map((phase, i) => (
          <div key={phase.discipline} className={styles.phase}>
            <span className={styles.phaseNum}>{i + 1}</span>
            <div>
              <strong style={{ color: "var(--text-primary)" }}>{phase.discipline}</strong>
              <p className={styles.lede} style={{ marginTop: "var(--space-1)", fontSize: "var(--fs-sm)" }}>
                {phase.items.map((r) => r.module.name).join(" · ")}
              </p>
            </div>
          </div>
        ))}
      </Card>

      <div style={{ marginTop: "var(--space-5)" }}>
        <Alert tone="info" title="Ready to talk it through?">
          Create your account to start a discovery conversation with a strategist. You&apos;ll
          review this plan together, ask questions, and get a real quote — no obligation.
        </Alert>
      </div>

      <div className={styles.actions}>
        <Button variant="ghost" size="lg" onClick={onBack}>Back</Button>
        <Button variant="primary" size="lg" asChild>
          <Link href={`/start?plan=${plan?.id ?? ""}`}>Create account &amp; talk to a strategist</Link>
        </Button>
      </div>
    </>
  );
}
