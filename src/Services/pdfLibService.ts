import { PDFDocument, rgb, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
// @ts-ignore
import pkg from "arabic-persian-reshaper";
import "../utils/canvasPolyfill.js";
import logger from "../utils/logger.js";

const { ArabicShaper } = pkg;

let cachedPdfJs: any = null;

/**
 * Safely loads pdfjs-dist dynamically with canvas polyfills initialized.
 * Avoids top-level evaluation crashes on serverless environments like Vercel.
 */
async function getPdfJs(): Promise<any> {
  if (cachedPdfJs) return cachedPdfJs;
  try {
    // @ts-ignore
    cachedPdfJs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    return cachedPdfJs;
  } catch (err) {
    logger.error(`[pdfLibService] Failed to dynamically load pdfjs-dist: ${err}`);
    throw err;
  }
}

/**
 * Converts Eastern Arabic digits (٠-٩) to Western Arabic digits (0-9).
 */
export function toWesternDigits(str: string): string {
  if (!str) return "";
  const eastern = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.replace(/[٠-٩]/g, (d) => {
    const idx = eastern.indexOf(d);
    return idx !== -1 ? String(idx) : d;
  });
}

/**
 * Converts Western digits (0-9) to Eastern Arabic digits (٠-٩).
 */
export function toEasternDigits(str: string): string {
  if (!str) return "";
  const eastern = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.replace(/[0-9]/g, (d) => eastern[parseInt(d, 10)] || d);
}

/**
 * Prepares Arabic and multilingual text for pdf-lib drawing with fontkit.
 * fontkit handles OpenType Arabic shaping, ligatures, and bidirectional layout natively,
 * so we preserve the natural forward text stream without manual character inversion.
 */
export function shapeArabicText(text: string): string {
  if (!text) return "";
  return String(text).trim();
}

/**
 * Finds and loads a TTF font with full Arabic support.
 */
function loadArabicFontBytes(): Buffer {
  const candidatePaths = [
    path.resolve(process.cwd(), "src/assets/fonts/trado.ttf"),
    "C:\\Windows\\Fonts\\trado.ttf",
    "C:\\Windows\\Fonts\\tradbdo.ttf",
    path.resolve(process.cwd(), "src/assets/fonts/arial.ttf"),
    "C:\\Windows\\Fonts\\arial.ttf",
    path.resolve(process.cwd(), "src/assets/fonts/tahoma.ttf"),
    "C:\\Windows\\Fonts\\tahoma.ttf",
  ];

  for (const fontPath of candidatePaths) {
    if (fs.existsSync(fontPath)) {
      return fs.readFileSync(fontPath);
    }
  }

  throw new Error("لم يتم العثور على خط يدعم اللغة العربية (trado.ttf أو arial.ttf أو tahoma.ttf) في المسار المحدد");
}

let cachedFontBytes: Buffer | null = null;

export async function embedArabicFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  pdfDoc.registerFontkit(fontkit);
  if (!cachedFontBytes) {
    cachedFontBytes = loadArabicFontBytes();
  }
  return await pdfDoc.embedFont(cachedFontBytes);
}

export interface CoordinatePlaceholder {
  key: string;
  originalText?: string;
  label?: string;
  page?: number;
  x?: number;
  maxX?: number;
  y?: number;
  fontSize?: number;
  clearWidth?: number;
  clearHeight?: number;
  color?: { r: number; g: number; b: number };
}

/**
 * Computes Levenshtein edit distance between two strings
 */
function editDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Cleans an Arabic or alphanumeric key for fuzzy comparison
 */
