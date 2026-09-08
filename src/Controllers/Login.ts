import { type Response, type Request } from "express";
import bcrypt from "bcrypt";
import generateToken from "../Services/generateToken.js";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";
import crypto from "node:crypto"


const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const Login = async (req: Request, res: Response) => {
  const isMobile = req.headers["x-client-type"] === "mobile";
  try {
    const { email, password } = req.body;

    if (!email || !password) {
  return res.status(400).json({
    success: false,
    message: "البريد الإلكتروني وكلمة المرور مطلوبان",
  });
}

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

    const {accessToken,refreshToken} = generateToken({
      lawyer_email: email,
      lawyer_id: lawyer.id,
      is_admin: lawyer.is_admin ?? false,
    });

    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const {data:storedToken,error:insertTokenError} = await supabase
    .from("user_refresh_tokens")
    .insert({
      user_id:lawyer.id,
      token_hash:tokenHash,
      expires_at:new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_valid:true
    })

    if(insertTokenError) throw Error("Error while generating tokens")

    const lawyerInfo = {
      id: lawyer.id,
      name: lawyer.name,
      bio: lawyer.bio,
      email: lawyer.email,
      pictureUrl: lawyer.picture_url,
      isAdmin: lawyer.is_admin,
    };

    if(isMobile){
        return res.status(200).json({success:true,data:{
            accessToken,refreshToken
        }})
    }
    else{

        res.cookie("refreshToken",refreshToken,{
            httpOnly:true,
            maxAge : REFRESH_TOKEN_TTL_MS,
            path:"/api/refresh",
            sameSite:"strict",
            secure:process.env.NODE_ENV === "production"
        })
        
        return res.status(200).json({
            success: true,
            data: { accessToken},
        }    
    );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Login error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: `server error` });
  }
};
