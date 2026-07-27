/* =============================================================================
 * Application context + authorization (Phase C · Sprint C1).
 *
 * A use-case receives an `AppContext` and its typed input, and nothing else. It
 * never sees a request, a cookie, a Supabase client, or a repository — the
 * ROUTE builds the context and the use-case orchestrates runtime services.
 *
 * Authorization is enforced HERE, before any runtime call, using the domain's
 * canonical capability matrix (`may` / `hasCapability`) as the single source of
 * truth — but the thrown error is an APPLICATION error, so the boundary speaks
 * one error vocabulary. The runtime tables are internal-only (RLS), so this is a
 * fast, clear pre-check in front of RLS, never a replacement for it.
 * ========================================================================== */

import type { Actor, AgentRepositories, AiFoundationRepositories, AiProviderRegistry, AutomationBuilderRepositories, CertificationRepositories, Clock, CollaborationRepositories, EmbeddingProviderRegistry, KnowledgeRepositories, ProjectManagerRepositories, ReportingRepositories, RuntimeIdGen, RuntimeServices, StrategistRepositories, TransformationExecutionRepositories, VectorStorePort } from "@brightloop/domain";
import { may } from "@brightloop/domain";
import { isClientRole } from "@brightloop/schema";
import { ForbiddenError, RuntimeUnavailableError } from "./errors.js";

/** Capability required to create / cancel / retry a scan (internal authority). */
export const SCAN_WRITE_CAP = "transformation.scan.write";
/** Capability required to read a scan and its outputs (internal authority). */
export const SCAN_READ_CAP = "transformation.read";

/** Phase D · capability to seed / write a transformation workspace (internal). */
export const TRANSFORMATION_WRITE_CAP = "transformation.write";
/** Phase D · capability to read a transformation workspace (internal). */
export const TRANSFORMATION_READ_CAP = "transformation.read";
/** Phase D · capability to read initiatives (internal). */
export const INITIATIVE_READ_CAP = "initiative.read";
/** Phase D · capability to transition an initiative's lifecycle (internal, D2). */
export const INITIATIVE_WRITE_CAP = "initiative.write";
/** Phase D · execution-management capabilities (internal, D3/D4). */
export const REVIEW_READ_CAP = "review.read";
export const REVIEW_WRITE_CAP = "review.write";
export const TASK_READ_CAP = "task.read";
export const TASK_WRITE_CAP = "task.write";
export const ASSIGNMENT_WRITE_CAP = "assignment.write";
export const DEPENDENCY_WRITE_CAP = "dependency.write";
/** Phase D · planning & performance capabilities (internal, D5/D6). */
export const TIMELINE_READ_CAP = "timeline.read";
export const TIMELINE_WRITE_CAP = "timeline.write";
export const MILESTONE_READ_CAP = "milestone.read";
export const MILESTONE_WRITE_CAP = "milestone.write";
export const KPI_READ_CAP = "kpi.read";
export const KPI_WRITE_CAP = "kpi.write";
export const PROGRESS_READ_CAP = "progress.read";
/** Phase D · collaboration & operational awareness capabilities (internal, D7). */
export const NOTIFICATION_READ_CAP = "notification.read";
export const NOTIFICATION_WRITE_CAP = "notification.write";
export const SUBSCRIPTION_READ_CAP = "subscription.read";
export const SUBSCRIPTION_WRITE_CAP = "subscription.write";
export const MENTION_READ_CAP = "mention.read";
export const MENTION_WRITE_CAP = "mention.write";
/** Phase E · AI Foundation capabilities (internal, E1). */
export const PROMPT_READ_CAP = "prompt.read";
export const PROMPT_WRITE_CAP = "prompt.write";
export const PROMPT_PUBLISH_CAP = "prompt.publish";
export const PROMPT_EXECUTE_CAP = "prompt.execute";
export const USAGE_READ_CAP = "usage.read";
export const COST_READ_CAP = "cost.read";
export const CONVERSATION_READ_CAP = "conversation.read";
export const CONVERSATION_WRITE_CAP = "conversation.write";
export const EVALUATION_READ_CAP = "evaluation.read";
/** Capability to manage provider configuration (owner/admin only). */
export const AI_PROVIDER_WRITE_CAP = "ai.provider.write";
/** Phase E · Knowledge Base / RAG capabilities (internal, E2). */
export const KNOWLEDGE_READ_CAP = "knowledge.read";
export const KNOWLEDGE_WRITE_CAP = "knowledge.write";
export const KNOWLEDGE_DELETE_CAP = "knowledge.delete";
export const KNOWLEDGE_EMBED_CAP = "knowledge.embed";
export const KNOWLEDGE_RETRIEVE_CAP = "knowledge.retrieve";
/** Collection administration (create collections, manage permissions). Not clients. */
export const KNOWLEDGE_ADMIN_CAP = "knowledge.admin";
/** Phase E · AI Strategist capabilities (E3). */
export const STRATEGY_READ_CAP = "strategy.read";
export const STRATEGY_WRITE_CAP = "strategy.write";
export const STRATEGY_RUN_CAP = "strategy.run";
export const STRATEGY_REVIEW_CAP = "strategy.review";
export const STRATEGY_FEEDBACK_CAP = "strategy.feedback";
/** Phase E · AI Project Manager capabilities (E4). */
export const PLANNING_READ_CAP = "planning.read";
export const PLANNING_WRITE_CAP = "planning.write";
export const PLANNING_RUN_CAP = "planning.run";
export const PLANNING_REVIEW_CAP = "planning.review";
export const PLANNING_APPROVE_CAP = "planning.approve";
export const PLANNING_FEEDBACK_CAP = "planning.feedback";
/** Phase E · AI Automation Builder capabilities (E5). */
export const AUTOMATION_READ_CAP = "automation.read";
export const AUTOMATION_WRITE_CAP = "automation.write";
export const AUTOMATION_GENERATE_CAP = "automation.generate";
export const AUTOMATION_PUBLISH_CAP = "automation.publish";
export const AUTOMATION_DEPLOY_CAP = "automation.deploy";
export const AUTOMATION_FEEDBACK_CAP = "automation.feedback";
/** Phase E · AI Reporting & BI capabilities (E6). */
export const REPORT_READ_CAP = "report.read";
export const REPORT_WRITE_CAP = "report.write";
export const REPORT_GENERATE_CAP = "report.generate";
export const REPORT_PUBLISH_CAP = "report.publish";
export const REPORT_SCHEDULE_CAP = "report.schedule";
export const REPORT_FEEDBACK_CAP = "report.feedback";
/** Phase E · AI Agents & Orchestration capabilities (E7). */
export const AGENT_READ_CAP = "agent.read";
export const AGENT_WRITE_CAP = "agent.write";
export const AGENT_CONFIGURE_CAP = "agent.configure";
export const AGENT_RUN_CAP = "agent.run";
export const AGENT_DELEGATE_CAP = "agent.delegate";
export const AGENT_APPROVE_CAP = "agent.approve";
export const AGENT_CANCEL_CAP = "agent.cancel";
export const AGENT_REVIEW_CAP = "agent.review";
export const AGENT_FEEDBACK_CAP = "agent.feedback";
export const AGENT_ADMIN_CAP = "agent.admin";
/** Phase E · Platform Certification capabilities (E8; owner/admin only). */
export const CERTIFICATION_READ_CAP = "certification.read";
export const CERTIFICATION_RUN_CAP = "certification.run";
export const CERTIFICATION_PUBLISH_CAP = "certification.publish";
export const CERTIFICATION_ADMIN_CAP = "certification.admin";

