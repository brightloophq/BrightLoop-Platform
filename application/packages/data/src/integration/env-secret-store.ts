/* =============================================================================
 * Environment-backed ConnectorSecretStore (F4.1).
 *
 * Resolves connector secret REFERENCES from the process environment (or an
 * out-of-band secret manager that injects them as env vars), keyed by an opaque
 * ref. Invents NO encryption. Writes fall back to a process-lifetime map used only
 * for bootstrap/dev — production secrets are provisioned out-of-band and resolved
 * read-only here. Secret VALUES never leave this module except via `getSecret` at
 * the adapter boundary. Mirrors the F3 env-secret-store.
 * ========================================================================== */

import type { ConnectorSecretMetadata, ConnectorSecretStore, ConnectorSecretValidation } from "@brightloop/domain";

const ENV_PREFIX = "CONNECTOR_SECRET__";
const envKey = (ref: string): string => `${ENV_PREFIX}${ref.replace(/[^A-Za-z0-9_]/g, "_")}`;

/** An env-backed secret store. `getSecret` prefers a real env var, then a bootstrap map. */
export function createEnvConnectorSecretStore(): ConnectorSecretStore {
  const bootstrap = new Map<string, { value: string; metadata: ConnectorSecretMetadata }>();
  return {
    async putSecret(ref, value, metadata) {
      // Production secrets are injected via the environment; this map is a dev/bootstrap
      // fallback only (process lifetime, never persisted).
      bootstrap.set(ref, { value, metadata });
    },
    async getSecret(ref) {
      const fromEnv = process.env[envKey(ref)];
      if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
      return bootstrap.get(ref)?.value ?? null;
    },
    async rotateSecret(ref, value) {
      const cur = bootstrap.get(ref);
      const version = cur ? String(Number(cur.metadata.version) + 1) : "1";
      bootstrap.set(ref, { value, metadata: cur ? { ...cur.metadata, version } : { connectorId: "", purpose: "credential", version, rotatedAt: null, expiresAt: null } });
      return version;
    },
    async revokeSecret(ref) { bootstrap.delete(ref); },
    async validateSecretReference(ref): Promise<ConnectorSecretValidation> {
      const present = (typeof process.env[envKey(ref)] === "string" && process.env[envKey(ref)]!.length > 0) || bootstrap.has(ref);
      return present ? { valid: true, reason: null } : { valid: false, reason: "the secret reference is not provisioned" };
    },
  };
}
