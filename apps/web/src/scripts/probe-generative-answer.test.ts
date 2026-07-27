import {readFileSync} from "node:fs";
import type {GenerativeSearchAnswerProvider} from "@open-geo-console/ai-report-engine";
import {describe, expect, it} from "vitest";
import {
  DEFAULT_GENERATIVE_ANSWER_PROBE_OPTIONS,
  formatGenerativeAnswerProbeFailure,
  formatGenerativeAnswerProbeSummary,
  parseGenerativeAnswerProbeCommand,
  runGenerativeAnswerProbeCommand
} from "./probe-generative-answer";

describe("generative-answer staging probe", () => {
  it("uses one frozen generic input when the checked-in command passes no arguments", () => {
    expect(parseGenerativeAnswerProbeCommand([])).toEqual({
      question: "采购跨境物流服务时，应核验哪些公开证据？",
      locale: "zh-CN",
      region: "CN"
    });
    expect(Object.isFrozen(DEFAULT_GENERATIVE_ANSWER_PROBE_OPTIONS)).toBe(true);
  });
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
    expect(() => parseGenerativeAnswerProbeCommand([
      "--question", "ordinary question", "--locale", "en"
    ])).toThrow(/only --question|required/i);
    expect(() => parseGenerativeAnswerProbeCommand([
      "--question", "ordinary question", "--question", "duplicate",
      "--locale", "en", "--region", "US"
    ])).toThrow(/duplicate/i);
    expect(() => parseGenerativeAnswerProbeCommand([
      "--question", "x".repeat(2_001), "--locale", "en", "--region", "US"
    ])).toThrow(/safe length/i);
  });

  it("runs the zero-argument command through guard, resolution, and provider request in order", async () => {
    const calls: string[] = [];
    const summary = await runGenerativeAnswerProbeCommand([], {
      prepare: async () => {
        calls.push("prepare");
        return {
          profile: "staging",
          databaseFingerprint: "not-output",
          commerceMode: "sandbox",
          fulfillmentMode: "batch_24h"
        };
      },
      resolveProvider: (_environment, input) => {
        calls.push(`resolve:${input.locale}:${input.region}`);
        return {
          providerId: "xiaomi-mimo",
          model: "mimo-v2.5-pro",
          searchMode: "native_web_search",
          async answerWithSources(answerInput) {
            calls.push(`answer:${answerInput.question}`);
            return {
              questionId: answerInput.questionId,
              answerText: "公开证据回答",
              sources: [],
              refusal: null,
              searchedAt: "2030-01-01T00:00:00.000Z",
              completedAt: "2030-01-01T00:00:01.000Z",
              providerResponseId: null
            };
          }
        };
      },
      signal: new AbortController().signal
    });

    expect(calls).toEqual([
      "prepare",
      "resolve:zh-CN:CN",
      "answer:采购跨境物流服务时，应核验哪些公开证据？"
    ]);
    expect(summary.answerNonblank).toBe(true);
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

  it("reports only fixed secret-safe failure stages", async () => {
    const secret = "SECRET_CUSTOMER_TOKEN_AND_PROVIDER_BODY";
    const scenarios = [
      {
        expected: "command",
        run: () => runGenerativeAnswerProbeCommand(["--question", secret])
      },
      {
        expected: "staging_guard",
        run: () => runGenerativeAnswerProbeCommand([], {
          prepare: async () => { throw new Error(secret); }
        })
      },
      {
        expected: "provider_resolution",
        run: () => runGenerativeAnswerProbeCommand([], {
          prepare: async () => ({profile: "staging", databaseFingerprint: secret, commerceMode: "sandbox", fulfillmentMode: "batch_24h"}),
          resolveProvider: () => { throw new Error(secret); }
        })
      },
      {
        expected: "provider_request",
        run: () => runGenerativeAnswerProbeCommand([], {
          prepare: async () => ({profile: "staging", databaseFingerprint: secret, commerceMode: "sandbox", fulfillmentMode: "batch_24h"}),
          resolveProvider: () => ({
            providerId: "xiaomi-mimo",
            model: "mimo-v2.5-pro",
            searchMode: "native_web_search",
            answerWithSources: async () => { throw new Error(secret); }
          })
        })
      }
    ];

    for (const scenario of scenarios) {
      const output = await scenario.run().then(
        () => { throw new Error("Expected the staged probe failure."); },
        (error: unknown) => formatGenerativeAnswerProbeFailure(error)
      );
      expect(JSON.parse(output)).toEqual({
        error: "generative_answer_staging_probe_failed",
        stage: scenario.expected
      });
      expect(output).not.toContain(secret);
    }
    expect(formatGenerativeAnswerProbeFailure(new Error(secret))).toBe(
      '{"error":"generative_answer_staging_probe_failed","stage":"unexpected"}'
    );
  });
});
