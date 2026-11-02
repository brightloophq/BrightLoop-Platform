import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Fake CLI output exercises refusal paths without Docker, auth, or a database.
function fixture({ linked = false, remote = false, badLabel = false, missingAuth = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "auxion-db-guard-"));
  const project = "auxion-s1d-guard";
  mkdirSync(join(dir, "supabase/.temp"), { recursive: true });
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "supabase/config.toml"), `project_id = "${project}"\n`);
  if (linked) writeFileSync(join(dir, "supabase/.temp/project-ref"), "forbidden");
  const status = { API_URL: remote ? "https://remote.example.test" : "http://127.0.0.1:56421",
    DB_URL: "postgresql://local:local@127.0.0.1:56422/postgres", SERVICE_ROLE_KEY: "fake-service", ANON_KEY: "fake-anon", JWT_SECRET: "fake-secret" };
  if (missingAuth) delete status.JWT_SECRET;
  const inspected = [{ Name: `/supabase_db_${project}`, Config: { Labels: { "com.supabase.cli.project": badLabel ? "other-project" : project } },
    State: { Running: true }, NetworkSettings: { Ports: { "5432/tcp": [{ HostPort: "56422" }] } } }];
  for (const [name, data] of [["supabase", status], ["docker", inspected]]) {
    writeFileSync(join(dir, "bin", name), `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(data))});\n`, { mode: 0o700 });
  }
  return { dir, env: { ...process.env, AUXION_DB_WORKDIR: dir, PATH: `${join(dir, "bin")}:${process.env.PATH}`, GITHUB_ACTIONS: "false" } };
}
const wrapper = resolve("scripts/with-local-db.mjs");
const run = (f, code = "process.exit(0)") => spawnSync(process.execPath, [wrapper, "--", process.execPath, "-e", code], { env: f.env, encoding: "utf8" });
test("linked disposable workdir is rejected", () => assert.notEqual(run(fixture({ linked: true })).status, 0));
test("remote API is rejected", () => assert.notEqual(run(fixture({ remote: true })).status, 0));
test("mismatched container label is rejected", () => assert.notEqual(run(fixture({ badLabel: true })).status, 0));
test("missing JWT configuration fails instead of skipping integration tests", () => assert.notEqual(run(fixture({ missingAuth: true })).status, 0));
test("actual container is exported and inherited remote values replaced", () => {
  const f = fixture();
  f.env.SUPABASE_TEST_URL = "https://remote.example.test";
  const result = run(f, "if(process.env.SUPABASE_TEST_DB_CONTAINER!=='supabase_db_auxion-s1d-guard'||process.env.SUPABASE_TEST_URL!=='http://127.0.0.1:56421')process.exit(7)");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes("fake-secret") && !result.stdout.includes("fake-service"));
});
test("child failure fails the verification command", () => assert.equal(run(fixture(), "process.exit(19)").status, 19));
