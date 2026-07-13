import { describe, expect, it } from "vitest";
import { readMiMoPublicSearchConfig } from "./config";

const independent = {
  OGC_PUBLIC_SEARCH_MIMO_BASE_URL: "https://search.example.test/v1/",
  OGC_PUBLIC_SEARCH_MIMO_API_KEY: "search-secret",
  OGC_PUBLIC_SEARCH_MIMO_MODEL: "mimo-v2.5-pro"
};

describe("MiMo public-search configuration", () => {
  it("never derives missing search settings from report-model configuration", () => {
    const reportOnly = {
      OGC_AI_BASE_URL: "https://report.example.test/v1",
      OGC_AI_API_KEY: "same-secret",
      OGC_AI_MODEL: "report-model"
    };
    expect(() => readMiMoPublicSearchConfig(reportOnly, "zh-CN", "CN")).toThrow(/OGC_PUBLIC_SEARCH_MIMO_BASE_URL/i);
    expect(() => readMiMoPublicSearchConfig({ ...reportOnly, OGC_PUBLIC_SEARCH_MIMO_BASE_URL: independent.OGC_PUBLIC_SEARCH_MIMO_BASE_URL }, "zh-CN", "CN"))
      .toThrow(/OGC_PUBLIC_SEARCH_MIMO_API_KEY/i);
  });

  it("accepts equal values only when the search variables are explicitly present", () => {
    expect(readMiMoPublicSearchConfig({
      ...independent,
      OGC_AI_API_KEY: independent.OGC_PUBLIC_SEARCH_MIMO_API_KEY
    }, "zh-CN", "CN")).toMatchObject({ apiKey: "search-secret", locale: "zh-CN", region: "CN" });
  });

  it("validates base URL, model, locale, and region deterministically", () => {
    expect(() => readMiMoPublicSearchConfig({ ...independent, OGC_PUBLIC_SEARCH_MIMO_BASE_URL: "http://public.example.test/v1" }, "zh-CN", "CN"))
      .toThrow(/HTTPS/i);
    expect(() => readMiMoPublicSearchConfig({ ...independent, OGC_PUBLIC_SEARCH_MIMO_BASE_URL: "https://user:pass@search.example.test/v1" }, "zh-CN", "CN"))
      .toThrow(/credentials/i);
    expect(() => readMiMoPublicSearchConfig({ ...independent, OGC_PUBLIC_SEARCH_MIMO_MODEL: "mimo model" }, "zh-CN", "CN"))
      .toThrow(/model/i);
    expect(() => readMiMoPublicSearchConfig(independent, "zh", "CN")).toThrow(/locale/i);
    expect(() => readMiMoPublicSearchConfig(independent, "en", "")).toThrow(/region/i);
  });
});
