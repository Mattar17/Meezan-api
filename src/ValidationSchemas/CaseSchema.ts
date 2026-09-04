import { z } from "zod";
import { Database } from "../types/database.types.js";

// Only client_type is an actual DB enum on the cases table
type ClientTypeEnum = Database["public"]["Enums"]["client_type_enum"];

const clientTypeValues: [ClientTypeEnum, ...ClientTypeEnum[]] = [
  "فرد",
  "شركة تضامن",
  "شركة توصية بسيطة",
  "شركة مساهمة",
  "شركة ذات مسؤولية محدودة",
  "شركة الشخص الواحد",
  "جهة حكومية",
  "أخرى",
];

export const createCaseSchema = z
  .object({
    // Required fields per DB Insert
    title: z.string().min(1, "عنوان القضية مطلوب"),
    case_number: z.string().min(1, "رقم القضية مطلوب"),
    case_year: z.string().regex(/^\d{4}$/, "السنة غير صحيحة"),
    client_name: z.string().min(1, "اسم الموكل مطلوب"),
    client_national_id: z.string().regex(/^\d{14}$/, "الرقم القومي غير صحيح"),
    client_opponent_name: z.string().min(1, "اسم الخصم مطلوب"),
    client_opponent_national_id: z
      .string()
      .regex(/^\d{14}$/, "الرقم القومي غير صحيح"),
    client_role: z.string().min(1, "صفة الموكل مطلوبة"),

    // Optional fields per DB Insert
    assigned_lawyer_id: z.string().uuid().optional().nullable(),
    case_degree: z.string().optional().nullable(),
    case_type: z.string().optional().nullable(),
    client_type: z.enum(clientTypeValues).optional().nullable(),
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

export { clientTypeValues };
