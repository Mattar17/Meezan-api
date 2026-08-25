import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";
import supabase from "../Services/supabaseClient.js";
import { type AuthRequest } from "../types/AuthRequest.js";

export async function GetAllCategories(req: AuthRequest, res: Response) {
  try {
    const { data: categories, error } = await supabase
      .from("categories")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      logger.error(`GetAllCategories: fetch failed: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحميل التصنيفات" });
    }

    return res.status(200).json({ success: true, data: categories });
  } catch (err: any) {
    logger.error(`GetAllCategories error: ${err.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function CreateCategory(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك إضافة تصنيف" });
    }

    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "اسم التصنيف غير صحيح" });
    }

    const { data: insertedCategory, error } = await supabase
      .from("categories")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ success: false, message: "هذا التصنيف موجود بالفعل" });
      }
      logger.error(`error creating category: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء إنشاء التصنيف" });
    }

    return res.status(200).json({ success: true, data: insertedCategory });
  } catch (err: any) {
    logger.error(`error creating category: ${err.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ أثناء إنشاء التصنيف" });
  }
}

export async function UploadBook(req: AuthRequest, res: Response) {
  try {
    const { title, description, categoryId } = req.body;

    if (!title || typeof title !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "عنوان الكتاب مطلوب" });
    }

    if (!categoryId || typeof categoryId !== "string") {
      return res.status(400).json({ success: false, message: "التصنيف مطلوب" });
    }

    const uploadedBy = req.token?.lawyer_id;
    if (!uploadedBy) {
      return res.status(401).json({ success: false, message: "غير مصرح" });
    }

    const { data: fetchedCategory, error: catError } = await supabase
      .from("categories")
      .select("id,name")
      .eq("id", categoryId)
      .single();

    if (!fetchedCategory || catError)
      return res
        .status(404)
        .json({ success: false, message: "التصنيف غير صحيح أو تم حذفه" });

    const file = req.file;
    if (!file)
      return res
        .status(403)
        .json({ success: false, message: "لا يوجد ملف لإضافته" });

    const ext = path.extname(req.file!.originalname);
    const bookId = crypto.randomUUID();
    const supabasePath = `${fetchedCategory.id}/${bookId}${ext}`;

    const fileBuffer = fs.readFileSync(req.file!.path);

    const { error } = await supabase.storage
      .from("books")
      .upload(supabasePath, fileBuffer, { contentType: req.file!.mimetype });

    fs.unlinkSync(req.file!.path);

    if (error) {
      logger.error(`[upload error] ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء رفع الملف" });
    }

    const { data: insertedBook, error: insertError } = await supabase
      .from("books")
      .insert({
        id: bookId,
        title,
        description: description ?? null,
        category_id: fetchedCategory.id,
        uploaded_by: uploadedBy,
        storage_path: supabasePath,
        file_ext: ext,
        file_size_bytes: req.file?.size,
      })
      .select()
      .single();

    if (insertError) {
      logger.error(insertError.message);
      await supabase.storage.from("books").remove([supabasePath]);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء حفظ بيانات الكتاب" });
    }

    return res.status(200).json({
      success: true,
      data: insertedBook,
      message: "تم رفع الكتاب بنجاح",
    });
  } catch (err: any) {
    logger.error(`UploadBookController error: ${err.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  } finally {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
}

export async function GetAllBooksInCategory(req: AuthRequest, res: Response) {
  try {
    const { categoryId } = req.params;

    const { data: fetchedCategory, error: catError } = await supabase
      .from("categories")
      .select("id,name")
      .eq("id", categoryId)
      .single();

    if (!fetchedCategory || catError)
      return res
        .status(404)
        .json({ success: false, message: "التصنيف غير صحيح أو تم حذفه" });

    const { data: books, error: fetchError } = await supabase
      .from("books")
      .select("*")
      .eq("category_id", categoryId);

    if (fetchError) {
      logger.error(`[fetch books error]: ${fetchError.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحميل الكتب" });
    }

    return res.status(200).json({ success: true, data: books });
  } catch (err: any) {
    logger.error(`GET all books error: ${err.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function GetFileUrl(req: AuthRequest, res: Response) {
  try {
    const { bookId } = req.params;

    const { data: book, error: fetchError } = await supabase
      .from("books")
      .select("storage_path")
      .eq("id", bookId)
      .single();

    if (!book || fetchError) {
      return res
        .status(404)
        .json({ success: false, message: "الكتاب غير موجود!" });
    }

    const filePath = book.storage_path;
    const { data, error } = await supabase.storage
      .from("books")
      .createSignedUrl(filePath, 60 * 5);

    if (error) {
      logger.error("GetFileUrl: failed to create signed URL", {
        filePath,
        message: error.message,
      });
      return res.status(404).json({ error: "File not found or inaccessible" });
    }

    return res
      .status(200)
      .json({ success: true, data: { url: data.signedUrl } });
  } catch (err) {
    logger.error("GetFileUrl: unexpected error", {
      filePath: req.body?.filePath,
      error: err instanceof Error ? err.message : err,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function DeleteCategory(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك حذف التصنيف" });
    }

    const { categoryId } = req.params;
    if (!categoryId) {
      return res
        .status(400)
        .json({ success: false, message: "معرف التصنيف مطلوب" });
    }

    const { data: fetchedCategory, error: catError } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .single();

    if (!fetchedCategory || catError)
      return res
        .status(404)
        .json({ success: false, message: "التصنيف غير موجود" });

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", categoryId);

    if (error) {
      // FK violation: books still reference this category
      if (error.code === "23503") {
        return res.status(409).json({
          success: false,
          message: "لا يمكن حذف التصنيف لوجود كتب مرتبطة به",
        });
      }
      logger.error(`error deleting category: ${error.message}`);
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء حذف التصنيف" });
    }

    return res.status(200).json({ success: true, message: "تم حذف التصنيف" });
  } catch (err: any) {
    logger.error(`DeleteCategory error: ${err.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function DeleteBook(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك حذف الكتاب" });
    }

    const { bookId } = req.params;
    if (!bookId) {
      return res
        .status(400)
        .json({ success: false, message: "معرف الكتاب مطلوب" });
    }

    const { data: book, error: fetchError } = await supabase
      .from("books")
      .select("id, storage_path")
      .eq("id", bookId)
      .single();

    if (!book || fetchError)
      return res
        .status(404)
        .json({ success: false, message: "الكتاب غير موجود" });

    const { error: storageError } = await supabase.storage
      .from("books")
      .remove([book.storage_path]);

    if (storageError) {
      logger.error(
        `DeleteBook: failed to remove file from storage: ${storageError.message}`,
        { bookId, storagePath: book.storage_path },
      );
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء حذف الملف" });
    }

    const { error: deleteError } = await supabase
      .from("books")
      .delete()
      .eq("id", bookId);

    if (deleteError) {
      // File is already gone from storage but the row remains — flag loudly, this is an inconsistent state
      logger.error(
        `DeleteBook: file removed from storage but DB delete failed (orphaned row): ${deleteError.message}`,
        { bookId, storagePath: book.storage_path },
      );
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء حذف بيانات الكتاب" });
    }

    return res.status(200).json({ success: true, message: "تم حذف الكتاب" });
  } catch (err: any) {
    logger.error(`DeleteBook error: ${err.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function UpdateBookInfo(req: AuthRequest, res: Response) {
  try {
    if (!req.token?.is_admin) {
      return res
        .status(403)
        .json({ success: false, message: "لا يمكنك تعديل بيانات الكتاب" });
    }

    const { bookId } = req.params;
    if (!bookId) {
      return res
        .status(400)
        .json({ success: false, message: "معرف الكتاب مطلوب" });
    }

    const { title, description, categoryId } = req.body;

    if (
      title === undefined &&
      description === undefined &&
      categoryId === undefined
    ) {
      return res
        .status(400)
        .json({ success: false, message: "لا يوجد بيانات لتحديثها" });
    }

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return res
        .status(400)
        .json({ success: false, message: "عنوان الكتاب غير صحيح" });
    }

    if (description !== undefined && typeof description !== "string") {
      return res
        .status(400)
        .json({ success: false, message: "الوصف غير صحيح" });
    }

    const updatePayload: Record<string, any> = {};
    if (title !== undefined) updatePayload.title = title.trim();
    if (description !== undefined) updatePayload.description = description;

    if (categoryId !== undefined) {
      if (typeof categoryId !== "string" || !categoryId.trim()) {
        return res
          .status(400)
          .json({ success: false, message: "التصنيف غير صحيح" });
      }

      const { data: fetchedCategory, error: catError } = await supabase
        .from("categories")
        .select("id")
        .eq("id", categoryId)
        .single();

      if (!fetchedCategory || catError)
        return res
          .status(404)
          .json({ success: false, message: "التصنيف غير صحيح أو تم حذفه" });

      updatePayload.category_id = fetchedCategory.id;
    }

    const { data: updatedBook, error } = await supabase
      .from("books")
      .update(updatePayload)
      .eq("id", bookId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // no row matched the filter
        return res
          .status(404)
          .json({ success: false, message: "الكتاب غير موجود" });
      }
      logger.error(`UpdateBookInfo: update failed: ${error.message}`, {
        bookId,
      });
      return res
        .status(500)
        .json({ success: false, message: "حدث خطأ أثناء تحديث بيانات الكتاب" });
    }

    return res.status(200).json({
      success: true,
      message: "تم تحديث بيانات الكتاب",
      book: updatedBook,
    });
  } catch (err: any) {
    logger.error(`UpdateBookInfo error: ${err.message}`);
    return res
      .status(500)
      .json({ success: false, message: "حدث خطأ في الخادم" });
  }
}
