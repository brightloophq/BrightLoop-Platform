"use client";

/**
 * Workspace Copilot console (Phase F · Sprint F2).
 *
 * The conversational PRESENTATION surface over Phases D & E. It renders the
 * conversation rail, the cited message thread, permission-aware suggested actions
 * and a slash-command composer, and it drives everything through the workspace
 * Copilot SERVER ACTIONS — it never reaches data itself. All parsing/rendering
 * logic lives in the tested pure helpers (`lib/workspace/copilot`); this component
 * only wires state to markup. Renders identically full-page and docked (`dock`).
 */

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Icon } from "@brightloop/ui";
import type { CopilotActionDTO, CopilotCitationDTO, CopilotConversationDTO, CopilotMessageDTO } from "@brightloop/application";
import {
  groupConversations, isStreaming, parseSmartInput, renderMarkdown, streamingLabel, suggestCommands,
  type InlineToken, type MarkdownBlock,
} from "@/lib/workspace/copilot";
import { createConversationAction, executeActionAction, sendMessageAction } from "./actions";
import styles from "./copilot.module.css";

interface Props {
  conversations: CopilotConversationDTO[];
  activeId: string | null;
  activeTitle: string | null;
  messages: CopilotMessageDTO[];
  citations: CopilotCitationDTO[];
  suggestions: CopilotActionDTO[];
  dock?: boolean;
}

function Inline({ spans }: { spans: InlineToken[] }) {
  return <>{spans.map((s, i) => s.code ? <code key={i}>{s.text}</code> : s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>)}</>;
}

