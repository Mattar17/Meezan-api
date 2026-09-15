import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import logger from "../utils/logger.js"
import { AuthRequest } from "../types/AuthRequest.js";
import supabase from "../Services/supabaseClient.js";
import { createClientSchema, updateClientSchema } from "../ValidationSchemas/ClientSchema.js";

// POST /api/:officeId/clients
export const CreateClient = async (req: AuthRequest, res: Response) => {
    try {
        const officeId = req.params.officeId as string;
        const lawyerId = req.token?.lawyer_id
        console.log(lawyerId)


        const { data: office, error: officeFetchError } = await supabase.from("offices").select("owner_id").eq("id", officeId).single();

        if (officeFetchError) {
            if (officeFetchError.code === "PGRST116")
                return res.status(404).json({ success: false, message: "المكتب غير موجود" });
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء تحميل بيانات المكتب" });
        }
        if (!office) {
            return res.status(404).json({ success: false, message: "المكتب غير موجود" })
        }

        if (lawyerId !== office.owner_id)
            return res.status(403).json({ success: false, message: "لا يمكنك إضافة موكل لهذا المكتب" })

        const parsed = createClientSchema.safeParse(req.body);

        if (!parsed.success) {
            logger.error(`Invalid client data : ${JSON.stringify(parsed.error.flatten().fieldErrors)}`)

            return res.status(400).json({ success: false, message: "بيانات غير صالحة", errors: parsed.error.flatten().fieldErrors })
        }

        const { data: insertedClient, error: insertError } = await supabase
            .from("clients")
            .insert({ ...parsed.data, id: randomUUID(), office_id: officeId })
            .select("*")
            .single();

        if (insertError) {
            logger.error(`[insert client error] ${insertError.message}`)
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء إنشاء الموكل" })
        }

        return res.status(201).json({ success: true, data: insertedClient, message: "تم إنشاء الموكل بنجاح" })
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[CreateClient] server error ${message}`);
        return res.status(500).json({ success: false, message: "[create client] server error" })
    }
}

// GET /api/:officeId/clients
export const GetClients = async (req: AuthRequest, res: Response) => {
    try {
        const officeId = req.params.officeId as string;
        const lawyerId = req.token?.lawyer_id;

        const { data: office, error: officeError } = await supabase
            .from("offices")
            .select("owner_id")
            .eq("id", officeId)
            .single();

        if (officeError) {
            if (officeError.code === "PGRST116")
                return res.status(404).json({ success: false, message: "المكتب غير موجود" });
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء تحميل بيانات المكتب" });
        }
        if (!office) {
            return res.status(404).json({ success: false, message: "المكتب غير موجود" });
        }

        if (lawyerId !== office.owner_id)
            return res.status(403).json({ success: false, message: "لا يمكنك عرض موكلي هذا المكتب" });

        const { data: clients, error: fetchError } = await supabase
            .from("clients")
            .select("*")
            .eq("office_id", officeId);

        if (fetchError) {
            logger.error(`[GetClients] ${fetchError.message}`);
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء تحميل الموكلين" });
        }

        return res.status(200).json({ success: true, data: clients });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[GetClients] server error ${message}`);
        return res.status(500).json({ success: false, message: "خطأ في الخادم" });
    }
}

