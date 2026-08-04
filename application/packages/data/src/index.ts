/* =============================================================================
 * @brightloop/data — repository bindings.
 *
 * THIS FILE IS THE ONLY SEAM between the application and its persistence.
 * Consumers ask for a repository by PORT; they never name an implementation.
 *
 * CURRENT BINDINGS
 *   ReputationRepository → Supabase (production) | Placeholder (dev/tests)
 *   CatalogRepository    → Static catalog, ALWAYS.
 *
 * WHY THE CATALOG IS NOT SUPABASE-BACKED
 *   There are no catalog tables. The service modules, plans and prices were
 *   never part of the handoff's database schema (schema.js ENTITIES) — they live
 *   in the design bundle's `platform/data.js` as reference content, and their
 *   real values are still open decisions 1 & 2. Giving them tables before the
 *   product owner has decided the pricing model would be inventing a schema.
 *   When real pricing lands, either the dataset is edited or catalog tables get
 *   a migration and a SupabaseCatalogRepository slots in here — no page changes
 *   either way, because pages only know the port.
 * ========================================================================== */

import type { CatalogRepository, DataSource, ReputationRepository } from "@brightloop/domain";
import { PlaceholderReputationRepository } from "./placeholder/reputation.repository.js";
import { PlaceholderCatalogRepository } from "./placeholder/catalog.repository.js";
import {
  SupabaseReputationRepository,
  type AuxionSupabaseClient,
} from "./supabase/reputation.repository.js";

