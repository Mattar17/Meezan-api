import { OpenRouter } from "@openrouter/sdk";
import logger from "../utils/logger.js";

const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

/**
 * Normalizes Arabic text extracted from PDFs.
 * Handles PDFs that store Arabic characters using Presentation Forms-A/B in visual RTL order.
 * Restores them to standard Unicode Arabic in logical reading order.
 */
export function normalizeAndUnshapeArabicText(rawText: string): string[] {
  const lines = rawText.split(/\r?\n/);
  const unshapedLines: string[] = [];

  const hasPresentationForms = /[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(rawText);

  for (let rawLine of lines) {
    let line = rawLine.replace(/[\t\r]+/g, " ").trim();
    if (!line) continue;

    // Skip vertical margin stamps, page metadata, and date headers
    if (
      /^(?:عقد|أتعاب|محام[يى]|حمامي)$/.test(line) ||
      /^بتاريخ[\s\d\-_]*$/.test(line) ||
      /^\d{4}$/.test(line) ||
      /Page \d+ of \d+/i.test(line) ||
      /-- \d+ of \d+ --/.test(line) ||
      /^\d{4}-\d{1,2}-\d{1,2}$/.test(line) ||
      /^\{\{[\s\t]*logo[\s\t]*\}\}$/i.test(line) ||
      /^\{\{[\s\t]*شعار[\s\t]*\}\}$/i.test(line)
    ) {
      continue;
    }

    // Clean any malformed placeholders in line
    line = line.replace(/\{\{([^{}]+)\}\}/g, (_match, p1) => {
      let key = p1
        .trim()
        .replace(/[\t\r\n]+/g, " ")
        .replace(/\s*_\s*/g, "_")
        .replace(/\s+/g, "_")
        .replace(/^_+|_+$/g, "");
      key = key
        .replace(/احملامي/g, "المحامي")
        .replace(/كلاملو/g, "الموكل")
        .replace(/األتعاب/g, "الأتعاب")
        .replace(/األ/g, "الأ")
        .replace(/القید/g, "القيد")
        .replace(/السید/g, "السيد")
        .replace(/المقیم/g, "المقيم")
        .replace(/التاریخ/g, "التاريخ");
      return `{{${key}}}`;
    });

    // If no presentation forms and not starting with a misplaced colon, keep as-is
    const isVisualRtl = hasPresentationForms || (line.startsWith(":") && /[\u0600-\u06FF]/.test(line));

    if (!isVisualRtl) {
      unshapedLines.push(line);
      continue;
    }

    // 1. Normalize NFKC to map Presentation Forms to base Unicode characters
    const normalized = line.normalize("NFKC");

    // 2. Tokenize placeholders so their braces and internal structure are protected
    const placeholders: string[] = [];
    const tokenized = normalized.replace(/\{\{([^{}]+)\}\}/g, (_match, p1) => {
      let key = p1.trim();
      // If characters are reversed, reverse back e.g. ﻲﻣﺎﺤﻤﻟا_ﻢﺳا -> اسم_المحامي
      if (/^[\u0600-\u06FF_]+$/.test(key)) {
        key = key.split("").reverse().join("");
      }
      // Common Arabic placeholder key cleanup
      key = key
        .replace(/عنونا/g, "عنوان")
        .replace(/األتعاب/g, "الأتعاب")
        .replace(/قضیة/g, "قضية")
        .replace(/التاریخ/g, "التاريخ")
        .replace(/رقم_القید/g, "رقم_القيد")
        .replace(/احملامي/g, "المحامي")
        .replace(/كلاملو/g, "الموكل");

      const id = `___PH_${placeholders.length}___`;
      placeholders.push(`{{${key}}}`);
      return id;
    });

    // 3. Reverse the line characters to restore logical reading order
    let reversed = tokenized.split("").reverse().join("");

    // 4. Re-insert preserved placeholders
    placeholders.forEach((ph, idx) => {
      const revId = `___PH_${idx}___`.split("").reverse().join("");
      reversed = reversed.replace(revId, ph);
    });

    // 5. Fix numbers & punctuation formatting
    reversed = reversed.replace(/(\d+)\s*\.\s*/g, "$1. ");
    reversed = reversed.replace(/\)\s*([^\(\)]+?)\s*\(/g, "($1)");

    // 6. Fix Arabic reverse-ligature artifacts from PDF text stream decoders
    reversed = reversed
      .replace(/األلو/g, "الأول")
      .replace(/الألو/g, "الأول")
      .replace(/األ/g, "الأ")
      .replace(/إو/g, "وإ")
      .replace(/اول/g, "وال")
      .replace(/اتءا/g, "إجرا")
      .replace(/اتد/g, "دات")
      .replace(/اتل/g, "لات")
      .replace(/طوریقة/g, "طريقة")
      .replace(/السددا/g, "السداد")
      .replace(/وسددا/g, "وسداد")
      .replace(/المقرةر/g, "المقررة")
      .replace(/عنونا/g, "عنوان")
      .replace(/صدرو/g, "صدور")
      .replace(/اللزمو/g, "اللزوم")
      .replace(/نأ/g, "أن")
      .replace(/لوأ/g, "أول")
      .replace(/أوتعاب/g, "وأتعاب")
      .replace(/قضیة/g, "قضية")
      .replace(/المقید/g, "المقيد")
      .replace(/السید/g, "السيد")
      .replace(/المقیم/g, "المقيم")
      .replace(/القانونیة/g, "القانونية")
      .replace(/نھائي/g, "نهائي")
      .replace(/نسختین/g, "نسختين")
      .replace(/الطرفین/g, "الطرفين")
      .replace(/بین/g, "بين")
      .replace(/وتوكیل/g, "وتوكيل")
      .replace(/النزعا/g, "النزاع")
      .replace(/المتدلوا/g, "المتداول")
      .replace(/اإلجراءتا/g, "الإجراءات")
      .replace(/المستندتا/g, "المستندات")
      .replace(/الالزمة/g, "اللازمة")
      .replace(/وقدهر/g, "وقدره")
      .replace(/االتفاق/g, "الاتفاق")
      .replace(/وأالً/g, "أولاً")
      .replace(/ثانیاً/g, "ثانياً")
      .replace(/إنھ/g, "إنه")
      .replace(/یوم/g, "يوم")
      .replace(/یعتبر/g, "يعتبر")
      .replace(/یلتزم/g, "يلتزم")
      .replace(/یتم/g, "يتم")
      .replace(/توقیع/g, "توقيع");

    unshapedLines.push(reversed.trim());
  }

  return unshapedLines;
}

/**
 * Sanitizes Handlebars HTML content:
 * - Strips rogue standalone {{logo}} tags
 * - Fixes malformed placeholder tags with embedded tabs or spaces (e.g. {{\tاسم\t_\tاحملامي\t}} -> {{اسم_المحامي}})
 * - Normalizes known Arabic OCR key corruptions (احملامي -> المحامي, كلاملو -> الموكل, األتعاب -> الأتعاب)
 * - Removes duplicated inline signature blocks from clauses if present
 */
export function sanitizeHandlebarsTemplate(content: string): string {
  if (!content || typeof content !== "string") return "";

  let cleaned = content;

  // 1. Remove standalone {{logo}} or {{\tlogo\t}} if not part of #if block
  cleaned = cleaned.replace(/\{\{[\s\t]*logo[\s\t]*\}\}/gi, "");

  // 2. Clean all {{ ... }} tags
  cleaned = cleaned.replace(/\{\{([^{}]+)\}\}/g, (match, rawInner) => {
    const trimmed = rawInner.trim();

    // Preserve block helpers and built-ins
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("/") ||
      trimmed === "else" ||
      trimmed.startsWith(">")
    ) {
      return match;
    }

    // Collapse tabs, newlines, and spaces around underscores
    let key = trimmed
      .replace(/[\t\r\n]+/g, " ")
      .replace(/\s*_\s*/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^_+|_+$/g, "");

    // Fix common Arabic PDF extractor corruptions in variable keys
    key = key
      .replace(/احملامي/g, "المحامي")
      .replace(/كلاملو/g, "الموكل")
      .replace(/األتعاب/g, "الأتعاب")
      .replace(/األ/g, "الأ")
      .replace(/القید/g, "القيد")
      .replace(/السید/g, "السيد")
      .replace(/المقیم/g, "المقيم")
      .replace(/التاریخ/g, "التاريخ");

    return `{{${key}}}`;
  });

  // 3. Remove inline signature noise that leaked into clauses (since table already exists)
  cleaned = cleaned.replace(
    /\(?\s*توقيع\s*[\t\s]*الطرف\s*[\t\s]*(?:الأول|األول)\s*\)?[\s\S]*?(?:<\/p>|$)/i,
    "</p>"
  );

  return cleaned;
}