// GET /api/:officeId/clients/:clientId
export const GetClientById = async (req: AuthRequest, res: Response) => {
    try {
        const officeId = req.params.officeId as string;
        const clientId = req.params.clientId as string;
        const lawyerId = req.token?.lawyer_id;

        const { data: office, error: officeError } = await supabase
            .from("offices")
            .select("owner_id")
            .eq("id", officeId)
            .single();

        if (officeError) {
            if (officeError.code === "PGRST116")
                return res.status(404).json({ success: false, message: "المكتب غير موجود" });
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء تحميل بيانات المكتب" });
        }
        if (!office) {
            return res.status(404).json({ success: false, message: "المكتب غير موجود" });
        }

        if (lawyerId !== office.owner_id)
            return res.status(403).json({ success: false, message: "لا يمكنك عرض موكلي هذا المكتب" });

        const { data: client, error: fetchError } = await supabase
            .from("clients")
            .select("*")
            .eq("office_id", officeId)
            .eq("id", clientId)
            .single();

        if (fetchError) {
            if (fetchError.code === "PGRST116")
                return res.status(404).json({ success: false, message: "الموكل غير موجود" });
            logger.error(`[GetClientById] ${fetchError.message}`);
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء تحميل بيانات الموكل" });
        }
        if (!client) {
            return res.status(404).json({ success: false, message: "الموكل غير موجود" });
        }

        return res.status(200).json({ success: true, data: client });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[GetClientById] server error ${message}`);
        return res.status(500).json({ success: false, message: "خطأ في الخادم" });
    }
}

// PATCH /api/:officeId/clients/:clientId
export const UpdateClient = async (req: AuthRequest, res: Response) => {
    try {
        const officeId = req.params.officeId as string;
        const clientId = req.params.clientId as string;
        const lawyerId = req.token?.lawyer_id;

        const { data: office, error: officeError } = await supabase
            .from("offices")
            .select("owner_id")
            .eq("id", officeId)
            .single();

        if (officeError) {
            if (officeError.code === "PGRST116")
                return res.status(404).json({ success: false, message: "المكتب غير موجود" });
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء تحميل بيانات المكتب" });
        }
        if (!office) {
            return res.status(404).json({ success: false, message: "المكتب غير موجود" });
        }

        if (lawyerId !== office.owner_id)
            return res.status(403).json({ success: false, message: "لا يمكنك تعديل موكلي هذا المكتب" });

        const parsed = updateClientSchema.safeParse(req.body);

        if (!parsed.success) {
            logger.error(`Invalid client update data: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
            return res.status(400).json({ success: false, message: "بيانات غير صالحة", errors: parsed.error.flatten().fieldErrors });
        }

        const { data: updatedClient, error: updateError } = await supabase
            .from("clients")
            .update(parsed.data)
            .eq("office_id", officeId)
            .eq("id", clientId)
            .select("*")
            .single();

        if (updateError) {
            if (updateError.code === "PGRST116")
                return res.status(404).json({ success: false, message: "الموكل غير موجود" });
            logger.error(`[UpdateClient] ${updateError.message}`);
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء تعديل بيانات الموكل" });
        }
        if (!updatedClient) {
            return res.status(404).json({ success: false, message: "الموكل غير موجود" });
        }

        return res.status(200).json({ success: true, data: updatedClient, message: "تم تعديل بيانات الموكل بنجاح" });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[UpdateClient] server error ${message}`);
        return res.status(500).json({ success: false, message: "خطأ في الخادم" });
    }
}

// DELETE /api/:officeId/clients/:clientId
export const DeleteClient = async (req: AuthRequest, res: Response) => {
    try {
        const officeId = req.params.officeId as string;
        const clientId = req.params.clientId as string;
        const lawyerId = req.token?.lawyer_id;

        const { data: office, error: officeError } = await supabase
            .from("offices")
            .select("owner_id")
            .eq("id", officeId)
            .single();

        if (officeError) {
            if (officeError.code === "PGRST116")
                return res.status(404).json({ success: false, message: "المكتب غير موجود" });
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء تحميل بيانات المكتب" });
        }
        if (!office) {
            return res.status(404).json({ success: false, message: "المكتب غير موجود" });
        }

        if (lawyerId !== office.owner_id)
            return res.status(403).json({ success: false, message: "لا يمكنك حذف موكلي هذا المكتب" });

        const { data: deletedClient, error: deleteError } = await supabase
            .from("clients")
            .delete()
            .eq("office_id", officeId)
            .eq("id", clientId)
            .select("name")
            .single();

        if (deleteError) {
            if (deleteError.code === "PGRST116")
                return res.status(404).json({ success: false, message: "الموكل غير موجود أو تم حذفه بالفعل" });
            logger.error(`[DeleteClient] ${deleteError.message}`);
            return res.status(500).json({ success: false, message: "حدث خطأ أثناء حذف الموكل" });
        }
        if (!deletedClient) {
            return res.status(404).json({ success: false, message: "الموكل غير موجود أو تم حذفه بالفعل" });
        }

        return res.status(200).json({ success: true, message: `تم حذف الموكل "${deletedClient.name}"` });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[DeleteClient] server error ${message}`);
        return res.status(500).json({ success: false, message: "خطأ في الخادم" });
    }
}

