#!/usr/bin/env node
/* =============================================================================
 * F4.8 — Integration Platform certification report generator.
 *
 * Runs the automated certification harness (@brightloop/data) over the whole
 * Integration Platform (F4.1–F4.7) and writes the deterministic markdown + JSON
 * certification reports to docs/engineering/. Re-runnable and offline:
 *
 *   pnpm -w build && node application/scripts/certify-integration.mjs
 *
 * Requires the workspace to be built first (imports the compiled data package).
 * Exits non-zero if certification fails, so it doubles as a CI-style gate.
 * ========================================================================== */

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url)); // application/scripts
// Import the compiled harness by path (workspace symlinks live in the data package's
// own node_modules, so a bare `@brightloop/data` specifier is unresolvable from here).
const dataDist = pathToFileURL(join(here, "..", "packages", "data", "dist", "index.js")).href;
const { certifyIntegrationPlatform, renderCertificationMarkdown, renderCertificationJson } = await import(dataDist);

const repoRoot = join(here, "..", ".."); // repo root
const outDir = join(repoRoot, "docs", "engineering");

const report = await certifyIntegrationPlatform();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "integration-platform-certification.md"), renderCertificationMarkdown(report), "utf8");
writeFileSync(join(outDir, "integration-platform-certification.json"), renderCertificationJson(report), "utf8");

const status = report.ok ? "CERTIFIED" : "BLOCKED";
process.stdout.write(
  `Integration Platform certification: ${status}\n` +
  `  connectors=${report.totals.availableConnectors} families=${report.totals.families} ` +
  `capabilities=${report.totals.capabilities} adapters=${report.totals.adapters}\n` +
  `  orphanCapabilities=${report.totals.orphanCapabilities} undeclaredHandlers=${report.totals.missingHandlers} ` +
  `duplicateRegistrations=${report.totals.duplicateRegistrations} orphanAdapters=${report.totals.orphanAdapters}\n` +
  `  reports → docs/engineering/integration-platform-certification.{md,json}\n`,
);

process.exit(report.ok ? 0 : 1);
