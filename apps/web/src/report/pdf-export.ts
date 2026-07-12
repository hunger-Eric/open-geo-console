import "server-only";
import serverlessChromium from "@sparticuz/chromium";
import { chromium as serverlessPlaywright } from "playwright-core";

export async function exportReportPdf(input: {
  htmlUrl: string;
  cookieHeader: string;
}): Promise<Buffer> {
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
    await page.emulateMedia({ media: "print" });
    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: '<div style="font-size:8px;color:#687570;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: "14mm", right: "13mm", bottom: "16mm", left: "13mm" }
    });
    return Buffer.from(bytes);
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
