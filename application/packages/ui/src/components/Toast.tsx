"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toastEnter, toastExit } from "../motion/presets";
import { useReducedMotion } from "../motion/useReducedMotion";
import { Icon } from "./Icon";
import styles from "./Toast.module.css";

export type ToastTone = "success" | "danger" | "info";

interface ToastData {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  /** Show a transient notification. Returns nothing — fire and forget. */
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi>({ toast: () => {} });

/** Show transient notifications. Safe to call even outside a provider (no-op). */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const AUTO_DISMISS_MS = 4200;
const TONE_ICON: Record<ToastTone, string> = {
  success: "check-circle",
  danger: "bell",
  info: "activity",
};

let toastCounter = 0;

/**
 * Mounts a notification region and provides `useToast()`. Notifications enter and
 * leave via the shared toast motion presets (transform + opacity, reduced-motion
 * aware). Renders nothing visible until a toast fires. Mount once, high in the
 * authenticated tree.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = `toast_${++toastCounter}`;
    setToasts((current) => [...current, { id, tone, message }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className={styles.viewport} role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <ToastItem key={t.id} tone={t.tone} message={t.message} onDone={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ tone, message, onDone }: { tone: ToastTone; message: string; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (el) toastEnter(el, { reduced });
    const timer = setTimeout(() => {
      const node = ref.current;
      if (!node) {
        onDone();
        return;
      }
      toastExit(node, { reduced }).then(() => onDone());
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [reduced, onDone]);

  // A failure toast must interrupt the screen reader (assertive), not queue behind
  // current speech; informational tones stay polite so they don't steal focus.
  const assertive = tone === "danger";

  return (
    <div
      ref={ref}
      className={[styles.toast, styles[tone]].join(" ")}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
    >
      <Icon name={TONE_ICON[tone]} size={16} className={styles.icon} />
      <span className={styles.message}>{message}</span>
    </div>
  );
}
