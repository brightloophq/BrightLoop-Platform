/* =============================================================================
 * Mention engine (Phase D · Sprint D7) — PURE.
 *
 * `@user` tokens are parsed from note text, de-duplicated, and (optionally)
 * resolved against a roster of known internal user ids. Unknown handles are
 * dropped (invalid mention). A self-mention is filtered by policy.
 * ========================================================================== */

import type { ActivitySubjectType, Mention } from "@brightloop/schema";

/** Matches `@handle` where a handle is word-chars / `.` / `_` / `-` (1–64 chars). */
const MENTION_RE = /@([A-Za-z0-9._-]{1,64})/g;

/** Extract unique `@handle` tokens (without the `@`) from free text, in order. Pure. */
export function parseMentionHandles(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const handle = match[1];
    if (handle !== undefined && !out.includes(handle)) out.push(handle);
  }
  return out;
}

/**
 * Resolve parsed handles to known user ids: keep only handles present in `roster`
 * (invalid mentions dropped), and drop the author (`byUserId`, self-mention policy).
 * `roster` maps handle → userId. Pure.
 */
export function resolveMentions(text: string, roster: ReadonlyMap<string, string>, byUserId: string): string[] {
  const ids: string[] = [];
  for (const handle of parseMentionHandles(text)) {
    const userId = roster.get(handle);
    if (userId !== undefined && userId !== byUserId && !ids.includes(userId)) ids.push(userId);
  }
  return ids;
}

export interface BuildMentionInput {
  id: string;
  workspaceId: string;
  clientId: string | null;
  subjectType: ActivitySubjectType;
  subjectId: string;
  mentionedUserId: string;
  mentionedByUserId: string;
  note: string | null;
  now: string;
}

/** Build a mention record (pure). */
export function buildMention(input: BuildMentionInput): Mention {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    mentionedUserId: input.mentionedUserId,
    mentionedByUserId: input.mentionedByUserId,
    note: input.note,
    createdAt: input.now,
  };
}
