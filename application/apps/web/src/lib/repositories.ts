import "server-only";

import {
  createCatalogRepository,
  createReputationRepository,
  SupabaseTransformationDashboardRepository,
  SupabaseSignalsRepository,
  SupabaseTransformationRepository,
  SupabaseCoreSurfaceRepository,
  SupabaseRuntimeRepository,
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
  SupabaseSubscriptionRepository,
  SupabaseMentionRepository,
  SupabaseNotificationRepository,
  SupabaseInboxRepository,
  SupabaseReadReceiptRepository,
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
  createDeterministicAiProvider,
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
  SupabaseStrategySessionRepository,
  SupabaseStrategyAnalysisRepository,
  SupabaseBusinessFindingRepository,
  SupabaseRiskAssessmentRepository,
  SupabaseRecommendationRepository,
  SupabasePriorityScoreRepository,
  SupabaseTransformationRoadmapRepository,
  SupabaseStrategyCitationRepository,
  SupabaseStrategyFeedbackRepository,
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
  SupabaseCertificationRunRepository,
  SupabaseCertificationResultRepository,
  SupabaseCertificationIssueRepository,
  SupabaseCertificationExceptionRepository,
  SupabaseCopilotConversationRepository,
  SupabaseCopilotMessageRepository,
  SupabaseCopilotCitationRepository,
  SupabaseCopilotActionRepository,
  createExecutionRuntimeRepositories,
  createN8nRuntimeAdapter,
  createEnvRuntimeSecretStore,
  createIntegrationRepositories,
  createDefaultConnectorAdapters,
  createEnvConnectorSecretStore,
  createGoogleConnectorAdapters,
  loadGoogleAdapterConfig,
  createFetchGoogleHttpTransport,
  createCommunicationConnectorAdapters,
  loadCommunicationConfig,
  createFetchCommTransport,
  createCommerceConnectorAdapters,
  loadCommerceConfig,
  createFetchCommerceTransport,
} from "@brightloop/data";
import {
  createTransformationService,
  createCoreSurfaceService,
  createRuntimeServices,
  type CatalogRepository,
  type CoreSurfaceService,
  type DataSource,
  type ReputationRepository,
  type RuntimeServices,
  type TransformationService,
  type TransformationExecutionRepositories,
  type CollaborationRepositories,
  type AiFoundationRepositories,
  type AiProviderRegistry,
  type KnowledgeRepositories,
  type EmbeddingProviderRegistry,
  type VectorStorePort,
  type StrategistRepositories,
  type ProjectManagerRepositories,
  type AutomationBuilderRepositories,
  type ReportingRepositories,
  type AgentRepositories,
  type CertificationRepositories,
  type CopilotRepositories,
  type ExecutionRuntimeRepositories,
  type RuntimeAdapterRegistry,
  type RuntimeSecretStore,
  type IntegrationRepositories,
  type ConnectorAdapterRegistry,
  type ConnectorSecretStore,
} from "@brightloop/domain";
import { createAnonClient } from "./supabase/anon";
import { createClient } from "./supabase/server";

/** Prefixed-id generator injected into the transformation service (mirrors the app convention). */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Repository access for Server Components.
 *
 * THE ONLY PLACE the app names a data source. Pages depend on the PORT types and
 * these getters — never on a concrete repository or a dataset.
 *
 * `server-only` makes a client-component import a build error rather than a
 * silent bundle bloat (or leaking the whole dataset to the browser).
 *
 * ⚠️ NOTHING IS CACHED HERE, DELIBERATELY.
 * The Supabase repository holds a request-scoped client carrying the caller's
 * session cookies. The previous version memoised the repository in a module-level
 * variable — harmless for a static placeholder dataset, but with Supabase that
 * would pin one user's session (and therefore one client org's RLS view) into a
 * module that every subsequent request shares. Build them per request.
 */

/**
 * Which persistence backs reputation data.
 *
 * Defaults to "supabase". The env var is an escape hatch for local development
 * without a database — it is NOT a fallback: an unset/invalid value means
 * production, and a Supabase failure throws rather than quietly degrading to
 * sample content.
 */
function reputationSource(): DataSource {
  return process.env.BRIGHTLOOP_DATA_SOURCE === "placeholder" ? "placeholder" : "supabase";
}

