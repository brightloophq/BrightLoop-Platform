// Create a brand-new CI workdir. Never start/reset the repository's linked stack.
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

if (process.env.GITHUB_ACTIONS !== "true" || !process.env.GITHUB_ENV) throw new Error("GitHub Actions only");
const workdir = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "auxion-ci-"));
const project = `auxion-ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
if (!/^auxion-ci-\d+-\d+$/.test(project)) throw new Error("Invalid CI run identity");
mkdirSync(join(workdir, "supabase"), { mode: 0o700 });
const config = readFileSync("supabase/config.toml", "utf8").replace(/^project_id\s*=.*$/m, `project_id = "${project}"`);
writeFileSync(join(workdir, "supabase/config.toml"), config, { mode: 0o600 });
for (const path of ["migrations", "tests", "seed.sql"]) cpSync(resolve("supabase", path), join(workdir, "supabase", path), { recursive: true });
appendFileSync(process.env.GITHUB_ENV, `AUXION_DB_WORKDIR=${workdir}\n`);
console.log(`Prepared unlinked disposable project ${project}; no existing stack touched.`);
