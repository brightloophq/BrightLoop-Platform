# Discovery & Crawler Runtime

Phase C · Sprint C3. The first real website discovery/crawler runtime behind the
pure Phase-A Sprint-5 discovery contracts. It lets a controlled business website
enter the Auxion pipeline **safely**: normalize + validate the URL, enforce SSRF
protections (string **and** DNS), read robots policy, fetch allowed pages, extract
bounded structured evidence, build the discovery result/manifest, and hand
evidence ingress to the Evidence Engine — executed through the C2.1 controlled
runtime driver **one stage at a time**.

**It collects and provenances only. No reasoning, no recommendations, no
competitor inference, no worker loop.**

---

## Package

`@brightloop/crawler` — server-only infrastructure. The networking + DNS live
here, never in `@brightloop/domain` (which stays Node-free and pure). It depends
only on `@brightloop/domain` + `@brightloop/schema` and reuses the pure Phase-A
discovery logic rather than reimplementing it.

```
src/
  config.ts          typed env config + kill switch (crawler_disabled)
  transport.ts       HttpTransport seam + FetchHttpTransport (single hop, byte-capped)
  dns.ts             DnsResolver + resolved-IP classification (v4/v6)
  ssrf.ts            fetch-time guard: Phase-A string check + DNS classification
  robots.ts          fetch robots.txt + Phase-A parseRobots (missing/malformed → allow-all)
  fetcher.ts         redirect chain (re-guarded per hop) + limits + content-type allowlist
  extract.ts         deterministic HTML → structured PageExtract (no JS execution)
  sanitize.ts        strip script/style, control chars, caps, checksum, injection markers
  crawl.ts           orchestrator: plan → robots → fetch → extract → records + observability
  evidence.ts        crawled pages → EvidenceIngress + per-page state (observed/unavailable)
  stage-executors.ts discovery stage executors + registry for the C2.1 driver
  testing/fake-transport.ts  scripted HTTP + DNS doubles (offline, deterministic)
```

Reused from Phase A (`@brightloop/domain/scan-engine/discovery`): `normalizeUrl`,
`evaluateSsrf`, `parseRobots`, `isPathAllowed`, `generatePlan`, `planSession`,
`buildResult`, `toEvidenceIngress`, `sourceForKind`, `hashContent`. The crawler
adds only the live adapter behavior those contracts deferred.

---

## Security model

Website content is **untrusted data, never instruction**. The layers:

### SSRF (string + DNS)
Every request — the initial URL **and every redirect target** — passes through
`guardFetchUrl`:
1. **Phase-A `evaluateSsrf`** (pure, no I/O): rejects non-http(s) schemes,
   embedded credentials, `localhost`, and literal loopback/private/link-local IPs.
2. **Resolved-IP classification** (`dns.ts`): resolves the host and rejects it if
   **any** returned address is loopback / private (RFC1918) / link-local / CGNAT /
   unspecified / multicast / reserved / IPv6 ULA — the defence a hostname pointing
   at a private IP (DNS rebinding, split-horizon) needs. **Fail-closed**: an
   unresolvable host or unparseable URL is never fetched.

### Other guards
- **Redirects** followed manually (`redirect: "manual"`), capped at
  `maxRedirects`, each target re-guarded before the next hop.
- **Byte cap** (`maxResponseBytes`) enforced while streaming — an oversized
  response is truncated, never fully buffered.
- **Content-type allowlist** — `text/html` / `application/xhtml+xml` only.
- **Timeout** (`AbortController`) per request; **total crawl deadline** across all
  pages; **bounded concurrency**.
- **No cookies, no `Authorization`, no credentials** ever sent
  (`credentials: "omit"`); only a safe subset of response headers is retained, and
  cookies/auth headers are never captured or persisted.
- **No JavaScript execution** — plain HTTP + regex extraction only. No
  Playwright/Puppeteer. **No authenticated crawl. No broad web search.**

