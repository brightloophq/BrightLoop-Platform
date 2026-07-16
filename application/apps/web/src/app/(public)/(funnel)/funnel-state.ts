"use client";

/**
 * Funnel state — held CLIENT-SIDE until the prospect creates an account.
 *
 * A prospect is anonymous through assessment → configurator → recommendation →
 * roadmap. There is no authenticated identity yet, so there's nowhere on the
 * server to persist to (and RLS would deny it). We keep the working state in
 * sessionStorage so it survives navigation + refresh within the funnel, then
 * hand the whole thing to the signup action, which persists it to the new
 * client's Assessment + Configuration rows.
 *
 * This mirrors the `onboarding` machine's "resumable" intent for the anonymous
 * phase; a logged-in resume via magic link is a later enhancement.
 */

import type { Choice } from "@brightloop/domain";

const KEY = "bl_funnel_v1";

export interface FunnelState {
  /** questionId → chosen score. */
  answers: Record<string, number>;
  /** chosen business goal id. */
  goal: string | null;
  /** selected plan id (from recommendation or manual). */
  plan: string | null;
  /** extra module ids added beyond the plan. */
  added: string[];
  /** asset key → presence (have|weak|none). */
  inventory: Record<string, "have" | "weak" | "none">;
  /** module id → the client's choice. */
  choices: Record<string, Choice>;
  /** fast-track vs phased. */
  pace: "fast" | "phased";
}

export const EMPTY_FUNNEL: FunnelState = {
  answers: {},
  goal: null,
  plan: null,
  added: [],
  inventory: {},
  choices: {},
  pace: "phased",
};

export function loadFunnel(): FunnelState {
  if (typeof window === "undefined") return EMPTY_FUNNEL;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return EMPTY_FUNNEL;
    return { ...EMPTY_FUNNEL, ...(JSON.parse(raw) as Partial<FunnelState>) };
  } catch {
    return EMPTY_FUNNEL;
  }
}

export function saveFunnel(state: FunnelState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full / disabled — the funnel still works within the page */
  }
}

export function clearFunnel(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