/**
 * Everything a use-case needs. The runtime `services` are already bound to the
 * caller's RLS-scoped session by the route; `ids`/`clock` are injected so the
 * application layer owns no ambient nondeterminism.
 */
export interface AppContext {
  services: RuntimeServices;
  actor: Actor;
  ids: RuntimeIdGen;
  clock: Clock;
  /**
   * Phase D · Transformation Execution repositories, bound to the caller's
   * RLS-scoped session by the route. Optional so pre-Phase-D contexts (and every
   * scan use-case) are unaffected; Phase D use-cases require it via
   * `requireExecution`.
   */
  execution?: TransformationExecutionRepositories;
  /**
   * Phase D · Collaboration repositories (D7), bound to the caller's RLS-scoped
   * session by the route. Optional so pre-D7 contexts are unaffected; the
   * collaboration use-cases require it via `requireCollaboration`.
   */
  collaboration?: CollaborationRepositories;
  /**
   * Phase E · AI Foundation repositories (E1), bound to the caller's RLS-scoped
   * session. Optional; the AI use-cases require it via `requireAiFoundation`.
   */
  ai?: AiFoundationRepositories;
  /**
   * The concrete provider adapters keyed by kind (mock in dev/tests; real SDK
   * adapters in production). The execution engine selects from these — business
   * code never names one. Optional; required by the execution engine.
   */
  aiProviders?: AiProviderRegistry;
  /** Phase E · Knowledge Base repositories (E2). Required via `requireKnowledge`. */
  knowledge?: KnowledgeRepositories;
  /** Embedding provider adapters keyed by kind (separate from LLM providers). */
  embeddingProviders?: EmbeddingProviderRegistry;
  /** The vector-store backend (pgvector/naive today). Business code never names it. */
  vectorStore?: VectorStorePort;
  /** Phase E · AI Strategist repositories (E3). Required via `requireStrategist`. */
  strategist?: StrategistRepositories;
  /** Phase E · AI Project Manager repositories (E4). Required via `requireProjectManager`. */
  projectManager?: ProjectManagerRepositories;
  /** Phase E · AI Automation Builder repositories (E5). Required via `requireAutomationBuilder`. */
  automationBuilder?: AutomationBuilderRepositories;
  /** Phase E · AI Reporting repositories (E6). Required via `requireReporting`. */
  reporting?: ReportingRepositories;
  /** Phase E · AI Agents repositories (E7). Required via `requireAgents`. */
  agents?: AgentRepositories;
  /** Phase E · Platform Certification repositories (E8). Required via `requireCertification`. */
  certification?: CertificationRepositories;
}

