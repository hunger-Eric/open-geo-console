import serverlessChromium from "@sparticuz/chromium";
import { chromium as serverlessPlaywright } from "playwright-core";
import { runReportV4GuardedOperation } from "@/report-v4/prohibited-operation-guard-runtime";

export async function exportReportPdf(input: {
  htmlUrl: string;
  cookieHeader: string;
}): Promise<Buffer> {
  return runReportV4GuardedOperation({ guardSite: "pdf_export_url", delegate: () => exportReportPdfUnsafe(input) });
}

async function exportReportPdfUnsafe(input: { htmlUrl: string; cookieHeader: string }): Promise<Buffer> {
  const url = new URL(input.htmlUrl);
  if (!isControlledReportArtifactUrl(url)) {
    throw new Error("PDF export URL is not a controlled report artifact.");
  }
  const browser = await launchPdfBrowser();
  try {
    const context = await browser.newContext({
      extraHTTPHeaders: input.cookieHeader ? { cookie: input.cookieHeader } : undefined
    });
    const page = await context.newPage();
    const response = await page.goto(url.href, { waitUntil: "networkidle", timeout: 45_000 });
    if (!response?.ok()) throw new Error("The canonical HTML artifact could not be loaded for PDF export.");
    await page.evaluate(() => document.fonts.ready);
    const bytes = await renderPdfPage(page);
    return Buffer.from(bytes);
  } finally {
    await browser.close();
  }
}

/**
 * Creates a real PDF from a canonical artifact's already-rendered HTML. This
 * is used by pre-terminal readiness checks, where the report cannot yet be
 * persisted and therefore cannot be loaded through its authorized route.
 */
export async function exportCanonicalArtifactHtmlPdf(html: string): Promise<Buffer> {
  return runReportV4GuardedOperation({ guardSite: "pdf_export_html", delegate: () => exportCanonicalArtifactHtmlPdfUnsafe(html) });
}
async function exportCanonicalArtifactHtmlPdfUnsafe(html: string): Promise<Buffer> {
  if (!html.trim()) throw new Error("Canonical artifact HTML is required for PDF export.");
  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle", timeout: 45_000 });
    return Buffer.from(await renderPdfPage(page));
  } finally {
    await browser.close();
  }
}

export function isControlledReportArtifactUrl(url: URL): boolean {
  return !url.pathname.includes("..") && /^\/reports\/[^/]+\/(?:report|legacy-report|recommendation-report)\.html$/.test(url.pathname);
}

async function launchPdfBrowser() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return serverlessPlaywright.launch({
      args: serverlessChromium.args,
      executablePath: await serverlessChromium.executablePath(),
      headless: true
    });
  }
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}

async function renderPdfPage(page: { emulateMedia(input: { media: "print" }): Promise<void>; evaluate<T>(callback: () => T | Promise<T>): Promise<T>; pdf(input: Parameters<import("playwright-core").Page["pdf"]>[0]): Promise<Uint8Array> }) {
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  return page.pdf({
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: '<div style="font-size:8px;color:#687570;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: "14mm", right: "13mm", bottom: "16mm", left: "13mm" }
  });
}
