import { z } from "zod";

<<<<<<< HEAD
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
=======
export const TASK_STATUSES = ["لم تبدأ", "قيد التنفيذ", "مكتملة"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const createTaskSchema = z
  .object({
    title: z.string().min(1, "عنوان المهمة مطلوب"),
    description: z.string().optional(),
    case_id: z.string().uuid().optional().nullable(),
    due_date: z.string().date().optional().nullable(),
    status: z.enum(TASK_STATUSES).optional(),
    notes: z.string().optional(),
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
  })
  .strict();

export const ownerUpdateTaskSchema = createTaskSchema.partial().strict();

export const lawyerUpdateTaskSchema = z
  .object({
<<<<<<< HEAD
    notes: z.string().nullable().optional(),
    due_date: z.string().date().optional().nullable(),
=======
    status: z.enum(TASK_STATUSES).optional(),
    notes: z.string().optional(),
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
  })
  .strict();
