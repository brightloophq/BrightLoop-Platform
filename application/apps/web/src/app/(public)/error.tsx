"use client";

import { useEffect } from "react";
import { Container, RouteError, Section } from "@brightloop/ui";

/**
 * Public marketing error boundary. Catches errors thrown while rendering any
 * public page (home, services, portfolio, contact, …) — which fetch published
 * CMS content from Supabase — so a data failure yields a graceful, themed,
 * recoverable state inside the marketing chrome (Navbar/Footer from the layout)
 * instead of Next's raw default error screen. `reset()` re-attempts the render.
 *
 * Delegates to the shared `RouteError` primitive so every surface fails
 * identically and never leaks a raw error message, stack, or payload.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Console-only, for local debugging; no PII, no user-facing leak.
    console.error("Public route error", error.digest ?? error.message);
  }, [error]);

  return (
    <Section>
      <Container width="sm">
        <RouteError
          onRetry={() => reset()}
          description="We couldn't load this page just now. Please try again — if it keeps happening, get in touch and we'll take a look."
        />
      </Container>
    </Section>
  );
}
