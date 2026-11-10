import puppeteer, { Browser } from "puppeteer";
import fs from "fs";
import os from "os";
import logger from "../utils/logger.js";

let browserInstance: Browser | null = null;

/**
 * Automatically finds the best available browser executable.
 * Priority:
 *   1. PUPPETEER_EXECUTABLE_PATH env var (explicit override)
 *   2. Puppeteer's own bundled Chromium (most reliable — same version Puppeteer was tested with)
 *   3. System Chrome/Edge as last resort
 */
async function findExecutablePath(): Promise<string | undefined> {
  // 1. Explicit env override
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    logger.info(`[pdfService] Using PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Puppeteer's bundled Chromium (preferred — guaranteed compatible version)
  try {
    const bundledPath = await puppeteer.executablePath();
    if (bundledPath && fs.existsSync(bundledPath)) {
      logger.info(`[pdfService] Using Puppeteer bundled Chromium: ${bundledPath}`);
      return bundledPath;
    }
  } catch {
    // executablePath() may throw if Chromium was never downloaded
  }

  // 3. System browser fallback (Windows only)
  if (os.platform() === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        logger.info(`[pdfService] Using system browser fallback: ${candidate}`);
        return candidate;
      }
    }
  }

  // Let Puppeteer decide (Linux/Mac with bundled Chromium downloaded via postinstall)
  return undefined;
}

/**
 * Returns a shared, running instance of Puppeteer Chromium
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    const executablePath = await findExecutablePath();
    logger.info(`[pdfService] Launching browser (executablePath: ${executablePath || "puppeteer-default"})...`);

    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    });
  }
  return browserInstance;
}

/**
 * Wraps Handlebars HTML inside a fully-formed HTML document with A4 page styles and Arabic fonts.
 * Uses system fonts (Tahoma/Arial) embedded directly to avoid Google Fonts network dependency in headless Puppeteer.
 */
export function wrapHtmlForPrint(bodyHtml: string, title: string = "مستند قانوني"): string {
  if (bodyHtml.includes("<html") && bodyHtml.includes("</html>")) {
    return bodyHtml;
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    @page {
      size: A4;
      /* Single margin definition — do NOT also pass margin to page.pdf() */
      margin: 20mm 15mm 20mm 15mm;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    body {
      /* Use system Arabic fonts — no network required in headless mode */
      font-family: 'Traditional Arabic', 'Amiri', 'Cairo', 'Segoe UI', Tahoma, Arial, 'DejaVu Sans', sans-serif;
      font-size: 14pt;
      line-height: 2.15;
      color: #1e293b;
      margin: 0;
      padding: 0;
      direction: rtl;
      text-align: right;
    }
    p {
      margin-bottom: 0.9em;
      text-align: justify;
      text-justify: inter-word;
      color: #1e293b;
    }
    strong {
      color: #0d1b2a;
      font-weight: bold;
    }
    h1, h2, h3, h4 {
      text-align: center;
      color: #0d1b2a;
      margin-top: 0.5em;
      margin-bottom: 0.8em;
      font-weight: bold;
      border-bottom: 3px double #b8975a;
      padding-bottom: 8px;
    }
    /* Strip any rogue inline padding/font overrides from AI-generated HTML */
    div[dir="rtl"] {
      padding: 0 !important;
      font-family: inherit !important;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

/**
 * Converts HTML content into an A4 PDF Buffer using Puppeteer
 */
export async function generatePdfFromHtml(html: string, title?: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    const fullHtml = wrapHtmlForPrint(html, title);

    await page.setContent(fullHtml, {
      // "load" is sufficient here because we use system fonts only (Tahoma/Arial/Segoe UI).
      // There are no external font or asset requests, so the page is fully ready on "load".
      waitUntil: "load",
      timeout: 30000,
    });

    const pdfUint8Array = await page.pdf({
      format: "A4",
      printBackground: true,
      // Do NOT set margin here — @page CSS margin in wrapHtmlForPrint handles it.
      // Setting both causes double-margin and crushes the content area.
    });

    return Buffer.from(pdfUint8Array);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[generatePdfFromHtml] Puppeteer error: ${msg}`);
    throw err;
  } finally {
    await page.close().catch(() => {});
  }
}

// Cleanup on exit
process.on("exit", async () => {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
  }
});
