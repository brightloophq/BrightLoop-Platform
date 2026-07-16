"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  kind: string;
  created_at: string;
}

/**
 * Live messages for one conversation via Supabase Realtime `postgres_changes`.
 *
 * The subscription runs under the signed-in user's JWT, so RLS filters the feed:
 * a client is only ever pushed inserts for a conversation they participate in —
 * proven in the RLS spike before this was built. Realtime is not a second
 * security surface to get right; it inherits the same policies.
 *
 * Starts from a server-rendered `initial` list (so there's no empty flash and
 * the first paint is SSR), then appends live inserts. De-dupes on id because the
 * sender also gets their own insert echoed back.
 */
export function useRealtimeMessages(conversationId: string, initial: ChatMessage[]): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);

  useEffect(() => {
    setMessages(initial);
    const supabase = createClient();

    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // `initial` is intentionally excluded — conversationId drives resubscribe,
    // and a server refetch remounts with a fresh initial anyway.
  }, [conversationId]);

  return messages;
}
