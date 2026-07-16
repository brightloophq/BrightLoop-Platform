import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PLACEHOLDER_MODULES, PLACEHOLDER_PLANS } from "@brightloop/data";
import { healthBand } from "@brightloop/domain";
import { Alert, Badge, Card, Icon, Stat } from "@brightloop/ui";
import { getActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { joinConversationAsAdmin } from "../../../conversation-actions";
import { ChatThread, type ThreadPerson } from "../../../ChatThread";
import type { ChatMessage } from "../../../useRealtimeMessages";
import { InternalNotes, type InternalNote } from "../InternalNotes";
import styles from "../../../chat.module.css";
import shell from "../../admin.module.css";

export const metadata: Metadata = { title: "Consulting workspace" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const MODULE_NAME = new Map(PLACEHOLDER_MODULES.map((m) => [m.id, m.name]));
const PLAN_NAME = new Map(PLACEHOLDER_PLANS.map((p) => [p.id, p.name]));

/**
 * Admin consulting workspace (handoff §12).
 *
 * The strategist gets the client's full funnel context on the right — assessment
 * health, recommended plan, chosen modules, owned assets, indicative range —
 * alongside the live thread and INTERNAL notes the client can never see. On open
 * the admin is joined as a participant so they can reply (idempotent upsert).
 */
export default async function ConsultingWorkspace({ params }: PageProps) {
  const { id } = await params;
  const actor = await getActor();
  const supabase = await createClient();

  // Make sure this admin can post into the thread.
  await joinConversationAsAdmin(id);

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, subject, state, client_id, assessment_id, configuration_id, clients(company, lifecycle, plan)")
    .eq("id", id)
    .maybeSingle();

  if (!conversation) notFound();

  const { data: me } = await supabase.from("users").select("id").eq("auth_user_id", actor!.userId).maybeSingle();

  const [{ data: assessment }, { data: config }, { data: msgs }, { data: parts }, { data: rawNotes }] = await Promise.all([
    conversation.assessment_id
      ? supabase.from("assessments").select("health_score, scores").eq("id", conversation.assessment_id).maybeSingle()
      : Promise.resolve({ data: null }),
    conversation.configuration_id
      ? supabase.from("configurations").select("modules, owned_assets, estimate_low, estimate_high").eq("id", conversation.configuration_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("chat_messages")
      .select("id, conversation_id, author_id, body, kind, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("conversation_participants").select("user_id, users(id, name, client_id)").eq("conversation_id", id),
    supabase.from("internal_notes").select("id, body, created_at, author_id, users(name)").eq("conversation_id", id).order("created_at", { ascending: true }),
  ]);

  const messages = (msgs ?? []) as ChatMessage[];
  const people: ThreadPerson[] = (parts ?? []).map((p) => {
    const u = p.users as unknown as { id: string; name: string | null; client_id: string | null } | null;
    return { id: p.user_id, name: u?.name ?? "Client", internal: !u?.client_id };
  });
  const notes: InternalNote[] = (rawNotes ?? []).map((n) => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    authorName: (n.users as unknown as { name: string | null } | null)?.name ?? "Team",
  }));

  // Read receipts for my own messages.
  let readByOther: Record<string, boolean> = {};
  const myIds = messages.filter((m) => m.author_id === me?.id).map((m) => m.id);
  if (me && myIds.length > 0) {
    const { data: reads } = await supabase.from("message_reads").select("message_id").in("message_id", myIds).neq("user_id", me.id);
    readByOther = Object.fromEntries((reads ?? []).map((r) => [r.message_id, true]));
  }

  const client = conversation.clients as unknown as { company: string; lifecycle: string; plan: string | null } | null;
  const modules = (config?.modules as string[] | null) ?? [];
  const ownedAssets = (config?.owned_assets as string[] | null) ?? [];
  const planName = client?.plan ? (PLAN_NAME.get(client.plan) ?? client.plan) : null;

  return (
    <>
      <div className={shell.topbar}>
        <h1 className={shell.topTitle}>{client?.company ?? "Conversation"}</h1>
      </div>

      <div className={shell.content}>
        <Link
          href="/admin/conversations"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", color: "var(--text-muted)", textDecoration: "none", fontSize: "var(--fs-sm)", marginBottom: "var(--space-5)" }}
        >
          <Icon name="arrow-left" size={14} />
          All conversations
        </Link>

        <div className={styles.workspace}>
          {/* ---- thread + internal notes ---- */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <Card style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 320px)", minHeight: 380 }}>
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} className={styles.thread}>
                {me ? (
                  <ChatThread
                    conversationId={id}
                    meId={me.id}
                    initialMessages={messages}
                    people={people}
                    readByOther={readByOther}
                  />
                ) : (
                  <Alert tone="danger" title="No user record">Your admin account has no users row; cannot post.</Alert>
                )}
              </div>
            </Card>

            <InternalNotes conversationId={id} notes={notes} />
          </div>

          {/* ---- context panel ---- */}
          <aside className={styles.context}>
            <Card>
              <div className={styles.ctxSection}>Client</div>
              <div className={styles.ctxRow}>
                <span>Company</span>
                <span>{client?.company ?? "—"}</span>
              </div>
              <div className={styles.ctxRow}>
                <span>Lifecycle</span>
                <Badge tone="neutral">{client?.lifecycle ?? "—"}</Badge>
              </div>
            </Card>

            <Card>
              <div className={styles.ctxSection}>Assessment</div>
              <Stat
                value={assessment?.health_score != null ? Number(assessment.health_score).toFixed(0) : "—"}
                label={`Health score${assessment?.health_score != null ? ` · ${healthBand(Number(assessment.health_score))}` : ""}`}
              />
              {assessment?.scores ? (
                <div style={{ marginTop: "var(--space-3)" }}>
                  {Object.entries(assessment.scores as Record<string, number>).map(([dim, val]) => (
                    <div key={dim} className={styles.ctxRow}>
                      <span style={{ textTransform: "capitalize" }}>{dim}</span>
                      <span>{Math.round(Number(val))}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>

            <Card>
              <div className={styles.ctxSection}>Recommended plan</div>
              <div className={styles.ctxRow}>
                <span>Plan</span>
                <span>{planName ?? "Not selected"}</span>
              </div>
              <div className={styles.ctxRow}>
                <span>Indicative range</span>
                <span>
                  {config && (config.estimate_low || config.estimate_high)
                    ? `$${Number(config.estimate_low).toLocaleString()} – $${Number(config.estimate_high).toLocaleString()}`
                    : "—"}
                </span>
              </div>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>
                Indicative only. The binding quote is built in the quote workspace (5C).
              </p>
            </Card>

            <Card>
              <div className={styles.ctxSection}>Configurator selections</div>
              {modules.length === 0 ? (
                <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>No modules selected.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
                  {modules.map((m) => (
                    <Badge key={m} tone="neutral">{MODULE_NAME.get(m) ?? m}</Badge>
                  ))}
                </div>
              )}
              {ownedAssets.length > 0 ? (
                <div style={{ marginTop: "var(--space-3)" }}>
                  <div className={styles.ctxSection}>Already owns</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
                    {ownedAssets.map((a) => (
                      <Badge key={a} tone="success">{a}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