// POST /api/offices/:officeId/clients/:clientId/documents
// POST /api/clients/:clientId/documents
// POST /api/clients/upload-documents
export const UploadDocuments = async (req: AuthRequest, res: Response) => {
    const filesToCleanup: string[] = [];

    try {
        const lawyerId = req.token?.lawyer_id
        if (!lawyerId) {
            return res.status(401).json({
                success: false,
                message: "غير مصرح، لا يوجد معرف للمحامي",
            });
        }

        const clientId = req.params.clientId as string

        if (!clientId) {
            return res.status(400).json({
                success: false,
                message: "معرّف الموكل مطلوب",
            });
        }

        // Check client existence
        const { data: client, error: clientFetchError } = await supabase
            .from("clients")
            .select("id, office_id")
            .eq("id", clientId)
            .single();

        if (clientFetchError) {
            if (clientFetchError.code === "PGRST116") {
                return res.status(404).json({
                    success: false,
                    message: "الموكل غير موجود",
                });
            }
            logger.error(`[UploadDocuments] Client fetch error: ${clientFetchError.message}`);
            return res.status(500).json({
                success: false,
                message: "حدث خطأ أثناء التحقق من بيانات الموكل",
            });
        }

        // If client belongs to an office, verify lawyer has access
        if (client.office_id) {
            const { data: office, error: officeError } = await supabase
                .from("offices")
                .select("owner_id")
                .eq("id", client.office_id)
                .single();

            if (!officeError && office && office.owner_id !== lawyerId && !req.token?.is_admin) {
                return res.status(403).json({
                    success: false,
                    message: "لا يمكنك رفع مستندات لهذا الموكل",
                });
            }
        }
        console.log(req.files);
        // Extract files from req.files or req.file
        const allFiles: Express.Multer.File[] = Array.isArray(req.files)
            ? req.files 
            : req.files && typeof req.files === "object"
            ? Object.values(req.files).flat()
            : req.file
            ? [req.file]
            : [];

        for (const f of allFiles) {
            if (f.path) {
                filesToCleanup.push(f.path);
            }
        }

        let nationalIdFile: Express.Multer.File | undefined;
        let passportFile: Express.Multer.File | undefined;

        for (const file of allFiles) {
            const field = file.fieldname.toLowerCase();
            if (field.includes("passport")) {
                passportFile = file;
            } else if (field.includes("national_id")) {
                nationalIdFile = file;
            }
        }

        if (!nationalIdFile && !passportFile) {
            return res.status(400).json({
                success: false,
                message: "يجب إرفاق صورة بطاقة الرقم القومي أو صورة جواز السفر أو كلاهما",
            });
        }

        const uploadFileToSupabase = async (
            file: Express.Multer.File,
            docType: "national_id" | "passport"
        ) => {
            const ext = path.extname(file.originalname) || ".jpg";
            const fileName = `${docType}${ext}`;
            const storagePath = `${lawyerId}/${clientId}/${fileName}`;

            const fileBuffer = file.buffer || fs.readFileSync(file.path);

            const { error: uploadError } = await supabase.storage
                .from("client_documents")
                .upload(storagePath, fileBuffer, {
                    contentType: file.mimetype,
                    upsert: true,
                });

            if (uploadError) {
                logger.error(`[UploadDocuments] Supabase upload error: ${uploadError.message}`);
                throw uploadError;
            }

            const { data: publicUrlData } = supabase.storage
                .from("client_documents")
                .getPublicUrl(storagePath);

            return {
                path: storagePath,
                fullPath: `client_documents/${storagePath}`,
                publicUrl: publicUrlData.publicUrl,
                fileName,
                mimetype: file.mimetype,
                size: file.size,
            };
        };

        const uploadedDocuments: {
            national_id?: Awaited<ReturnType<typeof uploadFileToSupabase>>;
            passport?: Awaited<ReturnType<typeof uploadFileToSupabase>>;
        } = {};

        if (nationalIdFile) {
            uploadedDocuments.national_id = await uploadFileToSupabase(
                nationalIdFile,
                "national_id"
            );
        }

        if (passportFile) {
            uploadedDocuments.passport = await uploadFileToSupabase(
                passportFile,
                "passport"
            );
        }

        return res.status(200).json({
            success: true,
            message: "تم رفع المستندات بنجاح",
            data: {
                lawyer_id: lawyerId,
                client_id: clientId,
                documents: uploadedDocuments,
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[UploadDocuments] server error: ${message}`);
        return res.status(500).json({
            success: false,
            message: "حدث خطأ أثناء رفع المستندات",
            error: message,
        });
    } finally {
        for (const filePath of filesToCleanup) {
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (unlinkErr) {
                    logger.error(`[UploadDocuments] Failed to delete temp file ${filePath}: ${unlinkErr}`);
                }
            }
        }
    }
};