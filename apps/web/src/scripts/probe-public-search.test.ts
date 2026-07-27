import {describe, expect, it} from "vitest";
import {formatPublicSearchProbeSummary, parsePublicSearchProbeCommand, runPublicSearchProbeCommand} from "./probe-public-search";

describe("public-search probe command",()=>{
  it("accepts only the compile-time MiMo adapter and produces no secret-bearing output",async()=>{
    expect(()=>parsePublicSearchProbeCommand(["--adapter","caller-module","--locale","zh-CN","--region","CN"])).toThrow(/mimo/i);
    const summary=await runPublicSearchProbeCommand(["--adapter","mimo","--locale","zh-CN","--region","CN"],{
      runProbe:async()=>({
        adapterId:"mimo",
        identity:{adapterId:"mimo",providerId:"xiaomi-mimo",productId:"native-web-search",modelId:"mimo-v2.5-pro",adapterVersion:"mimo-web-search-adapter-v1",surface:{surfaceId:"mimo-native-web-search",providerId:"xiaomi-mimo",productId:"native-web-search",surfaceKind:"documented_api",contractVersion:"public-search-surface-v1",surfaceVersion:"mimo-native-web-search-v1",adapterVersion:"mimo-web-search-adapter-v1",locale:"zh-CN",region:"CN"}},
        cases:[], failureSemantics:{authentication:true,rateLimited:true,timedOut:true,malformed:true}, rawBody:"not-allowed", apiKey:"not-allowed"
      } as never)
    });
    const output=formatPublicSearchProbeSummary(summary);
    expect(output).toContain('"adapterId":"mimo"');
    expect(output).not.toContain("not-allowed");
    expect(output).not.toContain("rawBody");
  });
});
