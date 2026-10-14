import { z } from "zod";
<<<<<<< HEAD
=======
import { CASE_STATUSES } from "../Models/Case.js";
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
import { createCaseSchema } from "./CaseSchema.js";

export const lawyerUpdateSchema = z
  .object({
<<<<<<< HEAD
=======
    case_status: z.enum(CASE_STATUSES).optional(),
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
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
<<<<<<< HEAD
    court_name: z.string().nullable().optional(),
    court_circuit: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
=======
    court_name: z.string().optional(),
    court_circuit: z.string().optional(),
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
  })
  .strict();

export const ownerUpdateSchema = createCaseSchema
  .partial()
<<<<<<< HEAD
=======
  .extend({
    case_status: z.enum(CASE_STATUSES).optional(),
    latest_update: z.string().optional(),
  })
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
  .strict();
