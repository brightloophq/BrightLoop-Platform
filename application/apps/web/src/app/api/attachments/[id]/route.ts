import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Signed-URL redirect for a chat attachment.
 *
 * Uses the SESSION client, so RLS decides visibility: message_attachments SELECT
 * only returns the row if the caller participates in the conversation (or is
 * internal), and the storage signed-URL is itself scoped by the bucket policies.
 * A prospect from another org gets 404 — the row simply isn't visible.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: att } = await supabase
    .from("message_attachments")
    .select("storage_path, name")
    .eq("id", id)
    .maybeSingle();
  if (!att) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: signed, error } = await supabase.storage.from("attachments").createSignedUrl(att.storage_path, 60, { download: att.name });
  if (error || !signed) return NextResponse.json({ error: "Could not sign" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
