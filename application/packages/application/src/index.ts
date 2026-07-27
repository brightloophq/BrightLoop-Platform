/* =============================================================================
 * @brightloop/application (Phase C · Sprint C1) — the application boundary.
 *
 * The thin orchestration layer between the web app and the intelligence runtime.
 * Nothing here knows HTTP, React, or Supabase Auth: a use-case takes an
 * `AppContext` (runtime services bound to the caller's session, plus the actor)
 * and typed input, and returns a DTO or throws a canonical `ApplicationError`.
 *
 *   Route Handler → Application use-case → RuntimeCoordinator → Engine → Repos
 *
 * The browser never receives a domain entity or a repository row, and no runtime
 * failure code, SQLSTATE, or stack trace ever crosses this boundary.
 * ========================================================================== */

export * from "./errors.js";
export * from "./context.js";
export * from "./dto.js";
export * from "./runtime-result.js";
export * from "./validate.js";
export * from "./scan/index.js";
export * from "./pipeline/index.js";
export * from "./transformation-execution/index.js";
export * from "./collaboration/index.js";
export * from "./ai-foundation/index.js";
export * from "./knowledge/index.js";
export * from "./strategist/index.js";
export * from "./project-manager/index.js";
export * from "./automation-builder/index.js";
export * from "./reporting/index.js";
