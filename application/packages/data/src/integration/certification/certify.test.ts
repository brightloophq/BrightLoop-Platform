/* =============================================================================
 * Integration Platform — Certification harness tests (F4.8). Deterministic, offline.
 *
 * Runs the automated certifier over the FULL production connector-adapter set and
 * asserts the platform-wide invariants a coherent connector platform must hold:
 * every declared capability has a handler (no orphans, no undeclared handlers),
 * every available connector is installable + invocable + health-reporting with
 * trigger/OAuth wiring matching its descriptor, the registry has no duplicate
 * registrations or orphan adapters, and the health vocabulary is the shared
 * normalized set. The matrix counts are pinned so a future connector that skips a
 * seam, or a silent registry change, fails CI.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { CONNECTOR_REGISTRY } from "@brightloop/domain";
import {
  certifyIntegrationPlatform, buildCertificationAdapterRegistry, CERTIFIED_HEALTH_LEVELS,
} from "./certify.js";
import { renderCertificationMarkdown, renderCertificationJson } from "./report.js";

describe("F4.8 — Integration Platform certification harness", () => {
  it("composes the full production adapter set offline (Fakes + 6 families)", () => {
    const adapters = buildCertificationAdapterRegistry();
    // Every AVAILABLE connector must have a live adapter; unavailable examples must not.
    for (const d of CONNECTOR_REGISTRY) {
      if (d.available) expect(adapters[d.id], `${d.id} adapter`).toBeDefined();
      else expect(adapters[d.id], `${d.id} example has no adapter`).toBeUndefined();
    }
    // Expected production connectors (2 fakes + 4 Google + 3 Comm + 3 Commerce + 3 CRM + 2 Finance + 4 Social = 21).
    expect(Object.keys(adapters).sort()).toEqual(
      [
        "discord", "fake-connector", "fake-oauth", "google-calendar", "google-contacts", "google-drive",
        "google-gmail", "hubspot", "linkedin", "meta", "microsoft-teams", "paypal", "pipedrive", "quickbooks",
        "salesforce", "shopify", "slack", "stripe", "tiktok", "x", "xero",
      ].sort(),
    );
  });

  it("certifies the whole platform with ZERO defects", async () => {
    const report = await certifyIntegrationPlatform();
    // No defects in any dimension.
    expect(report.totals.orphanCapabilities, "orphan capabilities").toBe(0);
    expect(report.totals.missingHandlers, "undeclared handlers").toBe(0);
    expect(report.totals.duplicateRegistrations, "duplicate registrations").toBe(0);
    expect(report.totals.orphanAdapters, "orphan adapters").toBe(0);
    expect(report.connectors.filter((c) => !c.ok), "failed connectors").toEqual([]);
    expect(report.capabilities.filter((c) => !c.ok), "failed capabilities").toEqual([]);
    expect(report.areas.filter((a) => !a.ok), "failed areas").toEqual([]);
    expect(report.ok, "overall certification").toBe(true);
  });

  it("pins the certification matrix totals", async () => {
    const report = await certifyIntegrationPlatform();
    expect(report.totals.connectors).toBe(24); // 5 framework (2 fake + 3 example) + 4 google + 3 comm + 3 commerce + 3 crm + 2 finance + 4 social
    expect(report.totals.availableConnectors).toBe(21);
    expect(report.totals.catalogueExamples).toBe(3);
    expect(report.totals.adapters).toBe(21);
    // Family groupings of AVAILABLE connectors (custom = fakes; productivity = calendar; storage = drive; crm includes google-contacts).
    const byFamily = Object.fromEntries(report.families.map((f) => [f.family, f.connectors]));
    expect(byFamily["communication"]).toBe(4); // gmail + slack + teams + discord
    expect(byFamily["commerce"]).toBe(3);
    expect(byFamily["crm"]).toBe(4); // google-contacts + hubspot + salesforce + pipedrive
    expect(byFamily["finance"]).toBe(2);
    expect(byFamily["social"]).toBe(4);
  });

  it("proves every available connector's declared operations equal its adapter's handlers", async () => {
    const report = await certifyIntegrationPlatform();
    for (const c of report.connectors) {
      if (!c.available) continue;
      // capabilityCount capabilities, each with a handler (hasHandler true).
      const caps = report.capabilities.filter((x) => x.connectorId === c.connectorId);
      expect(caps.length, `${c.connectorId} capability rows`).toBe(c.capabilityCount);
      for (const cap of caps) expect(cap.hasHandler, `${c.connectorId}.${cap.capabilityKey}`).toBe(true);
    }
  });

  it("certifies oauth2 connectors carry OAuth wiring and trigger kinds match adapters", async () => {
    const report = await certifyIntegrationPlatform();
    for (const c of report.connectors) {
      if (!c.available) continue;
      if (c.authMethod === "oauth2") expect(c.oauth, `${c.connectorId} oauth`).toBe(true);
      if (c.triggerKinds.includes("polling")) expect(c.polling, `${c.connectorId} poll`).toBe(true);
      if (c.triggerKinds.includes("webhook")) expect(c.webhook, `${c.connectorId} webhook`).toBe(true);
    }
  });

  it("uses only the shared normalized health vocabulary", async () => {
    const report = await certifyIntegrationPlatform();
    expect(report.healthVocabulary).toEqual([...CERTIFIED_HEALTH_LEVELS]);
    expect(report.healthVocabulary).toEqual(["healthy", "degraded", "unavailable", "unauthorized", "unknown"]);
  });

  it("renders a deterministic, secret-free markdown + JSON report", async () => {
    const report = await certifyIntegrationPlatform();
    const md1 = renderCertificationMarkdown(report);
    const md2 = renderCertificationMarkdown(await certifyIntegrationPlatform());
    expect(md1).toBe(md2); // deterministic
    expect(md1).toContain("CERTIFIED — READY FOR REVIEW");
    expect(md1).toContain("Connector certification matrix");
    // The report must never carry the dummy client credentials used to compose adapters.
    const json = renderCertificationJson(report);
    for (const blob of [md1, json]) {
      expect(blob).not.toContain("cert-secret");
      expect(blob).not.toContain("cert-token");
    }
  });
});
