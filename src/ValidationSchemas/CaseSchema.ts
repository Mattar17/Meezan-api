import { z } from "zod";
import { Database } from "../types/database.types.js";


export const createCaseSchema = z
  .object({
    case_number: z.string().min(1, "رقم القضية مطلوب"),
    case_year: z.string().regex(/^\d{4}$/, "السنة غير صحيحة"),
    client_name: z.string().min(1, "اسم الموكل مطلوب"),
    client_opponent_name: z.string().min(1, "اسم الخصم مطلوب"),
    client_role: z.string().min(1, "صفة الموكل مطلوبة"),

    // Optional fields per DB Insert
    client_national_id: z.string().regex(/^\d{14}$/, "الرقم القومي غير صحيح").optional().nullable(),
    client_opponent_national_id: z
      .string()
      .regex(/^\d{14}$/, "الرقم القومي غير صحيح").optional().nullable(),
    client_phone_number: z
      .string()
      .regex(/^\d{11}$/, "رقم الهاتف غير صحيح")
      .optional()
      .nullable(),
    opponent_phone_number: z
      .string()
      .regex(/^\d{11}$/, "رقم الهاتف غير صحيح")
      .optional()
      .nullable(),
    poa_number: z.string().optional().nullable(),
    notary_office: z.string().optional().nullable(),
    assigned_lawyer_id: z.string().uuid().optional().nullable(),
    case_degree: z.string().optional().nullable(),
    case_type: z.string().optional().nullable(),
    client_type: z.string().optional().nullable(),
    closed_at: z.string().optional().nullable(),
    court_circuit: z.string().optional().nullable(),
    court_name: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    latest_court_session_date: z
      .string()
      .optional()
      .nullable()
      .refine(
        (date) => !date || new Date(date) <= new Date(),
        "تاريخ آخر جلسة لا يمكن أن يكون في المستقبل",
      ),
    latest_update: z.string().optional().nullable(),
    next_court_session_date: z.string().optional().nullable(),
    opened_at: z.string().optional(),
  })
  .strict();

