/* =============================================================================
 * Integration Platform — Certification module (F4.8) barrel.
 *
 * The automated certifier for the whole Integration Platform (F4.1–F4.7): composes
 * the production connector-adapter set offline, cross-checks it against the domain
 * CONNECTOR_REGISTRY, and renders a deterministic markdown/JSON certification report.
 * ========================================================================== */

export {
  certifyIntegrationPlatform,
  buildCertificationAdapterRegistry,
  CERTIFIED_HEALTH_LEVELS,
  type IntegrationCertificationReport,
  type ConnectorCertRow,
  type CapabilityCertRow,
  type CertificationArea,
  type FamilySummary,
} from "./certify.js";
export { renderCertificationMarkdown, renderCertificationJson } from "./report.js";
