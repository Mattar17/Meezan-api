import { z } from "zod";

export const createTaskSchema = z
  .object({
    // Required fields per DB Insert
    title: z.string().min(1, "عنوان المهمة مطلوب"),

    // Optional fields per DB Insert
    assigned_lawyer_id: z.string().uuid().optional().nullable(),
    case_id: z.string().uuid().optional().nullable(),
    description: z.string().optional().nullable(),
    due_date: z.string().date().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .strict();

export const ownerUpdateTaskSchema = createTaskSchema.partial().strict();

export const lawyerUpdateTaskSchema = z
  .object({
    notes: z.string().nullable().optional(),
    due_date: z.string().date().optional().nullable(),
  })
  .strict();