function cleanArabicKey(str: string): string {
  return String(str || "")
    .replace(/[{}\[\]_]/g, "")
    .replace(/[يى]/g, "ي")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Finds the best matching target key for a detected placeholder tag
 */
function findBestTargetKey(
  detectedKey: string,
  targets: Array<{ key: string; originalText?: string }>
): { key: string; originalText?: string } | null {
  const cDet = cleanArabicKey(detectedKey);
  const revCDet = cleanArabicKey(detectedKey.split("").reverse().join(""));

  let bestTarget: { key: string; originalText?: string } | null = null;
  let bestScore = Infinity;

  for (const t of targets) {
    const keysToTry = [t.key];
    if (t.originalText && t.originalText !== t.key) keysToTry.push(t.originalText);

    for (const rawKey of keysToTry) {
      const cT = cleanArabicKey(rawKey);
      if (cDet === cT || revCDet === cT || detectedKey === rawKey) {
        return t;
      }
      const d1 = editDistance(revCDet, cT);
      const d2 = editDistance(cDet, cT);
      const minD = Math.min(d1, d2);
      if (minD < bestScore) {
        bestScore = minD;
        bestTarget = t;
      }
    }
  }

  if (bestTarget && bestScore <= Math.max(2, Math.floor(bestTarget.key.length * 0.35))) {
    return bestTarget;
  }
  return null;
}

/**
 * Inspects a PDF to see if it has AcroForm fillable fields.
 */
export async function inspectPdfFormFields(pdfBuffer: Buffer): Promise<{
  hasForm: boolean;
  fieldNames: string[];
}> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const fieldNames = fields.map((f) => f.getName()).filter(Boolean);
    return {
      hasForm: fieldNames.length > 0,
      fieldNames,
    };
  } catch {
    return { hasForm: false, fieldNames: [] };
  }
}

/**
 * Generates all possible permutations of a placeholder key as it might appear
 * in a PDF text stream, including logical LTR, mirrored RTL (Word export),
 * word-by-word reversals, and bracket variations.
 */
export function generateAllPlaceholderVariants(rawTarget: string): string[] {
  const tokens = new Set<string>();
  const base = rawTarget.trim();
  if (!base) return [];

  // Strip existing brackets if already passed with brackets
  const unbracketed = base.replace(/^(\{\{|\{|\[|\}\})/, "").replace(/(\}\}|\}|\]|\{\{)$/, "").trim();

  const variations = Array.from(new Set([base, unbracketed]));
  if (unbracketed.includes("_")) {
    variations.push(unbracketed.replace(/_/g, " "));
  }
  if (unbracketed.includes(" ")) {
    variations.push(unbracketed.replace(/\s+/g, "_"));
  }

  const addBracketVariants = (inner: string) => {
    if (!inner || !inner.trim()) return;
    const t = inner.trim();
    // Standard logical LTR brackets
    tokens.add(`{{${t}}}`);
    tokens.add(`{{ ${t} }}`);
    tokens.add(`{{ ${t}}}`);
    tokens.add(`{{${t} }}`);
    tokens.add(`{${t}}`);
    tokens.add(`[${t}]`);

    // Mirrored / RTL reversed brackets (Word PDF export format: }} ... {{)
    tokens.add(`}}` + t + `{{`);
    tokens.add(`}} ` + t + `{{`);
    tokens.add(`}}` + t + ` {{`);
    tokens.add(`}} ` + t + ` {{`);
    tokens.add(`}` + t + `{`);
    tokens.add(`]` + t + `[`);
    tokens.add(t);
  };

  for (const v of variations) {
    // 1. Literal as-is
    addBracketVariants(v);

    // 2. Full character reversal (e.g. التاريخ -> خيراتلا)
    const revChar = v.split("").reverse().join("");
    addBracketVariants(revChar);

    // 3. Word-by-word reversal with separators (_ or space)
    const wordsUnderscore = v.split("_");
    const revWordsOnly = wordsUnderscore.map((w) => w.split("").reverse().join("")).join("_");
    addBracketVariants(revWordsOnly);

    const revWordsOrder = wordsUnderscore.slice().reverse().map((w) => w.split("").reverse().join("")).join("_");
    addBracketVariants(revWordsOrder);

    if (wordsUnderscore.length === 2) {
      addBracketVariants(`${wordsUnderscore[0]}_${wordsUnderscore[1].split("").reverse().join("")}`);
      addBracketVariants(`${wordsUnderscore[0].split("").reverse().join("")}_${wordsUnderscore[1]}`);
    }

    const wordsSpace = v.replace(/_/g, " ").split(" ");
    const revWordsSpaceOnly = wordsSpace.map((w) => w.split("").reverse().join("")).join(" ");
    addBracketVariants(revWordsSpaceOnly);

    if (wordsSpace.length === 2) {
      addBracketVariants(`${wordsSpace[0]} ${wordsSpace[1].split("").reverse().join("")}`);
      addBracketVariants(`${wordsSpace[0].split("").reverse().join("")} ${wordsSpace[1]}`);
    }

    // 4. Shape variations (for presentation forms)
    const shaped = shapeArabicText(v);
    if (shaped && shaped !== v) {
      addBracketVariants(shaped);
    }
  }

  // Sort longest first so full placeholders with braces match before partial words
  return Array.from(tokens).filter(Boolean).sort((a, b) => b.length - a.length);
}

