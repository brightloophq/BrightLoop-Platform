/* =============================================================================
 * Shared AI Action surface — types (PX.1e).
 *
 * One reusable AI action + result contract for every product page. The UI never
 * calls a provider: an action is run by a server action that routes through the
 * certified Copilot/capability path and returns one of these results.
 * ========================================================================== */

export type AiResultKind =
  | "summary"
  | "explanation"
  | "risk"
  | "recommendation"
  | "comparison"
  | "forecast"
  | "action-plan";

/** A source record / signal / citation backing a result. */
export interface AiEvidence {
  readonly label: string;
  readonly href?: string;
}

/** An executable follow-up the result offers — always gated + confirmed downstream. */
export interface AiExecutable {
  readonly label: string;
  readonly capabilityKey: string;
  readonly requiredPermission: string | null;
  readonly requiresApproval: boolean;
}

/** The rendered AI result (advisory by default; execution stays on the certified path). */
export interface AiResult {
  readonly kind: AiResultKind;
  readonly title: string;
  readonly body: string;
  readonly evidence: readonly AiEvidence[];
  readonly confidence?: number; // 0..1
  readonly generatedAt: string; // ISO
  /** Capability/intent that produced it (trust). */
  readonly capability?: string;
  /** Advisory (read-only) vs an executable proposal. */
  readonly advisory: boolean;
  /** True when this is a deterministic, clearly-labeled Demo Mode output. */
  readonly demo: boolean;
  /** Optional gated follow-up action (write-safety flows through the app service). */
  readonly executable?: AiExecutable | null;
}

/** Discriminated result of running an AI action (returned by the server action). */
export type AiActionOutcome =
  | { readonly status: "ok"; readonly result: AiResult }
  | { readonly status: "denied"; readonly message: string }
  | { readonly status: "unavailable"; readonly reason: string; readonly futurePhase: boolean }
  | { readonly status: "error"; readonly message: string };

/** One AI action a page offers. */
export interface AiActionDef {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly kind: AiResultKind;
}

/** Client-side view state for the shared component. */
export type AiViewState =
  | { readonly phase: "idle" }
  | { readonly phase: "loading"; readonly actionKey: string }
  | { readonly phase: "done"; readonly actionKey: string; readonly outcome: AiActionOutcome };
