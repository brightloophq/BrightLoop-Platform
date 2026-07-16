"use client";

import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

interface TurnstileApi {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; "error-callback"?: () => void; "expired-callback"?: () => void }) => string;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare Turnstile widget for the signup form (Decision M).
 *
 * Renders ONLY when NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured — otherwise it
 * renders nothing and the hidden token stays empty (the server no-ops the check
 * when its secret is also unset). This keeps the controlled launch working while
 * the gate is ready to switch on the moment both keys are provided.
 */
export function TurnstileWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!SITE_KEY) return;
    const scriptId = "cf-turnstile-script";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    let tries = 0;
    const render = () => {
      const ts = window.turnstile;
      if (ts && ref.current && ref.current.childElementCount === 0) {
        ts.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (t) => setToken(t),
          "error-callback": () => setToken(""),
          "expired-callback": () => setToken(""),
        });
      } else if (tries++ < 40) {
        setTimeout(render, 300);
      }
    };
    render();
  }, []);

  if (!SITE_KEY) return null;
  return (
    <>
      <div ref={ref} />
      <input type="hidden" name="turnstileToken" value={token} />
    </>
  );
}
