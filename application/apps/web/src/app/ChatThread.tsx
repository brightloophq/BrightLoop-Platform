"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@brightloop/ui";
import { sendMessage, markConversationRead, attachFile } from "./conversation-actions";
import { useRealtimeMessages, type ChatMessage } from "./useRealtimeMessages";
import styles from "./chat.module.css";

export interface MessageAttachment {
  id: string;
  name: string;
}

export interface ThreadPerson {
  id: string;
  name: string;
  /** true for Auxion-side participants — drives the "Auxion" author label */
  internal: boolean;
}

interface ChatThreadProps {
  conversationId: string;
  /** The signed-in user's `users.id` — decides which side each bubble sits on. */
  meId: string;
  initialMessages: ChatMessage[];
  people: ThreadPerson[];
  /** message_id -> true if the OTHER side has read it (for the sender's ✓ Read). */
  readByOther: Record<string, boolean>;
  /** message_id -> attachments on that message (rendered as download links). */
  attachments?: Record<string, MessageAttachment[]>;
}

/**
 * The live conversation thread — used verbatim by both the client portal and the
 * admin workspace. It renders server-fetched history, then subscribes to
 * `postgres_changes` for live inserts (RLS-filtered — see useRealtimeMessages).
 *
 * The composer posts through the `sendMessage` server action, so the write also
 * passes RLS. On mount and whenever new messages arrive, it records the reader's
 * receipts so the other side sees ✓ Read.
 */
export function ChatThread({ conversationId, meId, initialMessages, people, readByOther, attachments = {} }: ChatThreadProps) {
  const router = useRouter();
  const messages = useRealtimeMessages(conversationId, initialMessages);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    fd.set("file", file);
    const res = await attachFile(fd);
    setPending(false);
    if (fileRef.current) fileRef.current.value = "";
    if (res.ok) router.refresh();
    else setError(res.error ?? "Couldn't upload that file.");
  }

  const nameById = useMemo(() => {
    const m = new Map<string, ThreadPerson>();
    for (const p of people) m.set(p.id, p);
    return m;
  }, [people]);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // Record read receipts for anything not authored by me, whenever the thread changes.
  useEffect(() => {
    const hasIncoming = messages.some((m) => m.author_id !== meId);
    if (hasIncoming) void markConversationRead(conversationId);
  }, [messages.length, conversationId, meId]);

  async function submit() {
    const text = body.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    fd.set("body", text);
    const res = await sendMessage(fd);
    setPending(false);
    if (res.ok) setBody("");
    else setError(res.error ?? "Couldn't send that message.");
  }

  return (
    <div className={styles.thread}>
      <div className={styles.scroll} ref={scrollRef}>
        {messages.length === 0 ? (
          <p className={styles.empty}>No messages yet. Say hello to get the conversation started.</p>
        ) : (
          messages.map((m) => {
            const mine = m.author_id === meId;
            const person = nameById.get(m.author_id);
            const label = person ? (person.internal ? "Auxion" : person.name) : "Someone";
            return (
              <div key={m.id} className={[styles.msg, mine ? styles.msgMine : styles.msgTheirs].join(" ")}>
                <div className={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs].join(" ")}>
                  {m.body}
                  {(attachments[m.id] ?? []).map((a) => (
                    <div key={a.id} style={{ marginTop: 4 }}>
                      <a href={`/api/attachments/${a.id}`} style={{ color: "inherit", textDecoration: "underline" }}>
                        Download {a.name}
                      </a>
                    </div>
                  ))}
                </div>
                <div className={styles.meta}>
                  {!mine ? <span className={styles.author}>{label}</span> : null}
                  <time dateTime={m.created_at}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  {mine && readByOther[m.id] ? <span>· Read</span> : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.composer}>
        <input ref={fileRef} type="file" onChange={onPickFile} style={{ display: "none" }} aria-hidden="true" />
        <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={pending} aria-label="Attach a file" title="Attach a file">
          📎
        </Button>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
          rows={2}
          aria-label="Message"
        />
        <Button variant="primary" onClick={() => void submit()} disabled={pending || body.trim().length === 0}>
          Send
        </Button>
      </div>
      {error ? <p className={styles.err}>{error}</p> : null}
    </div>
  );
}
