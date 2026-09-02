import { type Response } from "express";
import { type AuthRequest } from "../types/AuthRequest.js";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import {
  createTaskSchema,
  ownerUpdateTaskSchema,
  lawyerUpdateTaskSchema,
} from "../ValidationSchemas/TasksSchema.js";

// POST /offices/:officeId/tasks (owner only)
export async function createTask(req: AuthRequest, res: Response) {
  try {
    const { officeId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي مهام هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError)
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });

    if (office.owner_id !== lawyerId)
      return res.status(403).json({
        success: false,
        message: "مالك المكتب فقط يمكنه إضافة مهمة",
      });

    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.error(
        `Invalid task creation data: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
      );
      return res.status(400).json({
        success: false,
        message: "بيانات غير صالحة لإنشاء المهمة",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    if (parsed.data.case_id) {
      const { data: relatedCase, error: caseError } = await supabase
        .from("cases")
        .select("id")
        .eq("id", parsed.data.case_id)
        .eq("office_id", officeId)
        .single();

      if (!relatedCase || caseError)
        return res.status(400).json({
          success: false,
          message: "القضية المرتبطة غير موجودة في هذا المكتب",
        });
    }

    const taskData = { ...parsed.data, office_id: officeId };

    const { data: createdTask, error: taskError } = await supabase
      .from("tasks")
      .insert(taskData)
      .select("*")
      .single();

    if (taskError) {
      logger.error(`Error creating task: ${taskError.message}`);
      return res
        .status(500)
        .json({ success: false, message: "خطأ أثناء إضافة المهمة" });
    }

    return res.status(201).json({
      success: true,
      message: "تم إضافة المهمة بنجاح",
      data: createdTask,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error creating task: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "خطأ أثناء إضافة المهمة" });
  }
}

// GET /offices/:officeId/tasks (owner sees all, lawyer sees tasks assigned to him)
export async function getOfficeTasks(req: AuthRequest, res: Response) {
  try {
    const { officeId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي مهام هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError)
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });

    const isOwner = office.owner_id === lawyerId;

    if (!isOwner) {
      const { data: membership, error: membershipError } = await supabase
        .from("office_members")
        .select("id")
        .eq("office_id", officeId)
        .eq("lawyer_id", lawyerId)
        .single();

      if (!membership || membershipError)
        return res.status(403).json({
          success: false,
          message: "غير مسموح لك الإطلاع علي مهام هذا المكتب",
        });
    }

    let fetchedTasks;
    if (isOwner) {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("office_id", officeId);

      if (error)
        return res.status(500).json({
          success: false,
          message: "خطأ أثناء تحميل مهام المكتب",
        });
      fetchedTasks = data;
    } else {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("office_id", officeId)
        .eq("assigned_lawyer_id", lawyerId);

      if (error)
        return res
          .status(500)
          .json({ success: false, message: "خطأ أثناء تحميل مهامك" });
      fetchedTasks = data;
    }

    return res.status(200).json({ success: true, data: fetchedTasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching office tasks: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تحميل مهام المكتب" });
  }
}

// GET /offices/:officeId/tasks/:taskId (owner and assigned lawyer only)
export async function getTaskDetails(req: AuthRequest, res: Response) {
  try {
    const { officeId, taskId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي مهام هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError)
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });

    const { data: fetchedTask, error: fetchedTaskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("office_id", officeId)
      .eq("id", taskId)
      .single();

    if (!fetchedTask || fetchedTaskError)
      return res
        .status(404)
        .json({ success: false, message: "المهمة غير موجودة أو تم حذفها" });

    if (
      office.owner_id !== lawyerId &&
      fetchedTask.assigned_lawyer_id !== lawyerId
    )
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك الإطلاع علي هذه المهمة" });

    return res.status(200).json({ success: true, data: fetchedTask });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching task details: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تحميل بيانات المهمة" });
  }
}

// PATCH /offices/:officeId/tasks/:taskId (owner: full, lawyer: status + notes only)
export async function updateTask(req: AuthRequest, res: Response) {
  try {
    const { officeId, taskId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي مهام هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError)
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });

    const { data: fetchedTask, error: fetchedTaskError } = await supabase
      .from("tasks")
      .select("id, assigned_lawyer_id")
      .eq("office_id", officeId)
      .eq("id", taskId)
      .single();

    if (!fetchedTask || fetchedTaskError)
      return res
        .status(404)
        .json({ success: false, message: "المهمة غير موجودة أو تم حذفها" });

    const isOwner = office.owner_id === lawyerId;

    if (!isOwner && fetchedTask.assigned_lawyer_id !== lawyerId)
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك تعديل هذه المهمة" });

    const schema = isOwner ? ownerUpdateTaskSchema : lawyerUpdateTaskSchema;
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      logger.error(
        `Invalid task update data: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
      );
      return res.status(400).json({
        success: false,
        message: "بيانات غير صالحة للتعديل",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update(parsed.data)
      .eq("id", fetchedTask.id)
      .select("*")
      .single();

    if (!updatedTask || updateError)
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تعديل المهمة" });

    return res.status(200).json({
      success: true,
      data: updatedTask,
      message: "تم تعديل المهمة بنجاح",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error updating task: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تعديل المهمة" });
  }
}

// PATCH /offices/:officeId/tasks/:taskId/assign (owner only)
export async function assignLawyerToTask(req: AuthRequest, res: Response) {
  try {
    const { officeId, taskId } = req.params;
    const lawyerId = req.token?.lawyer_id;
    const lawyerToAssign = req.body.id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي مهام هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError)
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });

    if (office.owner_id !== lawyerId)
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك بتعيين محامي علي المهمة",
      });

    if (office.owner_id === lawyerToAssign)
      return res.status(403).json({
        success: false,
        message: "لا يمكن تعيين مالك المكتب علي المهمة",
      });

    if (lawyerToAssign !== null) {
      const { data: membership, error: membershipError } = await supabase
        .from("office_members")
        .select("id")
        .eq("office_id", officeId)
        .eq("lawyer_id", lawyerToAssign)
        .single();

      if (!membership || membershipError)
        return res.status(403).json({
          success: false,
          message: "هذا المحامي ليس عضواً في المكتب",
        });
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update({ assigned_lawyer_id: lawyerToAssign })
      .eq("id", taskId)
      .eq("office_id", officeId)
      .select("id")
      .single();

    if (updateError)
      return res
        .status(500)
        .json({ success: false, message: "خطأ أثناء تعيين المحامي" });

    if (!updatedTask)
      return res.status(404).json({
        success: false,
        message: "المهمة غير موجودة في هذا المكتب",
      });

    return res.status(200).json({
      success: true,
      message: lawyerToAssign
        ? "تم تعيين المحامي علي المهمة بنجاح"
        : "تم إلغاء تعيين المحامي بنجاح",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error assigning lawyer to task: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تعيين المحامي" });
  }
}

// DELETE /offices/:officeId/tasks/:taskId (owner only)
export async function deleteTask(req: AuthRequest, res: Response) {
  try {
    const { officeId, taskId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي مهام هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError)
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });

    if (office.owner_id !== lawyerId)
      return res.status(403).json({
        success: false,
        message: "مالك المكتب فقط يمكنه حذف المهمة",
      });

    const { data: deletedTask, error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("office_id", officeId)
      .eq("id", taskId)
      .select("title")
      .single();

    if (deleteError)
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء حذف المهمة" });

    if (!deletedTask)
      return res.status(404).json({
        success: false,
        message: "المهمة غير موجودة أو تم حذفها بالفعل",
      });

    return res.status(200).json({
      success: true,
      message: `تم حذف المهمة "${deletedTask.title}"`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error deleting task: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء حذف المهمة" });
  }
}