export { PlaceholderReputationRepository } from "./placeholder/reputation.repository.js";
export { PlaceholderCatalogRepository } from "./placeholder/catalog.repository.js";
export { SupabaseReputationRepository } from "./supabase/reputation.repository.js";
export type { AuxionSupabaseClient } from "./supabase/reputation.repository.js";
export { toPortfolioProject, toTestimonial } from "./supabase/mappers.js";
// Transformation cycle — Supabase-backed adapter for the domain repository port.
export { SupabaseTransformationRepository } from "./transformation/repository.js";
// Phase D · Transformation Execution — workspace / initiative / activity adapters.
export {
  SupabaseTransformationWorkspaceRepository,
  SupabaseInitiativeRepository,
  SupabaseTransformationActivityRepository,
  SupabaseReviewRepository,
  SupabaseTaskRepository,
  SupabaseAssignmentRepository,
  SupabaseDependencyRepository,
  SupabaseTimelineRepository,
  SupabaseMilestoneRepository,
  SupabaseKpiRepository,
  SupabaseProgressSnapshotRepository,
} from "./transformation-execution/adapter.js";
// Phase D · Collaboration (D7) — subscription / mention / notification / inbox / receipt adapters.
export {
  SupabaseSubscriptionRepository,
  SupabaseMentionRepository,
  SupabaseNotificationRepository,
  SupabaseInboxRepository,
  SupabaseReadReceiptRepository,
} from "./collaboration/adapter.js";
// Phase E · AI Foundation (E1) — eleven repository adapters + deterministic provider.
export {
  SupabaseAiProviderRepository,
  SupabasePromptRepository,
  SupabasePromptVersionRepository,
  SupabasePromptExecutionRepository,
  SupabasePromptResultRepository,
  SupabaseUsageRecordRepository,
  SupabaseCostRecordRepository,
  SupabaseAuditEventRepository,
  SupabaseConversationRepository,
  SupabaseConversationMessageRepository,
  SupabaseEvaluationResultRepository,
} from "./ai-foundation/adapter.js";
export { createDeterministicAiProvider } from "./ai-foundation/deterministic-provider.js";
// Phase E · Knowledge Base (E2) — eleven repositories + vector store + embedding provider.
export {
  SupabaseKnowledgeCollectionRepository,
  SupabaseKnowledgeDocumentRepository,
  SupabaseDocumentVersionRepository,
  SupabaseDocumentChunkRepository,
  SupabaseEmbeddingVectorRepository,
  SupabaseEmbeddingJobRepository,
  SupabaseRetrievalSessionRepository,
  SupabaseRetrievedContextRepository,
  SupabaseKnowledgeCitationRepository,
  SupabaseKnowledgePermissionRepository,
  SupabaseKnowledgeSourceRepository,
  SupabaseVectorStore,
  createDeterministicEmbeddingProvider,
} from "./knowledge/adapter.js";
// Phase E · AI Strategist (E3) — nine repository adapters.
export {
  SupabaseStrategySessionRepository,
  SupabaseStrategyAnalysisRepository,
  SupabaseBusinessFindingRepository,
  SupabaseRiskAssessmentRepository,
  SupabaseRecommendationRepository,
  SupabasePriorityScoreRepository,
  SupabaseTransformationRoadmapRepository,
  SupabaseStrategyCitationRepository,
  SupabaseStrategyFeedbackRepository,
} from "./strategist/adapter.js";
// Phase E · AI Project Manager (E4) — twelve repository adapters.
export {
  SupabasePlanningSessionRepository,
  SupabaseExecutionPlanRepository,
  SupabaseInitiativePlanRepository,
  SupabaseMilestonePlanRepository,
  SupabaseTaskPlanRepository,
  SupabaseDependencyPlanRepository,
  SupabaseTimelinePlanRepository,
  SupabaseReviewPlanRepository,
  SupabaseKpiPlanRepository,
  SupabaseResourceEstimateRepository,
  SupabaseExecutionRiskRepository,
  SupabasePlanningFeedbackRepository,
} from "./project-manager/adapter.js";
// Phase E · AI Automation Builder (E5) — twelve repository adapters.
export {
  SupabaseExecutionIntentRepository,
  SupabaseAutomationPlanRepository,
  SupabaseWorkflowDefinitionRepository,
  SupabaseWorkflowStepRepository,
  SupabaseTriggerDefinitionRepository,
  SupabaseActionDefinitionRepository,
  SupabaseConditionDefinitionRepository,
  SupabaseVariableDefinitionRepository,
  SupabaseIntegrationBindingRepository,
  SupabaseDeploymentPackageRepository,
  SupabaseAutomationVersionRepository,
  SupabaseAutomationFeedbackRepository,
} from "./automation-builder/adapter.js";
// Phase E · AI Reporting & BI (E6) — twelve repository adapters.
export {
  SupabaseExecutiveReportRepository,
  SupabaseObservationSnapshotRepository,
  SupabaseBusinessMetricRepository,
  SupabaseKpiResultRepository,
  SupabaseTrendAnalysisRepository,
  SupabaseForecastRepository,
  SupabaseBusinessInsightRepository,
  SupabaseReportExecutiveSummaryRepository,
  SupabaseReportSectionRepository,
  SupabaseReportNarrativeRepository,
  SupabaseReportScheduleRepository,
  SupabaseReportFeedbackRepository,
} from "./reporting/adapter.js";
// Phase E · AI Agents (E7) — seventeen repository adapters.
export {
  SupabaseAgentProfileRepository,
  SupabaseAgentMissionRepository,
  SupabaseAgentRunRepository,
  SupabaseAgentTaskRepository,
  SupabaseAgentDelegationRepository,
  SupabaseAgentMessageRepository,
  SupabaseAgentObservationRepository,
  SupabaseAgentDecisionRepository,
  SupabaseAgentToolCallRepository,
  SupabaseAgentCheckpointRepository,
  SupabaseAgentApprovalRepository,
  SupabaseAgentEvaluationRepository,
  SupabaseAgentMemoryRepository,
  SupabaseAgentArtifactRepository,
  SupabaseAgentFailureRepository,
  SupabaseAgentFeedbackRepository,
  SupabaseCapabilityDefinitionRepository,
} from "./agents/adapter.js";
// Phase E · Platform Certification (E8) — four repository adapters.
export {
  SupabaseCertificationRunRepository,
  SupabaseCertificationResultRepository,
  SupabaseCertificationIssueRepository,
  SupabaseCertificationExceptionRepository,
} from "./platform-certification/adapter.js";
// Phase F · AI Copilot (F2) — four repository adapters.
export {
  SupabaseCopilotConversationRepository,
  SupabaseCopilotMessageRepository,
  SupabaseCopilotCitationRepository,
  SupabaseCopilotActionRepository,
} from "./copilot/adapter.js";
// Phase F · Execution Runtime (F3) — fifteen repository adapters + n8n provider.
export { createExecutionRuntimeRepositories } from "./execution-runtime/adapter.js";
export { createN8nRuntimeAdapter, translateToN8n } from "./execution-runtime/n8n-adapter.js";
export { createEnvRuntimeSecretStore } from "./execution-runtime/env-secret-store.js";
// Phase F · Integration Platform (F4.1) — eight connector repository adapters,
// the env-backed connector secret store, and the deterministic Fake connector.
export { createIntegrationRepositories } from "./integration/adapter.js";
export { createEnvConnectorSecretStore } from "./integration/env-secret-store.js";
export { createFakeConnectorAdapter, createDefaultConnectorAdapters } from "./integration/fake-connector-adapter.js";
// Phase F · F4.2 — Google Workspace production connectors (Gmail/Calendar/Drive/Contacts).
export { createGoogleConnectorAdapters, loadGoogleAdapterConfig } from "./integration/google/adapter.js";
export { createFetchGoogleHttpTransport } from "./integration/google/transport.js";
export type { GoogleAdapterConfig } from "./integration/google/client.js";
export type { GoogleHttpTransport, GoogleHttpRequest, GoogleHttpResponse } from "./integration/google/transport.js";
// Phase F · F4.3 — Communication production connectors (Slack/Teams/Discord).
export { createCommunicationConnectorAdapters, loadCommunicationConfig } from "./integration/communication/adapter.js";
export type { CommunicationConfig } from "./integration/communication/adapter.js";
export { createFetchCommTransport } from "./integration/communication/transport.js";
export type { CommHttpTransport } from "./integration/communication/transport.js";
// Phase F · F4.4 — Commerce production connectors (Shopify/Stripe/PayPal).
export { createCommerceConnectorAdapters, loadCommerceConfig } from "./integration/commerce/adapter.js";
export type { CommerceConnectorConfig } from "./integration/commerce/adapter.js";
export { createFetchCommerceTransport } from "./integration/commerce/transport.js";
export type { CommerceHttpTransport, CommerceHttpRequest, CommerceHttpResponse } from "./integration/commerce/transport.js";
// Phase F · F4.5 — CRM production connectors (HubSpot/Salesforce/Pipedrive).
export { createCrmConnectorAdapters, loadCrmConfig } from "./integration/crm/adapter.js";
export type { CrmConnectorConfig } from "./integration/crm/adapter.js";
export { createFetchCrmTransport } from "./integration/crm/transport.js";
export type { CrmHttpTransport, CrmHttpRequest, CrmHttpResponse } from "./integration/crm/transport.js";
// Phase F · F4.6 — Finance production connectors (QuickBooks Online/Xero).
export { createFinanceConnectorAdapters, loadFinanceConfig } from "./integration/finance/adapter.js";
export type { FinanceConnectorConfig } from "./integration/finance/adapter.js";
export { createFetchFinanceTransport } from "./integration/finance/transport.js";
export type { FinanceHttpTransport, FinanceHttpRequest, FinanceHttpResponse } from "./integration/finance/transport.js";
// Phase F · F4.7 — Social production connectors (Meta/LinkedIn/X/TikTok).
export { createSocialConnectorAdapters, loadSocialConfig } from "./integration/social/adapter.js";
export type { SocialConnectorConfig } from "./integration/social/adapter.js";
export { createFetchSocialTransport } from "./integration/social/transport.js";
export type { SocialHttpTransport, SocialHttpRequest, SocialHttpResponse } from "./integration/social/transport.js";
// Phase F · F4.8 — Integration Platform certification harness (automated certifier
// for F4.1–F4.7: composes the production adapter set offline, cross-checks the
// registry, renders a deterministic markdown/JSON certification report).
export {
  certifyIntegrationPlatform,
  buildCertificationAdapterRegistry,
  renderCertificationMarkdown,
  renderCertificationJson,
  CERTIFIED_HEALTH_LEVELS,
} from "./integration/certification/index.js";
export type {
  IntegrationCertificationReport,
  ConnectorCertRow,
  CapabilityCertRow,
  CertificationArea,
  FamilySummary,
} from "./integration/certification/index.js";
// Transformation dashboard — fully typed read adapter (Sprint 4).
export { SupabaseTransformationDashboardRepository } from "./transformation/dashboard.js";
// Signals — fully typed read adapter (Sprint 5). Writes go through the domain service.
export { SupabaseSignalsRepository } from "./transformation/signals.read.js";
// Core surfaces (Phase 1B) — fully typed Business Scan / Domains / Findings adapter.
export { SupabaseCoreSurfaceRepository } from "./core-surfaces/adapter.js";
// Runtime persistence (Phase B) — fully typed runtime repository adapter.
export { SupabaseRuntimeRepository } from "./runtime/adapter.js";
export {
  PLACEHOLDER_PROJECTS,
  PLACEHOLDER_TESTIMONIALS,
  PLACEHOLDER_TRUST_BAR,
} from "./placeholder/reputation.dataset.js";
export {
  PLACEHOLDER_MODULES,
  PLACEHOLDER_PLANS,
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_GOALS,
  PLACEHOLDER_CONTENT,
  PLACEHOLDER_RANGE_FACTORS,
  PLACEHOLDER_DISCIPLINE_COPY,
  PLACEHOLDER_ASSESSMENT,
  PLACEHOLDER_CHOICES,
  PLACEHOLDER_STATUS_META,
} from "./placeholder/catalog.dataset.js";

