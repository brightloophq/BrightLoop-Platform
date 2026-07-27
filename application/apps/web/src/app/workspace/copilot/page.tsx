/**
 * Workspace Copilot (Phase F · Sprint F2) — the full-page conversational assistant.
 * Server component: it loads the conversation list + selected thread from existing
 * Copilot application read models via `loadCopilotBoot()` (RLS-scoped) and hydrates
 * the console. The `?c=` param selects a thread. No business logic here.
 */

import { EmptyState } from "@brightloop/ui";
import { loadCopilotBoot } from "@/lib/copilot-data";
import { CopilotConsole } from "./CopilotConsole";
import styles from "../pages.module.css";

export const dynamic = "force-dynamic";

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function CopilotPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const activeParam = first((await searchParams)["c"]);
  const boot = await loadCopilotBoot(activeParam);
  if (boot === null) return <EmptyState icon="lock" title="Session expired" body="Please sign in again." />;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Copilot</h1>
          <p className={styles.pageSub}>Ask across your reports, missions, strategy, approvals and automations. Every answer cites your live workspace — nothing is invented.</p>
        </div>
      </div>
      <div style={{ height: "calc(100vh - 15rem)", minHeight: "32rem" }}>
        <CopilotConsole
          conversations={boot.conversations}
          activeId={boot.active?.conversation.id ?? null}
          activeTitle={boot.active?.conversation.title ?? null}
          messages={boot.active?.messages ?? []}
          citations={boot.active?.citations ?? []}
          suggestions={boot.suggestions}
        />
      </div>
    </>
  );
}
