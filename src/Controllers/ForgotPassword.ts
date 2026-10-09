import { type Request, type Response } from "express";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import { sendPasswordResetOtpEmail } from "../Services/emailService.js";

const OTP_EXPIRATION_MINUTES = 10;

/**
 * 1. Request Password Reset
 * Generates a 6-digit OTP, stores it in `otps` table, and sends email to the user.
 */
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body ?? {};

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "يرجى إدخال البريد الإلكتروني",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if the lawyer exists
    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers")
      .select("id, name, email")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lawyerError) {
      logger.error(`[ForgotPassword DB Error] ${lawyerError.message}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء معالجة الطلب",
      });
    }

    if (!lawyer) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على حساب مسجل بهذا البريد الإلكتروني",
      });
    }

    // Generate secure 6-digit code
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000).toISOString();

    // Invalidate any previous unused OTPs for this lawyer
    await supabase
      .from("otps")
      .update({ is_used: true })
      .eq("lawyer_id", lawyer.id)
      .eq("is_used", false);

    // Insert new OTP record
    const { error: insertError } = await supabase.from("otps").insert({
      lawyer_id: lawyer.id,
      code: otpCode,
      expires_at: expiresAt,
      is_used: false,
    });

    if (insertError) {
      logger.error(`[ForgotPassword Insert OTP Error] ${insertError.message}`);
      return res.status(500).json({
        success: false,
        message: "فشل إنشاء رمز التحقق، يرجى المحاولة لاحقاً",
      });
    }

    // Send email using nodemailer
    try {
      await sendPasswordResetOtpEmail({
        to: lawyer.email,
        name: lawyer.name,
        code: otpCode,
        expiresInMinutes: OTP_EXPIRATION_MINUTES,
      });
    } catch (mailError) {
      const errorMsg = mailError instanceof Error ? mailError.message : String(mailError);
      logger.error(`[ForgotPassword Mail Error] Failed to send email to ${lawyer.email}: ${errorMsg}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء إرسال البريد الإلكتروني، يرجى المحاولة لاحقاً",
      });
    }

    return res.status(200).json({
      success: true,
      message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني بنجاح",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[ForgotPassword Unexpected Error] ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ غير متوقع في الخادم",
    });
  }
};

/**
 * 2. Verify Reset OTP
 * Validates the 6-digit OTP code before proceeding to password reset.
 */
export const verifyResetOtp = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body ?? {};

    if (!email || !code || typeof email !== "string" || typeof code !== "string") {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني ورمز التحقق مطلوبان",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    // Check lawyer
    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lawyerError || !lawyer) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على الحساب",
      });
    }

    // Verify OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("otps")
      .select("id, code, expires_at, is_used")
      .eq("lawyer_id", lawyer.id)
      .eq("code", normalizedCode)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) {
      logger.error(`[VerifyOtp DB Error] ${otpError.message}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء التحقق من الرمز",
      });
    }

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "رمز التحقق غير صحيح أو انتهت صلاحيته",
      });
    }

    return res.status(200).json({
      success: true,
      message: "رمز التحقق صحيح",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[VerifyOtp Unexpected Error] ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ غير متوقع في الخادم",
    });
  }
};

/**
 * 3. Reset Password
 * Verifies the OTP, updates the user's password, marks the OTP as used, and invalidates old sessions.
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body ?? {};

    if (!email || !code || !newPassword || typeof email !== "string" || typeof code !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({
        success: false,
        message: "جميع الحقول مطلوبة (البريد الإلكتروني، رمز التحقق، كلمة المرور الجديدة)",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "يجب ألا تقل كلمة المرور عن 6 أحرف",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();

    // Check lawyer
    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (lawyerError || !lawyer) {
      return res.status(404).json({
        success: false,
        message: "لم يتم العثور على الحساب",
      });
    }

    // Verify OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from("otps")
      .select("id")
      .eq("lawyer_id", lawyer.id)
      .eq("code", normalizedCode)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) {
      logger.error(`[ResetPassword OTP DB Error] ${otpError.message}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ أثناء التحقق من الرمز",
      });
    }

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "رمز التحقق غير صحيح أو انتهت صلاحيته",
      });
    }

    // Mark OTP as used
    await supabase
      .from("otps")
      .update({ is_used: true })
      .eq("id", otpRecord.id);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password in lawyers table
    const { error: updateError } = await supabase
      .from("lawyers")
      .update({
        password_hash: hashedPassword,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lawyer.id);

    if (updateError) {
      logger.error(`[ResetPassword Update Error] ${updateError.message}`);
      return res.status(500).json({
        success: false,
        message: "فشل تحديث كلمة المرور، يرجى المحاولة لاحقاً",
      });
    }

    // Revoke old refresh tokens for security
    await supabase
      .from("user_refresh_tokens")
      .update({ is_valid: false })
      .eq("user_id", lawyer.id);

    return res.status(200).json({
      success: true,
      message: "تم تغيير كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[ResetPassword Unexpected Error] ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ غير متوقع في الخادم",
    });
  }
};
