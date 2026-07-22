/* =============================================================================
 * DNS resolution + resolved-IP SSRF classification (Phase C · Sprint C3 §2).
 *
 * The Phase-A `evaluateSsrf` blocks literal-IP / scheme / credential SSRF by
 * string inspection. It CANNOT catch a hostname that RESOLVES to a private or
 * reserved address — that needs DNS, which is the crawler adapter's job. This
 * module resolves a host and classifies every returned address, rejecting the
 * host if ANY resolved address is private/reserved (defence against DNS
 * rebinding and split-horizon names). Deterministic given an injected resolver.
 * ========================================================================== */

/** Resolves a hostname to its IP addresses. Injected so tests never hit DNS. */
export interface DnsResolver {
  resolve(host: string): Promise<string[]>;
}

/** Production resolver over Node's DNS, returning every A/AAAA address. */
export class NodeDnsResolver implements DnsResolver {
  async resolve(host: string): Promise<string[]> {
    const { lookup } = await import("node:dns/promises");
    const results = await lookup(host, { all: true });
    return results.map((r) => r.address);
  }
}

/** Why a resolved address is unsafe to fetch. */
export type IpRejectReason =
  | "loopback"
  | "private"
  | "link_local"
  | "unspecified"
  | "cgnat"
  | "multicast"
  | "reserved"
  | "unique_local"
  | "unparsable";

function ipv4Reasons(a: number, b: number): IpRejectReason[] {
  const r: IpRejectReason[] = [];
  if (a === 0) r.push("unspecified");
  if (a === 127) r.push("loopback");
  if (a === 10) r.push("private");
  if (a === 172 && b >= 16 && b <= 31) r.push("private");
  if (a === 192 && b === 168) r.push("private");
  if (a === 169 && b === 254) r.push("link_local");
  if (a === 100 && b >= 64 && b <= 127) r.push("cgnat");
  if (a >= 224 && a <= 239) r.push("multicast");
  if (a >= 240) r.push("reserved"); // 240/4 incl. 255.255.255.255
  if (a === 192 && b === 0) r.push("reserved"); // 192.0.0/24, 192.0.2/24 test-net
  if (a === 198 && (b === 18 || b === 19)) r.push("reserved"); // benchmarking
  return r;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Classify a single IP (v4 or v6). Empty array = safe/public. */
export function classifyIp(ip: string): IpRejectReason[] {
  const trimmed = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4-mapped / -embedded IPv6 (::ffff:1.2.3.4) → classify the embedded v4.
  const mapped = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(trimmed);
  const v4 = IPV4.exec(trimmed) ?? (mapped ? IPV4.exec(mapped[1]!) : null);
  if (v4) {
    const octets = [Number(v4[1]), Number(v4[2]), Number(v4[3]), Number(v4[4])];
    if (octets.some((n) => n > 255)) return ["unparsable"];
    return dedupe(ipv4Reasons(octets[0]!, octets[1]!));
  }

  if (trimmed.includes(":")) {
    if (trimmed === "::1") return ["loopback"];
    if (trimmed === "::" ) return ["unspecified"];
    if (trimmed.startsWith("fe80") || trimmed.startsWith("fe9") || trimmed.startsWith("fea") || trimmed.startsWith("feb")) return ["link_local"];
    if (trimmed.startsWith("fc") || trimmed.startsWith("fd")) return ["unique_local"]; // fc00::/7 ULA
    if (trimmed.startsWith("ff")) return ["multicast"]; // ff00::/8
    return []; // a routable public IPv6
  }

  return ["unparsable"];
}

/** The verdict for a hostname after DNS resolution. */
export interface ResolvedHostVerdict {
  allowed: boolean;
  reasons: IpRejectReason[];
  addresses: string[];
}

/**
 * Resolve a host and reject it if ANY address is private/reserved, or if
 * resolution fails or returns nothing. Fail-closed: an unresolvable host is not
 * fetched.
 */
export async function guardResolvedHost(host: string, resolver: DnsResolver): Promise<ResolvedHostVerdict> {
  let addresses: string[];
  try {
    addresses = await resolver.resolve(host);
  } catch {
    return { allowed: false, reasons: ["unparsable"], addresses: [] };
  }
  if (addresses.length === 0) return { allowed: false, reasons: ["unparsable"], addresses: [] };

  const reasons = dedupe(addresses.flatMap(classifyIp));
  return { allowed: reasons.length === 0, reasons, addresses };
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
