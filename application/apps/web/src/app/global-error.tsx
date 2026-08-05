"use client";

import { useEffect } from "react";

/**
 * Root error boundary. `global-error.tsx` is the ONLY boundary that catches a
 * failure in the root layout itself (theme provider, fonts) — it REPLACES the
 * root layout, so it must render its own <html>/<body> and cannot depend on the
 * design tokens or theme runtime (neither has loaded when it renders). It is a
 * deliberately minimal, self-contained, brand-consistent last resort; ordinary
 * page failures are handled by the per-segment `error.tsx` boundaries with the
 * full design system. Never leaks a raw error message, stack, or payload.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error", error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#F3F1EC",
          color: "#16181D",
          fontFamily:
            "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
          lineHeight: 1.6,
        }}
      >
        <main
          role="alert"
          style={{ maxWidth: "32rem", textAlign: "center" }}
        >
          <p
            style={{
              margin: "0 0 12px",
              fontSize: "12px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#8A8D94",
            }}
          >
            Auxion
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "28px", fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 24px", color: "#55585F" }}>
            An unexpected error interrupted the page. You can try again — if it
            keeps happening, please get in touch and we&rsquo;ll look into it.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              appearance: "none",
              cursor: "pointer",
              border: "1px solid transparent",
              borderRadius: "8px",
              padding: "12px 24px",
              fontSize: "16px",
              fontWeight: 600,
              background: "#16181D",
              color: "#FBFAF8",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
