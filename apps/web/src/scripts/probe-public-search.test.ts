import {describe, expect, it, vi} from "vitest";
import type {MiMoPublicSearchProbeSummary} from "@/public-search-adapters/mimo/certification";
import {
  assertPublicSearchProbeReadiness,
  formatPublicSearchProbeSummary,
  parsePublicSearchProbeCommand,
  runPublicSearchProbeCommand
} from "./probe-public-search";

describe("public-search executable readiness probe", () => {
  it("accepts only three passing quality cases with complete failure semantics", async () => {
    expect(() => parsePublicSearchProbeCommand(
      ["--adapter", "caller-module", "--locale", "zh-CN", "--region", "CN"]
    )).toThrow(/mimo/i);
    const runProbe = vi.fn(async () => summary());
    const result = await runPublicSearchProbeCommand(
      ["--adapter", "mimo", "--locale", "zh-CN", "--region", "CN"],
      {environment: {OGC_PUBLIC_SEARCH_MIMO_API_KEY: "secret-value"}, runProbe}
    );

    expect(() => assertPublicSearchProbeReadiness(result)).not.toThrow();
    expect(runProbe).toHaveBeenCalledWith(expect.objectContaining({locale: "zh-CN", region: "CN"}));
  });

  it("fails closed when a quality case times out or a case is missing", () => {
    const timedOut = summary({
      cases: summary().cases.map((item, index) => index === 1
        ? {...item, status: "timed_out", passed: false, sanitizedErrorClass: "timed_out"}
        : item)
    });
    expect(() => assertPublicSearchProbeReadiness(timedOut)).toThrow(/quality|every|required/i);
    expect(() => assertPublicSearchProbeReadiness(summary({cases: summary().cases.slice(0, 2)}))).toThrow(/quality|every|required/i);
  });

  it("fails closed on drifted failure semantics and keeps output secret-safe", () => {
    const drifted = summary({failureSemantics: {...summary().failureSemantics, timedOut: false}});
    expect(() => assertPublicSearchProbeReadiness(drifted)).toThrow(/failure semantics|ready/i);

    const value = summary() as MiMoPublicSearchProbeSummary & {secret?: string; generatedProse?: string};
    value.secret = "secret-value";
    value.generatedProse = "private generated prose";
    const output = formatPublicSearchProbeSummary(value);
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("private generated prose");
    expect(JSON.parse(output).cases).toHaveLength(3);
  });
});

function summary(overrides: Partial<MiMoPublicSearchProbeSummary> = {}): MiMoPublicSearchProbeSummary {
  const cases: MiMoPublicSearchProbeSummary["cases"] = [
    probeCase("official-factual"),
    probeCase("chinese-b2b-discovery"),
    probeCase("narrow-structured-search")
  ];
  return {
    adapterId: "mimo",
    identity: {
      adapterId: "mimo", providerId: "xiaomi-mimo", productId: "native-web-search",
      modelId: "mimo-v2.5-pro", adapterVersion: "mimo-web-search-adapter-v1",
      surface: {
        surfaceId: "mimo-native-web-search", providerId: "xiaomi-mimo", productId: "native-web-search",
        surfaceKind: "documented_api", contractVersion: "public-search-surface-v1",
        surfaceVersion: "mimo-native-web-search-v1", adapterVersion: "mimo-web-search-adapter-v1",
        locale: "zh-CN", region: "CN"
      }
    },
    cases,
    failureSemantics: {authentication: true, rateLimited: true, timedOut: true, malformed: true},
    ...overrides
  };
}

function probeCase(id: MiMoPublicSearchProbeSummary["cases"][number]["id"]): MiMoPublicSearchProbeSummary["cases"][number] {
  return {
    id, status: "complete", passed: true, sourceDomains: ["source.example"], sourceCount: 1,
    usage: {requestCount: 1, resultCount: 1, costUncertain: false}
  };
}
