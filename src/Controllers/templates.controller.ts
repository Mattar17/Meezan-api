import type { Response } from "express";
import express from "express";
import { OpenRouter } from "@openrouter/sdk";
import Handlebars from "handlebars";
import supabase from "../Services/supabaseClient.js";
import logger from "../utils/logger.js";
import { AuthRequest } from "../types/AuthRequest.js";
import { generatePdfFromHtml } from "../Services/pdfService.js";
import { fillPdfDocument, inspectPdfFormFields, autoDetectPlaceholderCoordinates } from "../Services/pdfLibService.js";
import { convertPdfBufferToHtmlTemplate, sanitizeHandlebarsTemplate } from "../Services/templateHtmlService.js";

// Prevent Handlebars from throwing "Missing helper" when malformed tags like {{اسم _ المحامي}} are encountered
Handlebars.registerHelper("helperMissing", function () {
  return "";
});
Handlebars.registerHelper("اسم", function () {
  return "";
});

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

/**
 * Extracts plain text from a PDF Buffer using pdf-parse
 */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import("pdf-parse");
    if (pdfModule.PDFParse) {
      const parser = new pdfModule.PDFParse({ data: buffer });
      const result = await parser.getText();
      if (typeof parser.destroy === "function") {
        await parser.destroy();
      }
      return result.text || "";
    } else if (typeof (pdfModule as any).default === "function") {
      const result = await (pdfModule as any).default(buffer);
      return result.text || "";
    } else if (typeof pdfModule === "function") {
      const result = await (pdfModule as any)(buffer);
      return result.text || "";
    }
    throw new Error("لم يتم العثور على محرك متوافق لاستخراج النصوص من ملف PDF");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[extractTextFromPdf] Error: ${message}`);
    throw new Error(`فشل قراءة ملف الـ PDF: ${message}`);
  }
}

/**
 * Extracts {{variable}} keys directly from Handlebars HTML
 */
function extractPlaceholdersFromHtml(html: string): string[] {
  const matches = [...html.matchAll(/\{\{([^{}\s#/>]+)\}\}/g)].map((m) => m[1].trim());
  return Array.from(new Set(matches)).filter(Boolean);
}

/**
 * Sanitizes unescaped control characters (\n, \r, \t) inside JSON string literals
 */
function sanitizeControlCharsInStrings(str: string): string {
  let result = "";
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (inString) {
      if (isEscaped) {
        result += char;
        isEscaped = false;
      } else if (char === "\\") {
        result += char;
        isEscaped = true;
      } else if (char === '"') {
        result += char;
        inString = false;
      } else if (char === "\n") {
        result += "\\n";
      } else if (char === "\r") {
        result += "\\r";
      } else if (char === "\t") {
        result += "\\t";
      } else if (char.charCodeAt(0) < 32) {
        result += " ";
      } else {
        result += char;
      }
    } else {
      result += char;
      if (char === '"') {
        inString = true;
      }
    }
  }
  return result;
}

/**
 * Robust extractor for AI template responses.
 * Handles valid JSON, unescaped newlines/tabs, unescaped quotes in HTML,
 * and recovers placeholders and Handlebars HTML even under malformed JSON syntax.
 */
function extractTemplateOutput(rawText: string): {
  handlebarsHtml: string;
  placeholders: string[];
} {
  let cleaned = rawText.trim();

  // 1. Strip markdown code fences if present
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 2. Try standard JSON.parse first
  try {
    let jsonCandidate = cleaned;
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonCandidate = cleaned.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonCandidate);
    const handlebarsHtml =
      parsed.handlebarsHtml || parsed.handlebars_content || parsed.html;
    if (handlebarsHtml && typeof handlebarsHtml === "string") {
      const placeholders = Array.isArray(parsed.placeholders)
        ? parsed.placeholders
        : extractPlaceholdersFromHtml(handlebarsHtml);
      return { handlebarsHtml, placeholders };
    }
  } catch (err) {
    logger.warn(`[extractTemplateOutput] Direct JSON parse failed, trying sanitizer...`);
  }

  // 3. Try sanitizing unescaped control characters in JSON strings
  try {
    const sanitized = sanitizeControlCharsInStrings(cleaned);
    const parsed = JSON.parse(sanitized);
    const handlebarsHtml =
      parsed.handlebarsHtml || parsed.handlebars_content || parsed.html;
    if (handlebarsHtml && typeof handlebarsHtml === "string") {
      const placeholders = Array.isArray(parsed.placeholders)
        ? parsed.placeholders
        : extractPlaceholdersFromHtml(handlebarsHtml);
      return { handlebarsHtml, placeholders };
    }
  } catch (err) {
    logger.warn(`[extractTemplateOutput] Sanitized JSON parse failed, attempting regex recovery...`);
  }

  // 4. Robust Regex Fallback (recovers HTML and placeholders even with unescaped quotes or raw newlines)
  let handlebarsHtml = "";
  const htmlMatch = cleaned.match(
    /"(?:handlebarsHtml|handlebars_content|html)"\s*:\s*"([\s\S]*?)(?="\s*,\s*"placeholders"|"\s*\}|$)/i,
  );

  if (htmlMatch && htmlMatch[1]) {
    handlebarsHtml = htmlMatch[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
  }

  let placeholders: string[] = [];
  const placeholdersMatch = cleaned.match(/"placeholders"\s*:\s*\[([\s\S]*?)\]/i);
  if (placeholdersMatch && placeholdersMatch[1]) {
    placeholders = [...placeholdersMatch[1].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)]
      .map((m) => m[1].replace(/\\"/g, '"').trim())
      .filter(Boolean);
  }

  // If placeholders list is empty or wasn't found, extract {{placeholders}} directly from HTML
  if (placeholders.length === 0 && handlebarsHtml) {
    placeholders = extractPlaceholdersFromHtml(handlebarsHtml);
  }

  if (!handlebarsHtml) {
    throw new Error("فشل استخراج كود قالب Handlebars من مخرجات الذكاء الاصطناعي");
  }

  return { handlebarsHtml, placeholders };
}

/**
 * Creates a new template:
 * - If a PDF file is uploaded, saves the master PDF into Supabase Storage 'templates' bucket
 *   under `{lawyer_id}/{timestamp}_{filename}.pdf`, preserving 100% of its visual structure,
 *   vector lines, logos, and fonts for pdf-lib stamping.
 * - Inspects AcroForm fields or accepts coordinate-based placeholders in req.body.placeholders.
 * - Supports fallback to rawArabicText + AI-generated Handlebars HTML.
 */
export async function CreateTemplate(req: AuthRequest, res: Response) {
  try {
    let rawArabicText = "";
    let pdfStoragePath: string | null = null;
    let templateType: "pdf" | "html" = "html";
    let acroFieldNames: string[] = [];

    const lawyerId = req.token?.lawyer_id || "general";

    // 1. Process uploaded PDF file or text body
    if (req.file) {
      const isPdf =
        req.file.mimetype === "application/pdf" ||
        req.file.originalname.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        return res.status(400).json({
          success: false,
          message: "يجب أن يكون الملف المرفوع بصيغة PDF",
        });
      }

      templateType = "pdf";

      // Save master PDF file to 'templates' bucket under lawyerId folder
      const timestamp = Date.now();
      const sanitizedName = (req.file.originalname || "template.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
      pdfStoragePath = `${lawyerId}/${timestamp}_${sanitizedName}`;

      logger.info(
        `[CreateTemplate] Uploading master PDF template to 'templates' bucket: ${pdfStoragePath} (${req.file.size} bytes)`
      );

      const { error: uploadMasterError } = await supabase.storage
        .from("templates")
        .upload(pdfStoragePath, req.file.buffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadMasterError) {
        logger.error(`[CreateTemplate] Failed to upload PDF template to 'templates' bucket: ${uploadMasterError.message}`);
        return res.status(500).json({
          success: false,
          message: `فشل رفع ملف القالب إلى وحدة التخزين (templates): ${uploadMasterError.message}`,
        });
      }

      // Check if the PDF has fillable AcroForm fields
      const formInfo = await inspectPdfFormFields(req.file.buffer);
      if (formInfo.hasForm) {
        acroFieldNames = formInfo.fieldNames;
        logger.info(
          `[CreateTemplate] Detected ${acroFieldNames.length} AcroForm fields in PDF: ${acroFieldNames.join(", ")}`
        );
      }

      // Attempt text extraction for searchability and AI placeholder assistance
      try {
        rawArabicText = await extractTextFromPdf(req.file.buffer);
      } catch (extractErr) {
        logger.warn(`[CreateTemplate] Could not extract text from PDF: ${extractErr}`);
      }
    } else if (
      req.body.rawArabicText &&
      typeof req.body.rawArabicText === "string" &&
      req.body.rawArabicText.trim()
    ) {
      rawArabicText = req.body.rawArabicText.trim();
      templateType = "html";
    } else {
      return res.status(400).json({
        success: false,
        message: "يرجى رفع ملف PDF في حقل 'file' أو إرسال النص القانوني في 'rawArabicText'",
      });
    }

    // 2. Extract or infer template title
    let title = req.body.title;
    if (!title || typeof title !== "string" || !title.trim()) {
      if (req.file?.originalname) {
        title = req.file.originalname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
      }
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "عنوان القالب مطلوب",
      });
    }

    // 3. Process Placeholders
    let placeholders: any = [];
    if (req.body.placeholders) {
      try {
        placeholders =
          typeof req.body.placeholders === "string"
            ? JSON.parse(req.body.placeholders)
            : req.body.placeholders;
      } catch {
        logger.warn(`[CreateTemplate] Failed to parse req.body.placeholders`);
      }
    }

    // Fallback to AcroForm field names if no explicit placeholders provided
    if ((!Array.isArray(placeholders) || placeholders.length === 0) && acroFieldNames.length > 0) {
      placeholders = acroFieldNames;
    }

    let handlebarsContent: string | null = null;

    // 4. Automatically convert uploaded PDF to 100% semantic Handlebars HTML template
    if (req.file) {
      try {
        const conv = await convertPdfBufferToHtmlTemplate(req.file.buffer, title);
        handlebarsContent = conv.handlebarsHtml;
        rawArabicText = conv.rawText;
        if (!placeholders || (Array.isArray(placeholders) && placeholders.length === 0)) {
          placeholders = conv.placeholders;
        }
        templateType = "html";
        logger.info(`[CreateTemplate] Auto-converted PDF to Handlebars HTML successfully.`);
      } catch (convErr) {
        logger.warn(`[CreateTemplate] PDF to HTML auto-conversion warning: ${convErr}`);
      }
    }

    // If placeholders list is still empty or this is an HTML-only template without Handlebars content, invoke AI
    const shouldInvokeAi =
      !handlebarsContent &&
      (!placeholders || (Array.isArray(placeholders) && placeholders.length === 0)) &&
      rawArabicText &&
      rawArabicText.trim();

    if (shouldInvokeAi) {
      logger.info(`[CreateTemplate] Sending extracted text to AI for template: "${title}"`);
      try {
        const aiResponse = await openrouter.chat.send({
          chatRequest: {
            models: [
              "qwen/qwen3.8-27b:free",
              "openrouter/free",
            ],
            messages: [
              {
                role: "system",
                content: `You are an assistant that converts raw Arabic legal text into a styled HTML Handlebars template for printing as an A4 PDF.
