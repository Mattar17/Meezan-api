import type { Request, Response } from "express";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";
import type { AuthRequest } from "../types/AuthRequest.js";

export async function CreateOffice(req: Request, res: Response) {
  try {
    const { name, owner_id } = req.body;
    const { data: office } = await supabase
      .from("offices")
      .select("*")
      .eq("owner_id", owner_id)
      .single();
    if (office)
      return res
        .status(403)
        .json({ success: false, message: "You already have office" });
    const { data, error } = await supabase
      .from("offices")
      .insert({ name, owner_id })
      .select()
      .single();

    console.log(data);

    if (error) return res.status(400).json({ success: false });
    else {
      const { error } = await supabase
        .from("office_members")
        .insert({ office_id: data.id, lawyer_id: owner_id, role: "owner" });
      console.log(error?.message);
      return res.status(200).json({ success: true, data });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Office Create] : ${message}`);
  }
}

export async function getMyOffices(req: AuthRequest, res: Response) {
  try {
    logger.info(`[token] ${req.token}`)
    const lawyer_id = req.token?.lawyer_id;
    const { data, error } = await supabase
      .from("office_members")
      .select("*,offices(id,owner_id,name)")
      .eq("lawyer_id", lawyer_id as string);
    if (error) {
      logger.error(error.message);
      return res.json(error);
    }
    return res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[Offices fetch] : ${message}`);
    return res
      .status(500)
      .json({ success: false, message: `Server Error ${message}` });
  }
}

