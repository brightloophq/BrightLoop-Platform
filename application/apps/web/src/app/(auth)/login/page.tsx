import type { Metadata } from "next";
import { SurfaceSkeleton } from "../../_components/SurfaceSkeleton";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Authentication surface — Sprint 0 skeleton.
 *
 * Sprint 0 delivers the auth PLUMBING (Supabase clients, JWT claim reading,
 * surface guards). The functional auth screens (login / signup / reset / verify)
 * are part of the public-surface sprint per handoff §05.
 *
 * Approved Decision C: email + password and magic link at V1. Google/Microsoft/
 * SSO are deferred to V2 — no provider buttons here by design.
 */
export default function LoginSkeletonPage() {
  return (
    <SurfaceSkeleton
      eyebrow="Authentication"
      title="Sign in"
      note={
        <>
          Sprint 0 scaffolding — this form is not implemented yet. Protected surfaces
          redirect here because no Supabase project is configured, which is the correct
          fail-closed behaviour.
        </>
      }
    >
      <p>
        Email + password and magic link land with the auth screens. Until Supabase is
        provisioned, every request is treated as unauthenticated.
      </p>
    </SurfaceSkeleton>
  );
}