/**
 * Reputation repository for PUBLIC pages (portfolio, case studies, testimonials,
 * homepage proof, sitemap).
 *
 * Uses the cookie-less ANON client, deliberately:
 *   * public marketing content is not user-scoped — it looks the same to every
 *     visitor, so there is no session worth binding;
 *   * `generateStaticParams` and static prerendering run at BUILD time where no
 *     request (and therefore no cookie store) exists — a cookie client throws
 *     there, which is exactly what broke the first build after the flip;
 *   * anon is the LEAST privileged role available. RLS gives it only
 *     publish ∈ {public, featured}. It cannot see a draft or any client row.
 *
 * The admin CMS needs drafts, so it will use the session client via a separate
 * getter — internal roles get their own RLS view. Public never should.
 */
export async function getReputationRepository(): Promise<ReputationRepository> {
  const source = reputationSource();
  if (source === "placeholder") {
    return createReputationRepository({ source: "placeholder" });
  }
  return createReputationRepository({ source: "supabase", client: createAnonClient() });
}

/**
 * Reputation repository for AUTHENTICATED surfaces (the admin Reputation CMS).
 *
 * Uses the request-scoped cookie client so RLS sees the caller's role claim and
 * an internal user can read drafts. Never cached — it carries the caller's
 * session.
 */
export async function getAuthedReputationRepository(): Promise<ReputationRepository> {
  const source = reputationSource();
  if (source === "placeholder") {
    return createReputationRepository({ source: "placeholder" });
  }
  const client = await createClient();
  return createReputationRepository({ source: "supabase", client });
}

export function getCatalogRepository(): CatalogRepository {
  return createCatalogRepository();
}

/**
 * Transformation dashboard reader for the AUTHENTICATED command center.
 *
 * Request-scoped cookie client so RLS scopes the read to what the caller may see
 * (internal → the whole portfolio; a client role → only its own org). Fully typed
 * against the generated Database types. Never cached — it carries the session.
 */
export async function getTransformationDashboardRepository(): Promise<SupabaseTransformationDashboardRepository> {
  const client = await createClient();
  return new SupabaseTransformationDashboardRepository(client);
}

/**
 * Signals READ adapter for the authenticated command center (fully typed).
 * Request-scoped so RLS scopes what the caller can see. Never cached.
 */
export async function getSignalsRepository(): Promise<SupabaseSignalsRepository> {
  const client = await createClient();
  return new SupabaseSignalsRepository(client);
}

/**
 * Core-surfaces adapter (Phase 1B) — Business Scan / Domains / Findings. Typed,
 * request-scoped (RLS-scoped to the caller). Never cached. Reads feed the System
 * Map / Business Scan / Activation read models; writes go via the service below.
 */
export async function getCoreSurfaceRepository(): Promise<SupabaseCoreSurfaceRepository> {
  const client = await createClient();
  return new SupabaseCoreSurfaceRepository(client);
}

/**
 * The Phase B runtime repository (runs, stages, checkpoints, artifacts, reasoning
 * jobs, provider attempts, queue, append-only events). Request-scoped and
 * RLS-scoped to the caller — never cached, never service-role. The runtime tables
 * are internal-only, so a client-role session reads and writes nothing.
 *
 * No route or server action consumes this yet; the runtime SERVICES land in
 * Sprint 13C and will own capability checks, status transitions and attribution.
 */
export async function getRuntimeRepository(): Promise<SupabaseRuntimeRepository> {
  const client = await createClient();
  return new SupabaseRuntimeRepository(client);
}

/**
 * The Phase B runtime SERVICES + coordinator (Sprint 13C), bound to the
 * request-scoped repository so every runtime write runs under the caller's RLS.
 * Never cached — it carries the session.
 *
 * No route or server action consumes this yet. The coordinator performs exactly
 * one worker turn per call and schedules nothing on its own: there is no daemon,
 * no cron and no hosted queue behind it — Postgres is the queue, and the caller
 * decides when a turn happens.
 */
export async function getRuntimeServices(): Promise<RuntimeServices> {
  const client = await createClient();
  return createRuntimeServices({ repo: new SupabaseRuntimeRepository(client), ids: newId });
}

/**
 * Phase D · Transformation Execution repositories, bound to the request-scoped
 * RLS session. Wired into the AppContext by `buildAppContext`. Never cached.
 */
