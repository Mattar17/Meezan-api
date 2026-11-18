import puppeteer, { Browser } from "puppeteer";
import puppeteerCore from "puppeteer-core";
import fs from "fs";
import os from "os";
import path from "path";
import logger from "../utils/logger.js";

let browserInstance: Browser | any = null;

/**
 * Checks if the current runtime environment is a serverless platform (Vercel / AWS Lambda / Linux container).
 */
function isServerlessEnvironment(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT ||
    (process.platform === "linux" && !process.env.LOCAL_DEV)
  );
}

/**
 * Automatically finds the best available browser executable for local development.
 * Priority:
 *   1. PUPPETEER_EXECUTABLE_PATH env var (explicit override)
 *   2. Puppeteer's own bundled Chromium
 *   3. System Chrome/Edge
 */
async function findExecutablePath(): Promise<string | undefined> {
  // 1. Explicit env override
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    logger.info(`[pdfService] Using PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // 2. Puppeteer's bundled Chromium
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

  return undefined;
}

/**
 * Returns a running instance of Puppeteer Browser.
 * Supports:
 *   1. Remote browser via BROWSER_WS_ENDPOINT (e.g. Browserless.io)
 *   2. Serverless Linux environment via @sparticuz/chromium-min (Vercel / AWS Lambda)
 *   3. Local development via standard Puppeteer / System Chrome
 */
async function getBrowser(): Promise<Browser | any> {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  // 1. Remote Browser endpoint (Browserless.io / WebSocket)
  if (process.env.BROWSER_WS_ENDPOINT) {
    logger.info(`[pdfService] Connecting to remote browser endpoint: ${process.env.BROWSER_WS_ENDPOINT}`);
    try {
      browserInstance = await puppeteerCore.connect({
        browserWSEndpoint: process.env.BROWSER_WS_ENDPOINT,
      });
      return browserInstance;
    } catch (wsErr) {
      logger.warn(`[pdfService] Remote browser connection failed, falling back to local: ${wsErr}`);
    }
  }

  // 2. Serverless Linux environment (Vercel / AWS Lambda)
  if (isServerlessEnvironment()) {
    logger.info(`[pdfService] Running on Vercel/Serverless: initializing @sparticuz/chromium-min...`);
    try {
      const chromiumModule = await import("@sparticuz/chromium-min");
      const chromium = chromiumModule.default || chromiumModule;

      const arch = process.arch === "arm64" ? "arm64" : "x64";
      const defaultPackUrl = `https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.${arch}.tar`;
      const packUrl = process.env.CHROMIUM_PACK_URL || defaultPackUrl;

      logger.info(`[pdfService] Loading serverless chromium pack from: ${packUrl}`);
      const executablePath = await (chromium as any).executablePath(packUrl);

      const args = Array.isArray((chromium as any).args)
        ? [...(chromium as any).args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        : ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

      browserInstance = await puppeteerCore.launch({
        args,
        executablePath,
        headless: true,
      });

      return browserInstance;
    } catch (serverlessErr) {
      logger.error(`[pdfService] Serverless chromium launch error: ${serverlessErr}`);
      throw new Error(`فشل تشغيل متصفح Chromium على Vercel: ${serverlessErr instanceof Error ? serverlessErr.message : String(serverlessErr)}`);
    }
  }

  // 3. Local Development (Windows / macOS / Local Linux)
  const executablePath = await findExecutablePath();
  logger.info(`[pdfService] Launching local browser (executablePath: ${executablePath || "puppeteer-default"})...`);

  const tempProfileDir = path.join(os.tmpdir(), `lawsync_puppeteer_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  browserInstance = await puppeteer.launch({
    headless: true,
    executablePath,
    userDataDir: tempProfileDir,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  });

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
      margin: 8mm 10mm 8mm 10mm;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    body {
      font-family: 'Traditional Arabic', 'Amiri', 'Cairo', 'Segoe UI', Tahoma, Arial, 'DejaVu Sans', sans-serif;
      font-size: 13.5pt;
      line-height: 1.6;
      color: #1e293b;
      margin: 0;
      padding: 0;
      direction: rtl;
      text-align: right;
    }
    p {
      margin-top: 0;
      margin-bottom: 4pt;
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
      margin-top: 4pt;
      margin-bottom: 8pt;
      font-weight: bold;
      border-bottom: 2px solid #b8975a;
      padding-bottom: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0;
      page-break-inside: auto;
      break-inside: auto;
    }
    tr, td {
      border: 1px solid #444;
      padding: 4pt 8pt;
      vertical-align: top;
      text-align: right;
      page-break-inside: auto;
      break-inside: auto;
    }
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
      waitUntil: "load",
      timeout: 30000,
    });

    const pdfUint8Array = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    return Buffer.from(pdfUint8Array);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[generatePdfFromHtml] Puppeteer error: ${msg}`);
    throw err;
  } finally {
    await page.close().catch(() => {});
    // In serverless environments (Vercel), close browser instance to free lambda memory
    if (isServerlessEnvironment() && browserInstance) {
      try {
        await browserInstance.close();
      } catch {}
      browserInstance = null;
    }
  }
}

// Cleanup on exit
process.on("exit", async () => {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
  }
});