/**
 * Builds a structured, responsive Handlebars HTML template from unshaped text lines.
 */
export function generateSemanticHtmlFromPdfText(
  lines: string[],
  docTitle?: string
): { html: string; placeholders: Array<{ key: string; label: string; type: string }> } {
  let title = docTitle || "";
  const bodyLines: string[] = [];
  const signatureLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      /\{\{[\s\t]*logo[\s\t]*\}\}/i.test(line) ||
      /\{\{[\s\t]*شعار[\s\t]*\}\}/i.test(line) ||
      line.includes("{{logo}}") ||
      line.includes("{{الشعار}}") ||
      line.includes("{{شعار}}")
    ) {
      continue;
    }

    if (
      /^(?:عقد|أتعاب|محام[يى]|حمامي)$/.test(line.trim()) ||
      /^بتاريخ[\s\d\-_]*$/.test(line.trim()) ||
      /^\d{4}$/.test(line.trim()) ||
      line.includes("Page 1 of") ||
      line.includes("1 fo 1")
    ) {
      continue;
    }

    // Only match actual signature blocks, not "عند التوقيع على هذا العقد"
    const isSignatureBlock =
      /\(?\s*توقيع\s*[\s\t]+الطرف/i.test(line) ||
      /توقيع\s+الطرف\s+(?:الأول|األول|الثاني|الثاين)/i.test(line) ||
      /\(?\s*توقيع\s+(?:الموكل|المحامي)\)?/i.test(line) ||
      /(?:الأستاذ|األستاذ)\s*\/[\s\S]*?(?:السيد)\s*\//i.test(line);

    if (isSignatureBlock) {
      signatureLines.push(line);
      continue;
    }

    // Extract title (ignore 1-word margin stamps)
    if (!title || title.split(/\s+/).length < 2) {
      if (line.includes("عقد") || line.includes("اتفاق") || line.includes("دعوى") || line.includes("إعلان") || line.includes("توكيل")) {
        const candidate = line.replace(/\{\{[^}]+\}\}/g, "").replace(/[\t\r\n]+/g, " ").trim();
        if (candidate.split(/\s+/).length >= 2) {
          title = candidate;
          continue;
        }
      }
    }

    bodyLines.push(line);
  }

  const fullBodyText = bodyLines.join(" ");

  // Split on clause markers like "البند الأول", "البند الثاني", etc.
  const clauseSplitRegex = /(البند\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)[^\:]*\:)/g;
  const rawParts = fullBodyText.split(clauseSplitRegex);
  const clauses: Array<{ isIntro: boolean; heading?: string; content?: string; text?: string }> = [];

  if (rawParts.length > 1) {
    if (rawParts[0].trim()) {
      clauses.push({ isIntro: true, text: rawParts[0].trim() });
    }
    for (let j = 1; j < rawParts.length; j += 2) {
      const heading = rawParts[j].trim();
      const content = (rawParts[j + 1] || "").trim();
      clauses.push({ isIntro: false, heading, content });
    }
  } else {
    clauses.push({ isIntro: true, text: fullBodyText.trim() });
  }

  const clausesHtml = clauses
    .map((c) => {
      if (c.isIntro) {
        // Split intro text into distinct semantic lines for parties and dates
        const introLines = c.text!
          .split(/(?=(?:أولاً|ثانياً|\(طرف\s+أول|\(طرف\s+ثان|إنه\s+في|تم\s+الاتفاق))\s*/)
          .map((l) => l.trim())
          .filter(Boolean);

        return introLines
          .map((l) => {
            const isPartyHeader = l.startsWith("أولاً") || l.startsWith("ثانياً");
            const isPartyRole = l.includes("طرف أول") || l.includes("طرف ثان");
            const marginTop = isPartyHeader ? "10px" : "0";
            const marginBottom = isPartyRole ? "10px" : "4px";
            const fontWeight = isPartyHeader ? "bold" : "normal";
            const color = isPartyRole ? "#334155" : "#1e293b";
            return `    <div style="margin-top: ${marginTop}; margin-bottom: ${marginBottom}; font-weight: ${fontWeight}; color: ${color}; font-size: 14pt; line-height: 1.9;">${l}</div>`;
          })
          .join("\n");
      } else {
        // Format numbered sub-items (e.g. "1. ..." and "2. ...") onto separate indented lines
        const contentParts = c.content!.split(/(?=\d+\s*\.\s*)/g);
        const formattedContent = contentParts
          .map((cp, idx) => {
            const trimmed = cp.trim();
            if (idx === 0) return trimmed;
            return `<div style="margin-right: 18px; margin-top: 4px; margin-bottom: 4px;">${trimmed}</div>`;
          })
          .join("\n");

        return `    <div style="margin-top: 14px; margin-bottom: 14px; text-align: justify; text-justify: inter-word; font-size: 14pt; line-height: 1.95;"><strong style="color: #0f172a;">${c.heading}</strong> ${formattedContent}</div>`;
      }
    })
    .join("\n");

  const signaturesHtml = `
    <table style="width: 100%; margin-top: 50px; border-collapse: collapse; border: none; font-size: 14pt;">
      <tr>
        <td style="width: 50%; text-align: center; border: none; vertical-align: top; padding: 12px;">
          <div style="font-weight: bold; color: #0d1b2a; margin-bottom: 8px;">(توقيع الطرف الأول)</div>
          <div style="color: #334155;">الأستاذ / {{اسم_المحامي}}</div>
          <div style="margin-top: 35px; border-top: 1.5px dashed #b8975a; width: 75%; margin-left: auto; margin-right: auto;"></div>
        </td>
        <td style="width: 50%; text-align: center; border: none; vertical-align: top; padding: 12px;">
          <div style="font-weight: bold; color: #0d1b2a; margin-bottom: 8px;">(توقيع الطرف الثاني)</div>
          <div style="color: #334155;">السيد / {{اسم_الموكل}}</div>
          <div style="margin-top: 35px; border-top: 1.5px dashed #b8975a; width: 75%; margin-left: auto; margin-right: auto;"></div>
        </td>
      </tr>
    </table>`;

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 18mm 18mm 18mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: 'Traditional Arabic', 'Amiri', 'Cairo', 'Segoe UI', Tahoma, sans-serif;
      direction: rtl;
      text-align: right;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 14pt;
      line-height: 2.15;
    }
    .document-container {
      width: 100%;
      margin: 0 auto;
      position: relative;
    }
    /* Meezan App Identity Header */
    .brand-top-bar {
      border-top: 4px solid #0d1b2a;
      border-bottom: 2px solid #b8975a;
      padding: 6px 0 10px 0;
      margin-bottom: 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-identity-title {
      font-size: 11pt;
      font-weight: bold;
      color: #0d1b2a;
      letter-spacing: 0.5px;
    }
    .brand-identity-gold {
      color: #b8975a;
      font-weight: bold;
    }
    .header-logo {
      text-align: center;
      margin-bottom: 18px;
    }
    .header-logo img {
      max-height: 85px;
      max-width: 220px;
      object-fit: contain;
    }
    /* Meezan Signature Title */
    .document-title {
      text-align: center;
      font-size: 22pt;
      font-weight: bold;
      color: #0d1b2a;
      margin-top: 0;
      margin-bottom: 25px;
      padding-bottom: 12px;
      border-bottom: 3px double #b8975a;
      letter-spacing: 0.5px;
    }
    p {
      margin: 0 0 16px 0;
      text-align: justify;
      text-justify: inter-word;
      color: #1e293b;
    }
    strong {
      color: #0d1b2a;
      font-weight: bold;
    }
    /* Meezan Document Footer */
    .document-footer {
      margin-top: 45px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5pt;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="document-container">
    {{#if logo_url}}
    <div class="header-logo">
      <img src="{{logo_url}}" alt="شعار المكتب" />
    </div>
    {{else}}
    <div class="header-logo"></div>
    {{/if}}

    <div style="border-top: 2.5px solid #1e3a8a; margin-bottom: 20px;"></div>

    <h1 class="document-title">${title || "عقد اتفاق وأتعاب محاماة وتوكيل"}</h1>

${clausesHtml}

    <div style="border-top: 2.5px solid #1e3a8a; margin-top: 30px; margin-bottom: 16px;"></div>

${signaturesHtml}

    <div class="document-footer">
      <span>تم الإصدار والتوثيق عبر تطبيق ميزان للخدمات القانونية</span>
      <span style="color: #b8975a; font-weight: bold;">MEEZAN LEGAL SYNC</span>
    </div>
  </div>
</body>
</html>`;

  const cleanHtml = sanitizeHandlebarsTemplate(html);

  // Extract all placeholders from the final HTML
  const matches = [...cleanHtml.matchAll(/\{\{([^{}\s#/>]+)\}\}/g)].map((m) => m[1].trim());
  const extractedKeys = Array.from(new Set(matches)).filter(
    (k) =>
      k !== "logo_url" &&
      k !== "logo" &&
      k !== "شعار" &&
      k !== "الشعار" &&
      k !== "else" &&
      k !== "if" &&
      !k.startsWith("#") &&
      !k.startsWith("/")
  );

  const placeholders = extractedKeys.map((key) => ({
    key,
    label: key.replace(/_/g, " "),
    type: key.includes("تاريخ") ? "date" : "text",
  }));

  return { html: cleanHtml, placeholders };
}

/**
 * Extracts plain text from a PDF Buffer using pdf-parse
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import("pdf-parse");
    if (pdfModule.PDFParse) {
      const parser = new (pdfModule.PDFParse as any)({ data: buffer });
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
 * Master function: Converts an uploaded PDF Buffer into a 100% Handlebars HTML template.
 */
export async function convertPdfBufferToHtmlTemplate(
  pdfBuffer: Buffer,
  docTitle?: string
): Promise<{
  handlebarsHtml: string;
  placeholders: Array<{ key: string; label: string; type: string }>;
  rawText: string;
}> {
  const rawText = await extractTextFromPdf(pdfBuffer);
  const unshapedLines = normalizeAndUnshapeArabicText(rawText);

  // Default deterministic high-fidelity HTML generator
  const generated = generateSemanticHtmlFromPdfText(unshapedLines, docTitle);

  logger.info(
    `[convertPdfBufferToHtmlTemplate] Successfully generated Handlebars HTML for template: "${docTitle || "Untitled"}" with ${generated.placeholders.length} placeholders.`
  );

  return {
    handlebarsHtml: generated.html,
    placeholders: generated.placeholders,
    rawText: unshapedLines.join("\n"),
  };
}
