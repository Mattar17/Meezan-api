import type { Request, Response } from "express";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import {
  lawyerUpdateSchema,
  ownerUpdateSchema,
} from "../ValidationSchemas/CaseUpdateSchema.js";
import type { AuthRequest } from "../types/AuthRequest.js";

//POST /offices/:officeId/cases (owner only)
export async function createCase(req: AuthRequest, res: Response) {
  try {
    const { officeId } = req.params;
    const lawyerId = req.token?.lawyer_id;
    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي قضايا هذا المكتب",
      });
    }
    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (officeError || !office)
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود" });

    if (office.owner_id !== lawyerId)
      return res.status(403).json({
        success: false,
        message: "لا يمكنك إنشاء قضية جديدة لهذا المكتب",
      });

    const caseData = {
      ...req.body,
      office_id: officeId,
      title: `${req.body.client_name} ضد ${req.body.client_opponent_name}`,
    };

    const { data: createdCase, error: caseError } = await supabase
      .from("cases")
      .insert(caseData)
      .select("*")
      .single();

    if (caseError) {
      if (caseError?.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "يوجد قضية بنفس الرقم والسنة داخل هذا المكتب",
        });
      }
      logger.error(`Error creating the case : ${caseError.message}`);
      return res
        .status(500)
        .json({ success: false, message: "خطأ أثناء إضافة قضية" });
    }

    return res.status(201).json({
      success: true,
      message: "تم إنشاء القضية بنجاح",
      data: createdCase,
    });
  } catch (error: any) {
    logger.error(`Error creating the case : ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "خطأ أثناء إضافة قضية" });
  }
}

//GET /offices/:officeId/cases (owner can see all , lawyer can see cases the assigned to him)
export async function getOfficeCases(req: AuthRequest, res: Response) {
  try {
    const { officeId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي قضايا هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError) {
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });
    }

    if (office.owner_id !== lawyerId) {
      const { data: membership, error: membershipError } = await supabase
        .from("office_members")
        .select("id")
        .eq("office_id", officeId)
        .eq("lawyer_id", lawyerId)
        .single();

      if (!membership || membershipError) {
        return res.status(403).json({
          success: false,
          message: "غير مسموح لك الإطلاع علي قضايا هذا المكتب",
        });
      }
    }
    let fetchedCases;
    if (office.owner_id === lawyerId) {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("office_id", officeId);

      if (error)
        return res.status(500).json({
          success: false,
          message: "خطأ أثناء تحميل القضايا الخاصة بالمكتب",
        });
      fetchedCases = data;
    } else {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("office_id", officeId)
        .eq("assigned_lawyer_id", lawyerId);

      if (error)
        return res.status(500).json({
          success: false,
          message: "خطأ أثناء تحميل القضايا الخاصة بك",
        });
      fetchedCases = data;
    }
    return res.status(200).json({ success: true, data: fetchedCases });
  } catch (error: any) {
    logger.error(`Error fetching office cases: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تحميل قضايا المكتب" });
  }
}

