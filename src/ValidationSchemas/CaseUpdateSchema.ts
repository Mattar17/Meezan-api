import { z } from "zod";
import { createCaseSchema } from "./CaseSchema.js";

export const lawyerUpdateSchema = z
  .object({
    latest_court_session_date: z
      .string()
      .optional()
      .nullable()
      .refine(
        (date) => !date || new Date(date) <= new Date(),
        "تاريخ آخر جلسة لا يمكن أن يكون في المستقبل",
      ),
    next_court_session_date: z.preprocess(
      (v) => (v === "" ? null : v),
      z.string().nullable(),
    ),
    latest_update: z.string().nullable().optional(),
    court_name: z.string().nullable().optional(),
    court_circuit: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .strict();

export const ownerUpdateSchema = createCaseSchema
  .partial()
  .strict();
