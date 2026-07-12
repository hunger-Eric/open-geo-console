import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
const root=resolve(import.meta.dirname,"../../../..");
const active=["apps/web/src/worker/processor.ts","apps/web/src/public-source-forensics/production-runtime.ts","apps/web/src/recommendation-forensics/product-availability.ts","apps/web/src/app/api/reports/[id]/checkout/route.ts","apps/web/src/app/api/commerce/catalog/route.ts",".env.example","package.json","apps/web/package.json"];
describe("active V2 runtime reachability",()=>{
  it("has no active V1 provider adapter, credential, certification CLI, or admission flag",()=>{const source=active.map((file)=>readFileSync(resolve(root,file),"utf8")).join("\n");for(const term of ["createProductionRecommendationDependencies","adapters/openai-web-search","adapters/perplexity-sonar","OGC_ANSWER_OPENAI","OGC_ANSWER_PERPLEXITY","OGC_RECOMMENDATION_PUBLIC_ENABLED","recommendation:certify","recommendation:authority:install"])expect(source).not.toContain(term);});
  it("keeps crawler identity packages independent of fulfillment retirement",()=>{const source=readFileSync(resolve(root,"packages/crawler-rules/src/index.ts"),"utf8");expect(source).toMatch(/OpenAI|GPTBot/i);});
});
