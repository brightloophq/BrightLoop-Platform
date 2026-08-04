/* =============================================================================
 * Integration Platform — connector configuration (F4.1). PURE.
 *
 * Validates a submitted config against a connector descriptor's declared fields,
 * and separates NON-SECRET config (persisted on the installation row) from SECRET
 * fields (which only ever reach the secret store — never the database). No io.
 * ========================================================================== */

import type { ConfigFieldDescriptor, ConnectorDescriptor } from "@brightloop/schema";

export interface ConfigValidationIssue { field: string; message: string }
export interface ConfigValidationResult {
  ok: boolean;
  issues: ConfigValidationIssue[];
  /** Non-secret values that belong on the installation row. */
  config: Record<string, unknown>;
  /** Secret values keyed by field, destined ONLY for the secret store. */
  secrets: Record<string, string>;
}

function typeOk(field: ConfigFieldDescriptor, value: unknown): string | null {
  switch (field.type) {
    case "string":
    case "secret":
      return typeof value === "string" ? null : "must be a string";
    case "url":
      if (typeof value !== "string") return "must be a string";
      return /^https?:\/\/[^\s]+$/i.test(value) ? null : "must be an http(s) URL";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "must be a number";
    case "boolean":
      return typeof value === "boolean" ? null : "must be a boolean";
    case "enum":
      return typeof value === "string" && field.options.includes(value) ? null : `must be one of: ${field.options.join(", ")}`;
    default:
      return "unknown field type";
  }
}

/**
 * Validate + split a submitted config for a connector. Unknown keys are dropped
 * (never persisted). Secret fields are removed from `config` and returned in
 * `secrets`. Missing required fields become issues; `ok` is false if any issue.
 */
export function validateConnectorConfig(
  descriptor: ConnectorDescriptor,
  submitted: Record<string, unknown>,
  /**
   * Secret field keys already provisioned (e.g. on reconfigure). A required secret
   * that is already stored is NOT re-required — the caller need not re-supply it.
   */
  provisionedSecretFields: ReadonlySet<string> = new Set<string>(),
): ConfigValidationResult {
  const issues: ConfigValidationIssue[] = [];
  const config: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};

  for (const field of descriptor.configFields) {
    const provided = Object.prototype.hasOwnProperty.call(submitted, field.key);
    const value = submitted[field.key];
    if (!provided || value === null || value === undefined || value === "") {
      const alreadyProvisioned = (field.secret || field.type === "secret") && provisionedSecretFields.has(field.key);
      if (field.required && !alreadyProvisioned) issues.push({ field: field.key, message: "is required" });
      continue;
    }
    const typeErr = typeOk(field, value);
    if (typeErr !== null) {
      issues.push({ field: field.key, message: typeErr });
      continue;
    }
    if (field.secret || field.type === "secret") {
      secrets[field.key] = value as string;
    } else {
      config[field.key] = value;
    }
  }

  return { ok: issues.length === 0, issues, config, secrets };
}

/** Whether a validated config satisfies EVERY required field (used for gating). */
export function isConfigComplete(descriptor: ConnectorDescriptor, result: ConfigValidationResult): boolean {
  if (!result.ok) return false;
  return descriptor.configFields
    .filter((f) => f.required)
    .every((f) => (f.secret || f.type === "secret") ? f.key in result.secrets : f.key in result.config);
}

/** The set of capability keys a connector declares (for enable-list validation). */
export function declaredCapabilityKeys(descriptor: ConnectorDescriptor): string[] {
  return descriptor.capabilities.map((c) => c.key);
}

/**
 * Filter a requested enabled-capability list down to those the connector actually
 * declares — an installation can never enable a capability the connector lacks.
 */
export function resolveEnabledCapabilities(descriptor: ConnectorDescriptor, requested: readonly string[]): string[] {
  const declared = new Set(declaredCapabilityKeys(descriptor));
  return requested.filter((k) => declared.has(k));
}
