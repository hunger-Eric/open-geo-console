import { beforeEach, describe, expect, it, vi } from "vitest";

const guardHarness = vi.hoisted(() => {
  const state = {
    blockedSite: null as string | null,
    guardSites: [] as string[],
    delegatedSites: [] as string[]
  };
  const blocked = new Error("blocked by Report V4 test guard");
  return {
    state,
    blocked,
    run: vi.fn(async (input: { guardSite: string; delegate: () => Promise<unknown> }) => {
      state.guardSites.push(input.guardSite);
      if (state.blockedSite === input.guardSite) throw blocked;
      state.delegatedSites.push(input.guardSite);
      return input.delegate();
    })
  };
});

const browserHarness = vi.hoisted(() => {
  const page = {
    goto: vi.fn(async () => ({ ok: () => true })),
    setContent: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => undefined),
    emulateMedia: vi.fn(async () => undefined),
    pdf: vi.fn(async () => new Uint8Array(Buffer.from("%PDF-test")))
  };
  const browser = {
    newContext: vi.fn(async () => ({ newPage: vi.fn(async () => page) })),
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined)
  };
  return { page, browser, launch: vi.fn(async () => browser) };
});

vi.mock("server-only", () => ({}), { virtual: true });
vi.mock("@/report-v4/prohibited-operation-guard-runtime", () => ({
  runReportV4GuardedOperation: guardHarness.run
}));
vi.mock("playwright", () => ({ chromium: { launch: browserHarness.launch } }));
vi.mock("playwright-core", () => ({ chromium: { launch: browserHarness.launch } }));
vi.mock("@sparticuz/chromium", () => ({
  default: { args: [], executablePath: vi.fn(async () => "test-chromium") }
}));
import { exportCanonicalArtifactHtmlPdf, exportReportPdf, isControlledReportArtifactUrl } from "./pdf-export";

beforeEach(() => {
  guardHarness.state.blockedSite = null;
  guardHarness.state.guardSites.length = 0;
  guardHarness.state.delegatedSites.length = 0;
  guardHarness.run.mockClear();
  browserHarness.launch.mockClear();
  browserHarness.browser.newContext.mockClear();
  browserHarness.browser.newPage.mockClear();
  browserHarness.browser.close.mockClear();
  browserHarness.page.goto.mockClear();
  browserHarness.page.setContent.mockClear();
  browserHarness.page.evaluate.mockClear();
  browserHarness.page.emulateMedia.mockClear();
  browserHarness.page.pdf.mockClear();
});

describe("isControlledReportArtifactUrl", () => {
  it.each([
    "/reports/report-1/report.html",
    "/reports/report-1/legacy-report.html",
    "/reports/report-1/recommendation-report.html"
  ])("allows the controlled artifact path %s", (pathname) => {
    expect(isControlledReportArtifactUrl(new URL(pathname, "https://example.test"))).toBe(true);
  });

  it.each([
    "/reports/report-1/other-report.html",
    "/reports/report-1/recommendation-report.html/extra",
    "/api/reports/report-1/artifacts/recommendation-report.pdf"
  ])("rejects the uncontrolled path %s", (pathname) => {
    expect(isControlledReportArtifactUrl(new URL(pathname, "https://example.test"))).toBe(false);
  });
});

describe("Report V4 PDF export entry guards", () => {
  it.each([
    {
      site: "pdf_export_url",
      invoke: () => exportReportPdf({
        htmlUrl: "https://example.test/reports/report-1/report.html",
        cookieHeader: "report_access=test"
      })
    },
    {
      site: "pdf_export_html",
      invoke: () => exportCanonicalArtifactHtmlPdf("<!doctype html><html><body>ready</body></html>")
    }
  ])("blocks $site before Chromium is launched", async ({ site, invoke }) => {
    guardHarness.state.blockedSite = site;

    await expect(invoke()).rejects.toBe(guardHarness.blocked);

    expect(guardHarness.state.guardSites).toEqual([site]);
    expect(guardHarness.state.delegatedSites).toEqual([]);
    expect(browserHarness.launch).not.toHaveBeenCalled();
  });

  it("delegates the URL export exactly once when no guard context is active", async () => {
    await expect(exportReportPdf({
      htmlUrl: "https://example.test/reports/report-1/report.html",
      cookieHeader: "report_access=test"
    })).resolves.toEqual(Buffer.from("%PDF-test"));

    expect(guardHarness.state.guardSites).toEqual(["pdf_export_url"]);
    expect(guardHarness.state.delegatedSites).toEqual(["pdf_export_url"]);
    expect(browserHarness.launch).toHaveBeenCalledTimes(1);
    expect(browserHarness.page.goto).toHaveBeenCalledTimes(1);
  });

  it("delegates the canonical HTML export exactly once when no guard context is active", async () => {
    await expect(exportCanonicalArtifactHtmlPdf("<!doctype html><html><body>ready</body></html>"))
      .resolves.toEqual(Buffer.from("%PDF-test"));

    expect(guardHarness.state.guardSites).toEqual(["pdf_export_html"]);
    expect(guardHarness.state.delegatedSites).toEqual(["pdf_export_html"]);
    expect(browserHarness.launch).toHaveBeenCalledTimes(1);
    expect(browserHarness.page.setContent).toHaveBeenCalledTimes(1);
  });
});
