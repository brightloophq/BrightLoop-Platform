/* =============================================================================
 * Execution Runtime — provider adapter + secret-store PORTS (F3). PURE contracts.
 *
 * The domain depends ONLY on these interfaces, never on the n8n SDK or any HTTP
 * client. Concrete adapters (n8n, and a deterministic fake for tests) live in the
 * data layer and implement these. Provider-specific types never leak upward: the
 * inputs/outputs here are provider-neutral, normalized shapes. No io in this file.
 * ========================================================================== */

import type { RuntimeExecutionStatus, RuntimeFailureCategory, RuntimeHealthLevel, RuntimeProvider } from "@brightloop/schema";
import type { IncompatibilityReport } from "./validation.js";

/* ---- shared result envelope ------------------------------------------------ */

export interface ProviderOk<T> { ok: true; value: T }
export interface ProviderErr {
  ok: false;
  /** Normalized taxonomy — the adapter never leaks a raw provider error. */
  category: RuntimeFailureCategory;
  /** Short, safe provider code (never a response body/secret). */
  code: string | null;
  message: string;
}
export type ProviderResult<T> = ProviderOk<T> | ProviderErr;

/* ---- connection / capability / health -------------------------------------- */

export interface ConnectionInput { baseUrl: string; secret: string; provider: RuntimeProvider }
export interface ConnectionValidationResult { reachable: boolean; authenticated: boolean; providerVersion: string | null; latencyMs: number }
export interface RuntimeCapabilityResult { operation: string; supported: boolean }
export interface RuntimeHealthResult { level: RuntimeHealthLevel; providerVersion: string | null; latencyMs: number; detail: Record<string, unknown> }

/* ---- workflow deployment --------------------------------------------------- */

/** The translated, provider-specific workflow the adapter deploys (opaque here). */
export interface TranslatedWorkflow {
  provider: RuntimeProvider;
  /** Deterministic hash of the translated definition (drift baseline). */
  hash: string;
  name: string;
  /** Provider-specific document; the adapter interprets it, the domain never does. */
  document: Record<string, unknown>;
  nodeCount: number;
  connectionCount: number;
}

export interface DeployWorkflowInput { runtimeBaseUrl: string; secret: string; workflow: TranslatedWorkflow; externalWorkflowId: string | null; idempotencyKey: string; timeoutMs: number }
export interface ProviderDeploymentResult { externalWorkflowId: string; externalWorkflowVersion: string | null; active: boolean }
export interface ProviderOperationResult { externalWorkflowId: string | null; active: boolean }

export interface ProviderWorkflowSnapshot { externalWorkflowId: string; name: string; active: boolean; hash: string; nodeCount: number; connectionCount: number }

/* ---- executions ------------------------------------------------------------ */

export interface ProviderExecutionSnapshot {
  externalExecutionId: string;
  externalWorkflowId: string | null;
  status: RuntimeExecutionStatus;
  startedAt: string | null;
  stoppedAt: string | null;
  durationMs: number;
  triggerType: string | null;
  failureCategory: RuntimeFailureCategory | null;
  errorSummary: string;
  lastNode: string | null;
}
export interface ProviderExecutionPage { executions: ProviderExecutionSnapshot[]; nextCursor: string | null }
export interface ListExecutionsInput { runtimeBaseUrl: string; secret: string; externalWorkflowId: string | null; cursor: string | null; since: string | null; limit: number; timeoutMs: number }

/* ---- the port -------------------------------------------------------------- */

export interface OperationInput { runtimeBaseUrl: string; secret: string; externalWorkflowId?: string | null; externalExecutionId?: string | null; idempotencyKey?: string; timeoutMs: number }

/** Auxion metadata attached to the translated workflow (NEVER secrets). */
export interface DeploymentMeta { workspaceId: string; deploymentId: string; deploymentVersion: number; packageId: string; packageHash: string; correlationId: string }
export type TranslationOutcome = { ok: true; workflow: TranslatedWorkflow } | { ok: false; report: IncompatibilityReport };

/** The contract every runtime provider implements. Provider-neutral in/out. */
export interface RuntimeAdapter {
  readonly provider: RuntimeProvider;
  /**
   * Deterministically translate the provider-NEUTRAL package payload into this
   * provider's workflow document. Same package + same adapter version ⇒ same hash.
   * Returns a structured incompatibility report instead of silently omitting
   * unsupported constructs (the caller must fail before any provider call). Pure.
   */
  translate(payload: Record<string, unknown>, meta: DeploymentMeta): TranslationOutcome;
  validateConnection(input: ConnectionInput): Promise<ProviderResult<ConnectionValidationResult>>;
  discoverCapabilities(input: ConnectionInput): Promise<ProviderResult<RuntimeCapabilityResult[]>>;
  deployWorkflow(input: DeployWorkflowInput): Promise<ProviderResult<ProviderDeploymentResult>>;
  updateWorkflow(input: DeployWorkflowInput): Promise<ProviderResult<ProviderDeploymentResult>>;
  activateWorkflow(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>>;
  deactivateWorkflow(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>>;
  deleteWorkflow(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>>;
  getWorkflow(input: OperationInput): Promise<ProviderResult<ProviderWorkflowSnapshot>>;
  listExecutions(input: ListExecutionsInput): Promise<ProviderResult<ProviderExecutionPage>>;
  getExecution(input: OperationInput): Promise<ProviderResult<ProviderExecutionSnapshot>>;
  retryExecution(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>>;
  stopExecution(input: OperationInput): Promise<ProviderResult<ProviderOperationResult>>;
  healthCheck(input: ConnectionInput): Promise<ProviderResult<RuntimeHealthResult>>;
}

/** A registry of adapters keyed by provider, injected into the application layer. */
export type RuntimeAdapterRegistry = Partial<Record<RuntimeProvider, RuntimeAdapter>>;

/* ---- secret store PORT ----------------------------------------------------- */

export interface SecretMetadata { provider: RuntimeProvider; version: string; rotatedAt: string | null; expiresAt: string | null }
export interface SecretValidation { valid: boolean; reason: string | null }

/**
 * The abstraction over wherever real secrets live. The application NEVER handles a
 * raw secret except by passing an opaque `ref` to `getSecret` at the adapter
 * boundary; secret VALUES never enter DTOs, read models, logs, or the database.
 */
export interface RuntimeSecretStore {
  putSecret(ref: string, value: string, metadata: SecretMetadata): Promise<void>;
  getSecret(ref: string): Promise<string | null>;
  rotateSecret(ref: string, value: string): Promise<string>;
  revokeSecret(ref: string): Promise<void>;
  validateSecretReference(ref: string): Promise<SecretValidation>;
}
