/** Local-only security integration. Concurrency cases additionally require
 * SUPABASE_TEST_DB_CONTAINER naming the disposable database container. They use
 * two real transactions and observe an actual advisory-lock waiter, not timing.
 */
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createRuntimeServices } from "@brightloop/domain";
import type { CommercialReviewBinding } from "@brightloop/schema";
import { SupabaseRuntimeRepository } from "./adapter.js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_KEY"];
const anonKey = process.env["SUPABASE_TEST_ANON_KEY"];
const jwtSecret = process.env["SUPABASE_TEST_JWT_SECRET"];
const container = process.env["SUPABASE_TEST_DB_CONTAINER"];
const live = Boolean(url && serviceKey && anonKey && jwtSecret);
const subject = "00000000-0000-4000-8000-000000000001";
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const claims = JSON.stringify({ role: "authenticated", sub: subject, app_metadata: { role: "owner" } });

function token() {
  const encode = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode({ ...JSON.parse(claims), aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", jwtSecret!).update(`${head}.${body}`).digest("base64url")}`;
}

async function fixture() {
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Disposable loopback API required");
  const service = createClient(url, serviceKey!, { auth: { persistSession: false } });
  const client = createClient(url, anonKey!, { global: { headers: { Authorization: `Bearer ${token()}` } }, auth: { persistSession: false } });
  const runId = `vb_${randomUUID()}`;
  await service.from("intelligence_runs").insert({ id: runId, scan_id: runId, status: "completed", idempotency_key: runId }).throwOnError();
  const proposal = { id: `${runId}_p1`, run_id: runId, scan_id: runId, status: "needs_review", version: 1, checksum: "p1", idempotency_key: `${runId}_p1` };
  const narrative = { id: `${runId}_n1`, run_id: runId, scan_id: runId, audience: "client", status: "needs_review", version: 1, checksum: "n1", idempotency_key: `${runId}_n1` };
  const report = { id: `${runId}_r1`, run_id: runId, scan_id: runId, kind: "internal_intelligence_report", validation_status: "valid", version: 1, checksum: "r1", idempotency_key: `${runId}_r1` };
  await service.from("proposal_versions").insert(proposal).throwOnError();
  await service.from("narrative_versions").insert(narrative).throwOnError();
  await service.from("intelligence_artifacts").insert(report).throwOnError();
  const ref = (r: { id: string; version: number; checksum: string }) => ({ id: r.id, version: r.version, checksum: r.checksum });
  const binding: CommercialReviewBinding = { schemaVersion: 1, proposal: ref(proposal), narrative: ref(narrative), report: ref(report), competitor: null, coreProposal: null };
  const svc = createRuntimeServices({ repo: new SupabaseRuntimeRepository(client), ids: (p) => `${p}_${randomUUID()}` });
  const review = (bound: CommercialReviewBinding = binding) => svc.events.emit({ eventType: "runtime.review.approved", aggregateType: "intelligence_run",
    aggregateId: runId, runId, scanId: runId, clientId: null, payload: { by: subject, binding: bound } });
  const next = { ...proposal, id: `${runId}_p2`, version: 2, checksum: "p2", idempotency_key: `${runId}_p2`, supersedes_id: proposal.id };
  return { service, svc, runId, binding, review, next };
}

function sql(statement: string): string {
  if (!container) throw new Error("Disposable container is required");
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: statement, encoding: "utf8", timeout: 15_000 }).trim();
}

async function hold(statement: string) {
  if (!container) throw new Error("Disposable container is required");
  const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]);
  let finished = false;
  let errors = "";
  child.stderr.on("data", (b: Buffer) => { errors += b.toString(); });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Transaction lock setup timed out")); }, 10_000);
    let output = "";
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("exit", (code) => { clearTimeout(timeout); if (code !== 0) reject(new Error(errors)); });
    child.stdout.on("data", (b: Buffer) => { output += b.toString(); if (output.includes("LOCK_HELD")) { clearTimeout(timeout); resolve(); } });
    child.stdin.write(`begin; set local request.jwt.claims = ${quote(claims)}; ${statement}; select 'LOCK_HELD';\n`);
  });
  return async (commit = true) => {
    if (finished) return;
    finished = true;
    const exited = once(child, "exit");
    child.stdin.end(commit ? "commit;\n" : "rollback;\n");
    const [code] = await exited;
    if (code !== 0) throw new Error(errors);
  };
}