export interface ReputationConfig {
  source: DataSource;
  /**
   * Required when source is "supabase". MUST be a request-scoped client — it
   * carries the caller's session, and therefore determines what RLS lets them
   * see.
   */
  client?: AuxionSupabaseClient;
}

/**
 * Build a ReputationRepository.
 *
 * ⚠️ NEVER cache the result across requests. The Supabase implementation holds a
 * session-bearing client; a module-level singleton would serve one user's
 * session — and therefore one client org's rows — to another. Call this per
 * request.
 */
export function createReputationRepository(config: ReputationConfig): ReputationRepository {
  if (config.source === "supabase") {
    if (!config.client) {
      // Fail loudly. Falling back to placeholder here would silently serve
      // sample case studies as if they were the client's real published work.
      throw new Error(
        "createReputationRepository({ source: 'supabase' }) requires a request-scoped Supabase client.",
      );
    }
    return new SupabaseReputationRepository(config.client);
  }
  return new PlaceholderReputationRepository();
}

/**
 * Build a CatalogRepository.
 *
 * Always the static catalog — see the note at the top of this file. Its `source`
 * reports "placeholder" because the prices genuinely are placeholder, and the UI
 * uses that to keep labelling the site honestly even once reputation is real.
 */
export function createCatalogRepository(): CatalogRepository {
  return new PlaceholderCatalogRepository();
}

/** True while a bound repository is serving non-real content. */
export function isPlaceholderData(source: DataSource): boolean {
  return source === "placeholder";
}
