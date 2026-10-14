import { type Response, type Request } from "express";
import bcrypt from "bcrypt";
<<<<<<< HEAD
import crypto from "node:crypto";
=======
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
import generateToken from "../Services/generateToken.js";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";

<<<<<<< HEAD
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Dummy hash to execute constant-time bcrypt compare when user does not exist
const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

export const Login = async (req: Request, res: Response) => {
  const isMobile = req.headers["x-client-type"] === "mobile";

  try {
    const { email, password } = req.body ?? {};

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني وكلمة المرور مطلوبان",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const { data: lawyer, error: dbError } = await supabase
      .from("lawyers")
      .select("id, name, bio, email, picture_url, is_admin, password_hash,is_verified")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (dbError) {
      logger.error(`[Login DB Error] ${dbError.message}`);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ داخلي في الخادم",
      });
    }

    const hashToCompare = lawyer?.password_hash || DUMMY_HASH;
    const isMatch = await bcrypt.compare(password, hashToCompare);

    if (!lawyer || !isMatch) {
      return res.status(401).json({
        success: false,
        message: "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      });
    }

    const { accessToken, refreshToken } = generateToken({
      lawyer_email: lawyer.email,
      lawyer_id: lawyer.id,
      is_admin: lawyer.is_admin ?? false,
    });

    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();

    const { error: insertTokenError } = await supabase
      .from("user_refresh_tokens")
      .insert({
        user_id: lawyer.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        is_valid: true,
      });

    if (insertTokenError) {
      logger.error(`[Login Insert Token Error] ${insertTokenError.message}`);
      return res.status(500).json({
        success: false,
        message: "فشل إنشاء جلسة تسجيل الدخول",
      });
    }

=======
export const Login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const { data: lawyer, error } = await supabase
      .from("lawyers")
      .select()
      .eq("email", email)
      .single();

    if (error || !lawyer) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود",
      });
    }

    const isMatch = await bcrypt.compare(password, lawyer.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "كلمة المرور غير صحيحة",
      });
    }

    const generatedToken = await generateToken({
      lawyer_email: email,
      lawyer_id: lawyer.id,
      is_admin: lawyer.is_admin,
    });

>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
    const lawyerInfo = {
      id: lawyer.id,
      name: lawyer.name,
      bio: lawyer.bio,
      email: lawyer.email,
      pictureUrl: lawyer.picture_url,
      isAdmin: lawyer.is_admin,
<<<<<<< HEAD
      isVerified:lawyer.is_verified
    };

    if (isMobile) {
      return res.status(200).json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: lawyerInfo,
        },
      });
    }

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      maxAge: REFRESH_TOKEN_TTL_MS,
      path: "/api/auth",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        user: lawyerInfo,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Login Unexpected Error] ${message}`);
    return res.status(500).json({
      success: false,
      message: "حدث خطأ داخلي في الخادم",
    });
  }
};
=======
    };

    return res.status(200).json({
      success: true,
      data: { token: generatedToken, user: lawyerInfo },
    });
  } catch (err) {
    logger.error(`Login error: ${err}`);
    return res
      .status(500)
      .json({ success: false, message: `${err} server error` });
  }
};
>>>>>>> a60ee4f1deba1d483657d098bba392f5818b5f63
