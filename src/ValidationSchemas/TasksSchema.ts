import { z } from "zod";

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
  })
  .strict();

export const ownerUpdateTaskSchema = createTaskSchema.partial().strict();

export const lawyerUpdateTaskSchema = z
  .object({
    status: z.enum(TASK_STATUSES).optional(),
    notes: z.string().optional(),
  })
  .strict();
