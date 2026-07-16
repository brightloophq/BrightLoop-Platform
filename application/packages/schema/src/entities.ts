/* =============================================================================
 * Entity field contracts + Zod validators — derived from schema.js `ENTITIES`.
 * Status enums are derived from MACHINES so there is exactly one source of truth
 * for legal status values. z.infer<> gives the TypeScript type for each entity.
 *
 * Money is stored as integer minor units (cents), currency USD (single-currency
 * for MVP per approved Decision I). Timestamps are ISO-8601 strings (timestamptz).
 * ========================================================================== */

import { z } from "zod";
import { MACHINES, type MachineName } from "./machines.js";
import { ROLE_NAMES } from "./roles.js";

/** Canonical field lists (for codegen / documentation parity with schema.js). */
export const ENTITIES = {
  User: ["id", "name", "email", "role", "clientId", "status", "avatarUrl", "lastActiveAt", "invitedAt", "acceptedAt"],
  Client: ["id", "company", "plan", "mrr", "lifecycle", "healthScore", "accountManagerId", "createdAt", "industry", "seats"],
  Lead: ["id", "name", "company", "email", "industry", "value", "stage", "ownerId", "source", "createdAt"],
  Assessment: ["id", "clientId", "answers", "scores", "healthScore", "recommendations", "status", "submittedAt"],
  Configuration: ["id", "clientId", "assessmentId", "modules", "ownedAssets", "estimateLow", "estimateHigh", "status", "updatedAt"],
  Proposal: ["id", "clientId", "configurationId", "lineItems", "subtotal", "deposit", "total", "status", "sentAt", "viewedAt", "decidedAt", "changeNote"],
  Contract: ["id", "proposalId", "clientId", "sowUrl", "clientSignature", "countersignature", "status", "signedAt"],
  Invoice: ["id", "clientId", "projectId", "type", "amount", "dueDate", "status", "issuedAt", "paidAt"],
  Payment: ["id", "invoiceId", "method", "last4", "amount", "status", "processedAt", "failureReason"],
  Project: ["id", "clientId", "name", "status", "progress", "startDate", "targetDate", "managerId", "milestoneIds"],
  Milestone: ["id", "projectId", "title", "status", "order", "dueDate", "approvedAt"],
  Deliverable: ["id", "projectId", "milestoneId", "title", "type", "status", "version", "fileUrl", "feedback", "submittedAt"],
  FileUpload: ["id", "ownerId", "deliverableId", "name", "size", "mime", "status", "progress", "error", "uploadedAt"],
  Automation: ["id", "clientId", "name", "provider", "trigger", "status", "runs", "lastRunAt", "lastError"],
  Meeting: ["id", "clientId", "title", "type", "startAt", "durationMin", "attendees", "status", "joinUrl"],
  Notification: ["id", "userId", "kind", "title", "body", "entityRef", "read", "createdAt"],
  Message: ["id", "threadId", "authorId", "clientId", "body", "attachments", "createdAt"],
  Consent: ["id", "userId", "type", "granted", "version", "timestamp", "ip"],
} as const satisfies Record<string, readonly string[]>;

export type EntityName = keyof typeof ENTITIES;

/* ---- shared primitives ---------------------------------------------------- */

/** Prefixed ULID (e.g. usr_…, cli_…). Loosely validated; length-bounded. */
export const idSchema = z.string().min(1).max(64);
/** ISO-8601 timestamp string. */
export const timestampSchema = z.string().min(1);
/** Integer minor units (cents). */
export const moneySchema = z.number().int();
export const roleSchema = z.enum(ROLE_NAMES as [string, ...string[]]);

/** Build a Zod enum for a machine's legal status values (single source). */
export function statusEnum<M extends MachineName>(machine: M) {
  return z.enum(MACHINES[machine].states as unknown as [string, ...string[]]);
}

export const userAccountStatus = z.enum(["invited", "active", "suspended"]);
export const invoiceType = z.enum(["deposit", "milestone", "final", "retainer"]);

export const lineItemSchema = z.object({
  label: z.string(),
  amount: moneySchema,
  quantity: z.number().int().positive().optional(),
});

/* ---- entity schemas ------------------------------------------------------- */

export const userSchema = z.object({
  id: idSchema,
  name: z.string(),
  email: z.string().email(),
  role: roleSchema,
  clientId: idSchema.nullable(), // null for internal users
  status: userAccountStatus,
  avatarUrl: z.string().url().nullable(),
  lastActiveAt: timestampSchema.nullable(),
  invitedAt: timestampSchema.nullable(),
  acceptedAt: timestampSchema.nullable(),
});

export const clientSchema = z.object({
  id: idSchema,
  company: z.string(),
  plan: z.string(),
  mrr: moneySchema,
  lifecycle: statusEnum("clientLifecycle"),
  healthScore: z.number().min(0).max(100).nullable(),
  accountManagerId: idSchema.nullable(),
  createdAt: timestampSchema,
  industry: z.string(),
  seats: z.number().int().nonnegative(),
});

export const leadSchema = z.object({
  id: idSchema,
  name: z.string(),
  company: z.string(),
  email: z.string().email(),
  industry: z.string(),
  value: moneySchema,
  stage: statusEnum("lead"),
  ownerId: idSchema.nullable(),
  source: z.string(),
  createdAt: timestampSchema,
});

export const assessmentSchema = z.object({
  id: idSchema,
  clientId: idSchema.nullable(),
  answers: z.record(z.string(), z.unknown()),
  scores: z.record(z.string(), z.number()),
  healthScore: z.number().min(0).max(100).nullable(),
  recommendations: z.array(z.string()),
  status: statusEnum("onboarding"),
  submittedAt: timestampSchema.nullable(),
});

