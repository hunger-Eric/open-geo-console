import { describe, expect, it } from "vitest";
import { createApprovedPublicSearchAdapterRegistry } from "@/public-search-adapters/registry";
import { createMiMoPublicSearchAdapterFactory } from "@/public-search-adapters/mimo/adapter";
import { resolveProductionPublicSearchRuntime } from "./production-runtime";

const environment = { OGC_PUBLIC_SEARCH_RUNTIME_ENABLED: "true", OGC_DEPLOYMENT_PROFILE: "staging", OGC_PUBLIC_SEARCH_ADAPTER: "mimo", OGC_PUBLIC_SEARCH_LOCALE: "zh-CN", OGC_PUBLIC_SEARCH_REGION: "CN", OGC_PUBLIC_SEARCH_MIMO_BASE_URL: "https://example.test/v1", OGC_PUBLIC_SEARCH_MIMO_API_KEY: "search-key", OGC_PUBLIC_SEARCH_MIMO_MODEL: "mimo-v2.5-pro" };
describe("production public-search runtime", () => {
  it("fails closed for disabled runtime, missing search configuration, and identity drift", async () => {
    const registry=createApprovedPublicSearchAdapterRegistry([createMiMoPublicSearchAdapterFactory()]);
    const getAuthority=async()=>authority();
    await expect(resolveProductionPublicSearchRuntime({environment:{...environment,OGC_PUBLIC_SEARCH_RUNTIME_ENABLED:"false"},registry,getAuthority})).rejects.toThrow(/disabled/i);
    await expect(resolveProductionPublicSearchRuntime({environment:{...environment,OGC_PUBLIC_SEARCH_MIMO_API_KEY:""},registry,getAuthority})).rejects.toThrow(/required/i);
    await expect(resolveProductionPublicSearchRuntime({environment,registry,getAuthority:async()=>({...authority(),modelId:"other"})})).rejects.toThrow(/identity/i);
  });
  it("constructs only an exact registered runtime", async () => {
    const runtime=await resolveProductionPublicSearchRuntime({environment,registry:createApprovedPublicSearchAdapterRegistry([createMiMoPublicSearchAdapterFactory()]),getAuthority:async()=>authority()});
    expect(runtime.identity).toMatchObject({adapterId:"mimo",providerId:"xiaomi-mimo",modelId:"mimo-v2.5-pro"});
  });
});
function authority(){return {authorityVersion:"a",adapterId:"mimo",providerId:"xiaomi-mimo",productId:"native-web-search",modelId:"mimo-v2.5-pro",adapterVersion:"mimo-web-search-adapter-v1",surfaceId:"mimo-native-web-search",surfaceVersion:"mimo-native-web-search-v1",environment:"staging",localeCapabilities:["zh-CN"],regionCapabilities:["CN"],termsReviewedAt:new Date(),evidenceReferences:["review"],active:true,capturedAt:new Date(),createdAt:new Date()};}
