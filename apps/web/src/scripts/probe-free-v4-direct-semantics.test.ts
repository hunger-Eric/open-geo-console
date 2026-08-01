import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { runFreeV4DirectSemanticsProbe } from "./probe-free-v4-direct-semantics";

describe("Free V4 direct semantics probe", () => {
  it("runs only Q1 answer then flexible analysis and persists both receipts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ogc-free-direct-"));
    const calls: string[] = [];
    const structuredInvoke = vi.fn(async () => {
      calls.push("analysis");
      return {
        summary: "The answer is supported by the provider source.",
        observations: ["The source describes freight forwarding."],
        recommendations: [],
        evidenceHandles: ["S1", "T1"],
        checkoutEligible: true,
        harmlessExtra: "ignored"
      };
    });
    const result = await runFreeV4DirectSemanticsProbe({
      outputDirectory: directory,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
      dependencies: {
        environment: {},
        answerProvider: {
          providerId: "test-provider",
          model: "test-model",
          searchMode: "native_web_search",
          answerWithSources: vi.fn(async ({ questionId }) => {
            calls.push("q1_answer");
            return {
              questionId,
              answerText: "Flexport and other providers offer international freight forwarding services.",
              sources: [{
                sourceId: "source-1", title: "Provider source", canonicalUrl: "https://provider.example/",
                registrableDomain: "provider.example", citedText: "International freight forwarding services", providerResultOrder: 0
              }],
              refusal: null,
              searchedAt: "2030-01-01T00:00:00.000Z",
              completedAt: "2030-01-01T00:00:01.000Z",
              providerResponseId: "response-1"
            };
          })
        },
        structuredInvoker: { invoke: structuredInvoke }
      }
    });
    expect(calls).toEqual(["q1_answer", "analysis"]);
    expect(result.callSequence).toEqual(calls);
    expect(result.modelCallCount).toBe(2);
    expect(result.transportRequestCount).toBeNull();
    expect(result.globalReviewCallCount).toBe(0);
    expect(result.questions).toHaveLength(3);
    expect(JSON.parse(structuredInvoke.mock.calls[0]![0].inputText)).toMatchObject({
      targetIdentity: {
        canonicalName: "凌顺速递",
        aliases: ["凌顺速递", "凌顺国际物流", "深圳市凌顺国际物流有限公司"],
        domain: "shun-express.com"
      }
    });
    expect(structuredInvoke.mock.calls[0]![0].systemText).toContain("targetIdentity");
    expect(result.coreReceipt.kind).toBe("core");
    expect(result.analysisReceipt.kind).toBe("analysis");
    const persisted = JSON.parse(await readFile(join(directory, "direct-semantics-receipt.json"), "utf8"));
    expect(persisted).toEqual(result);
  });
});
