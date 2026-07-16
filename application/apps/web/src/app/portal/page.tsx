import type { Metadata } from "next";
import { getActor } from "@/lib/auth";
import { SurfaceSkeleton } from "../_components/SurfaceSkeleton";

export const metadata: Metadata = { title: "Portal" };

/**
 * Client portal — Sprint 0 skeleton.
 *
 * Dashboard, project progress, milestones, the deliverable approval loop, files,
 * messages, invoices and settings are Sprint 7. This page only proves the guard
 * and the client-scoped actor resolve correctly.
 */
export default async function PortalSkeletonPage() {
  const actor = await getActor();

  return (
    <SurfaceSkeleton
      eyebrow="Client portal"
      title="Portal surface"
      note={<>Sprint 0 scaffolding. The portal itself is Sprint 7.</>}
    >
      <p>
        Signed in as <strong>{actor?.role}</strong> scoped to client{" "}
        <code>{actor?.clientId ?? "—"}</code>. Every query on this surface runs under this
        user&apos;s JWT, so RLS restricts it to their own organisation&apos;s rows.
      </p>
    </SurfaceSkeleton>
  );
}
