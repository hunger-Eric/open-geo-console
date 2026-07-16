import {
  analyzePageBatch,
  createOpenAiCompatibleClient,
  planPages,
  synthesizeWebsiteReport
} from "@open-geo-console/ai-report-engine";
import { discoverSite, fetchEvidencePage } from "../worker/crawler-runtime";

const targetUrl = process.env.OGC_LIVE_TEST_URL ?? "https://company.com";
const locale = process.env.OGC_LIVE_TEST_LOCALE === "zh" ? "zh" : "en";
const client = configuredClient();
const discovered = await discoverSite(targetUrl);
const plan = await planPages(client, {
  targetUrl: discovered.targetUrl,
  tier: "free",
  locale,
  candidates: discovered.candidates
});
const pages = [];
for (const planned of plan.selected) {
  try {
    pages.push((await fetchEvidencePage(planned, discovered.robotsPolicy)).page);
  } catch (error) {
    process.stderr.write(`Skipped ${planned.url}: ${error instanceof Error ? error.message : "fetch failed"}\n`);
  }
}
if (pages.length === 0) throw new Error("The live fixture produced no readable pages.");
const analyzed = await analyzePageBatch(client, { pages, locale });
const result = await synthesizeWebsiteReport(client, {
  targetUrl: discovered.targetUrl,
  tier: "free",
  locale,
  pages,
  pageAnalyses: analyzed.analyses,
  coverage: {
    discoveredPages: discovered.deterministicCandidates.length,
    plannedPages: plan.selected.length,
    analyzedPages: analyzed.analyses.length,
    failedPages: plan.selected.length - pages.length,
    samplingMethod: "Live AI smoke test using the free representative-page budget.",
    pageTypesCovered: [...new Set(pages.map((page) => page.pageType))],
    limitations: []
  }
});
process.stdout.write(JSON.stringify({
  targetUrl: result.report.targetUrl,
  organizationName: result.report.organizationProfile.organizationName,
  analyzedPages: result.report.coverage.analyzedPages,
  findings: result.report.findings.length,
  rejectedFindings: result.rejectedFindingIds.length,
  model: result.modelId
}, null, 2) + "\n");

function configuredClient() {
  const baseUrl = process.env.OGC_AI_BASE_URL?.trim();
  const apiKey = process.env.OGC_AI_API_KEY?.trim();
  const model = process.env.OGC_AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) throw new Error("The live AI test requires configured OGC_AI_* variables.");
  return createOpenAiCompatibleClient({
    baseUrl,
    apiKey,
    model,
    timeoutMs: configuredAiTimeoutMs(),
    useJsonResponseFormat: process.env.OGC_AI_JSON_RESPONSE_FORMAT === "true"
  });
}

function configuredAiTimeoutMs(): number {
  const configured = Number(process.env.OGC_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 180_000;
}
