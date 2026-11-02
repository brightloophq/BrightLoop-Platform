// Resolve credentials ONLY from an explicitly selected, running disposable stack.
// No shell eval, remote operations, reset, or credential files/logging.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const workdir = realpathSync(process.env.AUXION_DB_WORKDIR || "");
if (workdir === realpathSync(".")) throw new Error("Repository stack is forbidden");
for (const marker of ["project-ref", "linked-project.json"]) {
  if (existsSync(join(workdir, "supabase/.temp", marker))) throw new Error("Linked project forbidden");
}
const project = readFileSync(join(workdir, "supabase/config.toml"), "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!project || !/^auxion-(ci|s1b|s1d)-[a-zA-Z0-9-]+$/.test(project)) throw new Error("Explicit disposable AUXION project required");
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let status;
try { status = JSON.parse(run("supabase", ["status", "--workdir", workdir, "-o", "json"])); }
catch { throw new Error("Cannot inspect local Supabase status"); }
for (const key of ["API_URL", "DB_URL", "SERVICE_ROLE_KEY", "ANON_KEY", "JWT_SECRET"]) {
  if (typeof status[key] !== "string" || !status[key]) throw new Error("Required local test configuration is missing");
}
const api = new URL(status.API_URL);
const db = new URL(status.DB_URL);
if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || !["127.0.0.1", "localhost"].includes(db.hostname)) throw new Error("Loopback targets required");
let inspected;
try { inspected = JSON.parse(run("docker", ["inspect", `supabase_db_${project}`]))[0]; }
catch { throw new Error("Cannot inspect disposable database container"); }
if (inspected.Config.Labels["com.supabase.cli.project"] !== project || !inspected.State.Running) throw new Error("Container project mismatch");
const container = inspected.Name.replace(/^\//, "");
const ports = inspected.NetworkSettings.Ports["5432/tcp"] || [];
if (!ports.some((p) => p.HostPort === db.port)) throw new Error("Database port mismatch");
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(SUPABASE_|POSTGRES_|PG|NEXT_PUBLIC_SUPABASE_)/.test(key) || key === "DATABASE_URL") delete env[key];
Object.assign(env, {
  SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_SERVICE_KEY: status.SERVICE_ROLE_KEY,
  SUPABASE_TEST_ANON_KEY: status.ANON_KEY, SUPABASE_TEST_JWT_SECRET: status.JWT_SECRET,
  SUPABASE_TEST_DB_CONTAINER: container, NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY, BRIGHTLOOP_DATA_SOURCE: "supabase",
  SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  AUXION_DISPOSABLE_PROJECT: project, AUXION_RUN_LIVE_PROVIDER_TESTS: "false", AUXION_RUN_LIVE_CRAWLER_TESTS: "false",
  AUXION_CRAWLER_ENABLED: "false", AUXION_ANTHROPIC_ENABLED: "false", AUXION_LIVE_AI_ENABLED: "false", NEXT_TELEMETRY_DISABLED: "1",
});
delete env.ANTHROPIC_API_KEY;
if (process.env.GITHUB_ACTIONS === "true") {
  for (const key of ["SERVICE_ROLE_KEY", "ANON_KEY", "JWT_SECRET", "DB_URL"]) if (status[key]) console.log(`::add-mask::${status[key]}`);
}
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
if (!args.length) throw new Error("Command required after --");
console.log(`Verified local project ${project}; DB container ${container}; API ${api.origin}`);
const child = spawnSync(args[0], args.slice(1), { env, stdio: "inherit", cwd: resolve(".") });
if (child.error) throw new Error("Unable to execute verification command");
process.exit(child.status ?? 1);
