import {describe, expect, it} from "vitest";
import {finalizeMiMoPublicSearchCertification, runMiMoPublicSearchProbe} from "./certification";

const environment: NodeJS.ProcessEnv={
  NODE_ENV:"test", OGC_PUBLIC_SEARCH_MIMO_BASE_URL:"http://mimo.test/v1",
  OGC_PUBLIC_SEARCH_MIMO_API_KEY:"mimo-secret-value", OGC_PUBLIC_SEARCH_MIMO_MODEL:"mimo-v2.5-pro"
};
const response={choices:[{message:{content:"generated prose must never escape",annotations:[{type:"url_citation",url:"https://openai.com/index/assistants-api-deprecation/",title:"Official notice",summary:"An official source",site_name:"openai.com"}]}}],usage:{web_search_usage:{tool_usage:1,page_usage:1}}};

describe("MiMo public-search certification",()=>{
  it("keeps probe output to redacted observation summaries",async()=>{
    const summary=await runMiMoPublicSearchProbe({environment,locale:"zh-CN",region:"CN",fetch:async()=>new Response(JSON.stringify(response),{status:200})});
    const output=JSON.stringify(summary);
    expect(summary.adapterId).toBe("mimo");
    expect(summary.cases[0]).toMatchObject({id:"official-factual",status:"complete",sourceDomains:["openai.com"]});
    for(const forbidden of ["mimo-secret-value","generated prose must never escape","Authorization","choices","annotations"])expect(output).not.toContain(forbidden);
  });

  it("requires every quality case and independent review references before creating an installable artifact",async()=>{
    const probe=await runMiMoPublicSearchProbe({environment,locale:"zh-CN",region:"CN",fetch:async()=>new Response(JSON.stringify(response),{status:200})});
    expect(()=>finalizeMiMoPublicSearchCertification({
      probe:{...probe,cases:probe.cases.map((item,index)=>index===1?{...item,passed:false}:item)}, locale:"zh-CN", region:"CN", reviewedBy:"operator", reviewedAt:"2026-07-13T00:00:00.000Z",
      review:{termsReviewReference:"terms-review",commercialUseReviewReference:"commercial-review",storageDisplayReviewReference:"storage-review"}
    })).toThrow(/quality/i);
  });

  it("creates only a signed protected-staging artifact after all gates pass",()=>{
    const artifact=finalizeMiMoPublicSearchCertification({
      probe:{adapterId:"mimo",identity:{adapterId:"mimo",providerId:"xiaomi-mimo",productId:"native-web-search",modelId:"mimo-v2.5-pro",adapterVersion:"mimo-web-search-adapter-v1",surface:{surfaceId:"mimo-native-web-search",providerId:"xiaomi-mimo",productId:"native-web-search",surfaceKind:"documented_api",contractVersion:"public-search-surface-v1",surfaceVersion:"mimo-native-web-search-v1",adapterVersion:"mimo-web-search-adapter-v1",locale:"zh-CN",region:"CN"}},cases:[
        {id:"official-factual",status:"complete",passed:true,sourceDomains:["openai.com"],sourceCount:1,usage:{requestCount:1,resultCount:1,costUncertain:true}},
        {id:"chinese-b2b-discovery",status:"complete",passed:true,sourceDomains:["supplier.example"],sourceCount:1,usage:{requestCount:1,resultCount:1,costUncertain:true}},
        {id:"narrow-structured-search",status:"complete",passed:true,sourceDomains:["source.example"],sourceCount:1,usage:{requestCount:1,resultCount:1,costUncertain:true}}
      ],failureSemantics:{authentication:true,rateLimited:true,timedOut:true,malformed:true}},locale:"zh-CN",region:"CN",reviewedBy:"operator",reviewedAt:"2026-07-13T00:00:00.000Z",
      review:{termsReviewReference:"terms-review",commercialUseReviewReference:"commercial-review",storageDisplayReviewReference:"storage-review"},
      signing:{secret:"x".repeat(32),keyId:"mimo-test",version:"v1"}
    });
    expect(artifact).toMatchObject({mode:"live",installable:true,environment:"protected_staging",adapterId:"mimo",signature:{keyId:"mimo-test"}});
  });
});