function Block({ block }: { block: MarkdownBlock }) {
  switch (block.type) {
    case "heading": return <h4><Inline spans={block.spans} /></h4>;
    case "bullet": return <ul><li><Inline spans={block.spans} /></li></ul>;
    case "ordered": return <ol start={block.index}><li><Inline spans={block.spans} /></li></ol>;
    case "code": return <pre><code>{block.text}</code></pre>;
    case "table": return (
      <div className={styles.tableWrap}><table className={styles.mdTable}>
        <thead><tr>{block.header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{block.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    );
    default: return <p><Inline spans={block.spans} /></p>;
  }
}

/** Consecutive bullets/ordered items render as separate <ul>; acceptable for a thin chat surface. */
function MessageBody({ content }: { content: string }) {
  const blocks = useMemo(() => renderMarkdown(content), [content]);
  return <>{blocks.map((b, i) => <Block key={i} block={b} />)}</>;
}

export function CopilotConsole(props: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<CopilotMessageDTO[]>(props.messages);
  const [citations, setCitations] = useState<CopilotCitationDTO[]>(props.citations);
  const [suggestions, setSuggestions] = useState<CopilotActionDTO[]>(props.suggestions);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cmdCursor, setCmdCursor] = useState(0);
  const threadRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupConversations(props.conversations), [props.conversations]);
  const commandMenu = suggestCommands(input);
  const citationsFor = (messageId: string) => citations.filter((c) => c.messageId === messageId);

  const scrollDown = () => requestAnimationFrame(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; });

  const startConversation = () => {
    setError(null);
    startTransition(async () => {
      const res = await createConversationAction("workspace");
      if (res.ok && res.id) router.push(`/workspace/copilot?c=${res.id}`);
      else setError(res.error ?? "The conversation could not be started.");
    });
  };

  const submit = () => {
    const parsed = parseSmartInput(input);
    const text = parsed.command ? `/${parsed.command}${parsed.text ? " " + parsed.text : ""}` : parsed.text;
    if (text.trim() === "" || props.activeId === null || pending) return;
    setError(null);
    setInput("");
    const optimisticId = `local_${messages.length}`;
    const userMsg: CopilotMessageDTO = { id: optimisticId, role: "user", content: text, intent: null, state: "completed", capabilityKey: null, ok: true, order: messages.length, createdAt: "" };
    const thinking: CopilotMessageDTO = { id: `${optimisticId}_a`, role: "assistant", content: "", intent: null, state: "thinking", capabilityKey: null, ok: true, order: messages.length + 1, createdAt: "" };
    setMessages((m) => [...m, userMsg, thinking]);
    scrollDown();
    startTransition(async () => {
      const res = await sendMessageAction(props.activeId!, text);
      if (res.ok && res.response) {
        setMessages((m) => [...m.filter((x) => x.id !== thinking.id), res.response!.message]);
        setCitations((c) => [...c, ...res.response!.citations]);
        if (res.response.actions.length > 0) setSuggestions(res.response.actions);
      } else {
        setMessages((m) => m.filter((x) => x.id !== thinking.id && x.id !== optimisticId));
        setError(res.error ?? "The Copilot could not respond.");
      }
      scrollDown();
    });
  };

  const runAction = (a: CopilotActionDTO) => {
    if (props.activeId === null || pending) return;
    if (a.capabilityKey === null) { if (a.href) router.push(a.href); return; }
    setError(null);
    startTransition(async () => {
      const res = await executeActionAction(props.activeId!, a.capabilityKey!);
      if (res.ok && res.response) {
        setMessages((m) => [...m, res.response!.message]);
        setCitations((c) => [...c, ...res.response!.citations]);
      } else setError(res.error ?? "That action could not be completed.");
      scrollDown();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (commandMenu.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setCmdCursor((c) => e.key === "ArrowDown" ? Math.min(c + 1, commandMenu.length - 1) : Math.max(c - 1, 0));
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (commandMenu.length > 0 && input.trim().length > 1) { const c = commandMenu[cmdCursor]; if (c) { setInput(`/${c.command} `); setCmdCursor(0); return; } }
      submit();
    }
  };

  return (
    <div className={styles.console} data-dock={props.dock ? "true" : "false"}>
      {!props.dock && (
        <div className={styles.rail}>
          <button className={styles.newBtn} onClick={startConversation} disabled={pending}><Icon name="sparkles" size={15} /> New conversation</button>
          <div className={styles.railGroup}>
            {groups.pinned.length > 0 && <span className={styles.railLabel}>Pinned</span>}
            {groups.pinned.map((c) => <Link key={c.id} href={`/workspace/copilot?c=${c.id}`} className={styles.railItem} data-active={c.id === props.activeId}>{c.title}</Link>)}
            <span className={styles.railLabel}>Recent</span>
            {groups.recent.length === 0 && groups.pinned.length === 0 && <span className={styles.hint} style={{ padding: "0 8px" }}>No conversations yet.</span>}
            {groups.recent.map((c) => <Link key={c.id} href={`/workspace/copilot?c=${c.id}`} className={styles.railItem} data-active={c.id === props.activeId}>{c.title}</Link>)}
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <Icon name="sparkles" size={16} />
          <span className={styles.panelTitle}>{props.activeTitle ?? "Auxion Copilot"}</span>
          {props.dock && <Link href="/workspace/copilot" className={styles.headBtn}><Icon name="arrow-up-right" size={12} /> Full page</Link>}
        </div>

        {props.activeId === null ? (
          <div className={styles.empty}>
            <div>
              <p style={{ marginBottom: "var(--space-4)" }}>Ask about your reports, missions, strategy, approvals and automations — the Copilot answers from your live workspace and cites what it used.</p>
              <button className={styles.newBtn} onClick={startConversation} disabled={pending}><Icon name="sparkles" size={15} /> Start a conversation</button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.thread} ref={threadRef}>
              {messages.map((m) => (
                <div key={m.id} className={styles.turn} data-role={m.role} data-ok={m.ok ? "true" : "false"}>
                  <span className={styles.who}>{m.role === "user" ? "You" : "Copilot"}</span>
                  <div className={styles.bubble}>
                    {isStreaming(m.state) && m.content === ""
                      ? <span className={styles.state}><span className={styles.dotPulse} /> {streamingLabel(m.state)}</span>
                      : <MessageBody content={m.content} />}
                    {m.capabilityKey && <div style={{ marginTop: "var(--space-2)" }}><Badge tone="neutral">{m.capabilityKey}</Badge></div>}
                  </div>
                  {citationsFor(m.id).length > 0 && (
                    <div className={styles.cites}>
                      {citationsFor(m.id).map((c) => (
                        <Link key={c.id} href={c.href || "#"} className={styles.cite}>
                          <span className={styles.citeKind}>{c.kind}</span>{c.title || c.refId}<Icon name="external-link" size={11} />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {suggestions.length > 0 && (
              <div className={styles.actions}>
                {suggestions.map((a) => (
                  <button key={a.id} className={styles.action} onClick={() => runAction(a)} disabled={!a.enabled || pending} title={a.enabled ? a.label : `Requires ${a.requiredPermission ?? "additional permission"}`}>
                    {a.enabled ? <Icon name="check-circle" size={12} /> : <Icon name="lock" size={12} />}
                    {a.label}
                    {a.requiresApproval && <span className={styles.approvalTag}>· needs approval</span>}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.composer}>
              {error && <div className={styles.errorBar}>{error}</div>}
              {commandMenu.length > 0 && input.trim().length > 1 && (
                <div className={styles.cmdMenu}>
                  {commandMenu.map((c, i) => (
                    <div key={c.command} className={styles.cmdItem} data-active={i === cmdCursor} onMouseEnter={() => setCmdCursor(i)} onMouseDown={(e) => { e.preventDefault(); setInput(`/${c.command} `); setCmdCursor(0); }}>
                      <span className={styles.cmdName}>{c.command}</span><span className={styles.cmdHint}>{c.hint}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles.inputRow}>
                <textarea className={styles.input} value={input} placeholder="Ask anything, or type / for commands…" rows={1}
                  onChange={(e) => { setInput(e.target.value); setCmdCursor(0); }} onKeyDown={onKeyDown} aria-label="Message the Copilot" disabled={pending} />
                <button className={styles.sendBtn} onClick={submit} disabled={pending || input.trim() === ""} aria-label="Send"><Icon name="arrow-up-right" size={18} /></button>
              </div>
              <span className={styles.hint}>Answers cite your live reports, missions and strategy. Enter to send · Shift+Enter for a new line.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
