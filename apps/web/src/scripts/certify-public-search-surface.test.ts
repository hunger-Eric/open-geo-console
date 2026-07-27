import {describe,expect,it} from "vitest";
import {approvedPublicSearchCertificationAdapters,runPublicSearchCertificationCommand} from "./certify-public-search-surface";
describe("public-search certification command",()=>{
  it("contains only the compile-time MiMo implementation and refuses unknown adapters before probe work",async()=>{
    expect([...approvedPublicSearchCertificationAdapters.keys()]).toEqual(["mimo"]);
    await expect(runPublicSearchCertificationCommand(["--adapter","caller-module","--locale","zh-CN","--region","CN","--output",".data/public-search-certification/a.json"])).rejects.toThrow(/No approved/);
  });
  it("refuses artifact output unless every quality and review gate is present",async()=>{
    await expect(runPublicSearchCertificationCommand(["--adapter","mimo","--locale","zh-CN","--region","CN","--output",".data/public-search-certification/a.json","--reviewed-by","operator","--terms-review-reference","terms","--commercial-use-review-reference","commercial","--storage-display-review-reference","storage"],{certify:async()=>{throw new Error("quality gate failed");}})).rejects.toThrow(/quality gate failed/);
  });
});