export const configurationSchema = z.object({
  id: idSchema,
  clientId: idSchema.nullable(),
  assessmentId: idSchema.nullable(),
  modules: z.array(z.string()),
  ownedAssets: z.array(z.string()),
  estimateLow: moneySchema,
  estimateHigh: moneySchema,
  status: statusEnum("onboarding"),
  updatedAt: timestampSchema,
});

export const proposalSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  configurationId: idSchema.nullable(),
  lineItems: z.array(lineItemSchema),
  subtotal: moneySchema,
  deposit: moneySchema,
  total: moneySchema,
  status: statusEnum("proposal"),
  sentAt: timestampSchema.nullable(),
  viewedAt: timestampSchema.nullable(),
  decidedAt: timestampSchema.nullable(),
  changeNote: z.string().nullable(),
});

export const contractSchema = z.object({
  id: idSchema,
  proposalId: idSchema,
  clientId: idSchema,
  sowUrl: z.string().nullable(),
  clientSignature: z.string().nullable(),
  countersignature: z.string().nullable(),
  status: statusEnum("contract"),
  signedAt: timestampSchema.nullable(),
});

export const invoiceSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  projectId: idSchema.nullable(),
  type: invoiceType,
  amount: moneySchema,
  dueDate: timestampSchema,
  status: statusEnum("invoice"),
  issuedAt: timestampSchema.nullable(),
  paidAt: timestampSchema.nullable(),
});

export const paymentSchema = z.object({
  id: idSchema,
  invoiceId: idSchema,
  method: z.string(),
  last4: z.string().length(4).nullable(), // NEVER store PAN — only last4/method
  amount: moneySchema,
  status: statusEnum("payment"),
  processedAt: timestampSchema.nullable(),
  failureReason: z.string().nullable(),
});

export const projectSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  name: z.string(),
  status: statusEnum("project"),
  progress: z.number().min(0).max(100), // derived from milestones
  startDate: timestampSchema.nullable(),
  targetDate: timestampSchema.nullable(),
  managerId: idSchema.nullable(),
  milestoneIds: z.array(idSchema),
});

export const milestoneSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  title: z.string(),
  status: statusEnum("milestone"),
  order: z.number().int().nonnegative(),
  dueDate: timestampSchema.nullable(),
  approvedAt: timestampSchema.nullable(),
});

export const deliverableSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  milestoneId: idSchema,
  title: z.string(),
  type: z.string(),
  status: statusEnum("deliverable"),
  version: z.number().int().positive(),
  fileUrl: z.string().nullable(),
  feedback: z.string().nullable(),
  submittedAt: timestampSchema.nullable(),
});

export const fileUploadSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
  deliverableId: idSchema.nullable(),
  name: z.string(),
  size: z.number().int().nonnegative(),
  mime: z.string(),
  status: statusEnum("fileUpload"),
  progress: z.number().min(0).max(100),
  error: z.string().nullable(),
  uploadedAt: timestampSchema.nullable(),
});

export const automationSchema = z.object({
  id: idSchema,
  clientId: idSchema.nullable(),
  name: z.string(),
  provider: z.string(),
  trigger: z.string(),
  status: statusEnum("automation"),
  runs: z.number().int().nonnegative(),
  lastRunAt: timestampSchema.nullable(),
  lastError: z.string().nullable(),
});

// Meeting has no state machine in schema.js; keep status as a bounded string set
// rather than inventing a machine. Revisit when the meetings sprint lands.
export const meetingStatus = z.enum(["scheduled", "completed", "cancelled"]);
export const meetingSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  title: z.string(),
  type: z.string(),
  startAt: timestampSchema,
  durationMin: z.number().int().positive(),
  attendees: z.array(z.string()),
  status: meetingStatus,
  joinUrl: z.string().url().nullable(),
});

export const notificationSchema = z.object({
  id: idSchema,
  userId: idSchema,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  entityRef: z.string().nullable(),
  read: z.boolean(),
  createdAt: timestampSchema,
});

export const messageSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  authorId: idSchema,
  clientId: idSchema,
  body: z.string(),
  attachments: z.array(z.string()),
  createdAt: timestampSchema,
});

export const consentSchema = z.object({
  id: idSchema,
  userId: idSchema,
  type: z.string(),
  granted: z.boolean(),
  version: z.string(),
  timestamp: timestampSchema,
  ip: z.string().nullable(),
});

/** Registry of entity schemas keyed by entity name. */
export const ENTITY_SCHEMAS = {
  User: userSchema,
  Client: clientSchema,
  Lead: leadSchema,
  Assessment: assessmentSchema,
  Configuration: configurationSchema,
  Proposal: proposalSchema,
  Contract: contractSchema,
  Invoice: invoiceSchema,
  Payment: paymentSchema,
  Project: projectSchema,
  Milestone: milestoneSchema,
  Deliverable: deliverableSchema,
  FileUpload: fileUploadSchema,
  Automation: automationSchema,
  Meeting: meetingSchema,
  Notification: notificationSchema,
  Message: messageSchema,
  Consent: consentSchema,
} as const satisfies Record<EntityName, z.ZodTypeAny>;

/* ---- inferred TypeScript types -------------------------------------------- */

export type User = z.infer<typeof userSchema>;
export type Client = z.infer<typeof clientSchema>;
export type Lead = z.infer<typeof leadSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type Configuration = z.infer<typeof configurationSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type Contract = z.infer<typeof contractSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Milestone = z.infer<typeof milestoneSchema>;
export type Deliverable = z.infer<typeof deliverableSchema>;
export type FileUpload = z.infer<typeof fileUploadSchema>;
export type Automation = z.infer<typeof automationSchema>;
export type Meeting = z.infer<typeof meetingSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Consent = z.infer<typeof consentSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
