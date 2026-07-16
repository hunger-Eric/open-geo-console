import { describe, expect, it } from "vitest";
import type { PublicSearchAdapterFactory } from "./types";
import {
  createApprovedPublicSearchAdapterRegistry,
  selectApprovedPublicSearchAdapterFactory
} from "./registry";

function factory(adapterId: string): PublicSearchAdapterFactory {
  return {
    adapterId,
    resolveIdentity: () => ({
      adapterId,
      providerId: "fixture-provider",
      productId: "fixture-product",
      modelId: "fixture-model",
      adapterVersion: "fixture-adapter-v1",
      surface: {
        surfaceId: "fixture-surface",
        providerId: "fixture-provider",
        productId: "fixture-product",
        surfaceKind: "documented_api",
        contractVersion: "public-search-surface-v1",
        surfaceVersion: "fixture-v1",
        adapterVersion: "fixture-adapter-v1",
        locale: "zh-CN",
        region: "CN"
      }
    }),
    create: () => {
      throw new Error("Fixture factory must not create an adapter in registry tests.");
    }
  };
}

describe("approved public-search adapter registry", () => {
  it("rejects empty, duplicate, and invalid compile-time registrations", () => {
    expect(() => createApprovedPublicSearchAdapterRegistry([])).toThrow(/at least one/i);
    expect(() => createApprovedPublicSearchAdapterRegistry([factory("mimo"), factory("mimo")]))
      .toThrow(/duplicate/i);
    for (const invalid of ["MiMo", "mimo_adapter", "mimo/path", "", "a".repeat(65)]) {
      expect(() => createApprovedPublicSearchAdapterRegistry([factory(invalid)])).toThrow(/adapter id/i);
    }
  });

  it("selects only an exact approved adapter ID after trimming", () => {
    const approved = factory("mimo");
    const registry = createApprovedPublicSearchAdapterRegistry([approved]);

    expect(selectApprovedPublicSearchAdapterFactory({
      environment: { OGC_PUBLIC_SEARCH_ADAPTER: "  mimo  " }, registry
    })).toBe(approved);
    expect(() => selectApprovedPublicSearchAdapterFactory({ environment: {}, registry })).toThrow(/not configured/i);
    expect(() => selectApprovedPublicSearchAdapterFactory({
      environment: { OGC_PUBLIC_SEARCH_ADAPTER: "caller-module" }, registry
    })).toThrow(/not approved/i);
    expect(() => selectApprovedPublicSearchAdapterFactory({
      environment: { OGC_PUBLIC_SEARCH_ADAPTER: "../mimo" }, registry
    })).toThrow(/not approved/i);
  });

  it("returns a copied readonly registry", () => {
    const source = new Map([["mimo", factory("mimo")]]);
    const registry = createApprovedPublicSearchAdapterRegistry([...source.values()]);
    source.clear();

    expect(registry.get("mimo")?.adapterId).toBe("mimo");
    expect(Object.isFrozen(registry)).toBe(true);
  });
});
