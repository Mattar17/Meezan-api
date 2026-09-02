import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import type { Request, Response } from "express";

export default async function AddAdmin(req: Request, res: Response) {
  try {
    if (req.headers["x-admin-key"] !== process.env.ADMIN_KEY)
      return res.sendStatus(403);

    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني مطلوب",
      });
    }

    const { data: lawyer, error } = await supabase
      .from("lawyers")
      .select("id,is_admin")
      .eq("email", email)
      .single();
    if (!lawyer || error) {
      logger.error(error.message);
      return res.status(404).json({
        success: false,
        message: "حدث خطأ أثناء تحميل المحامي أو أن المحامي غير موجود",
      });
    }

    if (lawyer.is_admin)
      return res.status(403).json({
        success: false,
        message: "المستخدم ضمن قائمة الأدمن بالفعل  ",
      });

    const { data: updatedLawyer, error: updateError } = await supabase
      .from("lawyers")
      .update({ is_admin: true })
      .eq("id", lawyer.id);

    if (updateError) {
      logger.error(updateError.message);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحديث البيانات" });
    }
    return res
      .status(200)
      .json({ success: true, message: "تم تعيين مسئول بنجاح" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`error [AddAdmin] : ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "Error while adding admin" });
  }
}