/** Assert the Phase D repositories are wired, or fail with a clean 503. */
export function requireExecution(ctx: AppContext): TransformationExecutionRepositories {
  if (ctx.execution === undefined) {
    throw new RuntimeUnavailableError("The transformation execution store is not available");
  }
  return ctx.execution;
}

/** Assert the collaboration repositories are wired, or fail with a clean 503. */
export function requireCollaboration(ctx: AppContext): CollaborationRepositories {
  if (ctx.collaboration === undefined) {
    throw new RuntimeUnavailableError("The collaboration store is not available");
  }
  return ctx.collaboration;
}

/** Assert the AI Foundation repositories are wired, or fail with a clean 503. */
export function requireAiFoundation(ctx: AppContext): AiFoundationRepositories {
  if (ctx.ai === undefined) {
    throw new RuntimeUnavailableError("The AI foundation store is not available");
  }
  return ctx.ai;
}

/** Assert at least one AI provider adapter is wired, or fail with a clean 503. */
export function requireAiProviders(ctx: AppContext): AiProviderRegistry {
  if (ctx.aiProviders === undefined || Object.keys(ctx.aiProviders).length === 0) {
    throw new RuntimeUnavailableError("No AI provider is configured");
  }
  return ctx.aiProviders;
}

/** Assert the Knowledge Base repositories are wired, or fail with a clean 503. */
export function requireKnowledge(ctx: AppContext): KnowledgeRepositories {
  if (ctx.knowledge === undefined) {
    throw new RuntimeUnavailableError("The knowledge store is not available");
  }
  return ctx.knowledge;
}

/** Assert an embedding provider is wired, or fail with a clean 503. */
export function requireEmbeddingProviders(ctx: AppContext): EmbeddingProviderRegistry {
  if (ctx.embeddingProviders === undefined || Object.keys(ctx.embeddingProviders).length === 0) {
    throw new RuntimeUnavailableError("No embedding provider is configured");
  }
  return ctx.embeddingProviders;
}

/** Assert the vector store is wired, or fail with a clean 503. */
export function requireVectorStore(ctx: AppContext): VectorStorePort {
  if (ctx.vectorStore === undefined) {
    throw new RuntimeUnavailableError("The vector store is not available");
  }
  return ctx.vectorStore;
}

/** Assert the AI Strategist repositories are wired, or fail with a clean 503. */
export function requireStrategist(ctx: AppContext): StrategistRepositories {
  if (ctx.strategist === undefined) {
    throw new RuntimeUnavailableError("The strategist store is not available");
  }
  return ctx.strategist;
}

/** Assert the AI Project Manager repositories are wired, or fail with a clean 503. */
export function requireProjectManager(ctx: AppContext): ProjectManagerRepositories {
  if (ctx.projectManager === undefined) {
    throw new RuntimeUnavailableError("The project manager store is not available");
  }
  return ctx.projectManager;
}

/** Assert the AI Automation Builder repositories are wired, or fail with a clean 503. */
export function requireAutomationBuilder(ctx: AppContext): AutomationBuilderRepositories {
  if (ctx.automationBuilder === undefined) {
    throw new RuntimeUnavailableError("The automation builder store is not available");
  }
  return ctx.automationBuilder;
}

/** Assert the AI Reporting repositories are wired, or fail with a clean 503. */
export function requireReporting(ctx: AppContext): ReportingRepositories {
  if (ctx.reporting === undefined) {
    throw new RuntimeUnavailableError("The reporting store is not available");
  }
  return ctx.reporting;
}

/** Assert the AI Agents repositories are wired, or fail with a clean 503. */
export function requireAgents(ctx: AppContext): AgentRepositories {
  if (ctx.agents === undefined) {
    throw new RuntimeUnavailableError("The agents store is not available");
  }
  return ctx.agents;
}

/** Assert the Platform Certification repositories are wired, or fail with a clean 503. */
export function requireCertification(ctx: AppContext): CertificationRepositories {
  if (ctx.certification === undefined) {
    throw new RuntimeUnavailableError("The certification store is not available");
  }
  return ctx.certification;
}

/**
 * Capability + ownership in one call.
 *
 * Capability comes from the domain matrix. Ownership: a client-scoped actor may
 * only touch its own org's runs; internal actors are capability-scoped, not
 * ownership-scoped, so they pass the ownership half (mirrors
 * `domain/assertOwnClient`). A mismatch throws `ForbiddenError` — never a
 * domain `AuthorizationError`, so nothing below the boundary leaks upward.
 */
export function authorize(actor: Actor, capability: string, targetClientId: string | null): void {
  if (!may(actor, capability)) {
    throw new ForbiddenError();
  }
  if (isClientRole(actor.role)) {
    if (actor.clientId === null || targetClientId === null || actor.clientId !== targetClientId) {
      throw new ForbiddenError();
    }
  }
}
