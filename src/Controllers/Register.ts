import type { Request, Response } from "express";
import bycrypt from "bcrypt";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
export default async function Register(req: Request, res: Response) {

  try{
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({success:false,message:"يجب إدخال كل البيانات"})
  }

  const {data:emailExists} = await supabase
  .from("lawyers")
  .select("email")
  .eq("email",email)
  .single()

  if(emailExists) return res.status(403).json({sucess:false,message:"البريد الإلكتروني غير صالح أو تم إستخدامه مسبقاً"})

  const hashedPassword = await bycrypt.hash(password, 12);
  const { error } = await supabase
    .from("lawyers")
    .insert({ name, email, phone, password_hash: hashedPassword });
  if (error) {
    logger.error(`${error.message}:خطأ`);
    return res.status(500).json("حدث خطأ أثناء التسجيل");
  }

  return res.status(200).json({ success: true, message: "تم التسجيل بنجاح" });
}catch(err){
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`[Register Error] ${message}`)
  return res.status(500).json({success:false,message:"خطأ أثناء التسجيل"})
}
}
