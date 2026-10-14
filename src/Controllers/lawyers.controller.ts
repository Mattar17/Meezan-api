import { type Request, type Response } from "express";
import supabase from "../Services/supabaseClient.js";
import bcrypt from "bcrypt";
import logger from "../utils/logger.js";
import type { AuthRequest, IAuthRequest } from "../types/AuthRequest.js";
import crypto from "node:crypto"
import fs from "node:fs"

// 🔹 Helper: get lawyer by id
export const getLawyerByIdHelper = async (id: string) => {
  const { data, error } = await supabase
    .from("lawyers")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
};

export const getLawyerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    logger.info(`Fetching lawyer with id: ${id}`);

    if (!id) {
      logger.warn("No ID provided");
      return res.status(400).json({
        success: false,
        message: "Lawyer ID is required",
      });
    }

    const data = await getLawyerByIdHelper(id as string);

    logger.info(`Lawyer fetched successfully: ${id}`);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Unexpected error: ${message}`);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// 🔹 GET ALL LAWYERS
export const getAllLawyersAdmin = async (req: AuthRequest, res: Response) => {
  try {
    logger.info("Fetching all lawyers", {
      user: req.token?.lawyer_id,
    });

    const { data, error } = await supabase.from("lawyers").select("*");

    if (error) throw error;

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error fetching lawyers", { message: message });

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
// 🔹 GET ALL LAWYERS (PUBLIC — excludes password_hash)
export const getAllLawyersPublic = async (req: AuthRequest, res: Response) => {
  try {
    logger.info("Fetching all lawyers (public)");

    const { data, error } = await supabase
      .from("lawyers")
      .select("id, name, email, bio, phone, picture_url, is_admin, created_at, updated_at");

    if (error) throw error;

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error fetching lawyers", { message });

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// 🔹 CREATE LAWYER (ADMIN ONLY)
export const createLawyer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.token?.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin only",
      });
    }

    const { name, email, password } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "الاسم والبريد الإلكتروني مطلوبان",
      });
    }

    // Use provided password or default "000000"
    const rawPassword = password || "000000";
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const { data, error } = await supabase
      .from("lawyers")
      .insert([
        {
          name,
          email,
          password_hash: hashedPassword,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    logger.info("Lawyer created", {
      lawyerId: data.id,
    });

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error creating lawyer", { message });

    return res.status(400).json({
      success: false,
      message,
    });
  }
};

// 🔹 UPDATE LAWYER
export const updateLawyer = async (req: AuthRequest, res: Response) => {
  try {
    const lawyer = await getLawyerByIdHelper(req.params.id as string);

    if (!lawyer) {
      return res.status(404).json({
        success: false,
        message: "Lawyer not found",
      });
    }
    if (req.token?.lawyer_id !== lawyer.id) {
      logger.warn("Unauthorized update attempt", {
        user: req.token?.lawyer_id,
      });

      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
    const { data, error } = await supabase
      .from("lawyers")
      .update(req.body)
      .eq("id", req.params.id as string)
      .select("*")
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error updating lawyer", { message: message });

    return res.status(400).json({
      success: false,
      message: message,
    });
  }
};

// 🔹 DELETE LAWYER (ADMIN ONLY)
export const deleteLawyer = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.token?.is_admin) {
      return res.status(403).json({
        success: false,
        message: "Access denied, admin only",
      });
    }

    const { error } = await supabase
      .from("lawyers")
      .delete()
      .eq("id", req.params.id as string);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "Lawyer deleted successfully",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Error deleting lawyer", { message: message });

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// 🔹 UPDATE PASSWORD
export const updatePassword = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const lawyer = await getLawyerByIdHelper(req.params.id as string);

    if (!lawyer) {
      return res.status(404).json({
        success: false,
        message: "Lawyer not found",
      });
    }

    if (req.token?.lawyer_id !== lawyer.id) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
    const isMatch = await bcrypt.compare(
      currentPassword,
      lawyer.password_hash,
    );

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور الحالية غير صحيحة",
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    const { error } = await supabase
      .from("lawyers")
      .update({ password_hash: hashed })
      .eq("id", req.params.id as string);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "تم تغيير كلمة المرور بنجاج",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("حدث خطأ!! حاول مرةً أخرى", {
      message: message,
    });

    return res.status(400).json({
      success: false,
      message: message,
    });
  }
};

export const setProfilePicture = async (req: Request, res: Response) => {
  try {
    const { file } = req;
    const { id } = req.params;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "يتعذر قراءة الملف",
      });
    }

    const { data: result, error: uploadError } = await supabase.storage
      .from("profile_pictures")
      .upload(`public/${file.originalname}`, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      logger.error(`Error while uploading picture: ${uploadError}`);
      return res.status(500).json({
        success: false,
        message: uploadError.message,
      });
    }

    const { data } = supabase.storage
      .from("profile_pictures")
      .getPublicUrl(`public/${file.originalname}`);
    console.log("data from supabase storage: ", data);
    const { error: updateError } = await supabase
      .from("lawyers")
      .update({ picture_url: data.publicUrl })
      .eq("id", id as string);

    if (updateError) {
      logger.error(`Error while updating picture: ${updateError}`);
      return res.status(500).json({
        success: false,
        message: updateError.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
      message: "تم تعديل الصورة الشخصية بنجاح",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      message: message,
    });
  }
};

export const verificationRequest = async (req:IAuthRequest,res:Response)=>{
  const lawyer_card = req.file;
  try{
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) return res.status(401).json({success:false,message:"unauthorized"});

    // Check if the lawyer is already verified
    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers")
      .select("is_verified")
      .eq("id", lawyerId)
      .maybeSingle();

    if (lawyerError) throw Error(lawyerError.message);

    if (!lawyer) {
      return res.status(404).json({ success: false, message: "المحامي غير موجود" });
    }

    if (lawyer.is_verified) {
      return res.status(400).json({ success: false, message: "الحساب موثق بالفعل" });
    }

    //Check if lawyer has a pending request 
    const {data:pendingRequest,error:fetchError} = await supabase
    .from("verification_requests")
    .select("id")
    .eq("lawyer_id",lawyerId)
    .eq("status",'pending')
    .maybeSingle()

    if(fetchError) throw Error(fetchError.message)

    if (pendingRequest) return res.status(409).json({success:false,message:"لديك طلب معلق بالفعل"})

    if (!lawyer_card) return res.status(400).json({success:false,message:"يجب إرفاق صورة لإثبات الهوية"})

    const fileId = crypto.randomBytes(16).toString("hex"); 
    const fileExt = lawyer_card.originalname.split(".").pop() || "jpg";
    const fileBuffer = fs.readFileSync(lawyer_card.path)

    const {data:uploadedFile,error:uploadError} = await supabase.storage
    .from("verification_requests")
    .upload(`${fileId}.${fileExt}`,fileBuffer,{
      contentType:lawyer_card.mimetype,
      upsert:false
    })  

    if(uploadError){
      logger.error(`[LAWYER CARD UPLOAD] ${uploadError.message}`)
      throw Error("خطأ أثناء تقديم الطلب")
    }

    const {error:insertError} = await supabase
    .from("verification_requests")
    .insert({lawyer_id:lawyerId,lawyer_card_path:uploadedFile.path})

    if(insertError) {
      logger.error(`[VERIFICATION REQUEST INSERT RECORD] ${insertError.message}`)
      await supabase.storage.from("verification_requests").remove([uploadedFile.path])
      throw Error("حدث خطأ أثناء إنشاء الطلب")
    }

    return res.status(201).json({success:true,message:"تم إرسال طلبك بنجاح"})  
  }catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      message: message,
    });
  }
  finally {
    if (lawyer_card?.path && fs.existsSync(lawyer_card.path)) {
      try {
        fs.unlinkSync(lawyer_card.path);
      } catch (cleanupErr) {
        logger.error(`[TEMP FILE CLEANUP FAILED] ${cleanupErr}`);
      }
    }
  }
};

export const getVerificationStatus = async (req: IAuthRequest, res: Response) => {
  try {
    const lawyerId = req.token?.lawyer_id;
    if (!lawyerId) return res.status(401).json({ success: false, message: "unauthorized" });

    const { data: pendingRequest, error: fetchError } = await supabase
      .from("verification_requests")
      .select("id")
      .eq("lawyer_id", lawyerId)
      .eq("status", "pending")
      .maybeSingle();

    if (fetchError) throw Error(fetchError.message);

    return res.status(200).json({
      success: true,
      data: {
        hasPendingRequest: Boolean(pendingRequest),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

export const sendSubscriptionRequest = async (req: IAuthRequest, res: Response) => {
  const invoice = req.file;
  try {
    const lawyerId = req.token?.lawyer_id;

    if (!lawyerId) return res.status(401).json({ success: false, message: "unauthorized" });

    // Check if the lawyer exists
    const { data: lawyer, error: lawyerError } = await supabase
      .from("lawyers")
      .select("id")
      .eq("id", lawyerId)
      .maybeSingle();

    if (lawyerError) throw Error(lawyerError.message);

    if (!lawyer) {
      return res.status(404).json({ success: false, message: "المحامي غير موجود" });
    }

    // Check if lawyer has a pending subscription request
    const { data: pendingRequest, error: fetchError } = await supabase
      .from("subscription_requests")
      .select("id")
      .eq("lawyer_id", lawyerId)
      .eq("status", "pending")
      .maybeSingle();

    if (fetchError) throw Error(fetchError.message);

    if (pendingRequest) return res.status(409).json({ success: false, message: "لديك طلب اشتراك معلق بالفعل" });

    if (!invoice) return res.status(400).json({ success: false, message: "يجب إرفاق فاتورة أو إيصال الدفع" });

    const fileId = crypto.randomBytes(16).toString("hex");
    const fileExt = invoice.originalname.split(".").pop() || "jpg";
    const fileBuffer = fs.readFileSync(invoice.path);

    const { data: uploadedFile, error: uploadError } = await supabase.storage
      .from("subscription_requests")
      .upload(`${fileId}.${fileExt}`, fileBuffer, {
        contentType: invoice.mimetype,
        upsert: false,
      });

    if (uploadError) {
      logger.error(`[SUBSCRIPTION INVOICE UPLOAD] ${uploadError.message}`);
      throw Error("خطأ أثناء تقديم الطلب");
    }

    const { error: insertError } = await supabase
      .from("subscription_requests")
      .insert({ lawyer_id: lawyerId, invoice_path: uploadedFile.path });

    if (insertError) {
      logger.error(`[SUBSCRIPTION REQUEST INSERT RECORD] ${insertError.message}`);
      await supabase.storage.from("subscription_requests").remove([uploadedFile.path]);
      throw Error("حدث خطأ أثناء إنشاء الطلب");
    }

    return res.status(201).json({ success: true, message: "تم إرسال طلب الاشتراك بنجاح" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      message: message,
    });
  } finally {
    if (invoice?.path && fs.existsSync(invoice.path)) {
      try {
        fs.unlinkSync(invoice.path);
      } catch (cleanupErr) {
        logger.error(`[TEMP FILE CLEANUP FAILED] ${cleanupErr}`);
      }
    }
  }
};

export const sendSubcriptionRequest = sendSubscriptionRequest;

export const getSubscriptionStatus = async (req: IAuthRequest, res: Response) => {
  try {
    const lawyerId = req.token?.lawyer_id;
    if (!lawyerId) return res.status(401).json({ success: false, message: "unauthorized" });

    const { data: pendingRequest, error: fetchError } = await supabase
      .from("subscription_requests")
      .select("id")
      .eq("lawyer_id", lawyerId)
      .eq("status", "pending")
      .maybeSingle();

    if (fetchError) throw Error(fetchError.message);

    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("lawyer_id", lawyerId)
      .eq("status", "active")
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) throw Error(subError.message);

    const isSubscribed = Boolean(
      subscription && new Date(subscription.current_period_end) > new Date()
    );

    return res.status(200).json({
      success: true,
      data: {
        hasPendingRequest: Boolean(pendingRequest),
        isSubscribed,
        subscription: isSubscribed ? subscription : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};