//PATCH offices/:officeId/cases/:caseId/assign
export async function assignLawyerToCase(req: AuthRequest, res: Response) {
  try {
    const { officeId } = req.params;
    const lawyerId = req.token?.lawyer_id;
    const lawyerToAssign = req.body.id;
    const { caseId } = req.params;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي قضايا هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError) {
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });
    }

    if (office.owner_id !== lawyerId)
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك بتعيين محامي علي القضية",
      });
    if (office.owner_id === lawyerToAssign)
      return res.status(403).json({
        success: false,
        message: "لا يمكن تعيين مالك المكتب علي القضية",
      });

    if (lawyerToAssign !== null) {
      const { data: membership, error: membershipError } = await supabase
        .from("office_members")
        .select("id")
        .eq("office_id", officeId)
        .eq("lawyer_id", lawyerToAssign)
        .single();

      if (!membership || membershipError) {
        return res.status(403).json({
          success: false,
          message: "هذا المحامي ليس عضواً في المكتب",
        });
      }
    }
    const { data: updatedCase, error: updateError } = await supabase
      .from("cases")
      .update({ assigned_lawyer_id: lawyerToAssign })
      .eq("id", caseId)
      .eq("office_id", officeId)
      .select("id");

    if (updateError)
      return res
        .status(500)
        .json({ success: false, message: "خطأ أثناء تعيين المحامي" });

    if (!updatedCase || updatedCase.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "القضية غير موجود" });

    return res.status(200).json({
      success: true,
      message: !lawyerToAssign
        ? "تم إلغاء تعيين المحامي بنجاح"
        : "تم تعيين المحامي علي القضية بنجاح",
    });
  } catch (error: any) {
    logger.error(`Error assigning lawyer to case: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تعيين المحامي" });
  }
}

//GET offices/:officeId/cases/:caseId (owner and assigned lawyer only)
export async function getCaseDetails(req: AuthRequest, res: Response) {
  try {
    const { officeId, caseId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي قضايا هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError) {
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });
    }

    const { data: fetchedCase, error: fetchedCaseError } = await supabase
      .from("cases")
      .select("*")
      .eq("office_id", officeId)
      .eq("id", caseId)
      .single();

    if (!fetchedCase || fetchedCaseError)
      return res
        .status(404)
        .json({ success: false, message: "القضية غير موجود أو تم حذفها" });

    if (
      office.owner_id !== lawyerId &&
      fetchedCase.assigned_lawyer_id !== lawyerId
    )
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك الإطلاع علي هذه القضية" });

    return res.status(200).json({ success: true, data: fetchedCase });
  } catch (error: any) {
    logger.error(`Error fetching case details: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تحميل بيانات القضية" });
  }
}

//PATCH offices/:officeId/cases/:caseId (owner and assigned lawyer only)
export async function updateCase(req: AuthRequest, res: Response) {
  try {
    const { officeId, caseId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي قضايا هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError) {
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });
    }

    const { data: fetchedCase, error: fetchedCaseError } = await supabase
      .from("cases")
      .select("id,assigned_lawyer_id")
      .eq("office_id", officeId)
      .eq("id", caseId)
      .single();

    if (!fetchedCase || fetchedCaseError)
      return res
        .status(404)
        .json({ success: false, message: "القضية غير موجود أو تم حذفها" });

    const isOwner = office.owner_id === lawyerId;

    if (!isOwner && fetchedCase.assigned_lawyer_id !== lawyerId)
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك الإطلاع علي هذه القضية" });

    const schema = isOwner ? ownerUpdateSchema : lawyerUpdateSchema;

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      console.log(parsed.error.issues);
      return res.status(400).json({
        success: false,
        message: "بيانات غير صالحة للتعديل",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { data: updatedCase, error: updateError } = await supabase
      .from("cases")
      .update(parsed.data)
      .eq("id", fetchedCase.id)
      .select("*")
      .single();

    if (!updatedCase || updateError) {
      logger.error(updateError?.message);
      return res.status(500).json({
        success: false,
        message: `${updateError?.message}   حدث خطأ أثناء تعديل القضية`,
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedCase,
      message: "تم تعديل القضية بنجاح",
    });
  } catch (error: any) {
    logger.error(`Error udpating case: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء تعديل القضية" });
  }
}

//DELETE offices/:officeId/cases/:caseId (owner only)
export async function deleteCase(req: AuthRequest, res: Response) {
  try {
    const { officeId, caseId } = req.params;
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) {
      return res.status(403).json({
        success: false,
        message: "غير مسموح لك الإطلاع علي قضايا هذا المكتب",
      });
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("owner_id")
      .eq("id", officeId)
      .single();

    if (!office || officeError) {
      return res
        .status(404)
        .json({ success: false, message: "المكتب غير موجود أو تم حذفه" });
    }

    if (office.owner_id !== lawyerId)
      return res
        .status(403)
        .json({ success: false, message: "مالك المكتب فقط يمكنه حذف القضية" });

    const { data: deletedCase, error: deleteError } = await supabase
      .from("cases")
      .delete()
      .eq("office_id", officeId)
      .eq("id", caseId)
      .select("case_number")
      .single();

    if (!deletedCase || deleteError)
      return res.status(400).json({
        success: false,
        message: "حدث خطأ أثناء حذف القضية أو قضية غير موجودة",
      });

    return res.status(200).json({
      success: true,
      message: `تم حذف القضية رقم ${deletedCase.case_number}`,
    });
  } catch (error: any) {
    logger.error(`Error deleting case: ${error.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء حذف القضية" });
  }
}
