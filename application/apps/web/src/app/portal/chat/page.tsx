import type { Metadata } from "next";
import { Alert, Card, EmptyState } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatThread, type ThreadPerson } from "../../ChatThread";
import type { ChatMessage } from "../../useRealtimeMessages";
import { StartChat } from "./StartChat";
import { ClientQuotes, type ClientQuote } from "./ClientQuotes";
import shell from "../../admin/admin.module.css";
import styles from "../../chat.module.css";

export const metadata: Metadata = { title: "Discovery chat" };
export const dynamic = "force-dynamic";

/**
 * Client discovery chat (handoff §12, Sprint 5B).
 *
 * The client talks directly to the Auxion team here. Every query is RLS-
 * scoped: this page can only ever load a conversation the caller participates in,
 * and internal notes / draft quotes are simply not reachable from this surface —
 * there is no client policy on those tables (proven in the 5B spike).
 */
export default async function PortalChatPage() {
  const actor = await getActor();
  const supabase = await createClient();

  const { data: me } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", actor!.userId)
    .maybeSingle();

  // RLS returns only conversations I'm a participant in.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, subject, state")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let messages: ChatMessage[] = [];
  let people: ThreadPerson[] = [];
  let readByOther: Record<string, boolean> = {};
  const attachments: Record<string, { id: string; name: string }[]> = {};
  let quotes: ClientQuote[] = [];

  if (conversation && me) {
    const [{ data: msgs }, { data: parts }] = await Promise.all([
      supabase
        .from("chat_messages")
        .select("id, conversation_id, author_id, body, kind, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("conversation_participants")
        .select("user_id, users(id, name, client_id)")
        .eq("conversation_id", conversation.id),
    ]);

    messages = (msgs ?? []) as ChatMessage[];
    people = (parts ?? []).map((p) => {
      const u = p.users as unknown as { id: string; name: string | null; client_id: string | null } | null;
      return { id: p.user_id, name: u?.name ?? "Team", internal: !u?.client_id };
    });

    // For my own messages, has the other side read them?
    const myIds = messages.filter((m) => m.author_id === me.id).map((m) => m.id);
    if (myIds.length > 0) {
      const { data: reads } = await supabase
        .from("message_reads")
        .select("message_id, user_id")
        .in("message_id", myIds)
        .neq("user_id", me.id);
      readByOther = Object.fromEntries((reads ?? []).map((r) => [r.message_id, true]));
    }

    const allIds = messages.map((m) => m.id);
    if (allIds.length > 0) {
      const { data: atts } = await supabase.from("message_attachments").select("id, name, message_id").in("message_id", allIds);
      for (const a of atts ?? []) (attachments[a.message_id] ??= []).push({ id: a.id, name: a.name });
    }

    // RLS returns only quotes past the draft-quote gate (sent or later).
    const { data: rawQuotes } = await supabase
      .from("quotes")
      .select("id, title, status, total, client_note, quote_items(id, label, quantity, amount, sort)")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false });
    quotes = (rawQuotes ?? []).map((q) => ({
      id: q.id, title: q.title, status: q.status, total: q.total, client_note: q.client_note,
      items: ((q.quote_items as ClientQuote["items"] | null) ?? []).slice().sort((a, b) => (a as unknown as { sort: number }).sort - (b as unknown as { sort: number }).sort),
    }));
  }

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>Discovery chat</h1>
      </div>

      <div className={shell.content}>
        {!conversation ? (
          <Card>
            <EmptyState
              icon="mail"
              title="Talk to your Auxion strategist"
              body="Start a conversation and a real member of our team will pick it up — no bots. They'll already have your assessment and recommended plan in front of them."
            />
            <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--space-4)" }}>
              <StartChat />
            </div>
          </Card>
        ) : (
          <Card style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 220px)", minHeight: 420 }}>
            {conversation.state === "awaiting_admin" ? (
              <Alert tone="neutral" title="Message sent">
                Your Auxion team has your message and will reply here. You&apos;ll see their answer live.
              </Alert>
            ) : null}
            {quotes.length > 0 ? <ClientQuotes quotes={quotes} /> : null}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} className={styles.thread}>
              <ChatThread
                conversationId={conversation.id}
                meId={me!.id}
                initialMessages={messages}
                people={people}
                readByOther={readByOther}
                attachments={attachments}
              />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
