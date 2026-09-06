import { z } from "zod";

export const quoteRecurrenceCadenceSchema = z.enum(["weekly", "monthly", "quarterly", "annual"]);

export const quoteCommercialItemSchema = z.object({
  id: z.string().trim().min(1).nullable().optional(),
  label: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  quantity: z.number().int().min(1).max(9999),
  unitAmount: z.number().int().nonnegative().nullable(),
  pricingType: z.enum(["one_time", "recurring"]),
  recurrenceCadence: quoteRecurrenceCadenceSchema.nullable(),
  optional: z.boolean(),
}).superRefine((value, context) => {
  if (value.pricingType === "one_time" && value.recurrenceCadence !== null) {
    context.addIssue({ code: "custom", path: ["recurrenceCadence"], message: "One-time items cannot have a cadence" });
  }
  if (value.pricingType === "recurring" && value.recurrenceCadence === null) {
    context.addIssue({ code: "custom", path: ["recurrenceCadence"], message: "Recurring items require a cadence" });
  }
});

export const quoteCommercialSaveSchema = z.object({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  title: z.string().trim().min(1).max(200),
  clientNote: z.string().max(5000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  discount: z.number().int().nonnegative(),
  validUntil: z.string().date().nullable(),
  items: z.array(quoteCommercialItemSchema).max(250),
});

export type QuoteCommercialSave = z.infer<typeof quoteCommercialSaveSchema>;
