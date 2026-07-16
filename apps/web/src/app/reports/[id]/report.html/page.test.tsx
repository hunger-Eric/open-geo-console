import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseCombinedGeoReportV4 } from "@open-geo-console/ai-report-engine";

const mocks=vi.hoisted(()=>({cookies:vi.fn(),notFound:vi.fn(),loadPrivateReportArtifact:vi.fn(),tokenGrantsReportAccess:vi.fn()}));
vi.mock("next/headers",()=>({cookies:mocks.cookies}));
vi.mock("next/navigation",()=>({notFound:mocks.notFound}));
vi.mock("@/report/artifact-model",()=>({loadPrivateReportArtifact:mocks.loadPrivateReportArtifact}));
vi.mock("@/server/report-access",()=>({reportAccessCookieName:(id:string,scope:string)=>`${id}/${scope}`,tokenGrantsReportAccess:mocks.tokenGrantsReportAccess}));

import PrivateHtmlReportPage from "./page";

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01
describe("private canonical HTML report page",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({get:vi.fn(()=>undefined)});
    mocks.tokenGrantsReportAccess.mockResolvedValue(false);
    mocks.notFound.mockImplementation(()=>{throw new Error("APP_404");});
  });

  it("returns the application 404 before loading an artifact for anonymous access",async()=>{
    await expect(PrivateHtmlReportPage({params:Promise.resolve({id:"report-v3"})})).rejects.toThrow("APP_404");
    expect(mocks.loadPrivateReportArtifact).not.toHaveBeenCalled();
  });

  it("checks the V3 scoped cookie after V4 but before older combined scopes",async()=>{
    mocks.cookies.mockResolvedValue({get:vi.fn((name:string)=>({value:name.endsWith("combined_geo_report_v3")?"v3-token":"older-token"}))});
    mocks.tokenGrantsReportAccess.mockImplementation(async(token:string|undefined,_id:string,scope:string)=>token==="v3-token"&&scope==="combined_geo_report_v3");
    mocks.loadPrivateReportArtifact.mockResolvedValue({productContract:"combined_geo_report_v3"});
    await PrivateHtmlReportPage({params:Promise.resolve({id:"report-v3"})});
    expect(mocks.loadPrivateReportArtifact).toHaveBeenCalledWith("report-v3","combined_geo_report_v3");
    expect(mocks.tokenGrantsReportAccess.mock.calls.slice(0, 2)).toEqual([
      ["older-token", "report-v3", "combined_geo_report_v4"],
      ["v3-token","report-v3","combined_geo_report_v3"]
    ]);
  });

  it("checks V4 first, loads only the V4 model and renders no PDF surface", async () => {
    mocks.cookies.mockResolvedValue({ get: vi.fn((name: string) => ({
      value: name.endsWith("combined_geo_report_v4") ? "v4-token" : "older-token"
    })) });
    mocks.tokenGrantsReportAccess.mockImplementation(async (token: string | undefined, _id: string, scope: string) =>
      token === "v4-token" && scope === "combined_geo_report_v4");
    mocks.loadPrivateReportArtifact.mockResolvedValue({
      productContract: "combined_geo_report_v4",
      combinedReport: v4Report()
    });

    const page = await PrivateHtmlReportPage({ params: Promise.resolve({ id: "report-v4" }) });
    const html = renderToStaticMarkup(page);
    const customerSurface = html.replace(/<style[\s\S]*?<\/style>/gi, "");

    expect(mocks.tokenGrantsReportAccess.mock.calls[0]).toEqual([
      "v4-token", "report-v4", "combined_geo_report_v4"
    ]);
    expect(mocks.loadPrivateReportArtifact).toHaveBeenCalledTimes(1);
    expect(mocks.loadPrivateReportArtifact).toHaveBeenCalledWith("report-v4", "combined_geo_report_v4");
    expect(html).toContain('data-report-version="4"');
    expect(html).toContain("V4 customer answer one.");
    expect(customerSurface).not.toMatch(/\.pdf\b|<button|download(?:=| pdf)|print report|pdf download/i);
  });

  it("fails closed when a V3 token appears only in the V4 cookie", async () => {
    mocks.cookies.mockResolvedValue({ get: vi.fn((name: string) => name.endsWith("combined_geo_report_v4")
      ? { value: "v3-token" }
      : undefined) });
    mocks.tokenGrantsReportAccess.mockImplementation(async (token: string | undefined, _id: string, scope: string) =>
      token === "v3-token" && scope === "combined_geo_report_v3");

    await expect(PrivateHtmlReportPage({ params: Promise.resolve({ id: "report-v4" }) }))
      .rejects.toThrow("APP_404");
    expect(mocks.loadPrivateReportArtifact).not.toHaveBeenCalled();
  });

  it("fails closed when an authorized V4 model is missing", async () => {
    mocks.cookies.mockResolvedValue({ get: vi.fn((name: string) => name.endsWith("combined_geo_report_v4")
      ? { value: "v4-token" }
      : undefined) });
    mocks.tokenGrantsReportAccess.mockImplementation(async (token: string | undefined, _id: string, scope: string) =>
      token === "v4-token" && scope === "combined_geo_report_v4");
    mocks.loadPrivateReportArtifact.mockResolvedValue(null);

    await expect(PrivateHtmlReportPage({ params: Promise.resolve({ id: "report-v4" }) }))
      .rejects.toThrow("APP_404");
    expect(mocks.loadPrivateReportArtifact).toHaveBeenCalledWith("report-v4", "combined_geo_report_v4");
  });

  it("returns the application 404 for a valid token bound to another artifact scope", async () => {
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: "older-token" })) });
    mocks.tokenGrantsReportAccess.mockResolvedValue(false);
    await expect(PrivateHtmlReportPage({ params: Promise.resolve({ id: "report-v3" }) }))
      .rejects.toThrow("APP_404");
    expect(mocks.loadPrivateReportArtifact).not.toHaveBeenCalled();
  });

  it("returns the application 404 when an authorized artifact does not exist", async () => {
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: "v3-token" })) });
    mocks.tokenGrantsReportAccess.mockResolvedValue(true);
    mocks.loadPrivateReportArtifact.mockResolvedValue(null);
    await expect(PrivateHtmlReportPage({ params: Promise.resolve({ id: "report-v3" }) }))
      .rejects.toThrow("APP_404");
  });
});

function v4Report() {
  return parseCombinedGeoReportV4({
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4",
    artifactRevisionId: "revision-v4",
    targetUrl: "https://target.example/",
    locale: "en-US",
    generatedAt: "2030-01-01T00:00:00.000Z",
    status: "completed",
    websiteSynthesis: {
      summary: "V4 website conclusion.",
      strengths: ["V4 website strength."],
      gaps: ["V4 website gap."],
      actions: ["V4 GEO website action."]
    },
    questions: [
      question(1, "one"),
      question(2, "two"),
      question(3, "three")
    ]
  });
}

function question(order: 1 | 2 | 3, word: string) {
  return {
    order,
    questionId: `question-${order}`,
    questionText: `V4 customer question ${word}?`,
    status: "answered",
    answer: `V4 customer answer ${word}.`,
    sources: []
  };
}
