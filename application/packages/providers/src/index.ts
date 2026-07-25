/* =============================================================================
 * @brightloop/providers (Phase C · Sprint C2) — production provider adapters.
 *
 * Infrastructure: the ONLY workspace package that imports a vendor AI SDK. It
 * implements the domain's `ReasoningProviderAdapter` seam so the engine, runtime,
 * and application layers stay vendor-agnostic. Server-only — never import from a
 * client bundle (it would pull the SDK and the key-resolution path into the
 * browser).
 * ========================================================================== */

export * from "./anthropic/index.js";
export { parseProviderClaims, type ParseClaimsResult } from "./anthropic/claim-parser.js";
export * from "./driver/index.js";
export { FakeAnthropicTransport } from "./testing/fake-transport.js";
export type {
  ScriptedTransportStep,
  ScriptedTransportReturn,
  ScriptedTransportThrow,
  ScriptedTransportAwaitAbort,
  FakeTransportOptions,
} from "./testing/fake-transport.js";
