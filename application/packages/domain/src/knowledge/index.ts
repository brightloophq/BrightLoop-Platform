/* =============================================================================
 * Knowledge Base / RAG (Phase E · Sprint E2) — domain barrel.
 *
 * Collections + permissions, document lifecycle + versioning, parsing + chunking,
 * the embedding provider port + job state machine, the vector-store port + cosine
 * similarity, the retrieval engine, and the repository ports. Pure except the
 * ports (adapters implement them in `@brightloop/data`).
 * ========================================================================== */

export * from "./collection.js";
export * from "./chunking.js";
export * from "./embedding.js";
export * from "./vector.js";
export * from "./retrieval.js";
export * from "./repository.js";