Follow these guidelines strictly:

1. Identify all dynamic placeholders (names, dates, case numbers, addresses, amounts).
2. Replace dynamic values with Arabic Handlebars keys using double curly braces: {{اسم_البائع}}, {{التاريخ}}. No spaces inside braces. Use underscores to join words.
3. Produce CLEAN, SEMANTIC HTML:
   - Wrap everything in ONE <div dir='rtl' style='font-family: Arial, sans-serif; font-size: 13pt; line-height: 1.9;'>
   - Each logical paragraph = ONE <p> tag. NEVER put a single word alone in its own <p> tag.
   - Use <table> for any columnar or side-by-side layout (e.g. header with office info on one side, date on the other).
   - Use <strong> for bold labels, <u> for underlines.
   - Do NOT add inline padding or margin on the outer div — the print wrapper already handles page margins.
4. CRUCIAL: Use SINGLE quotes (') for ALL HTML attribute values to keep the JSON valid.
5. Return ONLY a valid JSON object — no markdown, no explanation outside the JSON:
{
  "handlebarsHtml": "<div dir='rtl' style='font-family: Arial, sans-serif; font-size: 13pt; line-height: 1.9;'>...</div>",
  "placeholders": [
    { "key": "اسم_البائع", "label": "اسم البائع", "type": "text" },
    { "key": "التاريخ", "label": "التاريخ", "type": "date" }
  ]
}`,
              },
              {
                role: "user",
                content: `Convert this Arabic legal text into a template:\n\n${rawArabicText.trim()}`,
              },
            ],
          },
        });

        if (!(aiResponse instanceof ReadableStream)) {
          const messageContent = (aiResponse as any).choices?.[0]?.message?.content;
          if (typeof messageContent === "string") {
            try {
              const parsedTemplate = extractTemplateOutput(messageContent);
              handlebarsContent = parsedTemplate.handlebarsHtml;
              if (!placeholders || (Array.isArray(placeholders) && placeholders.length === 0)) {
                placeholders = parsedTemplate.placeholders;
              }
            } catch (pErr) {
              logger.warn(`[CreateTemplate] AI output parsing warning: ${pErr}`);
            }
          }
        }
      } catch (aiErr) {
        logger.warn(`[CreateTemplate] AI generation warning: ${aiErr}`);
        if (templateType === "html" && !handlebarsContent) {
          return res.status(502).json({
            success: false,
            message: "فشل استخراج القالب بواسطة الذكاء الاصطناعي",
          });
        }
      }
    }

    // 4. Save template in database
    const rawCategoryId = req.body.category_id || req.body.categoryId;
    const categoryId =
      rawCategoryId && typeof rawCategoryId === "string" && rawCategoryId.trim() && rawCategoryId !== "null" && rawCategoryId !== "undefined"
        ? rawCategoryId.trim()
        : null;

    const { data, error } = await supabase
      .from("templates")
      .insert([
        {
          title: title.trim(),
          raw_arabic_text: rawArabicText.trim() || null,
          handlebars_content: handlebarsContent,
          placeholders: placeholders || [],
          lawyer_id: lawyerId !== "general" ? lawyerId : null,
          pdf_storage_path: pdfStoragePath,
          template_type: templateType,
          category_id: categoryId,
        },
      ])
      .select("*, template_categories(id, name, description)")
      .single();

    if (error) {
      logger.error(`[CreateTemplate] Supabase insert error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل حفظ القالب في قاعدة البيانات" });
    }

    return res.status(201).json({
      success: true,
      message: "تم إضافة القالب ومعالجته بنجاح",
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[CreateTemplate] Error processing template: ${message}`);
    return res.status(500).json({ success: false, message: `تعذر معالجة وإضافة القالب: ${message}` });
  }
}

export async function GetAllTemplates(req: AuthRequest, res: Response) {
  try {
    const lawyerId = req.token?.lawyer_id;
    const categoryId = (req.query.categoryId || req.query.category_id) as string | undefined;

    let query = supabase
      .from("templates")
      .select("id, title, placeholders, template_type, pdf_storage_path, is_app_template, lawyer_id, category_id, created_at, template_categories(id, name, description)")
      .order("created_at", { ascending: false });

    if (categoryId && typeof categoryId === "string" && categoryId !== "all") {
      query = query.eq("category_id", categoryId);
    }

    if (lawyerId) {
      query = query.or(`lawyer_id.eq.${lawyerId},is_app_template.eq.true,lawyer_id.is.null`);
    } else {
      query = query.or(`is_app_template.eq.true,lawyer_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      logger.error(`[GetAllTemplates] fetch error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل تحميل القوالب" });
    }

    const myTemplates: any[] = [];
    const appTemplates: any[] = [];

    for (const t of data || []) {
      const templateItem = {
        ...t,
        category: t.template_categories || null,
      };

      if (t.is_app_template || !t.lawyer_id) {
        appTemplates.push(templateItem);
      } else if (lawyerId && t.lawyer_id === lawyerId) {
        myTemplates.push(templateItem);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        myTemplates,
        appTemplates,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetAllTemplates] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Admin creates an App Template:
 * - Admin uploads a master PDF with placeholders (e.g. {{اسم_المدعي}}, {{logo}})
 * - Admin provides title and optional placeholders list
 * - Saves master PDF to 'templates' bucket under `app_templates/{timestamp}_{filename}.pdf`
 * - Stored with `is_app_template = true` and `lawyer_id = null`
 */
export async function CreateAppTemplate(req: AuthRequest, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "يجب رفع ملف القالب بصيغة PDF في حقل 'file'",
      });
    }

    const isPdf =
      req.file.mimetype === "application/pdf" ||
      req.file.originalname.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return res.status(400).json({
        success: false,
        message: "يجب أن يكون الملف المرفوع بصيغة PDF",
      });
    }

    let title = req.body.title;
    if (!title || typeof title !== "string" || !title.trim()) {
      if (req.file.originalname) {
        title = req.file.originalname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim();
      }
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "عنوان القالب مطلوب",
      });
    }

    // Save master PDF to 'templates' bucket under app_templates folder
    const timestamp = Date.now();
    const sanitizedName = (req.file.originalname || "app_template.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
    const pdfStoragePath = `app_templates/${timestamp}_${sanitizedName}`;

    logger.info(`[CreateAppTemplate] Uploading master app template to 'templates' bucket: ${pdfStoragePath}`);

    const { error: uploadError } = await supabase.storage
      .from("templates")
      .upload(pdfStoragePath, req.file.buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      logger.error(`[CreateAppTemplate] Failed to upload PDF template: ${uploadError.message}`);
      return res.status(500).json({
        success: false,
        message: `فشل رفع ملف القالب إلى وحدة التخزين (templates): ${uploadError.message}`,
      });
    }

    // Parse placeholders from admin body if provided
    let adminPlaceholders: Array<{ key: string; label: string; type: string }> = [];
    if (req.body.placeholders) {
      try {
        let rawPh = req.body.placeholders;
        if (typeof rawPh === "string") {
          const trimmed = rawPh.trim();
          if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
            rawPh = JSON.parse(trimmed);
          } else {
            // Comma / newline separated string from admin input
            rawPh = trimmed
              .split(/[\n,،]+/)
              .map((s: string) => s.trim().replace(/^\{\{|\}\}$/g, ""))
              .filter(Boolean);
          }
        }
        if (Array.isArray(rawPh)) {
          adminPlaceholders = rawPh
            .map((item: any) => {
              if (typeof item === "string") {
                const key = item.trim().replace(/^\{\{|\}\}$/g, "").replace(/\s+/g, "_");
                const label = item.trim().replace(/^\{\{|\}\}$/g, "").replace(/_/g, " ");
                return {
                  key,
                  label,
                  type: key.includes("تاريخ") ? "date" : "text",
                };
              } else if (item && typeof item === "object" && item.key) {
                return {
                  key: String(item.key).trim().replace(/^\{\{|\}\}$/g, "").replace(/\s+/g, "_"),
                  label: item.label ? String(item.label).trim() : String(item.key).replace(/_/g, " "),
                  type: item.type || (String(item.key).includes("تاريخ") ? "date" : "text"),
                };
              }
              return null;
            })
            .filter((p): p is { key: string; label: string; type: string } => p !== null && p.key.length > 0);
        }
      } catch (e) {
        logger.warn(`[CreateAppTemplate] Failed to parse req.body.placeholders: ${e}`);
      }
    }

    let placeholders: Array<{ key: string; label: string; type: string }> = [...adminPlaceholders];

    // Check AcroForm fields
    const formInfo = await inspectPdfFormFields(req.file.buffer);
    if (placeholders.length === 0 && formInfo.hasForm && formInfo.fieldNames.length > 0) {
      placeholders = formInfo.fieldNames.map((name: string) => ({
        key: name.trim().replace(/\s+/g, "_"),
        label: name.trim().replace(/_/g, " "),
        type: name.includes("تاريخ") ? "date" : "text",
      }));
    }

    // Automatically convert uploaded PDF to 100% semantic Handlebars HTML template
    let rawArabicText = "";
    let handlebarsContent: string | null = null;
    try {
      const conv = await convertPdfBufferToHtmlTemplate(req.file.buffer, title);
      handlebarsContent = conv.handlebarsHtml;
      rawArabicText = conv.rawText;
      if (placeholders.length === 0) {
        placeholders = conv.placeholders;
      } else {
        // Prioritize admin-defined placeholders and merge any extra placeholders extracted by the parser
        const existingKeys = new Set(placeholders.map((p) => p.key));
        for (const convPh of conv.placeholders) {
          if (!existingKeys.has(convPh.key)) {
            placeholders.push(convPh);
            existingKeys.add(convPh.key);
          }
        }
      }
      logger.info(
        `[CreateAppTemplate] Auto-converted master PDF to Handlebars HTML with ${placeholders.length} placeholders.`
      );
    } catch (convErr) {
      logger.error(`[CreateAppTemplate] Error converting PDF to HTML template: ${convErr}`);
      try {
        rawArabicText = await extractTextFromPdf(req.file.buffer);
      } catch (extractErr) {
        logger.warn(`[CreateAppTemplate] Could not extract text from PDF: ${extractErr}`);
      }
    }

    // Insert into database with handlebars_content and template_type = "html"
    const rawCategoryId = req.body.category_id || req.body.categoryId;
    const categoryId =
      rawCategoryId && typeof rawCategoryId === "string" && rawCategoryId.trim() && rawCategoryId !== "null" && rawCategoryId !== "undefined"
        ? rawCategoryId.trim()
        : null;

    const { data, error } = await supabase
      .from("templates")
      .insert([
        {
          title: title.trim(),
          raw_arabic_text: rawArabicText.trim() || null,
          handlebars_content: handlebarsContent,
          placeholders: placeholders || [],
          lawyer_id: null,
          pdf_storage_path: pdfStoragePath,
          template_type: handlebarsContent ? "html" : "pdf",
          is_app_template: true,
          category_id: categoryId,
        },
      ])
      .select("*, template_categories(id, name, description)")
      .single();

    if (error) {
      logger.error(`[CreateAppTemplate] Supabase insert error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل حفظ قالب التطبيق في قاعدة البيانات" });
    }

    return res.status(201).json({
      success: true,
      message: "تم إضافة قالب التطبيق بنجاح",
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[CreateAppTemplate] Error: ${message}`);
    return res.status(500).json({ success: false, message: `تعذر إضافة قالب التطبيق: ${message}` });
  }
}

/**
 * List all app templates (Admin view, optional category filter)
 */
export async function GetAdminAppTemplates(req: AuthRequest, res: Response) {
  try {
    const categoryId = (req.query.categoryId || req.query.category_id) as string | undefined;

    let query = supabase
      .from("templates")
      .select("*, template_categories(id, name, description)")
      .eq("is_app_template", true)
      .order("created_at", { ascending: false });

    if (categoryId && typeof categoryId === "string" && categoryId !== "all") {
      query = query.eq("category_id", categoryId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error(`[GetAdminAppTemplates] fetch error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل تحميل قوالب التطبيق" });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetAdminAppTemplates] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Update an app template (Admin view - title, category_id, placeholders)
 */
export async function UpdateAppTemplate(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "معرف القالب مطلوب" });
    }

    const { title, category_id, categoryId, placeholders } = req.body;
    const catId = category_id !== undefined ? category_id : categoryId;

    const updatePayload: any = {};
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ success: false, message: "عنوان القالب غير صحيح" });
      }
      updatePayload.title = title.trim();
    }

    if (catId !== undefined) {
      updatePayload.category_id =
        catId && typeof catId === "string" && catId.trim() && catId !== "null" && catId !== "undefined"
          ? catId.trim()
          : null;
    }

    if (placeholders !== undefined && Array.isArray(placeholders)) {
      updatePayload.placeholders = placeholders;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ success: false, message: "لا توجد بيانات لتحديثها" });
    }

    const { data, error } = await supabase
      .from("templates")
      .update(updatePayload)
      .eq("id", id)
      .eq("is_app_template", true)
      .select("*, template_categories(id, name, description)")
      .single();

    if (error) {
      logger.error(`[UpdateAppTemplate] update error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل تحديث قالب التطبيق" });
    }

    return res.status(200).json({
      success: true,
      message: "تم تحديث قالب التطبيق بنجاح",
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[UpdateAppTemplate] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * List all template categories (Public/Authenticated)
 */
export async function GetAllTemplateCategories(req: AuthRequest, res: Response) {
  try {
    const { data, error } = await supabase
      .from("template_categories")
      .select("id, name, description, created_at, updated_at, templates(count)")
      .order("name", { ascending: true });

    if (error) {
      logger.error(`[GetAllTemplateCategories] fetch error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل تحميل أقسام القوالب" });
    }

    const categories = (data || []).map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      created_at: cat.created_at,
      updated_at: cat.updated_at,
      templatesCount: Array.isArray(cat.templates) && cat.templates[0] ? cat.templates[0].count : 0,
    }));

    return res.status(200).json({ success: true, data: categories });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetAllTemplateCategories] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Create a template category (Admin only)
 */
