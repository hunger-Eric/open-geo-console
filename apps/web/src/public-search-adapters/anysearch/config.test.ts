import { describe, expect, it } from "vitest";
import { readAnySearchPublicSearchConfig } from "./config";

const configured = {
  OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL: "https://api.anysearch.com/v1/search",
  OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY: "search-secret"
};

describe("AnySearch public-search configuration", () => {
  it("requires dedicated settings and never derives them from model configuration", () => {
    expect(() => readAnySearchPublicSearchConfig({ OGC_AI_API_KEY: "model-key" }, "zh-CN", "CN")).toThrow(/BASE_URL/);
    expect(() => readAnySearchPublicSearchConfig({ ...configured, OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY: "" }, "zh-CN", "CN")).toThrow(/API_KEY/);
  });

  it("accepts only the official endpoint and maps region to zone", () => {
    expect(readAnySearchPublicSearchConfig(configured, "zh-CN", "CN")).toMatchObject({ zone: "cn", locale: "zh-CN", region: "CN" });
    expect(readAnySearchPublicSearchConfig(configured, "en", "US")).toMatchObject({ zone: "intl" });
    expect(() => readAnySearchPublicSearchConfig({ ...configured, OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL: "https://proxy.example/v1/search" }, "zh-CN", "CN")).toThrow(/official/i);
    expect(() => readAnySearchPublicSearchConfig(configured, "zh", "CN")).toThrow(/locale/i);
    expect(() => readAnySearchPublicSearchConfig(configured, "en", "")).toThrow(/region/i);
  });
});
