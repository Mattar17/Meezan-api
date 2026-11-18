import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import mammoth from "mammoth";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { PDFDocument } from "pdf-lib";
import logger from "../utils/logger.js";
import { generatePdfFromHtml, getArabicFontFace } from "./pdfService.js";

const execAsync = promisify(exec);

export interface DocxPlaceholder {
  key: string;
  label: string;
  type: string;
}

/**
 * Checks if a buffer represents a valid DOCX file.
 * (A ZIP archive containing [Content_Types].xml and word/document.xml)
 */
export function isDocxBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;
  // Check ZIP magic bytes PK\x03\x04
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
    return false;
  }
  try {
    const zip = new PizZip(buffer);
    return Boolean(zip.file("word/document.xml") || zip.file("[Content_Types].xml"));
  } catch {
    return false;
  }
}

/**
 * Cleans a key name (removes braces, leading/trailing underscores, extra spaces)
 */
export function cleanKey(raw: string): string {
  return raw
    .trim()
    .replace(/^[\/\\_\s{}]+/, "")
    .replace(/[\/\\_\s{}]+$/, "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s*_\s*/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

/**
 * Normalizes Arabic letters for fuzzy matching:
 * - Unifies Alef variants (أ, إ, آ, ٱ -> ا)
 * - Unifies Taa Marbuta and Haa (ة -> ه)
 * - Unifies Yaa and Alef Maqsura (ى, ي -> ي)
 * - Strips Tashkeel / Diacritics
 * - Normalizes underscores and spaces
 */
export function normalizeArabicKey(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[\s_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

/**
 * Normalizes all placeholder tags inside Word XML parts (document.xml, headers, footers).
 * Handles Word XML run fragmentation: when Word splits placeholders across multiple
 * <w:r> runs (e.g. <w:t>اسم</w:t>...<w:t>_</w:t>...<w:t>المحكمة</w:t>), this reconstructs
 * the continuous paragraph text, wraps the placeholder as {key}, and keeps valid XML.
 */
function normalizeDocxXml(xml: string, explicitKeys?: string[]): string {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (pXml) => {
    const runRegex = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
    const runMatches: Array<{
      fullRun: string;
      startIndex: number;
      endIndex: number;
      text: string;
      openTag: string;
      closeTag: string;
    }> = [];
    let match: RegExpExecArray | null;

    while ((match = runRegex.exec(pXml)) !== null) {
      const runStr = match[0];
      const tMatch = runStr.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
      if (tMatch) {
        runMatches.push({
          fullRun: runStr,
          startIndex: match.index,
          endIndex: match.index + runStr.length,
          text: tMatch[1],
          openTag: tMatch[0].substring(0, tMatch[0].indexOf(">") + 1),
          closeTag: "</w:t>",
        });
      }
    }

    if (runMatches.length === 0) return pXml;

    let fullText = "";
    const charToRun: Array<{ runIdx: number; charInRun: number }> = [];

    for (let rIdx = 0; rIdx < runMatches.length; rIdx++) {
      const r = runMatches[rIdx];
      for (let cIdx = 0; cIdx < r.text.length; cIdx++) {
        charToRun.push({ runIdx: rIdx, charInRun: cIdx });
        fullText += r.text[cIdx];
      }
    }

    const replacements: Array<{ start: number; end: number; key: string }> = [];

    const isOverlapping = (start: number, end: number) => {
      return replacements.some((r) => start < r.end && end > r.start);
    };

    // 1. Bracketed tags like {{key}} or {key} (including when split across runs)
    const tagRegex = /\{{1,2}([^{}]+)\}{1,2}/g;
    let tm: RegExpExecArray | null;
    while ((tm = tagRegex.exec(fullText)) !== null) {
      const ck = cleanKey(tm[1]);
      if (ck && !ck.startsWith("#") && !ck.startsWith("/") && !ck.startsWith("^")) {
        const start = tm.index;
        const end = start + tm[0].length;
        if (!isOverlapping(start, end)) {
          replacements.push({ start, end, key: ck });
        }
      }
    }

    // 2. Explicit keys passed from formValues
    // CRITICAL: Sort keys by length DESCENDING so longer composite keys (e.g. اسم_المحكمة_التابعة_للقضية)
    // are matched BEFORE shorter prefixes (e.g. اسم_المحكمة).
    if (explicitKeys && explicitKeys.length > 0) {
      const sortedKeys = [...explicitKeys]
        .map((k) => cleanKey(k))
        .filter((k) => k && k.length >= 2)
        .sort((a, b) => b.length - a.length);

      for (const k of sortedKeys) {
        let pos = 0;
        while ((pos = fullText.indexOf(k, pos)) !== -1) {
          const start = pos;
          const end = pos + k.length;

          // Word boundary check: must not be preceded or followed by '_' or Arabic/alphanumeric characters
          const charBefore = start > 0 ? fullText[start - 1] : "";
          const charAfter = end < fullText.length ? fullText[end] : "";

          const isBoundaryBefore = !charBefore || !/[\u0600-\u06FFa-zA-Z0-9_]/.test(charBefore);
          const isBoundaryAfter = !charAfter || !/[\u0600-\u06FFa-zA-Z0-9_]/.test(charAfter);

          if (isBoundaryBefore && isBoundaryAfter && !isOverlapping(start, end)) {
            replacements.push({ start, end, key: k });
          }
          pos += k.length;
        }
      }
    }

    // 3. Unbracketed Arabic snake_case words (e.g. اسم_الموكل, تاريخ_الجلسة_التالية)
    const snakeRegex = /(?<![\u0600-\u06FFa-zA-Z0-9_{])([\u0600-\u06FF]+(?:_[\u0600-\u06FF0-9]+)+)(?![\u0600-\u06FFa-zA-Z0-9_}])/g;
    let sm: RegExpExecArray | null;
    while ((sm = snakeRegex.exec(fullText)) !== null) {
      const k = cleanKey(sm[1]);
      const start = sm.index;
      const end = start + sm[1].length;
      if (k && !isOverlapping(start, end)) {
        replacements.push({ start, end, key: k });
      }
    }

    if (replacements.length === 0) return pXml;

    replacements.sort((a, b) => a.start - b.start);

    const runChars = runMatches.map((r) => r.text.split(""));

    for (const rep of replacements) {
      const firstMapping = charToRun[rep.start];
      const lastMapping = charToRun[rep.end - 1];
      if (!firstMapping || !lastMapping) continue;

      const startRun = firstMapping.runIdx;
      const startChar = firstMapping.charInRun;
      const endRun = lastMapping.runIdx;
      const endChar = lastMapping.charInRun;

      if (startRun === endRun) {
        runChars[startRun][startChar] = `{${rep.key}}`;
        for (let c = startChar + 1; c <= endChar; c++) {
          runChars[startRun][c] = "";
        }
      } else {
        runChars[startRun][startChar] = `{${rep.key}}`;
        for (let c = startChar + 1; c < runChars[startRun].length; c++) {
          runChars[startRun][c] = "";
        }
        for (let r = startRun + 1; r < endRun; r++) {
          for (let c = 0; c < runChars[r].length; c++) {
            runChars[r][c] = "";
          }
        }
        for (let c = 0; c <= endChar; c++) {
          runChars[endRun][c] = "";
        }
      }
    }

    let newPXml = pXml;
    for (let rIdx = runMatches.length - 1; rIdx >= 0; rIdx--) {
      const r = runMatches[rIdx];
      const updatedText = runChars[rIdx].join("");
      let openTag = r.openTag;
      if (!openTag.includes("xml:space") && (updatedText.startsWith(" ") || updatedText.endsWith(" "))) {
        openTag = openTag.replace("<w:t", '<w:t xml:space="preserve"');
      }
      const newRun = r.fullRun.replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/, `${openTag}${updatedText}${r.closeTag}`);
      newPXml = newPXml.substring(0, r.startIndex) + newRun + newPXml.substring(r.endIndex);
    }

    return newPXml;
  });
}

/**
 * Extracts all dynamic placeholders from a DOCX template file.
 * Automatically checks document body, headers, and footers across paragraphs.
 */
export function extractPlaceholdersFromDocx(buffer: Buffer): DocxPlaceholder[] {
  const zip = new PizZip(buffer);
  const detectedKeys = new Set<string>();

  const xmlFiles: string[] = [];
  for (const fileName of Object.keys(zip.files)) {
    if (/^word\/(document|header\d+|footer\d+)\.xml$/.test(fileName)) {
      xmlFiles.push(fileName);
    }
  }

  for (const fName of xmlFiles) {
    const rawXml = zip.file(fName)?.asText() || "";
    const paragraphs = rawXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

    for (const p of paragraphs) {
      // Continuous text per paragraph (no artificial spaces between split runs)
      const pText = (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
        .map((t) => t.replace(/<[^>]+>/g, ""))
        .join("");

      // 1. Bracketed tags: {key} or {{key}}
      const tagRegex = /\{{1,2}([^{}]+)\}{1,2}/g;
      let m: RegExpExecArray | null;
      while ((m = tagRegex.exec(pText)) !== null) {
        const raw = m[1].trim();
        if (raw && !raw.startsWith("#") && !raw.startsWith("/") && !raw.startsWith("^")) {
          const ck = cleanKey(raw);
          if (ck) detectedKeys.add(ck);
        }
      }

      // 2. Unbracketed snake_case Arabic keys: اسم_الموكل, رقم_الدعوى
      const snakeRegex = /(?<![\u0600-\u06FFa-zA-Z0-9_{])([\u0600-\u06FF]+(?:_[\u0600-\u06FF0-9]+)+)(?![\u0600-\u06FFa-zA-Z0-9_}])/g;
      while ((m = snakeRegex.exec(pText)) !== null) {
        const ck = cleanKey(m[1]);
        if (ck && ck.length <= 50) detectedKeys.add(ck);
      }
    }
  }

  return Array.from(detectedKeys).map((k) => {
    const label = k.replace(/_/g, " ");
    let type = "text";
    if (/تاريخ|date/i.test(k)) type = "date";
    if (/مبلغ|قيمة|اتعاب|أتعاب|amount|price/i.test(k)) type = "number";
    return { key: k, label, type };
  });
}

/**
 * Fills a DOCX template using docxtemplater and returns the filled DOCX buffer.
 * Fully preserves Word formatting, fonts, margins, tables, and Arabic RTL layout.
 */
export function fillDocxTemplate(
  templateBuffer: Buffer,
  formValues: Record<string, any>
): Buffer {
  const zip = new PizZip(templateBuffer);

  // Normalize XML in all text-bearing parts
  for (const fileName of Object.keys(zip.files)) {
    if (/^word\/(document|header\d+|footer\d+)\.xml$/.test(fileName)) {
      const currentXml = zip.file(fileName)?.asText() || "";
      const normalized = normalizeDocxXml(currentXml, Object.keys(formValues || {}));
      zip.file(fileName, normalized);
    }
  }

  // Build normalized lookup dictionary for fast fuzzy matching
  const cleanData: Record<string, string> = {};
  const normalizedData: Record<string, string> = {};

  for (const [k, v] of Object.entries(formValues || {})) {
    const val = v !== undefined && v !== null ? String(v) : "";
    cleanData[k] = val;
    cleanData[cleanKey(k)] = val;
    cleanData[k.replace(/_/g, " ")] = val;
    cleanData[k.replace(/\s+/g, "_")] = val;

    const normKey = normalizeArabicKey(k);
    if (normKey) {
      normalizedData[normKey] = val;
    }
  }

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    // Never render the word "undefined" in the document
    nullGetter: () => "",
    // Fuzzy Arabic parser
    parser: (tag: string) => ({
      get: (scope: Record<string, any>) => {
        // 1. Direct match in scope
        if (scope[tag] !== undefined && scope[tag] !== null) return String(scope[tag]);

        // 2. Clean key match
        const ck = cleanKey(tag);
        if (scope[ck] !== undefined && scope[ck] !== null) return String(scope[ck]);
        if (cleanData[ck] !== undefined) return cleanData[ck];

        // 3. Space vs Underscore
        const sp = tag.replace(/_/g, " ");
        if (scope[sp] !== undefined && scope[sp] !== null) return String(scope[sp]);
        if (cleanData[sp] !== undefined) return cleanData[sp];

        const un = tag.replace(/\s+/g, "_");
        if (scope[un] !== undefined && scope[un] !== null) return String(scope[un]);
        if (cleanData[un] !== undefined) return cleanData[un];

        // 4. Fuzzy Arabic matching (ignoring hamza variants, taa marbuta, etc.)
        const normTag = normalizeArabicKey(tag);
        if (normalizedData[normTag] !== undefined) {
          return normalizedData[normTag];
        }

        for (const [k, v] of Object.entries(scope)) {
          if (normalizeArabicKey(k) === normTag && v !== undefined && v !== null) {
            return String(v);
          }
        }

        // Tag not provided in formValues -> return empty string (never "undefined")
        return "";
      },
    }),
  });

  doc.render(cleanData);

  return doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

/**
 * Converts a filled DOCX buffer to semantic, printable HTML with Egyptian court summons styling.
 * Designed to fit 1-page summons completely on a single A4 page with zero overflow or empty pages.
 */
export async function convertDocxToHtml(docxBuffer: Buffer, docTitle?: string): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer: docxBuffer },
    {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Title'] => h1.doc-title:fresh",
      ],
    }
  );

  const bodyHtml = result.value || "";
  const fontFace = getArabicFontFace();

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${docTitle || "مستند قانوني"}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&family=Cairo:wght@400;600;700;800&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    ${fontFace}
    @page {
      size: A4;
      margin: 8mm 10mm 8mm 10mm;
    }
    *, *:before, *:after {
      box-sizing: border-box;
    }
    body {
      font-family: 'Traditional Arabic', 'Amiri', 'Cairo', 'Noto Naskh Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 13.5pt;
      line-height: 1.55;
      color: #111;
      direction: rtl;
      text-align: justify;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    h1, h2, h3, .doc-title {
      text-align: center;
      font-weight: bold;
      margin-top: 4pt;
      margin-bottom: 8pt;
    }
    h1 { font-size: 16pt; }
    h2 { font-size: 15pt; }
    p {
      margin-top: 0;
      margin-bottom: 3.5pt;
      text-indent: 0;
    }
    p:first-of-type, .no-indent {
      text-indent: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
      font-size: 13pt;
      table-layout: fixed;
      page-break-inside: auto;
      break-inside: auto;
    }
    /* Standard Egyptian legal notice (اعادة اعلان / صحيفة دعوى) 2-column layout */
    table tr td:first-child:not(:only-child) {
      width: 82%;
      vertical-align: top;
      border-left: 1.5px solid #222;
      border-right: none;
      border-top: none;
      border-bottom: none;
      padding: 4pt 8pt;
      text-align: right;
    }
    table tr td:last-child:not(:only-child) {
      width: 18%;
      vertical-align: top;
      border: none;
      text-align: center;
      padding: 4pt 6pt;
    }
    table tr td:only-child {
      border: 1px solid #333;
      padding: 4pt 8pt;
      text-align: right;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    strong, b {
      font-weight: bold;
    }
    u {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

/**
 * Checks if LibreOffice CLI (soffice) is available on the operating system.
 */
async function getLibreOfficeExecutable(): Promise<string | null> {
  const isWindows = process.platform === "win32";
  const candidates = isWindows
    ? [
        "soffice",
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
      ]
    : ["soffice", "libreoffice"];

  for (const cmd of candidates) {
    try {
      const checkCmd = isWindows ? `"${cmd}" --version` : `${cmd} --version`;
      await execAsync(checkCmd);
      return cmd;
    } catch {
      // not found
    }
  }
  return null;
}

/**
 * Converts a DOCX buffer to a vector PDF buffer.
 *
 * Strategy:
 * 1. If LibreOffice (soffice) is installed on the host (e.g. Linux Docker production):
 *    invokes `soffice --headless --convert-to pdf` for 100% native Word pagination.
 * 2. Fallback: Converts to semantic HTML via mammoth + renders via Puppeteer (generatePdfFromHtml)
 *    with automatic empty page detection and pruning using pdf-lib!
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer,
  options?: { docTitle?: string }
): Promise<Buffer> {
  const libreOfficePath = await getLibreOfficeExecutable();

  if (libreOfficePath) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docx2pdf-"));
    const inDocx = path.join(tempDir, "document.docx");
    const outPdf = path.join(tempDir, "document.pdf");

    try {
      fs.writeFileSync(inDocx, docxBuffer);
      const isWindows = process.platform === "win32";
      const cmd = isWindows
        ? `"${libreOfficePath}" --headless --convert-to pdf --outdir "${tempDir}" "${inDocx}"`
        : `${libreOfficePath} --headless --convert-to pdf --outdir "${tempDir}" "${inDocx}"`;

      logger.info(`[convertDocxToPdf] Converting via LibreOffice: ${cmd}`);
      await execAsync(cmd);

      if (fs.existsSync(outPdf)) {
        const pdfBytes = fs.readFileSync(outPdf);
        return pdfBytes;
      }
    } catch (err) {
      logger.warn(`[convertDocxToPdf] LibreOffice execution failed, falling back to Puppeteer: ${err}`);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  }

  // Fast, pure Node.js fallback: Mammoth + Puppeteer
  logger.info(`[convertDocxToPdf] Converting via Mammoth + Puppeteer renderer...`);
  const html = await convertDocxToHtml(docxBuffer, options?.docTitle);
  let pdfBytes = await generatePdfFromHtml(html, options?.docTitle || "مستند قانوني");

  // Safeguard: Automatically prune any empty leading page if generated
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    if (pdfDoc.getPageCount() > 1) {
      const pdfParseModule = await import("pdf-parse");
      const parseFn = async (b: Buffer) => {
        if ((pdfParseModule as any).PDFParse) {
          const p = new (pdfParseModule as any).PDFParse({ data: b });
          const r = await p.getText();
          if (typeof p.destroy === "function") await p.destroy();
          return r.text;
        }
        const r = await ((pdfParseModule as any).default || pdfParseModule)(b);
        return r.text;
      };

      const singleDoc = await PDFDocument.create();
      const [p1] = await singleDoc.copyPages(pdfDoc, [0]);
      singleDoc.addPage(p1);
      const p1Buf = Buffer.from(await singleDoc.save());
      const p1Text = await parseFn(p1Buf);

      if (!p1Text || p1Text.trim().length === 0) {
        logger.info(`[convertDocxToPdf] Detected and pruned empty leading page 1.`);
        pdfDoc.removePage(0);
        pdfBytes = Buffer.from(await pdfDoc.save());
      }
    }
  } catch (pruneErr) {
    logger.warn(`[convertDocxToPdf] Empty page check warning: ${pruneErr}`);
  }

  return pdfBytes;
}
