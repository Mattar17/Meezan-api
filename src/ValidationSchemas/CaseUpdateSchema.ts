import { z } from "zod";
import { CASE_STATUSES } from "../Models/Case.js";
import { createCaseSchema } from "./CaseSchema.js";

export const lawyerUpdateSchema = z
  .object({
    case_status: z.enum(CASE_STATUSES).optional(),
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
    court_name: z.string().optional(),
    court_circuit: z.string().optional(),
  })
  .strict();

export const ownerUpdateSchema = createCaseSchema
  .partial()
  .extend({
    case_status: z.enum(CASE_STATUSES).optional(),
    latest_update: z.string().optional(),
  })
  .strict();