export async function getExecutionRepositories(): Promise<TransformationExecutionRepositories> {
  const client = await createClient();
  return {
    workspaces: new SupabaseTransformationWorkspaceRepository(client),
    initiatives: new SupabaseInitiativeRepository(client),
    activities: new SupabaseTransformationActivityRepository(client),
    reviews: new SupabaseReviewRepository(client),
    tasks: new SupabaseTaskRepository(client),
    assignments: new SupabaseAssignmentRepository(client),
    dependencies: new SupabaseDependencyRepository(client),
    timelines: new SupabaseTimelineRepository(client),
    milestones: new SupabaseMilestoneRepository(client),
    kpis: new SupabaseKpiRepository(client),
    progress: new SupabaseProgressSnapshotRepository(client),
  };
}

/** Phase D · Collaboration repositories (D7), bound to the caller's RLS session. */
export async function getCollaborationRepositories(): Promise<CollaborationRepositories> {
  const client = await createClient();
  return {
    subscriptions: new SupabaseSubscriptionRepository(client),
    mentions: new SupabaseMentionRepository(client),
    notifications: new SupabaseNotificationRepository(client),
    inbox: new SupabaseInboxRepository(client),
    readReceipts: new SupabaseReadReceiptRepository(client),
  };
}

/** Phase E · AI Foundation repositories (E1), bound to the caller's RLS session. */
export async function getAiFoundationRepositories(): Promise<AiFoundationRepositories> {
  const client = await createClient();
  return {
    providers: new SupabaseAiProviderRepository(client),
    prompts: new SupabasePromptRepository(client),
    promptVersions: new SupabasePromptVersionRepository(client),
    executions: new SupabasePromptExecutionRepository(client),
    results: new SupabasePromptResultRepository(client),
    usage: new SupabaseUsageRecordRepository(client),
    costs: new SupabaseCostRecordRepository(client),
    audit: new SupabaseAuditEventRepository(client),
    conversations: new SupabaseConversationRepository(client),
    messages: new SupabaseConversationMessageRepository(client),
    evaluations: new SupabaseEvaluationResultRepository(client),
  };
}

/**
 * The AI provider registry. Until real SDK adapters are wired with credentials,
 * every provider resolves to the deterministic, network-free adapter (mirrors the
 * mock-until-configured pattern for payments/email). Business code never names one.
 */
export function getAiProviderRegistry(): AiProviderRegistry {
  return {
    anthropic: createDeterministicAiProvider("anthropic"),
    openai: createDeterministicAiProvider("openai"),
    google: createDeterministicAiProvider("google"),
  };
}

/** Phase E · Knowledge Base repositories (E2), bound to the caller's RLS session. */
export async function getKnowledgeRepositories(): Promise<KnowledgeRepositories> {
  const client = await createClient();
  return {
    collections: new SupabaseKnowledgeCollectionRepository(client),
    documents: new SupabaseKnowledgeDocumentRepository(client),
    versions: new SupabaseDocumentVersionRepository(client),
    chunks: new SupabaseDocumentChunkRepository(client),
    vectors: new SupabaseEmbeddingVectorRepository(client),
    jobs: new SupabaseEmbeddingJobRepository(client),
    sessions: new SupabaseRetrievalSessionRepository(client),
    contexts: new SupabaseRetrievedContextRepository(client),
    citations: new SupabaseKnowledgeCitationRepository(client),
    permissions: new SupabaseKnowledgePermissionRepository(client),
    sources: new SupabaseKnowledgeSourceRepository(client),
  };
}

/** Embedding providers (separate from LLM). Deterministic/no-network until SDKs wired. */
export function getEmbeddingProviderRegistry(): EmbeddingProviderRegistry {
  return { openai: createDeterministicEmbeddingProvider("openai"), gemini: createDeterministicEmbeddingProvider("gemini") };
}

/** The vector store — a read view over embedding_vector; business code never names it. */
export async function getVectorStore(): Promise<VectorStorePort> {
  return new SupabaseVectorStore(await createClient());
}

/** Phase E · AI Strategist repositories (E3), bound to the caller's RLS session. */
export async function getStrategistRepositories(): Promise<StrategistRepositories> {
  const client = await createClient();
  return {
    sessions: new SupabaseStrategySessionRepository(client),
    analyses: new SupabaseStrategyAnalysisRepository(client),
    findings: new SupabaseBusinessFindingRepository(client),
    risks: new SupabaseRiskAssessmentRepository(client),
    recommendations: new SupabaseRecommendationRepository(client),
    priorityScores: new SupabasePriorityScoreRepository(client),
    roadmaps: new SupabaseTransformationRoadmapRepository(client),
    citations: new SupabaseStrategyCitationRepository(client),
    feedback: new SupabaseStrategyFeedbackRepository(client),
  };
}