// GET /api/offices/:id
export const getOfficeById = async (req: Request, res: Response) => {
  const { id } = req.params;

  logger.info(`Fetching office. OfficeId=${id}`);

  try {
    const { data, error } = await supabase
      .from("offices")
      .select("id, owner_id, name, address, phone, description")
      .eq("id", id as string)
      .single();

    if (error) {
      logger.error(
        `Failed to fetch office. OfficeId=${id}. Error=${error.message}`,
      );

      return res.status(500).json({
        success: false,
        message: "Failed to fetch office.",
      });
    }

    if (!data) {
      logger.warn(`Office not found. OfficeId=${id}`);

      return res.status(404).json({
        success: false,
        message: "Office not found.",
      });
    }

    logger.info(`Office fetched successfully. OfficeId=${id}`);

    return res.status(200).json({
      success: true,
      office: data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Unexpected error while fetching office. OfficeId=${id}`, err);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// PUT /api/offices/:id
export const updateOffice = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const {
    name,
    address,
    phone,
    description,
  }: {
    name: string;
    address?: string;
    phone?: string;
    description?: string;
  } = req.body;

  logger.info(`Updating office. OfficeId=${id}`);

  try {
    const updateData = {
      name,
      address: address ?? null,
      phone: phone ?? null,
      description: description ?? null,
    };

    const { data, error } = await supabase
      .from("offices")
      .update(updateData)
      .eq("id", id)
      .select("id, owner_id, name, address, phone, description")
      .single();

    if (error) {
      logger.error(
        `Failed to update office. OfficeId=${id}. Error=${error.message}`,
      );

      return res.status(500).json({
        success: false,
        message: "Failed to update office.",
      });
    }

    if (!data) {
      logger.warn(`Office not found for update. OfficeId=${id}`);

      return res.status(404).json({
        success: false,
        message: "Office not found.",
      });
    }

    if (req.token?.lawyer_id != data.owner_id) {
      return res.status(403).json({
        success: false,
        message: "You're not allowed to edit this data",
      });
    }

    logger.info(`Office updated successfully. OfficeId=${id}`);

    return res.status(200).json({
      success: true,
      message: "Office updated successfully.",
      office: data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Unexpected error while updating office. OfficeId=${id}`, err);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// controllers/officesController.ts
export async function leaveOffice(req: AuthRequest, res: Response) {
  const { officeId } = req.params;
  const lawyerId = req.token?.lawyer_id;
  const { data: office, error: officeErr } = await supabase
    .from("offices")
    .select("id, owner_id")
    .eq("id", officeId)
    .single();

  if (officeErr || !office) {
    return res
      .status(404)
      .json({ success: false, message: "المكتب غير موجود." });
  }

  if (office.owner_id === lawyerId) {
    return res.status(400).json({
      success: false,
      message:
        "لا يمكنك مغادرة مكتب أنت مالكه. قم بنقل الملكية أو حذف المكتب أولاً.",
    });
  }

  const { error: deleteErr } = await supabase
    .from("office_members")
    .delete()
    .eq("office_id", officeId)
    .eq("lawyer_id", lawyerId as string);

  if (deleteErr) {
    return res
      .status(500)
      .json({ success: false, message: "فشل مغادرة المكتب." });
  }

  return res.status(200).json({ success: true });
}

export async function getOfficeMembers(req: AuthRequest, res: Response) {
  const { officeId } = req.params;
  const lawyerId = req.token?.lawyer_id;

  if (!lawyerId) {
    return res.status(401).json({ message: "غير مصرح" });
  }

  // Confirm the requester actually belongs to this office before returning data
  const { data: membership, error: membershipError } = await supabase
    .from("office_members")
    .select("id")
    .eq("office_id", officeId)
    .eq("lawyer_id", lawyerId)
    .maybeSingle();

  if (membershipError) {
    return res.status(500).json({ message: "خطأ في التحقق من العضوية" });
  }
  if (!membership) {
    return res.status(403).json({ message: "لست عضوًا في هذا المكتب" });
  }

  const { data: office, error: officeError } = await supabase
    .from("offices")
    .select("owner_id")
    .eq("id", officeId)
    .single();

  if (officeError || !office) {
    return res.status(404).json({ message: "المكتب غير موجود" });
  }

  const { data: members, error } = await supabase
    .from("office_members")
    .select("lawyer_id, lawyers(id, name, email,picture_url)")
    .eq("office_id", officeId);

  if (error) {
    logger.error(error.message);
    return res.status(500).json({ message: "تعذر تحميل قائمة الأعضاء" });
  }

  const formatted = (members ?? []).map((m: any) => ({
    id: m.lawyers.id,
    name: m.lawyers.name,
    email: m.lawyers.email,
    picture_url: m.lawyers.picture_url,
    role: m.lawyers.id === office.owner_id ? "owner" : "member",
  }));

  return res.status(200).json({ members: formatted });
}

export async function kickMember(req: AuthRequest, res: Response) {
  const { officeId, memberId } = req.params;
  const lawyerId = req.token?.lawyer_id;

  if (!lawyerId) {
    return res.status(401).json({ message: "غير مصرح" });
  }

  const { data: office, error: officeError } = await supabase
    .from("offices")
    .select("owner_id")
    .eq("id", officeId)
    .single();

  if (officeError || !office) {
    return res.status(404).json({ message: "المكتب غير موجود" });
  }

  if (office.owner_id !== lawyerId) {
    return res
      .status(403)
      .json({ message: "فقط مالك المكتب يمكنه إزالة الأعضاء" });
  }

  if (memberId === office.owner_id) {
    return res.status(400).json({ message: "لا يمكن إزالة مالك المكتب" });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("office_members")
    .select("id")
    .eq("office_id", officeId)
    .eq("lawyer_id", memberId)
    .maybeSingle();

  if (membershipError) {
    return res.status(500).json({ message: "خطأ في التحقق من العضوية" });
  }
  if (!membership) {
    return res.status(404).json({ message: "هذا المحامي ليس عضوًا في المكتب" });
  }

  const { error: deleteError } = await supabase
    .from("office_members")
    .delete()
    .eq("office_id", officeId)
    .eq("lawyer_id", memberId);

  if (deleteError) {
    return res.status(500).json({ message: "تعذرت إزالة المحامي" });
  }

  return res.status(200).json({ message: "تمت إزالة المحامي من المكتب" });
}