async function waiter(runId: string) {
  const key = `hashtextextended(${quote(`auxion-commercial-review:${runId}`)},0)`;
  const query = `select count(*) from pg_locks where locktype='advisory' and not granted and classid::bigint=((${key} >> 32) & 4294967295) and objid::bigint=(${key} & 4294967295);`;
  for (let i = 0; i < 40; i++) {
    if (Number(sql(query)) > 0) return;
    await delay(25);
  }
  throw new Error("Expected a real waiter on the package lock");
}

describe.skipIf(!live)("version-bound reviews over Supabase", () => {
  it("persists current server identities and JWT actor through the real adapter", async () => {
    const f = await fixture();
    const result = await f.review();
    expect(result).toMatchObject({ ok: true, value: { actor: subject, payload: { binding: f.binding } } });
  });
  it("maps stale or forged binding failures to serialization conflicts", async () => {
    const f = await fixture();
    expect(await f.review({ ...f.binding, report: { ...f.binding.report, checksum: "forged" } })).toMatchObject({ ok: false, code: "serialization_conflict" });
    await f.service.from("proposal_versions").insert(f.next).throwOnError();
    expect(await f.review()).toMatchObject({ ok: false, code: "serialization_conflict" });
  });
  it.skipIf(!container)("revision wins: waiting approval rechecks committed versions and conflicts", async () => {
    const f = await fixture();
    const n = f.next;
    const release = await hold(`insert into public.proposal_versions(id,run_id,scan_id,status,version,checksum,idempotency_key,supersedes_id) values(${quote(n.id)},${quote(f.runId)},${quote(f.runId)},'needs_review',2,'p2',${quote(n.id)},${quote(n.supersedes_id)})`);
    let settled = false;
    const approval = f.review().finally(() => { settled = true; });
    try {
      await waiter(f.runId);
      expect(settled).toBe(false);
      await release();
      expect(await approval).toMatchObject({ ok: false, code: "serialization_conflict" });
    } finally { await release(false); await approval; }
  });
  it.skipIf(!container)("approval wins: revision waits until commit and preserves the reviewed identity", async () => {
    const f = await fixture();
    const payload = JSON.stringify({ by: subject, binding: f.binding });
    const eventId = `evt_${randomUUID()}`;
    const release = await hold(`insert into public.runtime_events(id,event_type,run_id,scan_id,aggregate_type,aggregate_id,sequence,payload) values(${quote(eventId)},'runtime.review.approved',${quote(f.runId)},${quote(f.runId)},'intelligence_run',${quote(f.runId)},1,${quote(payload)}::jsonb)`);
    let settled = false;
    const revision = Promise.resolve(f.service.from("proposal_versions").insert(f.next)).finally(() => { settled = true; });
    try {
      await waiter(f.runId);
      expect(settled).toBe(false);
      await release();
      expect((await revision).error).toBeNull();
      const events = await f.svc.events.list({ aggregateType: "intelligence_run", aggregateId: f.runId });
      expect(events).toMatchObject({ ok: true, value: [{ payload: { binding: f.binding } }] });
      expect(await f.review()).toMatchObject({ ok: false, code: "serialization_conflict" });
    } finally { await release(false); await revision; }
  });
  it.skipIf(!container)("repeatable-read review fails closed instead of comparing a stale snapshot", async () => {
    const f = await fixture();
    const payload = JSON.stringify({ by: subject, binding: f.binding });
    const statement = `begin isolation level repeatable read; set local request.jwt.claims=${quote(claims)}; insert into public.runtime_events(id,event_type,run_id,scan_id,aggregate_type,aggregate_id,sequence,payload) values('rr_${randomUUID()}','runtime.review.approved',${quote(f.runId)},${quote(f.runId)},'intelligence_run',${quote(f.runId)},1,${quote(payload)}::jsonb);`;
    expect(() => sql(statement)).toThrow(/fresh READ COMMITTED/);
  });
});
