import { z } from "zod";
import {
  CASE_STATUSES,
  PARTY_ROLES,
  CASE_TYPES,
  CASE_DEGREES,
  CLIENT_TYPES,
} from "../Models/Case.js";

export const createCaseSchema = z
  .object({
    description: z.string().optional(),

    case_number: z.string().min(1, "رقم القضية مطلوب"),

    case_year: z.string().regex(/^\d{4}$/, "السنة غير صحيحة"),

    client_name: z.string().min(1, "اسم الموكل مطلوب"),

    client_opponent_name: z.string().min(1, "اسم الخصم مطلوب"),

    client_role: z.enum(PARTY_ROLES, "صفة الموكل غير صحيحة"),

    client_national_id: z.string().regex(/^\d{14}$/, "الرقم القومي غير صحيح"),

    client_opponent_national_id: z
      .string()
      .regex(/^\d{14}$/, "الرقم القومي غير صحيح"),

    case_type: z.enum(CASE_TYPES).optional(),

    case_degree: z.enum(CASE_DEGREES).optional(),

    client_type: z.enum(CLIENT_TYPES).optional(),

    latest_court_session_date: z
      .string()
      .optional()
      .nullable()
      .refine(
        (date) => !date || new Date(date) <= new Date(),
        "تاريخ آخر جلسة لا يمكن أن يكون في المستقبل",
      ),
    next_court_session_date: z.string().nullable().optional(),

    court_name: z.string().optional(),
    court_circuit: z.string().optional(),

    case_status: z.enum(CASE_STATUSES).default("قضية جديدة"),

    latest_update: z.string().default("لم يتم العمل عليها بعد"),
  })
  .strict();
