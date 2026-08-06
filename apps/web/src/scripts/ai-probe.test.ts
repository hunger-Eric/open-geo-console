import { describe, expect, it, vi } from "vitest";
import type { JsonCompletionClient, JsonCompletionRequest } from "@open-geo-console/ai-report-engine";
import { PageAnalysisBatchError, PageAnalysisContractError } from "@open-geo-console/ai-report-engine";
import { runAiProbe, safeAiProbeFailure } from "./ai-probe";

describe("four-page AI contract probe", () => {
  it("uses four sequential Worker-shaped page-analysis calls without retry", async () => {
    const requests: JsonCompletionRequest[] = [];
    const client: JsonCompletionClient = {
      configuredModel: "probe-model",
      completeJson: vi.fn(async (request) => {
        requests.push(request);
        const user = JSON.parse(request.messages[1]!.content) as {
          pages: Array<{ url: string; pageType: string }>;
        };
        const page = user.pages[0]!;
        const value = {
          analyses: [{
            url: page.url,
            pageType: page.pageType,
            summary: "符合约束的页面摘要。",
            organizationSignals: [],
            strengths: [],
            findings: []
          }]
        };
        return { value, modelId: "probe-model", rawContent: JSON.stringify(value) };
      })
    };
    const lines: string[] = [];

    const receipt = await runAiProbe({
      environment: { OGC_PUBLIC_SEARCH_LOCALE: "zh-CN" },
      client,
      operation: { maxOutputTokens: 32_768, timeoutMs: 120_000 },
      write: (line) => lines.push(line)
    });

    expect(receipt).toMatchObject({
      ok: true,
      model: "probe-model",
      acceptedPages: 4,
      contract: "analyzePageBatch",
      batchSize: 1,
      maxAttempts: 1
    });
    expect(requests).toHaveLength(4);
    expect(requests.every(({ maxTokens }) => maxTokens === 32_768)).toBe(true);
    expect(requests.every(({ messages }) => {
      const user = JSON.parse(messages[1]!.content) as { pages: unknown[] };
      return user.pages.length === 1;
    })).toBe(true);
    expect(lines).toEqual([`${JSON.stringify(receipt)}\n`]);
    expect(lines[0]).not.toContain("示例企业");
  });

  it("prints only bounded contract paths and reasons on failure", () => {
    const contract = new PageAnalysisContractError(1, 0, [
      { path: "$.analyses[0].summary", reason: "summary_invalid" }
    ]);
    const batch = new PageAnalysisBatchError(contract.message, [], {
      cause: new Error("private model content", { cause: contract })
    });

    const serialized = safeAiProbeFailure(batch);
    expect(JSON.parse(serialized)).toEqual({
      ok: false,
      error: "page_analysis_contract_invalid",
      issues: [{ path: "$.analyses[0].summary", reason: "summary_invalid" }]
    });
    expect(serialized).not.toContain("private model content");
  });
});