### Prompt-injection
Extracted text is scanned for injection phrasings (e.g. "ignore previous
instructions"). Matches are **flagged as data** (`injectionMarkers`) for
observability — **never obeyed**. Website text cannot override Auxion system
policy.

---

## Robots

`fetchRobots` fetches `<root>/robots.txt` (SSRF-guarded) and parses it with the
pure `parseRobots`. Missing (404 / non-2xx), unfetchable, or empty → **allow-all**;
malformed → graceful degrade (only understood directives kept). `crawl-delay` and
`Sitemap:` are parsed; robots-disallowed paths are excluded at planning and never
fetched, with the exclusion recorded.

---

## Crawl limits

All conservative, all env-configurable (see Configuration). Defaults: **10 pages,
depth 2, 15 s/request, 120 s total, 2.5 MB/response, concurrency 2, 3 redirects,
20 000 chars text/page**. Same-origin is enforced by the plan (canonical paths on
the target root); there is **no unrestricted recursive crawl**.

---

## Extraction model

`extractPage` deterministically derives a bounded `PageExtract`: title, meta
description, canonical URL, robots-meta, language, headings (h1–h3), sanitized
visible text (capped), internal vs external links, forms (method/action/input
count — never submitted), public emails/phones, social links, JSON-LD `@type`
values, and SEO/accessibility signals. Identical HTML → identical extract
(checksummable). No raw HTML is retained — only sanitized, bounded text plus a
content checksum.

---

## Evidence handoff

`toCrawledEvidence` maps crawled pages into the Evidence Engine's ingress: the
canonical `EvidenceIngress` (pure Phase-A mapping) plus per-page items carrying
source URL, timestamp, method (`crawl`), stage (`discovery`), checksum,
provenance, freshness (`Last-Modified`), and state. **Observed** for a fetched
page; **Unavailable** for a failed/excluded one. Nothing is fabricated for a page
that was never successfully fetched. No competitor inference happens here.

---

## Controlled-driver integration

The crawler registers discovery stage executors resolved by the C2.1
`StageExecutorRegistry` shape, so the controlled runtime driver drives them **one
stage per turn**. The real pipeline stages (there is no `discovery_execution` /
`evidence_collection` stage) map as:

| Stage | Work | Artifact |
|---|---|---|
| `discovery_planning` | validate target + plan the surface | none |
| `discovery_completion` | run the crawl (fetch/extract) | `discovery_manifest` |
| `evidence_normalization` | map pages → evidence ingress | `evidence_ingress` |

Per turn the driver leases one job, the crawler performs one stage, the result is
persisted as a runtime artifact, a checkpoint is written, an event is appended,
the downstream stage is enqueued, and the driver returns. **The crawler enqueues
nothing itself and runs no loop** — the coordinator owns the queue and the
one-turn boundary. The registry is composed with the provider registry in the web
composition root; discovery stages resolve through the crawler, the reasoning
stage through the provider, everything else blocks.

The target URL travels in the run metadata (`metadata.rootUrl`), set at scan
creation (C1). A run with no target URL fails `discovery_planning` with
`missing_target_url` — no fabrication.

---

## Internal controlled entry

Reuses the existing internal `POST /api/internal/runtime/run-once` (C2.1) — **no
new public endpoint, no client-role access**. An internal operator can: create a
scan through C1 (with `metadata.rootUrl`), invoke run-once repeatedly, and watch
discovery artifacts + stage progression.

---

## Kill switch

`AUXION_CRAWLER_ENABLED` defaults **false**. When disabled: the web composition
constructs **no transport and no resolver**, the discovery executors return a
stable `crawler_disabled` block, the runtime records a safe blocked event, **no
outbound HTTP request is made**, and **no artifact is fabricated and no stage
succeeds**.

---

## Configuration

Server-only, no `NEXT_PUBLIC_`. Missing optional values use conservative defaults;
malformed values fall back to the default (they never disable a bound).

| Env var | Meaning | Default |
|---|---|---|
| `AUXION_CRAWLER_ENABLED` | Global kill switch | `false` |
| `AUXION_CRAWLER_USER_AGENT` | Bot UA (never impersonates a browser) | `AuxionBot/1.0 (+https://auxion.co/bot)` |
| `AUXION_CRAWLER_MAX_PAGES` | Pages per crawl | `10` |
| `AUXION_CRAWLER_MAX_DEPTH` | Plan depth | `2` |
| `AUXION_CRAWLER_TIMEOUT_MS` | Per-request timeout | `15000` |
| `AUXION_CRAWLER_TOTAL_DEADLINE_MS` | Total crawl deadline | `120000` |
| `AUXION_CRAWLER_MAX_RESPONSE_BYTES` | Byte cap per response | `2500000` |
| `AUXION_CRAWLER_CONCURRENCY` | Concurrent fetches | `2` |
| `AUXION_CRAWLER_MAX_REDIRECTS` | Redirects per page | `3` |
| `AUXION_CRAWLER_MAX_TEXT_CHARS` | Retained sanitized text/page | `20000` |

---

## Observability

The `discovery_manifest` artifact carries safe aggregate metadata: session/scan
ids, planned/allowed/fetched/excluded/failed counts, robots-blocked, SSRF-blocked,
duplicates, bytes fetched, duration, redirect count, content-type distribution,
robots-fetched flag, injection-flagged page count, and artifact/checkpoint ids
(via the runtime). **Never persisted:** cookies, authorization headers, secret
query values, raw unrestricted logs/HTML, or hidden reasoning. Page records store
only bounded sanitized text with a checksum — never raw HTML.

---

## Tests

`crawler.test.ts` (21) + `stage-executors.test.ts` (6) — all deterministic, using
the fake HTTP transport + fake DNS resolver + injected clock; **the default suite
opens no socket.** Coverage: config/kill-switch; IP classification for every
private/reserved class (v4/v6); DNS-resolved private-IP denial; literal-IP/scheme/
credential SSRF; redirect-to-private denial; redirect limit; robots allow/deny/
missing/malformed; content-type exclusion; non-2xx/timeout failure; oversized-
response truncation; script/style stripping; injection-marker flagging;
title/meta/canonical/headings/links/forms/JSON-LD extraction with internal-vs-
external split; deterministic manifest checksum; unavailable-page + evidence-state
mapping; no cookie/header/secret persistence; and the full three-stage discovery
flow through the real coordinator (artifact + checkpoint persistence, downstream
enqueue, one-turn boundary, `crawler_disabled` block, `missing_target_url`
failure).

### Live-test gate
`crawler.live.test.ts` runs **only** when `AUXION_RUN_LIVE_CRAWLER_TESTS=true` AND
`AUXION_CRAWLER_TEST_URL` is set, and is **excluded from the default `test`
script** (only `test:live` includes `*.live.test.ts`). It crawls **only** the one
explicitly configured safe URL with tiny limits, never an arbitrary host. **Default
CI makes no external network request.**

---

## Local setup

1. Set `AUXION_CRAWLER_ENABLED=true` (server env) to enable live crawling.
2. Create a scan via C1 with `metadata.rootUrl` = the target website.
3. Invoke `POST /api/internal/runtime/run-once` repeatedly (internal actor) to
   advance discovery one stage per call.
4. To run the gated live test: `AUXION_RUN_LIVE_CRAWLER_TESTS=true
   AUXION_CRAWLER_TEST_URL=https://example.com pnpm --filter @brightloop/crawler
   test:live`.

## Rollback / disable

Set `AUXION_CRAWLER_ENABLED=false` (or unset it). The discovery stages immediately
block with `crawler_disabled`; no outbound request is made. No migration or data
change is involved, so disabling is instant and safe.

---

## Known limitations

- **No JavaScript execution** — server-rendered / static HTML only; SPA content
  behind client rendering is not seen.
- **No authenticated crawl** — public pages only; no login, no cookies.
- **No broad web search** — only the target site's canonical paths (+ configured
  custom paths) are planned.
- **Naive eTLD+1 / same-origin** — inherits the Phase-A documented limitation (no
  Public Suffix List).
- **No competitor discovery, monitoring, or alerts** — later sprints (AIS-005/006).
