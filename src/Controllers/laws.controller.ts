
import type { Response } from "express";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";
import type { AuthRequest } from "../types/AuthRequest.js";
import type { Database } from "../types/database.types.js";

// ─── LAW CATEGORIES CRUD ──────────────────────────────────────────────────────

export async function GetAllLawCategories(req: AuthRequest, res: Response) {
  try {
    const { data: categories, error } = await supabase
      .from("law_categories")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      logger.error(`GetAllLawCategories: fetch failed: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحميل أقسام القانون" });
    }

    return res.status(200).json({ success: true, data: categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`GetAllLawCategories error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function GetLawCategoryById(req: AuthRequest, res: Response) {
  try {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "معرف القسم غير صحيح" });
    }

    const { data: category, error } = await supabase
      .from("law_categories")
      .select("*")
      .eq("id", categoryId)
      .single();

    if (error || !category) {
      return res
        .status(404)
        .json({ success: false, message: "قسم القانون غير موجود" });
    }

    return res.status(200).json({ success: true, data: category });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`GetLawCategoryById error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function CreateLawCategory(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك إضافة قسم قانوني" });
    }

    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "اسم القسم مطلوب" });
    }

    const { data: insertedCategory, error } = await supabase
      .from("law_categories")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ success: false, message: "هذا القسم موجود بالفعل" });
      }
      logger.error(`CreateLawCategory error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء إنشاء القسم" });
    }

    return res.status(201).json({
      success: true,
      data: insertedCategory,
      message: "تم إنشاء قسم القانون بنجاح",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`CreateLawCategory error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function UpdateLawCategory(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك تعديل قسم القانون" });
    }

    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "معرف القسم غير صحيح" });
    }

    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "اسم القسم غير صحيح" });
    }

    const { data: updatedCategory, error } = await supabase
      .from("law_categories")
      .update({ name: name.trim() })
      .eq("id", categoryId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res
          .status(404)
          .json({ success: false, message: "قسم القانون غير موجود" });
      }
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ success: false, message: "هذا القسم موجود بالفعل" });
      }
      logger.error(`UpdateLawCategory error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحديث القسم" });
    }

    return res.status(200).json({
      success: true,
      data: updatedCategory,
      message: "تم تحديث قسم القانون بنجاح",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`UpdateLawCategory error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function DeleteLawCategory(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك حذف قسم القانون" });
    }

    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "معرف القسم غير صحيح" });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("law_categories")
      .select("id")
      .eq("id", categoryId)
      .single();

    if (fetchError || !existing) {
      return res
        .status(404)
        .json({ success: false, message: "قسم القانون غير موجود" });
    }

    const { error } = await supabase
      .from("law_categories")
      .delete()
      .eq("id", categoryId);

    if (error) {
      if (error.code === "23503") {
        return res.status(409).json({
          success: false,
          message: "لا يمكن حذف القسم لوجود مواد قانونية مرتبطة به",
        });
      }
      logger.error(`DeleteLawCategory error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء حذف القسم" });
    }

    return res
      .status(200)
      .json({ success: true, message: "تم حذف قسم القانون بنجاح" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`DeleteLawCategory error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

// ─── LAW TEXTS (مواد القانون) CRUD ────────────────────────────────────────────

function extractArticleNum(articleNumber: string): number {
  const normalized = (articleNumber || "").replace(/[٠-٩]/g, (d) =>
    String("٠١٢٣٤٥٦٧٨٩".indexOf(d)),
  );
  const match = normalized.match(/\d+/);
  return match ? parseInt(match[0], 10) : Number.MAX_SAFE_INTEGER;
}

function sortLawTextsByArticleNumber<
  T extends { id: number; article_number: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const numA = extractArticleNum(a.article_number);
    const numB = extractArticleNum(b.article_number);
    if (numA !== numB) return numA - numB;
    return (
      a.article_number.localeCompare(b.article_number, "ar", {
        numeric: true,
      }) || a.id - b.id
    );
  });
}

export async function GetAllLawTexts(req: AuthRequest, res: Response) {
  try {
    const rawCategoryId = req.query.categoryId ?? req.query.category_id;
    const search = (req.query.search as string)?.trim();

    let query = supabase
      .from("law_texts")
      .select("*, law_categories(id, name)")
      .order("id", { ascending: true });

    if (rawCategoryId !== undefined && rawCategoryId !== "") {
      const categoryId = Number(rawCategoryId);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "معرف القسم غير صحيح" });
      }
      query = query.eq("category_id", categoryId);
    }

    if (search) {
      query = query.or(
        `article_number.ilike.%${search}%,content.ilike.%${search}%`,
      );
    }

    const { data: texts, error } = await query;

    if (error) {
      logger.error(`GetAllLawTexts: fetch failed: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحميل مواد القانون" });
    }

    const sortedTexts = sortLawTextsByArticleNumber(texts || []);

    return res.status(200).json({ success: true, data: sortedTexts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`GetAllLawTexts error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function GetLawTextsByCategory(req: AuthRequest, res: Response) {
  try {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "معرف القسم غير صحيح" });
    }

    const { data: category, error: catError } = await supabase
      .from("law_categories")
      .select("id, name")
      .eq("id", categoryId)
      .single();

    if (catError || !category) {
      return res
        .status(404)
        .json({ success: false, message: "قسم القانون غير موجود" });
    }

    const { data: texts, error } = await supabase
      .from("law_texts")
      .select("*")
      .eq("category_id", categoryId)
      .order("id", { ascending: true });

    if (error) {
      logger.error(`GetLawTextsByCategory: fetch failed: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحميل مواد القانون" });
    }

    const sortedTexts = sortLawTextsByArticleNumber(texts || []);

    return res.status(200).json({
      success: true,
      data: sortedTexts,
      category,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`GetLawTextsByCategory error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function GetLawTextById(req: AuthRequest, res: Response) {
  try {
    const textId = Number(req.params.textId);
    if (!Number.isInteger(textId) || textId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "معرف المادة القانونية غير صحيح" });
    }

    const { data: lawText, error } = await supabase
      .from("law_texts")
      .select("*, law_categories(id, name)")
      .eq("id", textId)
      .single();

    if (error || !lawText) {
      return res
        .status(404)
        .json({ success: false, message: "المادة القانونية غير موجودة" });
    }

    return res.status(200).json({ success: true, data: lawText });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`GetLawTextById error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function CreateLawText(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك إضافة مادة قانونية" });
    }

    const { article_number, content } = req.body;
    const rawCategoryId = req.body.category_id ?? req.body.categoryId;
    const categoryId = Number(rawCategoryId);

    if (!article_number || typeof article_number !== "string" || !article_number.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "رقم المادة القانونية مطلوب" });
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "نص المادة القانونية مطلوب" });
    }

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "قسم القانون مطلوب وغير صحيح" });
    }

    const { data: category, error: catError } = await supabase
      .from("law_categories")
      .select("id")
      .eq("id", categoryId)
      .single();

    if (catError || !category) {
      return res
        .status(404)
        .json({ success: false, message: "قسم القانون غير موجود" });
    }

    const { data: insertedText, error } = await supabase
      .from("law_texts")
      .insert({
        article_number: article_number.trim(),
        content: content.trim(),
        category_id: categoryId,
      })
      .select()
      .single();

    if (error) {
      logger.error(`CreateLawText error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء إضافة المادة القانونية" });
    }

    return res.status(201).json({
      success: true,
      data: insertedText,
      message: "تمت إضافة المادة القانونية بنجاح",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`CreateLawText error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function UpdateLawText(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك تعديل المادة القانونية" });
    }

    const textId = Number(req.params.textId);
    if (!Number.isInteger(textId) || textId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "معرف المادة القانونية غير صحيح" });
    }

    const { article_number, content } = req.body;
    const rawCategoryId = req.body.category_id ?? req.body.categoryId;

    if (
      article_number === undefined &&
      content === undefined &&
      rawCategoryId === undefined
    ) {
      return res
        .status(400)
        .json({ success: false, message: "لا توجد بيانات لتحديثها" });
    }

    type LawTextUpdate = Database["public"]["Tables"]["law_texts"]["Update"];
    const updatePayload: LawTextUpdate = {};

    if (article_number !== undefined) {
      if (typeof article_number !== "string" || !article_number.trim()) {
        return res
          .status(400)
          .json({ success: false, message: "رقم المادة القانونية غير صحيح" });
      }
      updatePayload.article_number = article_number.trim();
    }

    if (content !== undefined) {
      if (typeof content !== "string" || !content.trim()) {
        return res
          .status(400)
          .json({ success: false, message: "نص المادة القانونية غير صحيح" });
      }
      updatePayload.content = content.trim();
    }

    if (rawCategoryId !== undefined) {
      const categoryId = Number(rawCategoryId);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res
          .status(400)
          .json({ success: false, message: "معرف القسم غير صحيح" });
      }

      const { data: category, error: catError } = await supabase
        .from("law_categories")
        .select("id")
        .eq("id", categoryId)
        .single();

      if (catError || !category) {
        return res
          .status(404)
          .json({ success: false, message: "قسم القانون غير موجود" });
      }

      updatePayload.category_id = categoryId;
    }

    const { data: updatedText, error } = await supabase
      .from("law_texts")
      .update(updatePayload)
      .eq("id", textId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res
          .status(404)
          .json({ success: false, message: "المادة القانونية غير موجودة" });
      }
      logger.error(`UpdateLawText error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحديث المادة القانونية" });
    }

    return res.status(200).json({
      success: true,
      data: updatedText,
      message: "تم تحديث المادة القانونية بنجاح",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`UpdateLawText error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function DeleteLawText(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك حذف المادة القانونية" });
    }

    const textId = Number(req.params.textId);
    if (!Number.isInteger(textId) || textId <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "معرف المادة القانونية غير صحيح" });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("law_texts")
      .select("id")
      .eq("id", textId)
      .single();

    if (fetchError || !existing) {
      return res
        .status(404)
        .json({ success: false, message: "المادة القانونية غير موجودة" });
    }

    const { error } = await supabase
      .from("law_texts")
      .delete()
      .eq("id", textId);

    if (error) {
      logger.error(`DeleteLawText error: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء حذف المادة القانونية" });
    }

    return res
      .status(200)
      .json({ success: true, message: "تم حذف المادة القانونية بنجاح" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`DeleteLawText error: ${message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

