"use server";

import { revalidatePath } from "next/cache";
import { assertCapability } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/analytics";

/**
 * Discovery-chat actions — shared by the client portal and the admin workspace.
 *
 * Every write goes through the SESSION client, so RLS decides what's allowed:
 *   * a participant may post a message (proven in the spike)
 *   * only internal roles may write internal notes / assign
 *   * a user records only their own reads
 * The server-side capability checks fail fast; RLS is the real boundary.
 */

export interface ChatResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function currentUserRow() {
  const actor = await getActor();
  if (!actor) throw new Error("Not signed in");
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("id, client_id").eq("auth_user_id", actor.userId).maybeSingle();
  if (!data) throw new Error("No user record");
  return { actor, supabase, userRow: data };
}

/**
 * Start (or reuse) a discovery conversation for the current client, and add the
 * whole internal team as participants so any admin can pick it up.
 */
export async function startConversation(): Promise<ChatResult> {
  try {
    const { supabase, userRow } = await currentUserRow();
    if (!userRow.client_id) return { ok: false, error: "Only client accounts can start a conversation" };

    // Reuse an open conversation rather than spawning duplicates.
    const { data: existing } = await supabase
      .from("conversations")
      .select("id")
      .eq("client_id", userRow.client_id)
      .neq("state", "closed")
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: true, id: existing.id };

    // Pull the client's funnel context to link.
    const [{ data: asm }, { data: cfg }] = await Promise.all([
      supabase.from("assessments").select("id").eq("client_id", userRow.client_id).limit(1).maybeSingle(),
      supabase.from("configurations").select("id").eq("client_id", userRow.client_id).limit(1).maybeSingle(),
    ]);

    const convId = id("conv");
    const { error } = await supabase.from("conversations").insert({
      id: convId,
      client_id: userRow.client_id,
      assessment_id: asm?.id ?? null,
      configuration_id: cfg?.id ?? null,
      subject: "Business discovery",
      state: "awaiting_admin",
    });
    if (error) return { ok: false, error: error.message };

    await supabase.from("conversation_participants").insert({ conversation_id: convId, user_id: userRow.id, role_in_convo: "member" });

    await emitEvent({ name: "conversation.start", clientId: userRow.client_id, source: "server" });
    revalidatePath("/portal/chat");
    return { ok: true, id: convId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to start conversation" };
  }
}

/** Send a message into a conversation the caller participates in. */
export async function sendMessage(formData: FormData): Promise<ChatResult> {
  try {
    const { supabase, userRow } = await currentUserRow();
    const conversationId = String(formData.get("conversationId") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const kind = String(formData.get("kind") ?? "text");
    if (!conversationId || !body) return { ok: false, error: "Message can't be empty" };
    if (body.length > 5000) return { ok: false, error: "Message is too long" };

    const messageId = id("msg");
    const { error } = await supabase.from("chat_messages").insert({
      id: messageId,
      conversation_id: conversationId,
      author_id: userRow.id,
      body,
      kind: kind === "link" ? "link" : "text",
    });
    if (error) return { ok: false, error: error.message };

    // conversations.last_message_at / state are bumped by an AFTER INSERT trigger
    // (bl_bump_conversation) — neither side writes conversation state directly.
    return { ok: true, id: messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send" };
  }
}

/**
 * Attach a file to a conversation. Uploads to the private `attachments` bucket
 * under the conversation's client folder, then records a message + attachment
 * row — all through the SESSION client, so storage RLS (own-org folder) and
 * table RLS (participant) both apply. A prospect can only ever write into their
 * own org's folder; an internal user can write to any (storage policies from
 * migration 0014).
 */
const MAX_UPLOAD = 10 * 1024 * 1024; // 10 MB

export async function attachFile(formData: FormData): Promise<ChatResult> {
  try {
    const { supabase, userRow } = await currentUserRow();
    const conversationId = String(formData.get("conversationId") ?? "").trim();
    const file = formData.get("file");
    if (!conversationId || !(file instanceof File) || file.size === 0) return { ok: false, error: "No file" };
    if (file.size > MAX_UPLOAD) return { ok: false, error: "File is too large (max 10 MB)" };

    // The folder is the CONVERSATION's client — both sides write under it.
    const { data: conv } = await supabase.from("conversations").select("client_id").eq("id", conversationId).maybeSingle();
    if (!conv) return { ok: false, error: "Conversation not found" };

    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${conv.client_id}/${conversationId}/${id("f")}-${safe}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) return { ok: false, error: upErr.message };

    const messageId = id("msg");
    const { error: mErr } = await supabase.from("chat_messages").insert({
      id: messageId, conversation_id: conversationId, author_id: userRow.id, body: `📎 ${file.name}`, kind: "link",
    });
    if (mErr) return { ok: false, error: mErr.message };

    const { error: aErr } = await supabase.from("message_attachments").insert({
      id: id("att"), message_id: messageId, storage_path: path, name: file.name,
      mime: file.type || "application/octet-stream", size: file.size,
    });
    if (aErr) return { ok: false, error: aErr.message };

    revalidatePath("/portal/chat");
    revalidatePath(`/admin/conversations/${conversationId}`);
    return { ok: true, id: messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

/** Mark every message in a conversation as read by the current user. */
export async function markConversationRead(conversationId: string): Promise<ChatResult> {
  try {
    const { supabase, userRow } = await currentUserRow();
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .neq("author_id", userRow.id);

    const rows = (messages ?? []).map((m) => ({ message_id: m.id, user_id: userRow.id }));
    if (rows.length > 0) {
      // upsert-style: ignore conflicts on the (message_id, user_id) pk
      await supabase.from("message_reads").upsert(rows, { onConflict: "message_id,user_id", ignoreDuplicates: true });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/* ---- internal-only actions (RLS refuses client roles) ---------------------- */

export async function addInternalNote(formData: FormData): Promise<ChatResult> {
  try {
    const { supabase, userRow } = await currentUserRow();
    const actor = await getActor();
    assertCapability(actor!, "clients.update"); // internal capability
    const conversationId = String(formData.get("conversationId") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    if (!conversationId || !body) return { ok: false, error: "Note can't be empty" };

    const { error } = await supabase.from("internal_notes").insert({
      id: id("note"),
      conversation_id: conversationId,
      author_id: userRow.id,
      body,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/conversations/${conversationId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function assignConversation(formData: FormData): Promise<ChatResult> {
  try {
    const { supabase, userRow } = await currentUserRow();
    const actor = await getActor();
    assertCapability(actor!, "clients.update");
    const conversationId = String(formData.get("conversationId") ?? "").trim();
    const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;

    // Ensure the assignee is a participant so they can see the conversation.
    if (assigneeId) {
      await supabase
        .from("conversation_participants")
        .upsert({ conversation_id: conversationId, user_id: assigneeId, role_in_convo: "admin" }, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
    }

    const { error } = await supabase
      .from("conversation_assignments")
      .upsert({ conversation_id: conversationId, assignee_user_id: assigneeId, assigned_by: userRow.id, at: new Date().toISOString() }, { onConflict: "conversation_id" });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/conversations/${conversationId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Join an internal user to a conversation (so they can respond). */
export async function joinConversationAsAdmin(conversationId: string): Promise<ChatResult> {
  try {
    const { supabase, userRow } = await currentUserRow();
    const actor = await getActor();
    assertCapability(actor!, "clients.update");
    await supabase
      .from("conversation_participants")
      .upsert({ conversation_id: conversationId, user_id: userRow.id, role_in_convo: "admin" }, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
