import { type Response, type Request } from "express";
import bcrypt from "bcrypt";
import generateToken from "../Services/generateToken.js";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";

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

    const lawyerInfo = {
      id: lawyer.id,
      name: lawyer.name,
      bio: lawyer.bio,
      email: lawyer.email,
      pictureUrl: lawyer.picture_url,
      isAdmin: lawyer.is_admin,
    };

    return res.status(200).json({
      success: true,
      data: { token: generatedToken, user: lawyerInfo },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Login error: ${err}`);
    return res
      .status(500)
      .json({ success: false, message: `${err} server error` });
  }
};
