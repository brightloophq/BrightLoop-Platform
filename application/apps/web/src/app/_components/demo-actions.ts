"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEMO_MODE_COOKIE, demoToggleAvailable } from "@/lib/repositories";

/**
 * Developer toggle for Demo Mode (PX.1b). Sets the override cookie read by
 * `isDemoMode()`. Refuses to do anything in real production — Demo Mode can never
 * be switched on for a customer deployment. The cookie is a runtime switch that
 * needs no redeploy; the `AUXION_DEMO_MODE` env var remains the default.
 */
export async function setDemoModeAction(formData: FormData): Promise<void> {
  if (!demoToggleAvailable()) return;
  const next = formData.get("next") === "on" ? "on" : "off";
  const store = await cookies();
  store.set(DEMO_MODE_COOKIE, next, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}