export async function CreateTemplateCategory(req: AuthRequest, res: Response) {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "اسم القسم مطلوب ويجب أن يكون نصاً صالحاً",
      });
    }

    const trimmedName = name.trim();
    const trimmedDesc = typeof description === "string" && description.trim() ? description.trim() : null;

    const { data, error } = await supabase
      .from("template_categories")
      .insert([
        {
          name: trimmedName,
          description: trimmedDesc,
        },
      ])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "هذا القسم موجود بالفعل",
        });
      }
      logger.error(`[CreateTemplateCategory] insert error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: `فشل إنشاء قسم القوالب: ${error.message}`,
      });
    }

    return res.status(201).json({
      success: true,
      message: "تم إنشاء قسم القوالب بنجاح",
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[CreateTemplateCategory] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Update a template category (Admin only)
 */
export async function UpdateTemplateCategory(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "معرف القسم مطلوب" });
    }

    const { name, description } = req.body;

    if (name === undefined && description === undefined) {
      return res.status(400).json({ success: false, message: "لا توجد بيانات لتحديثها" });
    }

    const updatePayload: { name?: string; description?: string | null; updated_at?: string } = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, message: "اسم القسم غير صحيح" });
      }
      updatePayload.name = name.trim();
    }

    if (description !== undefined) {
      updatePayload.description = typeof description === "string" && description.trim() ? description.trim() : null;
    }

    const { data, error } = await supabase
      .from("template_categories")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ success: false, message: "اسم هذا القسم مستخدم بالفعل" });
      }
      logger.error(`[UpdateTemplateCategory] update error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل تحديث قسم القوالب" });
    }

    return res.status(200).json({
      success: true,
      message: "تم تحديث قسم القوالب بنجاح",
      data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[UpdateTemplateCategory] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Delete a template category (Admin only)
 */
export async function DeleteTemplateCategory(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "معرف القسم مطلوب" });
    }

    const { error } = await supabase
      .from("template_categories")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error(`[DeleteTemplateCategory] delete error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل حذف قسم القوالب" });
    }

    return res.status(200).json({
      success: true,
      message: "تم حذف قسم القوالب بنجاح",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[DeleteTemplateCategory] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Delete an app template (Admin view)
 */
export async function DeleteAppTemplate(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "معرف القالب مطلوب" });
    }

    const { data: template } = await supabase
      .from("templates")
      .select("id, pdf_storage_path, is_app_template")
      .eq("id", id)
      .single();

    if (!template) {
      return res.status(404).json({ success: false, message: "قالب التطبيق غير موجود" });
    }

    if (template.pdf_storage_path) {
      try {
        await supabase.storage.from("templates").remove([template.pdf_storage_path]);
      } catch (storageErr) {
        logger.warn(`[DeleteAppTemplate] Failed to delete master PDF: ${storageErr}`);
      }
    }

    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) {
      logger.error(`[DeleteAppTemplate] delete error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل حذف قالب التطبيق" });
    }

    return res.status(200).json({ success: true, message: "تم حذف قالب التطبيق بنجاح" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[DeleteAppTemplate] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Retrieves logos previously uploaded by the lawyer
 */
export async function GetLawyerLogos(req: AuthRequest, res: Response) {
  try {
    const lawyerId = req.token?.lawyer_id;
    if (!lawyerId) {
      return res.status(401).json({ success: false, message: "غير مصرح" });
    }

    const { data, error } = await supabase
      .from("lawyer_logos")
      .select("*")
      .eq("lawyer_id", lawyerId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      logger.error(`[GetLawyerLogos] error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل تحميل الشعارات السابقة" });
    }

    return res.status(200).json({ success: true, data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetLawyerLogos] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Deletes a previously saved logo for the lawyer
 */
export async function DeleteLawyerLogo(req: AuthRequest, res: Response) {
  try {
    const lawyerId = req.token?.lawyer_id;
    const { id } = req.params;

    if (!lawyerId) {
      return res.status(401).json({ success: false, message: "غير مصرح" });
    }
    if (!id) {
      return res.status(400).json({ success: false, message: "معرف الشعار مطلوب" });
    }

    const { data: logoRow } = await supabase
      .from("lawyer_logos")
      .select("*")
      .eq("id", id)
      .eq("lawyer_id", lawyerId)
      .single();

    if (!logoRow) {
      return res.status(404).json({ success: false, message: "الشعار غير موجود" });
    }

    if (logoRow.storage_path) {
      try {
        await supabase.storage.from("lawyer-logos").remove([logoRow.storage_path]);
      } catch (err) {
        logger.warn(`[DeleteLawyerLogo] Storage remove warning: ${err}`);
      }
    }

    await supabase.from("lawyer_logos").delete().eq("id", id).eq("lawyer_id", lawyerId);

    return res.status(200).json({ success: true, message: "تم حذف الشعار بنجاح" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[DeleteLawyerLogo] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function GetTemplateById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "معرف القالب مطلوب" });
    }

    const { data, error } = await supabase
      .from("templates")
      .select("*, template_categories(id, name, description)")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, message: "القالب غير موجود" });
    }

    return res.status(200).json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GetTemplateById] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

export async function DeleteTemplate(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: "معرف القالب مطلوب" });
    }

    // Check if template has an associated PDF file in 'templates' bucket
    const { data: template } = await supabase
      .from("templates")
      .select("pdf_storage_path")
      .eq("id", id)
      .single();

    if (template?.pdf_storage_path) {
      try {
        await supabase.storage.from("templates").remove([template.pdf_storage_path]);
      } catch (storageErr) {
        logger.warn(`[DeleteTemplate] Failed to delete master PDF from storage: ${storageErr}`);
      }
    }

    const { error } = await supabase.from("templates").delete().eq("id", id);

    if (error) {
      logger.error(`[DeleteTemplate] delete error: ${error.message}`);
      return res.status(500).json({ success: false, message: "فشل حذف القالب" });
    }

    return res.status(200).json({ success: true, message: "تم حذف القالب بنجاح" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[DeleteTemplate] error: ${message}`);
    return res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

/**
 * Generates a compiled document from a stored template:
 * - If template is a PDF template (has pdf_storage_path or template_type === 'pdf'):
 *   Uses pdf-lib to preserve 100% of the PDF vector layout, logos, lines, and existing words,
 *   filling blanks via AcroForms or coordinates.
 * - If template is an HTML template: compiles Handlebars HTML and prints via Puppeteer.
 * - Uploads the generated PDF to Supabase Storage 'documents' bucket under `{lawyer_id}/{filename}.pdf`.
 * - Returns downloadable/viewable publicUrl and signedUrl.
 *
 * Route: POST /api/documents/:templateId
 */
export async function GenerateDocument(req: AuthRequest, res: Response) {
  try {
    const templateId = req.params.templateId || req.params.id;

    if (!templateId || typeof templateId !== "string") {
      return res.status(400).json({
        success: false,
        message: "معرف القالب (templateId) مطلوب",
      });
    }

    // Extract form values (supports { form: { ... } }, { formValues: { ... } }, or flat { ... })
    const body = req.body || {};
    let formValues: any = body;
    if (typeof body.form === "string") {
      try {
        formValues = JSON.parse(body.form);
      } catch {
        formValues = body;
      }
    } else if (body.form && typeof body.form === "object") {
      formValues = body.form;
    } else if (typeof body.formValues === "string") {
      try {
        formValues = JSON.parse(body.formValues);
      } catch {
        formValues = body;
      }
    } else if (body.formValues && typeof body.formValues === "object") {
      formValues = body.formValues;
    }

    // Unwrap if nested { form: { ... } } or { formValues: { ... } }
    if (formValues && typeof formValues === "object") {
      if (formValues.form && typeof formValues.form === "object") {
        formValues = formValues.form;
      } else if (formValues.formValues && typeof formValues.formValues === "object") {
        formValues = formValues.formValues;
      }
    }

    // Normalize keys: strip any {{ or }} from keys and keep both raw and stripped versions
    const normalizedFormValues: Record<string, any> = {};
    if (formValues && typeof formValues === "object") {
      for (const [k, v] of Object.entries(formValues)) {
        normalizedFormValues[k] = v;
        const stripped = k.replace(/^(\{\{|\{|\[|\}\})/, "").replace(/(\}\}|\}|\]|\{\{)$/, "").trim();
        normalizedFormValues[stripped] = v;
      }
      // Provide bidirectional aliases for common Arabic spelling variants
      if (normalizedFormValues["مبلغ_الأتعاب"] && !normalizedFormValues["مبلغ_األتعاب"]) {
        normalizedFormValues["مبلغ_األتعاب"] = normalizedFormValues["مبلغ_الأتعاب"];
      }
      if (normalizedFormValues["مبلغ_األتعاب"] && !normalizedFormValues["مبلغ_الأتعاب"]) {
        normalizedFormValues["مبلغ_الأتعاب"] = normalizedFormValues["مبلغ_األتعاب"];
      }
      if (normalizedFormValues["اسم_المحامي"]) {
        normalizedFormValues["اسم_احملامي"] = normalizedFormValues["اسم_المحامي"];
      }
      if (normalizedFormValues["اسم_الموكل"]) {
        normalizedFormValues["اسم_كلاملو"] = normalizedFormValues["اسم_الموكل"];
      }
      formValues = normalizedFormValues;
    }

    logger.info(`[GenerateDocument] Received form keys: ${Object.keys(formValues).filter(k => !k.startsWith("{")).join(", ")}`);

    // 1. Fetch template from Supabase
    const { data: template, error: templateError } = await supabase
      .from("templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      logger.warn(`[GenerateDocument] Template not found: ${templateId}`);
      return res.status(404).json({
        success: false,
        message: "القالب غير موجود",
      });
    }

    const lawyerId = req.token?.lawyer_id || "general";
    const timestamp = Date.now();
    const fileName = `${timestamp}_${template.id.slice(0, 8)}.pdf`;
    const storagePath = `${lawyerId}/${fileName}`;

    let pdfBuffer: Buffer;
    let finalHtml: string | undefined = undefined;

    const isPreview = req.query.preview === "true" || body.preview === true;

    // Process lawyer logo (uploaded from device or picked from saved logos)
    let logoBuffer: Buffer | null = null;
    let savedLogoId: string | null = body.savedLogoId || null;
    let logoPublicUrl: string | null = null;

    if (req.file) {
      try {
        const logoTimestamp = Date.now();
        const sanitizedLogoName = (req.file.originalname || "logo.png").replace(/[^a-zA-Z0-9._-]/g, "_");
        const logoStoragePath = `${lawyerId}/${logoTimestamp}_${sanitizedLogoName}`;

        let bucketName = "lawyer-logos";
        const { error: logoUploadError } = await supabase.storage
          .from(bucketName)
          .upload(logoStoragePath, req.file.buffer, {
            contentType: req.file.mimetype || "image/png",
            upsert: true,
          });

        if (logoUploadError) {
          logger.warn(`[GenerateDocument] Upload to lawyer-logos failed: ${logoUploadError.message}. Trying documents bucket.`);
          bucketName = "documents";
          await supabase.storage
            .from(bucketName)
            .upload(`logos/${logoStoragePath}`, req.file.buffer, {
              contentType: req.file.mimetype || "image/png",
              upsert: true,
            });
        }

        const { data: pubData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(bucketName === "documents" ? `logos/${logoStoragePath}` : logoStoragePath);

        logoPublicUrl = pubData?.publicUrl || null;
        logoBuffer = req.file.buffer;

        // Save into lawyer_logos table for suggestions in future creations
        if (lawyerId !== "general") {
          const { data: logoRow, error: insertLogoErr } = await supabase
            .from("lawyer_logos")
            .insert([
              {
                lawyer_id: lawyerId,
                storage_path: bucketName === "documents" ? `logos/${logoStoragePath}` : logoStoragePath,
                public_url: logoPublicUrl || "",
              },
            ])
            .select()
            .single();

          if (!insertLogoErr && logoRow) {
            savedLogoId = logoRow.id;
          }
        }
      } catch (uploadLogoCatch) {
        logger.warn(`[GenerateDocument] Logo upload error: ${uploadLogoCatch}`);
      }
    } else if (body.savedLogoId) {
      try {
        const { data: savedLogoRow, error: fetchLogoErr } = await supabase
          .from("lawyer_logos")
          .select("*")
          .eq("id", body.savedLogoId)
          .single();

        if (savedLogoRow && !fetchLogoErr) {
          savedLogoId = savedLogoRow.id;
          logoPublicUrl = savedLogoRow.public_url;

          // Download image buffer for PDF stamping
          const { data: logoBlob } = await supabase.storage
            .from("lawyer-logos")
            .download(savedLogoRow.storage_path);

          if (logoBlob) {
            logoBuffer = Buffer.from(await logoBlob.arrayBuffer());
          } else {
            const { data: docBlob } = await supabase.storage
              .from("documents")
              .download(savedLogoRow.storage_path);
            if (docBlob) {
              logoBuffer = Buffer.from(await docBlob.arrayBuffer());
            }
          }
        }
      } catch (fetchSavedLogoErr) {
        logger.warn(`[GenerateDocument] Failed to load saved logo: ${fetchSavedLogoErr}`);
      }
    }

    // 2. Determine rendering strategy:
    //    Priority 1 → handlebars_content exists → always use Handlebars + Puppeteer (best Arabic support).
    //    Auto-upgrade → If legacy PDF template has no handlebars_content, convert it now so it renders with Puppeteer.
    if (!template.handlebars_content && template.pdf_storage_path) {
      try {
        logger.info(
          `[GenerateDocument] Auto-generating Handlebars HTML for template "${template.title}" (${template.id})`
        );
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from("templates")
          .download(template.pdf_storage_path);

        if (fileBlob && !downloadError) {
          const masterBuffer = Buffer.from(await fileBlob.arrayBuffer());
          const conv = await convertPdfBufferToHtmlTemplate(masterBuffer, template.title);
          template.handlebars_content = conv.handlebarsHtml;
          template.template_type = "html";

          // Persist the generated HTML into Supabase so subsequent calls skip conversion
          await supabase
            .from("templates")
            .update({
              handlebars_content: conv.handlebarsHtml,
              template_type: "html",
              raw_arabic_text: conv.rawText || template.raw_arabic_text,
            })
            .eq("id", template.id);

          logger.info(`[GenerateDocument] Upgraded template ${template.id} to Handlebars HTML successfully.`);
        }
      } catch (autoConvErr) {
        logger.warn(`[GenerateDocument] Auto-generating HTML template failed: ${autoConvErr}`);
      }
    }

    const useHandlebars = !!template.handlebars_content;
    const usePdfLib = !useHandlebars && (!!template.pdf_storage_path || template.template_type === "pdf");

    if (useHandlebars) {
      logger.info(`[GenerateDocument] Rendering via Handlebars + Puppeteer for template: "${template.title}"`);

      // Provide base64 data URI so Puppeteer embeds the logo directly without external network requests
      if (logoBuffer) {
        const mime = req.file?.mimetype || "image/png";
        const logoDataUri = `data:${mime};base64,${logoBuffer.toString("base64")}`;
        formValues.logo_url = logoDataUri;
        formValues.logo = logoDataUri;
      } else if (logoPublicUrl) {
        formValues.logo_url = logoPublicUrl;
        formValues.logo = logoPublicUrl;
      } else {
        formValues.logo_url = null;
        formValues.logo = null;
      }

      // If user modified the text directly in preview ("تعديل النص"), use their custom/edited HTML
      const editedHtml = body.customHtml || body.editedHtml || (body.html && !body.form ? body.html : null);
      if (editedHtml && typeof editedHtml === "string" && editedHtml.trim()) {
        logger.info(`[GenerateDocument] Using user-edited HTML for template: "${template.title}"`);
        finalHtml = sanitizeHandlebarsTemplate(editedHtml);
      } else {
        // Sanitize template HTML to fix malformed tags, tabs, and prevent helperMissing errors
        const cleanTemplateContent = sanitizeHandlebarsTemplate(template.handlebars_content || "");

        // Self-heal template in Supabase asynchronously if changes were made
        if (cleanTemplateContent !== template.handlebars_content) {
          supabase
            .from("templates")
            .update({ handlebars_content: cleanTemplateContent })
            .eq("id", template.id)
            .then(({ error: patchErr }) => {
              if (patchErr) logger.warn(`[GenerateDocument] Self-heal template warning: ${patchErr.message}`);
              else logger.info(`[GenerateDocument] Self-healed template "${template.id}" in database.`);
            });
        }

        const compiledFunction = Handlebars.compile(cleanTemplateContent);
        finalHtml = compiledFunction(formValues);
      }

      if (isPreview) {
        return res.status(200).json({
          success: true,
          message: "تم توليد معاينة المستند بنجاح",
          html: finalHtml,
          data: {
            templateId: template.id,
            title: template.title,
            html: finalHtml,
          },
        });
      }

      logger.info(`[GenerateDocument] Converting HTML to PDF via Puppeteer for template: "${template.title}"`);
      pdfBuffer = await generatePdfFromHtml(finalHtml, template.title);

    } else if (usePdfLib) {
      logger.info(
        `[GenerateDocument] Rendering via pdf-lib (no handlebars_content). Master PDF: ${template.pdf_storage_path}`
      );

      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from("templates")
        .download(template.pdf_storage_path!);

      if (downloadError || !fileBlob) {
        logger.error(`[GenerateDocument] Error downloading master PDF template: ${downloadError?.message}`);
        return res.status(500).json({
          success: false,
          message: `تعذر تحميل ملف القالب الأساسي من وحدة التخزين (templates): ${downloadError?.message || "الملف غير موجود"}`,
        });
      }

      const masterBuffer = Buffer.from(await fileBlob.arrayBuffer());

      const coordinates = body.coordinates || (Array.isArray(body.placeholders) ? body.placeholders : undefined);
      const replacements = body.replacements;

      pdfBuffer = await fillPdfDocument({
        originalPdfBuffer: masterBuffer,
        placeholders: template.placeholders,
        formValues,
        coordinates,
        replacements,
        logoBuffer,
      });

      if (isPreview) {
        return res.status(200).json({
          success: true,
          message: "تم توليد معاينة المستند بنجاح",
          pdfBase64: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
          data: {
            templateId: template.id,
            title: template.title,
            pdfBase64: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
          },
        });
      }

    } else {
      return res.status(400).json({
        success: false,
        message: "محتوى القالب فارغ أو غير صالح — لا يوجد handlebars_content ولا pdf_storage_path",
      });
    }

    // 3. Upload generated PDF to Supabase Storage 'documents' bucket under lawyerId folder
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      logger.error(`[GenerateDocument] Supabase Storage upload error: ${uploadError.message}`);
      return res.status(500).json({
        success: false,
        message: `فشل رفع المستند إلى وحدة التخزين (documents): ${uploadError.message}`,
      });
    }

    // 4. Get Public URL and 7-day Signed URL
    const { data: publicUrlData } = supabase.storage
      .from("documents")
      .getPublicUrl(storagePath);

    const { data: signedData } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days

    const pdfUrl = signedData?.signedUrl || publicUrlData?.publicUrl;

    logger.info(`[GenerateDocument] Document generated and uploaded to documents: ${storagePath}`);

    return res.status(200).json({
      success: true,
      message: "تم توليد وحفظ المستند بنجاح",
      pdfUrl,
      publicUrl: publicUrlData?.publicUrl,
      signedUrl: signedData?.signedUrl,
      storagePath,
      savedLogoId,
      html: finalHtml,
      data: {
        templateId: template.id,
        title: template.title,
        storagePath,
        pdfUrl,
        publicUrl: publicUrlData?.publicUrl,
        signedUrl: signedData?.signedUrl,
        savedLogoId,
        html: finalHtml,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[GenerateDocument] Error: ${message}`);
    return res.status(500).json({
      success: false,
      message: `حدث خطأ أثناء توليد المستند: ${message}`,
      error: message,
    });
  }
}

// Backward compatibility alias
export const GenerateContract = GenerateDocument;