/**
 * Uses pdfjs-dist to scan the PDF pages and automatically detect the exact
 * (pageIndex, x, y, width, height) coordinates of placeholder tags or target text.
 * Reconstructs lines across fragmented character items (essential for Word-exported PDFs).
 */
export async function autoDetectPlaceholderCoordinates(
  pdfBuffer: Buffer,
  targets: Array<{ key: string; originalText?: string }>
): Promise<CoordinatePlaceholder[]> {
  try {
    const pdfjs = await getPdfJs();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
    const doc = await loadingTask.promise;
    const detected: CoordinatePlaceholder[] = [];
    const matchedTargets = new Set<string>();

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const items = content.items as any[];

      // Sort items by vertical position (descending), then horizontal (ascending)
      const sorted = [...items].filter((it) => it.str && it.str.trim()).sort((a, b) => {
        const dy = b.transform[5] - a.transform[5];
        if (Math.abs(dy) > 3.5) return dy;
        return a.transform[4] - b.transform[4];
      });

      // Group items into visual lines
      const lines: any[][] = [];
      let currentLine: any[] = [];
      let currentY: number | null = null;

      for (const it of sorted) {
        const y = it.transform[5];
        if (currentY === null || Math.abs(currentY - y) <= 3.5) {
          currentLine.push(it);
          currentY = y;
        } else {
          lines.push(currentLine);
          currentLine = [it];
          currentY = y;
        }
      }
      if (currentLine.length) lines.push(currentLine);

      // Pass 1: Line-based placeholder detection (handles single-character items, Arabic RTL ligatures)
      for (const lineItems of lines) {
        let rawStr = "";
        const charMap: Array<{ item: any; char: string }> = [];

        for (let itIdx = 0; itIdx < lineItems.length; itIdx++) {
          const item = lineItems[itIdx];
          const s = item.str || "";
          for (let cIdx = 0; cIdx < s.length; cIdx++) {
            charMap.push({ item, char: s[cIdx] });
            rawStr += s[cIdx];
          }
        }

        let normStr = "";
        const normCharMap: Array<{ item: any; char: string }> = [];
        for (let i = 0; i < rawStr.length; i++) {
          const norm = rawStr[i].normalize("NFKC");
          for (let j = 0; j < norm.length; j++) {
            normStr += norm[j];
            normCharMap.push(charMap[i]);
          }
        }

        // Regex matches {{...}}, }}...{{, or {...}
        const regex = /(\{\{([^{}]+)\}\})|(\}\}([^\{\}]+)\{\{)|(\{[^{}]+\})/g;
        let m: RegExpExecArray | null;

        while ((m = regex.exec(normStr)) !== null) {
          const fullMatch = m[0];
          const innerKey = (m[2] || m[4] || fullMatch.replace(/[{}]/g, "")).trim();
          const startCharIdx = m.index;
          const endCharIdx = m.index + fullMatch.length - 1;

          if (!normCharMap[startCharIdx] || !normCharMap[endCharIdx]) continue;

          const startItem = normCharMap[startCharIdx].item;
          const endItem = normCharMap[endCharIdx].item;

          const x = Math.min(startItem.transform[4], endItem.transform[4]);
          const maxX = Math.max(
            startItem.transform[4] + (startItem.width || 0),
            endItem.transform[4] + (endItem.width || 0)
          );
          const y = startItem.transform[5];
          const clearWidth = maxX - x;
          const clearHeight = Math.max(
            ...normCharMap.slice(startCharIdx, endCharIdx + 1).map((c) => c.item.height || 12)
          );

          let resolvedKey = innerKey;
          if (targets && targets.length > 0) {
            const bestMatch = findBestTargetKey(innerKey, targets);
            if (bestMatch) {
              resolvedKey = bestMatch.key;
              matchedTargets.add(bestMatch.key);
            } else {
              // If target does not match any requested key, keep scanning
              continue;
            }
          }

          detected.push({
            key: resolvedKey,
            originalText: fullMatch,
            page: pageNum - 1,
            x,
            maxX,
            y,
            fontSize: clearHeight,
            clearWidth,
            clearHeight,
          });
        }
      }

      // Pass 2: Fallback single-item scan for targets that were not found in line-based scan (e.g. static numbers "7,000")
      const remainingTargets = targets.filter((t) => !matchedTargets.has(t.key));
      if (remainingTargets.length > 0) {
        for (const item of content.items as any[]) {
          if (!item.str || !item.str.trim()) continue;

          for (const target of remainingTargets) {
            const key = target.key;
            const searchTokensSet = new Set<string>();

            for (const variant of generateAllPlaceholderVariants(key)) {
              searchTokensSet.add(variant);
            }
            if (target.originalText && target.originalText !== key) {
              for (const variant of generateAllPlaceholderVariants(target.originalText)) {
                searchTokensSet.add(variant);
              }
            }

            const uniqueTokens = Array.from(searchTokensSet).sort((a, b) => b.length - a.length);

            for (const token of uniqueTokens) {
              let foundIdx = item.str.indexOf(token);
              let matchToken = token;

              if (foundIdx === -1) {
                const itemNorm = item.str.normalize("NFKC");
                const tokenNorm = token.normalize("NFKC");
                if (itemNorm.includes(tokenNorm)) {
                  foundIdx = itemNorm.indexOf(tokenNorm);
                  matchToken = tokenNorm;
                }
              }

              if (foundIdx !== -1) {
                const strLength = item.str.length;
                let extraLeft = 0;
                let extraRight = 0;
                if (foundIdx >= 2 && item.str.slice(foundIdx - 2, foundIdx) === "}}") {
                  extraLeft = 2;
                } else if (foundIdx >= 1 && item.str.slice(foundIdx - 1, foundIdx) === "}") {
                  extraLeft = 1;
                }
                const endIdx = foundIdx + matchToken.length;
                if (endIdx + 2 <= strLength && item.str.slice(endIdx, endIdx + 2) === "{{") {
                  extraRight = 2;
                } else if (endIdx + 1 <= strLength && item.str.slice(endIdx, endIdx + 1) === "{") {
                  extraRight = 1;
                }

                const adjustedFoundIdx = Math.max(0, foundIdx - extraLeft);
                const adjustedLength = matchToken.length + extraLeft + extraRight;
                const adjustedRatio = strLength > 0 ? adjustedFoundIdx / strLength : 0;
                const adjustedWidthRatio = strLength > 0 ? adjustedLength / strLength : 1;

                detected.push({
                  key,
                  originalText: matchToken,
                  page: pageNum - 1,
                  x: item.transform[4] + item.width * adjustedRatio,
                  maxX: item.transform[4] + item.width * (adjustedRatio + adjustedWidthRatio),
                  y: item.transform[5],
                  fontSize: item.height || 12,
                  clearWidth: Math.max(item.width * adjustedWidthRatio + 6, 40),
                  clearHeight: Math.max(item.height || 14, 14),
                });
                matchedTargets.add(key);
                break;
              }
            }
          }
        }
      }
    }

    return detected;
  } catch (err) {
    logger.warn(`[autoDetectPlaceholderCoordinates] Coordinate auto-detection error: ${err}`);
    return [];
  }
}

