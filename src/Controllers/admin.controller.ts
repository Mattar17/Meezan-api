import type { Response } from "express";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import type { AuthRequest } from "../types/AuthRequest.js";
import type { Database } from "../types/database.types.js";

type VerificationStatus = Database["public"]["Enums"]["verification_statuses"];

const VALID_STATUSES: VerificationStatus[] = ["pending", "accepted", "rejected", "canceled"];

/**
 * Fetch verification requests for admin with pagination and optional status filtering.
 */
export async function GetAllVerificationRequests(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin only",
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 10));
    const statusQuery = (req.query.status as string)?.toLowerCase();

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("verification_requests")
      .select(
        `
        id,
        lawyer_id,
        lawyer_card_path,
        status,
        rejection_reason,
        created_at,
        updated_at,
        lawyers (
          id,
          name,
          email,
          phone,
          bio,
          picture_url,
          is_verified,
          created_at
        )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (statusQuery) {
      if (VALID_STATUSES.includes(statusQuery as VerificationStatus)) {
        query = query.eq("status", statusQuery as VerificationStatus);
      } else {
        return res.status(400).json({
          success: false,
          message: `حالة غير صالحة. الحالات المسموحة: ${VALID_STATUSES.join(", ")}`,
        });
      }
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error(`[GetAllVerificationRequests] Failed to fetch requests: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تحميل طلبات التوثيق",
      });
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetAllVerificationRequests] Unexpected error: ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم",
    });
  }
}

/**
 * Returns a Supabase signed URL for a lawyer card given the verification request id.
 */
export async function GetLawyerCardUrl(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin only",
      });
    }

    const requestId = req.params.requestId as string;

    if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
      return res.status(400).json({
        success: false,
        message: "معرف طلب التوثيق مطلوب",
      });
    }

    const { data: verificationRequest, error: fetchError } = await supabase
      .from("verification_requests")
      .select("id, lawyer_card_path")
      .eq("id", requestId.trim())
      .single();

    if (fetchError || !verificationRequest) {
      return res.status(404).json({
        success: false,
        message: "طلب التوثيق غير موجود",
      });
    }

    if (!verificationRequest.lawyer_card_path) {
      return res.status(404).json({
        success: false,
        message: "لا توجد بطاقة محاماة مرفقة بهذا الطلب",
      });
    }

    // Strip bucket prefix if path contains it
    const cleanPath = verificationRequest.lawyer_card_path.replace(/^verification_requests\//, "");

    // Default 1 hour expiry (3600 seconds)
    const expiresIn = 60 * 60;
    const { data: signedData, error: signError } = await supabase.storage
      .from("verification_requests")
      .createSignedUrl(cleanPath, expiresIn);

    if (signError || !signedData?.signedUrl) {
      logger.error(`[GetLawyerCardUrl] Storage sign error: ${signError?.message}`);
      return res.status(500).json({
        success: false,
        message: "فشل في إنشاء رابط بطاقة المحامي",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        signedUrl: signedData.signedUrl,
        expiresIn,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetLawyerCardUrl] Unexpected error: ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم",
    });
  }
}

/**
 * Admin can accept or reject a verification request and leave a rejection reason.
 */