/** Phase E · AI Project Manager repositories (E4), bound to the caller's RLS session. */
export async function getProjectManagerRepositories(): Promise<ProjectManagerRepositories> {
  const client = await createClient();
  return {
    sessions: new SupabasePlanningSessionRepository(client),
    plans: new SupabaseExecutionPlanRepository(client),
    initiatives: new SupabaseInitiativePlanRepository(client),
    milestones: new SupabaseMilestonePlanRepository(client),
    tasks: new SupabaseTaskPlanRepository(client),
    dependencies: new SupabaseDependencyPlanRepository(client),
    timelines: new SupabaseTimelinePlanRepository(client),
    reviews: new SupabaseReviewPlanRepository(client),
    kpis: new SupabaseKpiPlanRepository(client),
    resources: new SupabaseResourceEstimateRepository(client),
    risks: new SupabaseExecutionRiskRepository(client),
    feedback: new SupabasePlanningFeedbackRepository(client),
  };
}

/** Phase E · AI Automation Builder repositories (E5), bound to the caller's RLS session. */
export async function getAutomationBuilderRepositories(): Promise<AutomationBuilderRepositories> {
  const client = await createClient();
  return {
    intents: new SupabaseExecutionIntentRepository(client),
    plans: new SupabaseAutomationPlanRepository(client),
    workflows: new SupabaseWorkflowDefinitionRepository(client),
    steps: new SupabaseWorkflowStepRepository(client),
    triggers: new SupabaseTriggerDefinitionRepository(client),
    actions: new SupabaseActionDefinitionRepository(client),
    conditions: new SupabaseConditionDefinitionRepository(client),
    variables: new SupabaseVariableDefinitionRepository(client),
    integrations: new SupabaseIntegrationBindingRepository(client),
    deployments: new SupabaseDeploymentPackageRepository(client),
    versions: new SupabaseAutomationVersionRepository(client),
    feedback: new SupabaseAutomationFeedbackRepository(client),
  };
}

/** Phase E · AI Reporting repositories (E6), bound to the caller's RLS session. */
export async function getReportingRepositories(): Promise<ReportingRepositories> {
  const client = await createClient();
  return {
    reports: new SupabaseExecutiveReportRepository(client),
    observations: new SupabaseObservationSnapshotRepository(client),
    metrics: new SupabaseBusinessMetricRepository(client),
    kpis: new SupabaseKpiResultRepository(client),
    trends: new SupabaseTrendAnalysisRepository(client),
    forecasts: new SupabaseForecastRepository(client),
    insights: new SupabaseBusinessInsightRepository(client),
    summaries: new SupabaseReportExecutiveSummaryRepository(client),
    sections: new SupabaseReportSectionRepository(client),
    narratives: new SupabaseReportNarrativeRepository(client),
    schedules: new SupabaseReportScheduleRepository(client),
    feedback: new SupabaseReportFeedbackRepository(client),
  };
}

/** Phase E · AI Agents repositories (E7), bound to the caller's RLS session. */
export async function getAgentRepositories(): Promise<AgentRepositories> {
  const client = await createClient();
  return {
    profiles: new SupabaseAgentProfileRepository(client),
    missions: new SupabaseAgentMissionRepository(client),
    runs: new SupabaseAgentRunRepository(client),
    tasks: new SupabaseAgentTaskRepository(client),
    delegations: new SupabaseAgentDelegationRepository(client),
    messages: new SupabaseAgentMessageRepository(client),
    observations: new SupabaseAgentObservationRepository(client),
    decisions: new SupabaseAgentDecisionRepository(client),
    toolCalls: new SupabaseAgentToolCallRepository(client),
    checkpoints: new SupabaseAgentCheckpointRepository(client),
    approvals: new SupabaseAgentApprovalRepository(client),
    evaluations: new SupabaseAgentEvaluationRepository(client),
    memories: new SupabaseAgentMemoryRepository(client),
    artifacts: new SupabaseAgentArtifactRepository(client),
    failures: new SupabaseAgentFailureRepository(client),
    feedback: new SupabaseAgentFeedbackRepository(client),
    capabilities: new SupabaseCapabilityDefinitionRepository(client),
  };
}

