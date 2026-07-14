import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({cookies:vi.fn(),notFound:vi.fn(),loadPrivateReportArtifact:vi.fn(),tokenGrantsReportAccess:vi.fn()}));
vi.mock("next/headers",()=>({cookies:mocks.cookies}));
vi.mock("next/navigation",()=>({notFound:mocks.notFound}));
vi.mock("@/report/artifact-model",()=>({loadPrivateReportArtifact:mocks.loadPrivateReportArtifact}));
vi.mock("@/server/report-access",()=>({reportAccessCookieName:(id:string,scope:string)=>`${id}/${scope}`,tokenGrantsReportAccess:mocks.tokenGrantsReportAccess}));

import PrivateHtmlReportPage from "./page";

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

  it("checks the V3 scoped cookie before older combined scopes",async()=>{
    mocks.cookies.mockResolvedValue({get:vi.fn((name:string)=>({value:name.endsWith("combined_geo_report_v3")?"v3-token":"older-token"}))});
    mocks.tokenGrantsReportAccess.mockImplementation(async(token:string|undefined,_id:string,scope:string)=>token==="v3-token"&&scope==="combined_geo_report_v3");
    mocks.loadPrivateReportArtifact.mockResolvedValue({productContract:"combined_geo_report_v3"});
    await PrivateHtmlReportPage({params:Promise.resolve({id:"report-v3"})});
    expect(mocks.loadPrivateReportArtifact).toHaveBeenCalledWith("report-v3","combined_geo_report_v3");
    expect(mocks.tokenGrantsReportAccess.mock.calls[0]).toEqual(["v3-token","report-v3","combined_geo_report_v3"]);
  });
});
