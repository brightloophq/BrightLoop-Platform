/* =============================================================================
 * mediaEmbed — resolve a catalogued media item to how it should be RENDERED.
 *
 * Pure and unit-tested (repo convention: factor the logic out of the component).
 * No DOM, no React.
 *
 * SECURITY. A media `url` comes from the Reputation CMS, so it is internal but
 * still data — and putting arbitrary data in an `<iframe src>` is how a content
 * row becomes script execution on our own origin's page. Embeds are therefore
 * ALLOW-LISTED by host: a URL that does not parse, is not https, or is not a
 * recognised provider degrades to a plain link instead of being framed. The
 * fallback is never "frame it anyway".
 * ========================================================================== */

/** How the tile should present this item. */
export type EmbedKind = "iframe" | "video" | "image" | "link" | "pending";

export interface Embed {
  readonly kind: EmbedKind;
  /** The URL to load (iframe/video/image) or navigate to (link). */
  readonly src?: string;
  /** A human title for the frame, used as the iframe's accessible name. */
  readonly provider?: string;
}

const PENDING: Embed = { kind: "pending" };

/** A placeholder url — the dataset uses "#" for "not supplied yet". */
function isUsable(url: string | undefined): url is string {
  return typeof url === "string" && url.trim() !== "" && url.trim() !== "#";
}

/** Parse to https only. http and other schemes (javascript:, data:) are refused. */
function parseHttps(url: string): URL | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function hostIs(u: URL, ...hosts: readonly string[]): boolean {
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  return hosts.includes(h);
}

/**
 * YouTube watch / short / embed / youtu.be → the privacy-preserving nocookie
 * embed. Returns null when no 11-character video id can be found, so a
 * malformed link becomes a link rather than a broken frame.
 */
export function youTubeEmbed(u: URL): string | null {
  let id: string | null = null;
  if (hostIs(u, "youtu.be")) {
    id = u.pathname.slice(1).split("/")[0] ?? null;
  } else if (hostIs(u, "youtube.com", "youtube-nocookie.com", "m.youtube.com")) {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = /^\/(?:embed|v|shorts|live)\/([^/?#]+)/.exec(u.pathname);
      id = m?.[1] ?? null;
    }
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

/** Loom share link → its embed form. */
export function loomEmbed(u: URL): string | null {
  if (!hostIs(u, "loom.com")) return null;
  const m = /^\/(?:share|embed)\/([0-9a-f]{16,})/i.exec(u.pathname);
  return m?.[1] ? `https://www.loom.com/embed/${m[1]}` : null;
}

/** Vimeo link → its player embed. */
export function vimeoEmbed(u: URL): string | null {
  if (!hostIs(u, "vimeo.com", "player.vimeo.com")) return null;
  const m = /(\d{6,})/.exec(u.pathname);
  return m?.[1] ? `https://player.vimeo.com/video/${m[1]}` : null;
}

/**
 * Resolve a media item to its presentation.
 *
 * THE URL IS THE ONLY AUTHORITY. The dataset's `kind` is deliberately NOT an
 * input: an earlier revision took it as a tie-breaker for extension-less URLs,
 * which meant a `kind: "video"` row pointed at any host went straight into a
 * <video src>, leaking the visitor to that host for a player that would not
 * play. Provider host or known extension, or it is a link. `kind` remains
 * useful to the CALLER as a label, and MediaTile still shows it.
 */
export function resolveEmbed(url?: string): Embed {
  if (!isUsable(url)) return PENDING;
  const u = parseHttps(url);
  // Not https, or unparseable — offer it as a link only if it is at least a
  // plausible absolute URL, otherwise treat it as missing.
  if (!u) return /^https?:\/\//i.test(url.trim()) ? { kind: "link", src: url.trim() } : PENDING;

  const yt = youTubeEmbed(u);
  if (yt) return { kind: "iframe", src: yt, provider: "YouTube" };
  const loom = loomEmbed(u);
  if (loom) return { kind: "iframe", src: loom, provider: "Loom" };
  const vimeo = vimeoEmbed(u);
  if (vimeo) return { kind: "iframe", src: vimeo, provider: "Vimeo" };

  // A direct media file we can play or show ourselves — extension-gated, so a
  // random https URL is never dropped into a <video> or <img>, where it would
  // leak the visitor to that host and render broken.
  if (/\.(mp4|webm|ogg|mov)$/i.test(u.pathname)) return { kind: "video", src: u.toString() };
  if (/\.(png|jpe?g|webp|avif|gif|svg)$/i.test(u.pathname)) return { kind: "image", src: u.toString() };

  // Anything else — a website, a PDF, an unrecognised host — is a link. Never
  // an iframe: that is the allow-list doing its job.
  return { kind: "link", src: u.toString(), provider: u.hostname.replace(/^www\./, "") };
}
