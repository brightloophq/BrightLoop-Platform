"use server";

/* Activation server actions (Phase 1C) — the ONLY write path. Authenticate →
 * capability → validate → CoreSurfaceService.activateDomain → revalidate. */

import { revalidatePath } from "next/cache";
import { domainKeySchema, domainStatusSchema } from "@brightloop/schema";
import { assertCapability, AuthorizationError } from "@brightloop/domain";
import { getActor } from "@/lib/auth";
import { getCoreSurfaceService } from "@/lib/repositories";

const ACTIVATION_WRITE = "transformation.activation.write";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Advance a domain's assembly state (typically → operating, with a live score). */
export async function activateDomainAction(input: {
  clientId: string;
  key: string;
  status: string;
  currentScore?: number | null;
}): Promise<ActionResult> {
  try {
    const actor = await getActor();
    if (!actor) return { ok: false, error: "You are not signed in." };
    assertCapability(actor, ACTIVATION_WRITE);

    const key = domainKeySchema.safeParse(input.key);
    const status = domainStatusSchema.safeParse(input.status);
    if (!key.success || !status.success) return { ok: false, error: "That is not a valid domain or status." };

    const svc = await getCoreSurfaceService();
    await svc.activateDomain(actor, {
      clientId: input.clientId,
      key: key.data,
      status: status.data,
      currentScore: input.currentScore ?? null,
    });
    revalidatePath("/admin/activation");
    revalidatePath("/admin/dashboard");
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to activate domains." };
    return { ok: false, error: "Couldn't update the domain." };
  }
}

/** Form-friendly wrapper (server-rendered <form action>) — activate one domain. */
export async function activateDomainFormAction(formData: FormData): Promise<void> {
  await activateDomainAction({
    clientId: String(formData.get("clientId") ?? ""),
    key: String(formData.get("key") ?? ""),
    status: String(formData.get("status") ?? "operating"),
    currentScore: formData.get("currentScore") ? Number(formData.get("currentScore")) : null,
  });
}
