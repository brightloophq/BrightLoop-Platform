import { z } from "zod";

const reviewedVersionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  checksum: z.string().min(1),
}).strict();

/** Opaque concurrency precondition in the browser; resolved again by the server. */
export const commercialReviewBindingSchema = z.object({
  schemaVersion: z.literal(1),
  proposal: reviewedVersionSchema,
  narrative: reviewedVersionSchema,
  report: reviewedVersionSchema,
  competitor: reviewedVersionSchema.nullable(),
  coreProposal: reviewedVersionSchema.nullable(),
}).strict();

export type CommercialReviewBinding = z.infer<typeof commercialReviewBindingSchema>;
