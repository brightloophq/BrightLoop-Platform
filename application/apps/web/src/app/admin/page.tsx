import type { Metadata } from "next";
import { getActor } from "@/lib/auth";
import { may } from "@brightloop/domain";
import { SurfaceSkeleton } from "../_components/SurfaceSkeleton";

export const metadata: Metadata = { title: "Admin" };

/**
 * Admin command center — Sprint 0 skeleton.
 *
 * Executive overview, CRM, delivery, finance, and the Reputation CMS are Sprints
 * 3–4. This page only proves the guard and capability gating resolve correctly.
 */
export default async function AdminSkeletonPage() {
  const actor = await getActor();
  // Role-gated actions are HIDDEN (not merely disabled) when the capability is
  // absent — handoff §09.3. team_member never sees finance.
  const canSeeFinance = actor ? may(actor, "finance.read") : false;

  return (
    <SurfaceSkeleton
      eyebrow="Admin command center"
      title="Admin surface"
      note={<>Sprint 0 scaffolding. The admin modules are Sprints 3–4.</>}
    >
      <p>
        Signed in as <strong>{actor?.role}</strong>. Finance capability:{" "}
        <strong>{canSeeFinance ? "granted" : "hidden"}</strong>.
      </p>
      {canSeeFinance ? (
        <p>
          Finance modules would render here. <code>team_member</code> never reaches this
          branch, and RLS refuses the underlying rows regardless.
        </p>
      ) : null}
    </SurfaceSkeleton>
  );
}
