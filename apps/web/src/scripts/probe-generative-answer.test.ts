import {readFileSync} from "node:fs";
import type {GenerativeSearchAnswerProvider} from "@open-geo-console/ai-report-engine";
import {describe, expect, it} from "vitest";
import {
  formatGenerativeAnswerProbeSummary,
  parseGenerativeAnswerProbeCommand,
  runGenerativeAnswerProbeCommand
} from "./probe-generative-answer";

describe("generative-answer staging probe", () => {
  it("accepts only one nonblank question, locale, and region", () => {
    expect(parseGenerativeAnswerProbeCommand([
      "--question", "采购跨境物流服务时，应核验哪些限制？",
      "--locale", "zh-CN",
      "--region", "CN"
    ])).toEqual({
      question: "采购跨境物流服务时，应核验哪些限制？",
      locale: "zh-CN",
      region: "CN"
    });

    expect(() => parseGenerativeAnswerProbeCommand([
      "--question", " ", "--locale", "zh-CN", "--region", "CN"
    ])).toThrow(/required/i);
    expect(() => parseGenerativeAnswerProbeCommand([
      "--question", "ordinary question", "--locale", "en", "--region", "US",
      "--customer", "private-customer"
    ])).toThrow(/only --question/i);
  });

  it("runs the protected staging guard first and emits only secret-safe fields", async () => {
    const calls: string[] = [];
    const provider: GenerativeSearchAnswerProvider = {
      providerId: "xiaomi-mimo",
      model: "mimo-v2.5-pro",
      searchMode: "native_web_search",
      async answerWithSources(input) {
        calls.push(`answer:${input.question}`);
        return {
          questionId: input.questionId,
          answerText: "SECRET_COMPLETE_ANSWER customer@example.com",
          sources: [{
            sourceId: "source-1",
            title: "SECRET_SOURCE_TITLE",
            canonicalUrl: "https://provider.example/services?customer=secret",
            registrableDomain: "provider.example",
            citedText: "SECRET_CITED_TEXT",
            providerResultOrder: 1
          }],
          refusal: null,
          searchedAt: "2030-01-01T00:00:00.000Z",
          completedAt: "2030-01-01T00:00:01.000Z",
          providerResponseId: "SECRET_RAW_RESPONSE_ID"
        };
      }
    };
    const summary = await runGenerativeAnswerProbeCommand([
      "--question", "SECRET_CUSTOMER_IDENTITY asks an ordinary question",
      "--locale", "en",
      "--region", "US"
    ], {
      environment: {MIMO_API_KEY: "SECRET_API_KEY"},
      prepare: async () => {
        calls.push("prepare");
        return {
          profile: "staging",
          databaseFingerprint: "SECRET_DATABASE_FINGERPRINT",
          commerceMode: "sandbox",
          fulfillmentMode: "batch_24h"
        };
      },
      resolveProvider: () => {
        calls.push("resolve");
        return provider;
      },
      signal: new AbortController().signal
    });
    const output = formatGenerativeAnswerProbeSummary(summary);

    expect(calls).toEqual([
      "prepare",
      "resolve",
      "answer:SECRET_CUSTOMER_IDENTITY asks an ordinary question"
    ]);
    expect(JSON.parse(output)).toEqual({
      profile: "staging",
      providerId: "xiaomi-mimo",
      model: "mimo-v2.5-pro",
      searchMode: "native_web_search",
      answerNonblank: true,
      sourceCount: 1,
      sourceDomains: ["provider.example"],
      refusalCode: null
    });
    for (const forbidden of [
      "SECRET_API_KEY",
      "SECRET_COMPLETE_ANSWER",
      "SECRET_SOURCE_TITLE",
      "SECRET_CITED_TEXT",
      "SECRET_RAW_RESPONSE_ID",
      "SECRET_CUSTOMER_IDENTITY",
      "SECRET_DATABASE_FINGERPRINT",
      "customer=secret"
    ]) expect(output).not.toContain(forbidden);
  });

  it("loads the merged environment used by protected staging workers", () => {
    const webPackage = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as {scripts: Record<string, string>};
    const rootPackage = JSON.parse(
      readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")
    ) as {scripts: Record<string, string>};

    expect(webPackage.scripts["generative-answer:staging:probe"]).toBe(
      "node --env-file=../../.data/workstation-docker/staging.env --import tsx src/scripts/probe-generative-answer.ts"
    );
    expect(rootPackage.scripts["generative-answer:staging:probe"]).toBe(
      "npm run generative-answer:staging:probe --workspace apps/web --"
    );
  });
});
