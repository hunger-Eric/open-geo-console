import { describe,expect,it } from "vitest";
import { readPublicSourceExecutionBudget } from "./budget";
describe("public-source execution budget",()=>{
  it("uses bounded defaults with exactly one transient retry",()=>expect(readPublicSourceExecutionBudget({})).toMatchObject({dailyRequestCap:100,maxResultsPerQuestion:10,maxTransientRetries:1,sourceFetchMaxRedirects:5}));
  it("rejects unsafe caps",()=>{expect(()=>readPublicSourceExecutionBudget({OGC_PUBLIC_SEARCH_DAILY_REQUEST_CAP:"0"})).toThrow(/integer/);expect(()=>readPublicSourceExecutionBudget({OGC_PUBLIC_SEARCH_TIMEOUT_MS:"120001"})).toThrow(/integer/);});
});
