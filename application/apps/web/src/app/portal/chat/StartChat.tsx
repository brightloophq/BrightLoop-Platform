"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@brightloop/ui";
import { startConversation } from "../../conversation-actions";

/** Kicks off (or reopens) the client's discovery conversation, then refreshes. */
export function StartChat() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="primary"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await startConversation();
          setPending(false);
          if (res.ok) router.refresh();
          else setError(res.error ?? "Couldn't start the conversation.");
        }}
      >
        {pending ? "Starting…" : "Start a conversation"}
      </Button>
      {error ? <p style={{ color: "var(--text-danger, #c0392b)", fontSize: "var(--fs-sm)", marginTop: "var(--space-2)" }}>{error}</p> : null}
    </div>
  );
}