/** Phase E · Platform Certification repositories (E8), bound to the caller's RLS session. */
export async function getCertificationRepositories(): Promise<CertificationRepositories> {
  const client = await createClient();
  return {
    runs: new SupabaseCertificationRunRepository(client),
    results: new SupabaseCertificationResultRepository(client),
    issues: new SupabaseCertificationIssueRepository(client),
    exceptions: new SupabaseCertificationExceptionRepository(client),
  };
}

/** Phase F · AI Copilot repositories (F2), bound to the caller's RLS session. */
export async function getCopilotRepositories(): Promise<CopilotRepositories> {
  const client = await createClient();
  return {
    conversations: new SupabaseCopilotConversationRepository(client),
    messages: new SupabaseCopilotMessageRepository(client),
    citations: new SupabaseCopilotCitationRepository(client),
    actions: new SupabaseCopilotActionRepository(client),
  };
}

/** Phase F · Execution Runtime repositories (F3), bound to the caller's RLS session. */
export async function getExecutionRuntimeRepositories(): Promise<ExecutionRuntimeRepositories> {
  const client = await createClient();
  return createExecutionRuntimeRepositories(client);
}
/** The runtime provider adapters (n8n is the first real provider). Stateless. */
export function getRuntimeAdapterRegistry(): RuntimeAdapterRegistry {
  return { n8n: createN8nRuntimeAdapter() };
}
/** The env-backed runtime secret store (resolves references; never exposes values). */
export function getRuntimeSecretStore(): RuntimeSecretStore {
  return createEnvRuntimeSecretStore();
}

/** Phase F · Integration Platform repositories (F4.1), bound to the caller's RLS session. */
export async function getIntegrationRepositories(): Promise<IntegrationRepositories> {
  const client = await createClient();
  return createIntegrationRepositories(client);
}
/**
 * The connector adapters: the deterministic Fakes plus the F4.2 Google Workspace
 * (Gmail/Calendar/Drive/Contacts), F4.3 Communication (Slack/Teams/Discord) and
 * F4.4 Commerce (Shopify/Stripe/PayPal) production connectors, bound to the real
 * fetch transports + app-level config from the environment. Stateless.
 */
export function getConnectorAdapterRegistry(): ConnectorAdapterRegistry {
  const now = () => new Date().toISOString();
  const googleConfig = loadGoogleAdapterConfig(process.env, createFetchGoogleHttpTransport(), now);
  const commConfig = loadCommunicationConfig(process.env, createFetchCommTransport(), now);
  const commerceConfig = loadCommerceConfig(process.env, createFetchCommerceTransport(), now);
  return {
    ...createDefaultConnectorAdapters(),
    ...createGoogleConnectorAdapters(googleConfig),
    ...createCommunicationConnectorAdapters(commConfig),
    ...createCommerceConnectorAdapters(commerceConfig),
  };
}
/** The env-backed connector secret store (resolves references; never exposes values). */
export function getConnectorSecretStore(): ConnectorSecretStore {
  return createEnvConnectorSecretStore();
}

/** The core-surfaces domain service for WRITES (scan/finding/domain/activation). */
export async function getCoreSurfaceService(): Promise<CoreSurfaceService> {
  const client = await createClient();
  const repo = new SupabaseCoreSurfaceRepository(client);
  return createCoreSurfaceService({ repo, ids: newId });
}

/**
 * The transformation domain service for WRITES (create / transition). Bound to the
 * request-scoped repository so every mutation runs the capability + lifecycle guard
 * + transition audit + event path under the caller's RLS. Never cached.
 */
export async function getTransformationService(): Promise<TransformationService> {
  const client = await createClient();
  const repo = new SupabaseTransformationRepository(client);
  return createTransformationService({ repo, ids: newId });
}

/**
 * True while ANY bound source is serving non-real content — drives
 * PlaceholderNotice.
 *
 * This checks the CATALOG as well as reputation, and that matters: once
 * reputation points at Supabase, the case studies are real but every price on
 * /packages and /services is still placeholder (open decisions 1 & 2). Keying the
 * notice on reputation alone would drop the label at exactly the moment the site
 * starts showing real work beside invented prices — the most misleading state
 * available. The notice retires when the catalog is real too.
 */
export function isServingPlaceholderData(): boolean {
  return reputationSource() === "placeholder" || getCatalogRepository().source === "placeholder";
}

/** Which parts of the site are still sample content. Drives the notice's wording. */
export function placeholderScope(): { reputation: boolean; catalog: boolean } {
  return {
    reputation: reputationSource() === "placeholder",
    catalog: getCatalogRepository().source === "placeholder",
  };
}