export interface LogoLocation {
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  clearWidth?: number;
  clearHeight?: number;
  fontSize?: number;
}

/**
 * Fills an existing PDF template using pdf-lib:
 * 1. Supports AcroForms (fillable form fields)
 * 2. Auto-detects coordinates of placeholder tags (e.g. {{key}}, [key], or original text)
 * 3. Supports explicit coordinate overlays passed by client
 * 4. Erases old text/placeholders with clean white-out and stamps the new value
 * 5. Embeds lawyer logo image at detected {{logo}} / {{شعار}} coordinates
 * 6. 100% preserves original logos, vector lines, borders, and static text.
 */
export async function fillPdfDocument(params: {
  originalPdfBuffer: Buffer;
  placeholders?: any;
  formValues: Record<string, any>;
  coordinates?: CoordinatePlaceholder[];
  replacements?: Array<{ target: string; value: string }>;
  logoBuffer?: Buffer | null;
  logoCoordinates?: LogoLocation;
}): Promise<Buffer> {
  const { originalPdfBuffer, placeholders, coordinates, replacements, logoBuffer, logoCoordinates } = params;

  // Filter out logo-related keys from text replacements so they are never printed as text
  const reservedLogoKeys = new Set(["logo", "logo_url", "savedLogoId", "شعار", "الشعار"]);
  const formValues: Record<string, any> = {};
  for (const [k, v] of Object.entries(params.formValues || {})) {
    if (!reservedLogoKeys.has(k.toLowerCase()) && !reservedLogoKeys.has(k)) {
      formValues[k] = v;
    }
  }

  const pdfDoc = await PDFDocument.load(originalPdfBuffer, { ignoreEncryption: true });
  const arabicFont = await embedArabicFont(pdfDoc);
  const pages = pdfDoc.getPages();

  let modifiedCount = 0;

  // 1. Try filling AcroForm interactive fields if present
  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    if (fields.length > 0) {
      for (const field of fields) {
        const fieldName = field.getName();
        const rawValue = formValues[fieldName];
        if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
          const shaped = shapeArabicText(String(rawValue));
          try {
            const textField = form.getTextField(fieldName);
            textField.setText(shaped);
            textField.updateAppearances(arabicFont);
            modifiedCount++;
          } catch {
            // Field might be a checkbox, radio, or signature
          }
        }
      }
      try {
        form.flatten();
      } catch (flattenErr) {
        logger.warn(`[fillPdfDocument] Form flatten warning: ${flattenErr}`);
      }
    }
  } catch {
    // PDF doesn't have an interactive AcroForm
  }

  // 2. Prepare Coordinate Placeholders
  let activeCoordinates: CoordinatePlaceholder[] = [];

  // Add explicit coordinates passed in params
  if (Array.isArray(coordinates) && coordinates.length > 0) {
    activeCoordinates.push(...coordinates);
  }

  // Add coordinates from stored template placeholders if they have x and y
  if (Array.isArray(placeholders)) {
    for (const item of placeholders) {
      if (typeof item === "object" && item !== null && typeof item.x === "number" && typeof item.y === "number") {
        activeCoordinates.push(item);
      }
    }
  }

  // 3. Auto-detect coordinates for keys in formValues
  const missingCoordinatesKeys: Array<{ key: string; originalText?: string }> = [];

  for (const [key, val] of Object.entries(formValues)) {
    if (val !== undefined && val !== null && val !== "") {
      const alreadyHasCoord = activeCoordinates.some((c) => c.key === key && typeof c.x === "number");
      if (!alreadyHasCoord) {
        // 1. Look up if template.placeholders has this key with an originalText
        let orig: string | undefined = undefined;
        if (Array.isArray(placeholders)) {
          const matchObj = placeholders.find((p) => p && typeof p === "object" && p.key === key);
          if (matchObj && matchObj.originalText) {
            orig = matchObj.originalText;
          }
        }

        // 2. If no placeholder originalText exists, key itself may be the target text (like "7,000" or a name)
        missingCoordinatesKeys.push({
          key,
          originalText: orig || key,
        });
      }
    }
  }

  // If there are keys to locate, auto-detect their position in the PDF using pdfjs-dist
  if (missingCoordinatesKeys.length > 0) {
    logger.info(
      `[fillPdfDocument] Auto-detecting coordinates for ${missingCoordinatesKeys.length} placeholder(s) in PDF...`
    );
    const autoDetected = await autoDetectPlaceholderCoordinates(originalPdfBuffer, missingCoordinatesKeys);
    logger.info(`[fillPdfDocument] Successfully detected coordinates for ${autoDetected.length} field(s)`);
    activeCoordinates.push(...autoDetected);
  }

  // 4. Apply text replacements at coordinates
  for (const item of activeCoordinates) {
    const key = item.key;
    const rawValue = formValues[key];

    if (rawValue !== undefined && rawValue !== null && rawValue !== "" && typeof item.x === "number" && typeof item.y === "number") {
      const pageIndex = typeof item.page === "number" ? item.page : 0;
      const page = pages[pageIndex];

      if (page) {
        // Use full font size matching the original PDF document
        const baseFontSize = item.fontSize && item.fontSize >= 10 ? item.fontSize : 11;
        const shaped = shapeArabicText(String(rawValue));
        const textColor = item.color
          ? rgb(item.color.r, item.color.g, item.color.b)
          : rgb(0.1, 0.1, 0.1);

        // Erase old placeholder or original text with a clean white rectangle covering brackets and descenders
        const clearW = (item.clearWidth || 60) + 6;
        const clearH = (item.clearHeight || baseFontSize + 4) + 6;
        page.drawRectangle({
          x: item.x - 3,
          y: item.y - 3.5,
          width: clearW,
          height: clearH,
          color: rgb(1, 1, 1),
        });

        const textWidth = arabicFont.widthOfTextAtSize(shaped, baseFontSize);
        const maxX = item.maxX || (item.x + (item.clearWidth || 60));
        const drawX = Math.max(item.x - 4, maxX - textWidth);

        page.drawText(shaped, {
          x: drawX,
          y: item.y,
          size: baseFontSize,
          font: arabicFont,
          color: textColor,
        });

        modifiedCount++;
      }
    }
  }

  // 5. Apply explicit custom string replacements if requested by caller
  if (Array.isArray(replacements) && replacements.length > 0) {
    const targets = replacements.map((r) => ({ key: r.target, originalText: r.target }));
    const detected = await autoDetectPlaceholderCoordinates(originalPdfBuffer, targets);

    for (const det of detected) {
      const replacement = replacements.find((r) => r.target === det.key);
      if (replacement && typeof det.x === "number" && typeof det.y === "number") {
        const pageIndex = det.page || 0;
        const page = pages[pageIndex];
        if (page) {
          const fontSize = det.fontSize || 11;
          const clearW = (det.clearWidth || 80) + 8;
          const clearH = (det.clearHeight || fontSize + 4) + 6;

          page.drawRectangle({
            x: det.x - 4,
            y: det.y - 3.5,
            width: clearW,
            height: clearH,
            color: rgb(1, 1, 1),
          });

          page.drawText(shapeArabicText(String(replacement.value)), {
            x: det.x,
            y: det.y,
            size: fontSize,
            font: arabicFont,
            color: rgb(0.1, 0.1, 0.1),
          });

          modifiedCount++;
        }
      }
    }
  }

  // 6. Handle Logo image embedding or placeholder erasure
  try {
    let resolvedLogoLocation: LogoLocation | null = null;

    if (logoCoordinates && typeof logoCoordinates.x === "number" && typeof logoCoordinates.y === "number") {
      resolvedLogoLocation = logoCoordinates;
    } else {
      // Check if coordinates or placeholders have a logo entry
      if (Array.isArray(placeholders)) {
        const logoItem = placeholders.find(
          (p) =>
            p &&
            typeof p === "object" &&
            (p.key === "logo" || p.key === "شعار" || p.key === "الشعار") &&
            typeof p.x === "number" &&
            typeof p.y === "number"
        );
        if (logoItem) {
          resolvedLogoLocation = logoItem;
        }
      }

      // If not yet resolved, auto-detect {{logo}} or {{شعار}} coordinates in PDF
      if (!resolvedLogoLocation) {
        const logoScanTargets = [
          { key: "logo", originalText: "logo" },
          { key: "شعار", originalText: "شعار" },
        ];
        const detected = await autoDetectPlaceholderCoordinates(originalPdfBuffer, logoScanTargets);
        if (detected.length > 0) {
          resolvedLogoLocation = detected[0];
        }
      }
    }

    if (resolvedLogoLocation && typeof resolvedLogoLocation.x === "number" && typeof resolvedLogoLocation.y === "number") {
      const pageIndex = typeof resolvedLogoLocation.page === "number" ? resolvedLogoLocation.page : 0;
      const targetPage = pages[pageIndex];

      if (targetPage) {
        // Generously white-out the {{logo}} / }}logo{{ placeholder text so braces never show
        const clearW = Math.max(resolvedLogoLocation.clearWidth || 120, 160);
        const clearH = Math.max(resolvedLogoLocation.clearHeight || 50, 45);
        targetPage.drawRectangle({
          x: resolvedLogoLocation.x - 20,
          y: resolvedLogoLocation.y - clearH * 0.35,
          width: clearW + 40,
          height: clearH,
          color: rgb(1, 1, 1),
        });

        // If logoBuffer is provided, embed and draw the image
        if (logoBuffer && logoBuffer.length > 0) {
          let embeddedImage: any = null;
          const isPng =
            logoBuffer[0] === 0x89 &&
            logoBuffer[1] === 0x50 &&
            logoBuffer[2] === 0x4e &&
            logoBuffer[3] === 0x47;

          try {
            if (isPng) {
              embeddedImage = await pdfDoc.embedPng(logoBuffer);
            } else {
              embeddedImage = await pdfDoc.embedJpg(logoBuffer);
            }
          } catch {
            try {
              embeddedImage = isPng ? await pdfDoc.embedJpg(logoBuffer) : await pdfDoc.embedPng(logoBuffer);
            } catch (embedErr) {
              logger.warn(`[fillPdfDocument] Failed to embed logo image into PDF: ${embedErr}`);
            }
          }

          if (embeddedImage) {
            const maxW = resolvedLogoLocation.width || 140;
            const maxH = resolvedLogoLocation.height || 70;
            const dims = embeddedImage.scaleToFit(maxW, maxH);

            // Center image over the detected logo position
            const placeholderCenter = resolvedLogoLocation.x + (resolvedLogoLocation.clearWidth || dims.width) / 2;
            const drawX = placeholderCenter - dims.width / 2;
            const drawY = Math.max(0, resolvedLogoLocation.y - (dims.height - (resolvedLogoLocation.fontSize || 14)) / 2);

            // Clean white background under the logo
            targetPage.drawRectangle({
              x: drawX - 4,
              y: drawY - 4,
              width: dims.width + 8,
              height: dims.height + 8,
              color: rgb(1, 1, 1),
            });

            targetPage.drawImage(embeddedImage, {
              x: drawX,
              y: drawY,
              width: dims.width,
              height: dims.height,
            });

            modifiedCount++;
            logger.info(`[fillPdfDocument] Successfully embedded logo image (${dims.width}x${dims.height}) at page ${pageIndex}`);
          }
        }
      }
    }
  } catch (logoErr) {
    logger.warn(`[fillPdfDocument] Error processing logo placement: ${logoErr}`);
  }

  logger.info(`[fillPdfDocument] Completed PDF processing. Modified/stamped ${modifiedCount} field(s).`);

  // 7. Save resulting PDF
  const savedBytes = await pdfDoc.save();
  return Buffer.from(savedBytes);
}
