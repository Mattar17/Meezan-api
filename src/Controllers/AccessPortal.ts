import type { Request, Response } from "express";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import bcrypt from "bcrypt";

export default async function AccessPortal(req: Request, res: Response) {
  try {
    const { password, id } = req.body;

    const { data: lawyer, error } = await supabase
      .from("lawyers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error(`Failed to fetch lawyer : ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "خطأ!! يرجي إعادة التحميل" });
    }

    if (!lawyer)
      return res
        .status(404)
        .json({ success: false, message: "لا يوجد محاميين نشطين حالياً" });

    console.log(password, lawyer);

    const isPasswordMatched = bcrypt.compareSync(
      password,
      lawyer.portal_password,
    );

    if (!isPasswordMatched) {
      return res
        .status(403)
        .json({ success: false, message: "كلمة السر غير صحيحة" });
    } else {
      return res
        .status(200)
        .json({ success: true, message: "Portal Access Successfully" });
    }
  } catch (err: any) {
    logger.error(`Error in AccessPortal:: ${err.message}`);
    return res
      .status(500)
      .json({ success: false, message: `Server ERROR : ${err.message}` });
  }
}
