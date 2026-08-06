import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PAGE_ANALYSIS_CONTRACT_INVALID_CODE,
  PageAnalysisContractError,
  analyzePageBatch,
  createOpenAiCompatibleClient,
  type ExtractedPage,
  type JsonCompletionClient
} from "@open-geo-console/ai-report-engine";
import { loadReportV4ModelRuntimeConfig } from "../report-v4/model-runtime-config";

const pages = [
  { url: "https://contract-probe.example/", pageType: "home", title: "示例企业",
    text: "示例企业为跨境电商团队提供可核验的物流协调服务，公开说明服务范围和联系方式。", metadata: { officialNames: ["示例企业"] } },
  { url: "https://contract-probe.example/services", pageType: "service", title: "服务说明",
    text: "服务包括运输方案比较、节点跟踪和异常沟通。客户可以查看服务步骤、交付边界和支持渠道。" },
  { url: "https://contract-probe.example/about", pageType: "about", title: "关于我们",
    text: "团队介绍页面说明组织名称、业务方向和工作原则，并避免未经证实的市场地位或业绩主张。" },
  { url: "https://contract-probe.example/insights/structured-content", pageType: "blog", title: "结构化内容指南",
    text: "文章建议使用清晰标题、直接答案和可追溯来源，帮助读者与搜索系统理解页面主题和证据。" }
] as const satisfies readonly ExtractedPage[];

interface ProbeInput {
  environment?: NodeJS.ProcessEnv;
  client?: JsonCompletionClient;
  operation?: { maxOutputTokens: number; timeoutMs: number };
  write?: (line: string) => void;
}

export async function runAiProbe(input: ProbeInput = {}) {
  const environment = input.environment ?? process.env;
  const operation = input.operation
    ?? loadReportV4ModelRuntimeConfig(environment).modelProfile.operations.pageAnalysis;
  const client = input.client ?? configuredClient(environment, operation.timeoutMs);
  const result = await analyzePageBatch(client, {
    pages, locale: environment.OGC_PUBLIC_SEARCH_LOCALE?.trim() || "zh-CN",
    semanticValidation: "deferred", batchSize: 1, maxAttempts: 1,
    maxCharactersPerPage: 30_000, maxOutputTokens: operation.maxOutputTokens
  });
  const receipt = Object.freeze({
    ok: true as const, model: result.modelId, acceptedPages: result.analyses.length,
    contract: "analyzePageBatch" as const, batchSize: 1 as const, maxAttempts: 1 as const
  });
  (input.write ?? ((line) => process.stdout.write(line)))(`${JSON.stringify(receipt)}\n`);
  return receipt;
}

export function safeAiProbeFailure(error: unknown): string {
  const contract = findContractError(error);
  if (contract) {
    return JSON.stringify({
      ok: false, error: PAGE_ANALYSIS_CONTRACT_INVALID_CODE,
      issues: contract.issues.map(({ path, reason }) => ({ path, reason }))
    });
  }
  const candidate = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code : "ai_probe_failed";
  return JSON.stringify({ ok: false, error: /^[a-z0-9_:-]{1,80}$/iu.test(candidate) ? candidate : "ai_probe_failed" });
}

function configuredClient(environment: NodeJS.ProcessEnv, timeoutMs: number): JsonCompletionClient {
  const baseUrl = environment.OGC_AI_BASE_URL?.trim();
  const apiKey = environment.OGC_AI_API_KEY?.trim();
  const model = environment.OGC_AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) {
    throw new Error("OGC_AI_BASE_URL, OGC_AI_API_KEY, and OGC_AI_MODEL are required.");
  }
  return createOpenAiCompatibleClient({
    baseUrl, apiKey, model, timeoutMs,
    useJsonResponseFormat: environment.OGC_AI_JSON_RESPONSE_FORMAT === "true"
  });
}

function findContractError(error: unknown): PageAnalysisContractError | null {
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current instanceof PageAnalysisContractError) return current;
    current = current instanceof Error ? (current as Error & { cause?: unknown }).cause : undefined;
  }
  return null;
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entryUrl === import.meta.url) {
  runAiProbe().catch((error: unknown) => {
    process.stderr.write(`${safeAiProbeFailure(error)}\n`);
    process.exitCode = 1;
  });
}
