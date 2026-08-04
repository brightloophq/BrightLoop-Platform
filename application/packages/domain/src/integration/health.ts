/* =============================================================================
 * Integration Platform — health evaluation (F4.1). PURE.
 *
 * Maps an adapter health level (and connection failures) onto the installation
 * lifecycle status, deterministically. No io, no clock.
 * ========================================================================== */

import type { ConnectorFailureCategory, ConnectorHealthLevel, ConnectorInstallationStatus } from "@brightloop/schema";

/** Derive the installation status implied by a health level. */
export function statusFromHealth(level: ConnectorHealthLevel): ConnectorInstallationStatus {
  switch (level) {
    case "healthy":
      return "connected";
    case "degraded":
      return "degraded";
    case "unavailable":
    case "unauthorized":
      return "error";
    case "unknown":
    default:
      return "validating";
  }
}

/** Map a connection failure category onto a health level (fail toward worse). */
export function healthFromFailure(category: ConnectorFailureCategory): ConnectorHealthLevel {
  switch (category) {
    case "authentication":
    case "authorization":
    case "signature_invalid":
      return "unauthorized";
    case "provider_unavailable":
    case "network":
    case "timeout":
      return "unavailable";
    case "throttled":
    case "rate_limited":
      return "degraded";
    default:
      return "degraded";
  }
}