export async function AnswerVerificationRequest(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin only",
      });
    }

    const requestId = req.params.requestId as string;

    if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
      return res.status(400).json({
        success: false,
        message: "معرف طلب التوثيق مطلوب",
      });
    }

    const action = req.body?.action?.toString().trim().toLowerCase();
    const rejectionReason =  req.body?.rejection_reason?.toString().trim();

    let normalizedStatus: "accepted" | "rejected" | null = null;
    if (action === "accepted") {
      normalizedStatus = "accepted";
    } else if (action === "rejected") {
      normalizedStatus = "rejected";
    }

    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: "يجب تحديد حالة صالحة: 'accepted' أو 'rejected'",
      });
    }

    if (normalizedStatus === "rejected" && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "سبب الرفض مطلوب عند رفض طلب التوثيق",
      });
    }

    // Check if verification request exists
    const { data: request, error: fetchError } = await supabase
      .from("verification_requests")
      .select("id, lawyer_id, status")
      .eq("id", requestId.trim())
      .single();

    if (fetchError || !request) {
      return res.status(404).json({
        success: false,
        message: "طلب التوثيق غير موجود",
      });
    }

    const now = new Date().toISOString();

    // 1. Update verification request record
    const { data: updatedRequest, error: updateRequestError } = await supabase
      .from("verification_requests")
      .update({
        status: normalizedStatus,
        rejection_reason: normalizedStatus === "rejected" ? rejectionReason : null,
        updated_at: now,
      })
      .eq("id", requestId.trim())
      .select()
      .single();

    if (updateRequestError) {
      logger.error(`[AnswerVerificationRequest] Error updating verification request: ${updateRequestError.message}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تحديث حالة الطلب",
      });
    }

    // 2. Update lawyer's verification status
    const isVerified = normalizedStatus === "accepted";
    const { error: updateLawyerError } = await supabase
      .from("lawyers")
      .update({
        is_verified: isVerified,
        updated_at: now,
      })
      .eq("id", request.lawyer_id);

    if (updateLawyerError) {
      logger.error(`[AnswerVerificationRequest] Error updating lawyer verification status: ${updateLawyerError.message}`);
      return res.status(500).json({
        success: false,
        message: "تم تحديث الطلب ولكن حدث خطأ أثناء تحديث حالة المحامي",
      });
    }

    return res.status(200).json({
      success: true,
      message: normalizedStatus === "accepted" ? "تم قبول طلب التوثيق بنجاح" : "تم رفض طلب التوثيق بنجاح",
      data: {
        request: updatedRequest,
        is_verified: isVerified,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[AnswerVerificationRequest] Unexpected error: ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم",
    });
  }
}

/**
 * Fetch subscription requests for admin with pagination and optional status filtering.
 */
export async function GetAllSubscriptionRequests(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin only",
      });
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 10));
    const statusQuery = (req.query.status as string)?.toLowerCase();

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("subscription_requests")
      .select(
        `
        id,
        lawyer_id,
        invoice_path,
        status,
        rejection_reason,
        created_at,
        updated_at,
        lawyers (
          id,
          name,
          email,
          phone,
          bio,
          picture_url,
          is_verified,
          created_at
        )
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (statusQuery) {
      if (VALID_STATUSES.includes(statusQuery as VerificationStatus)) {
        query = query.eq("status", statusQuery as VerificationStatus);
      } else {
        return res.status(400).json({
          success: false,
          message: `حالة غير صالحة. الحالات المسموحة: ${VALID_STATUSES.join(", ")}`,
        });
      }
    }

    const { data, count, error } = await query;

    if (error) {
      logger.error(`[GetAllSubscriptionRequests] Failed to fetch requests: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تحميل طلبات الاشتراك",
      });
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetAllSubscriptionRequests] Unexpected error: ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم",
    });
  }
}

/**
 * Returns a Supabase signed URL for an invoice given the subscription request id.
 */
export async function GetSubscriptionInvoiceUrl(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin only",
      });
    }

    const requestId = req.params.requestId as string;

    if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
      return res.status(400).json({
        success: false,
        message: "معرف طلب الاشتراك مطلوب",
      });
    }

    const { data: subscriptionRequest, error: fetchError } = await supabase
      .from("subscription_requests")
      .select("id, invoice_path")
      .eq("id", requestId.trim())
      .single();

    if (fetchError || !subscriptionRequest) {
      return res.status(404).json({
        success: false,
        message: "طلب الاشتراك غير موجود",
      });
    }

    if (!subscriptionRequest.invoice_path) {
      return res.status(404).json({
        success: false,
        message: "لا توجد فاتورة مرفقة بهذا الطلب",
      });
    }

    // Strip bucket prefix if path contains it
    const cleanPath = subscriptionRequest.invoice_path.replace(/^subscription_requests\//, "");

    // Default 1 hour expiry (3600 seconds)
    const expiresIn = 60 * 60;
    const { data: signedData, error: signError } = await supabase.storage
      .from("subscription_requests")
      .createSignedUrl(cleanPath, expiresIn);

    if (signError || !signedData?.signedUrl) {
      logger.error(`[GetSubscriptionInvoiceUrl] Storage sign error: ${signError?.message}`);
      return res.status(500).json({
        success: false,
        message: "فشل في إنشاء رابط الفاتورة",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        signedUrl: signedData.signedUrl,
        expiresIn,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetSubscriptionInvoiceUrl] Unexpected error: ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم",
    });
  }
}

/**
 * Admin can accept or reject a subscription request and leave a rejection reason.
 */
export async function AnswerSubscriptionRequest(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin only",
      });
    }

    const requestId = req.params.requestId as string;

    if (!requestId || typeof requestId !== "string" || !requestId.trim()) {
      return res.status(400).json({
        success: false,
        message: "معرف طلب الاشتراك مطلوب",
      });
    }

    const action = req.body?.action?.toString().trim().toLowerCase();
    const rejectionReason = req.body?.rejection_reason?.toString().trim();

    let normalizedStatus: "accepted" | "rejected" | null = null;
    if (action === "accepted") {
      normalizedStatus = "accepted";
    } else if (action === "rejected") {
      normalizedStatus = "rejected";
    }

    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: "يجب تحديد حالة صالحة: 'accepted' أو 'rejected'",
      });
    }

    if (normalizedStatus === "rejected" && !rejectionReason) {
      return res.status(400).json({
        success: false,
        message: "سبب الرفض مطلوب عند رفض طلب الاشتراك",
      });
    }

    // Check if subscription request exists
    const { data: request, error: fetchError } = await supabase
      .from("subscription_requests")
      .select("id, lawyer_id, status")
      .eq("id", requestId.trim())
      .single();

    if (fetchError || !request) {
      return res.status(404).json({
        success: false,
        message: "طلب الاشتراك غير موجود",
      });
    }

    const now = new Date().toISOString();

    // 1. Update subscription request record
    const { data: updatedRequest, error: updateRequestError } = await supabase
      .from("subscription_requests")
      .update({
        status: normalizedStatus,
        rejection_reason: normalizedStatus === "rejected" ? rejectionReason : null,
        updated_at: now,
      })
      .eq("id", requestId.trim())
      .select()
      .single();

    if (updateRequestError) {
      logger.error(`[AnswerSubscriptionRequest] Error updating subscription request: ${updateRequestError.message}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء تحديث حالة الطلب",
      });
    }

    // 2. If accepted, ensure lawyer has an active subscription for one month
    let subscriptionData = null;

    if (normalizedStatus === "accepted") {
      const addOneMonth = (baseDate: Date): Date => {
        const result = new Date(baseDate);
        const currentMonth = result.getMonth();
        result.setMonth(currentMonth + 1);
        if (result.getMonth() !== (currentMonth + 1) % 12) {
          result.setDate(0);
        }
        return result;
      };

      const nowDate = new Date();

      // Check if lawyer already has a subscription record
      const { data: existingSubscription, error: fetchSubError } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("lawyer_id", request.lawyer_id)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchSubError) {
        logger.error(`[AnswerSubscriptionRequest] Error fetching existing subscription: ${fetchSubError.message}`);
      }

      let startDate: Date;
      let endDate: Date;

      if (
        existingSubscription &&
        existingSubscription.status === "active" &&
        new Date(existingSubscription.current_period_end) > nowDate
      ) {
        // Extend existing active subscription by one month from current_period_end
        startDate = new Date(existingSubscription.current_period_start);
        endDate = addOneMonth(new Date(existingSubscription.current_period_end));

        const { data: updatedSub, error: updateSubError } = await supabase
          .from("subscriptions")
          .update({
            current_period_end: endDate.toISOString(),
            status: "active",
            updated_at: nowDate.toISOString(),
          })
          .eq("id", existingSubscription.id)
          .select()
          .single();

        if (updateSubError) {
          logger.error(`[AnswerSubscriptionRequest] Error extending subscription: ${updateSubError.message}`);
          return res.status(500).json({
            success: false,
            message: "تم تحديث الطلب ولكن حدث خطأ أثناء تمديد الاشتراك",
          });
        }
        subscriptionData = updatedSub;
      } else if (existingSubscription) {
        // Reactivate expired/inactive subscription for one month starting now
        startDate = nowDate;
        endDate = addOneMonth(nowDate);

        const { data: updatedSub, error: updateSubError } = await supabase
          .from("subscriptions")
          .update({
            current_period_start: startDate.toISOString(),
            current_period_end: endDate.toISOString(),
            status: "active",
            updated_at: nowDate.toISOString(),
          })
          .eq("id", existingSubscription.id)
          .select()
          .single();

        if (updateSubError) {
          logger.error(`[AnswerSubscriptionRequest] Error renewing subscription: ${updateSubError.message}`);
          return res.status(500).json({
            success: false,
            message: "تم تحديث الطلب ولكن حدث خطأ أثناء تفعيل اشتراك المحامي",
          });
        }
        subscriptionData = updatedSub;
      } else {
        // Create new subscription record for one month
        startDate = nowDate;
        endDate = addOneMonth(nowDate);

        const { data: newSub, error: insertSubError } = await supabase
          .from("subscriptions")
          .insert({
            lawyer_id: request.lawyer_id,
            status: "active",
            current_period_start: startDate.toISOString(),
            current_period_end: endDate.toISOString(),
            gateway: "manual",
            subscription_type: "standard",
          })
          .select()
          .single();

        if (insertSubError) {
          logger.error(`[AnswerSubscriptionRequest] Error creating subscription: ${insertSubError.message}`);
          return res.status(500).json({
            success: false,
            message: "تم تحديث الطلب ولكن حدث خطأ أثناء تفعيل اشتراك المحامي",
          });
        }
        subscriptionData = newSub;
      }
    }

    return res.status(200).json({
      success: true,
      message: normalizedStatus === "accepted" ? "تم قبول طلب الاشتراك وتفعيل الاشتراك بنجاح" : "تم رفض طلب الاشتراك بنجاح",
      data: {
        request: updatedRequest,
        subscription: subscriptionData,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[AnswerSubscriptionRequest] Unexpected error: ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم",
    });
  }
}


