import {describe,expect,it} from "vitest";
import {approvedPublicSearchCertificationAdapters,runPublicSearchCertificationCommand} from "./certify-public-search-surface";
describe("public-search certification command",()=>{
  it("contains only the compile-time MiMo and AnySearch implementations and refuses unknown adapters before probe work",async()=>{
    expect([...approvedPublicSearchCertificationAdapters.keys()]).toEqual(["mimo", "anysearch"]);
    await expect(runPublicSearchCertificationCommand(["--adapter","caller-module","--locale","zh-CN","--region","CN","--output",".data/public-search-certification/a.json"])).rejects.toThrow(/No approved/);
  });
  it("routes AnySearch certification through the approved compile-time entry",async()=>{
    let selected="";
    await runPublicSearchCertificationCommand(["--adapter","anysearch","--locale","zh-CN","--region","CN","--output",".data/public-search-certification/anysearch.json","--reviewed-by","operator","--terms-review-reference","terms","--commercial-use-review-reference","commercial","--storage-display-review-reference","storage"],{certify:async(options)=>{selected=options.adapterId;}});
    expect(selected).toBe("anysearch");
  });
  it("refuses artifact output unless every quality and review gate is present",async()=>{
    await expect(runPublicSearchCertificationCommand(["--adapter","mimo","--locale","zh-CN","--region","CN","--output",".data/public-search-certification/a.json","--reviewed-by","operator","--terms-review-reference","terms","--commercial-use-review-reference","commercial","--storage-display-review-reference","storage"],{certify:async()=>{throw new Error("quality gate failed");}})).rejects.toThrow(/quality gate failed/);
  });
});
