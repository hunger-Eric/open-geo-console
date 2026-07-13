import { describe, expect, it, vi } from "vitest";
import { createApprovedPublicSearchAdapterRegistry } from "@/public-search-adapters/registry";
import { createMiMoPublicSearchAdapterFactory } from "@/public-search-adapters/mimo/adapter";
import type { PublicSourceForensicsDependencies } from "@/worker/public-source-forensics";
import {
  createProductionPublicSourceForensicsDependencies,
  resolveProductionPublicSearchRuntime,
  type ProductionPublicSourceForensicsRuntimeOptions
} from "./production-runtime";

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

  it("constructs injectable snapshot and persistence dependencies only after exact runtime resolution", async () => {
    const runtime = await resolveProductionPublicSearchRuntime({
      environment,
      registry: createApprovedPublicSearchAdapterRegistry([createMiMoPublicSearchAdapterFactory()]),
      getAuthority: async () => authority()
    });
    const resolveRuntime = vi.fn(async () => runtime);
    const expected = fixtureDependencies(runtime.authority);
    const createDependencies: ProductionPublicSourceForensicsRuntimeOptions["createDependencies"] = async (resolved) => {
      expect(resolved.authority).toBe(runtime.authority);
      return expected;
    };
    const dependencies = await createProductionPublicSourceForensicsDependencies(environment, { resolveRuntime, createDependencies });

    expect(dependencies).not.toBeNull();
    expect(dependencies?.authority.authorityId).toBe("a");
    expect(resolveRuntime).toHaveBeenCalledTimes(1);
  });

  it("keeps production dependency construction closed when exact resolution fails", async () => {
    const dependencies = await createProductionPublicSourceForensicsDependencies(
      { ...environment, OGC_PUBLIC_SEARCH_RUNTIME_ENABLED: "false" },
      { resolveRuntime: async () => { throw new Error("disabled"); } }
    );
    expect(dependencies).toBeNull();
  });

  it("rejects collaborators that replace the resolved authority identity", async () => {
    const runtime = await resolveProductionPublicSearchRuntime({
      environment,
      registry: createApprovedPublicSearchAdapterRegistry([createMiMoPublicSearchAdapterFactory()]),
      getAuthority: async () => authority()
    });
    const dependencies = await createProductionPublicSourceForensicsDependencies(environment, {
      resolveRuntime: async () => runtime,
      createDependencies: async () => fixtureDependencies({ ...runtime.authority, surface: { ...runtime.authority.surface, surfaceVersion: "other" } })
    });
    expect(dependencies).toBeNull();
  });
});
function authority(){return {authorityVersion:"a",adapterId:"mimo",providerId:"xiaomi-mimo",productId:"native-web-search",modelId:"mimo-v2.5-pro",adapterVersion:"mimo-web-search-adapter-v1",surfaceId:"mimo-native-web-search",surfaceVersion:"mimo-native-web-search-v1",environment:"staging",localeCapabilities:["zh-CN"],regionCapabilities:["CN"],termsReviewedAt:new Date(),evidenceReferences:["review"],active:true,capturedAt:new Date(),createdAt:new Date()};}
function fixtureDependencies(authority: Awaited<ReturnType<typeof resolveProductionPublicSearchRuntime>>["authority"]): PublicSourceForensicsDependencies {
  return {
    authority,
    resolveSnapshot: async () => { throw new Error("not exercised"); },
    getCheckpoint: async () => null,
    saveCheckpoint: async () => undefined,
    getReport: async () => null,
    saveReport: async (report) => report as never,
    artifactReadiness: { verify: async () => undefined }
  };
}
