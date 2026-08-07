import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  analyzePageBatch,
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt,
  synthesizeWebsiteReportWithRecovery,
  type GenerativeSearchAnswerProvider,
  type GenerativeSearchAnswerResult,
  type JsonCompletionClient
} from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { closeDatabase, ensureDatabase, getSqlClient } from "@/db";
import { terminalizePaidCombinedReport } from "@/db/combined-correction-terminalization";
import { createTestSourceForensicReport } from "@/public-source-forensics/testing";
import { materializePreparedCombinedArtifactV3, prepareCombinedGeoReportV3, renderCanonicalCombinedArtifactHtml, type PrepareCombinedGeoReportV3Input } from "@/report/combined-artifact-readiness";
import { resolveGenerativeAnswerFirstV3 } from "./answer-first-v3";
import { buildPaidV3DirectSemantics } from "./paid-v3-direct-semantics";
import { generateGeoArticleExample } from "./geo-article-example";
import { createPublicSourceAttemptBudget } from "./public-source-execution-budget";
import { buildVisualEvidenceRequests, captureReportVisualEvidence, visualEvidenceHash } from "./visual-evidence";

const browserMocks = vi.hoisted(() => ({
  launch: vi.fn(), newContext: vi.fn(), newPage: vi.fn(), goto: vi.fn(), saveEvidenceAsset: vi.fn()
}));
vi.mock("playwright", () => ({ chromium: { launch: browserMocks.launch } }));
vi.mock("@/server/safe-fetch", () => ({ configuredPublicDnsResolver: () => async () => [] }));
vi.mock("@open-geo-console/site-crawler", async (importOriginal) => ({
  ...await importOriginal<typeof import("@open-geo-console/site-crawler")>(),
  resolveSafeUrl: vi.fn(async () => undefined)
}));
vi.mock("@/db/evidence-assets", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/evidence-assets")>(),
  saveEvidenceAsset: browserMocks.saveEvidenceAsset
}));

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describePostgres = adminUrl ? describe : describe.skip;

describePostgres("Paid V3 Direct linear combined regression", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids = {
    report: `direct-report-${suffix}`, job: `direct-job-${suffix}`, order: `direct-order-${suffix}`,
    questions: `direct-questions-${suffix}`, artifact: `direct-artifact-${suffix}`,
    access: `direct-access-${suffix}`, credit: `direct-credit-${suffix}`, worker: `direct-worker-${suffix}`
  };
  const snapshots = Array.from({ length: 4 }, (_, index) => ({
    id: `direct-snapshot-${index}-${suffix}`,
    cacheIdentity: `direct-cache-${index}-${suffix}`,
    queryId: `direct-query-${index}-${suffix}`,
    attemptId: `direct-attempt-${index}-${suffix}`
  }));
  const databaseName = `ogc_direct_linear_${suffix}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDeploymentProfile = process.env.OGC_DEPLOYMENT_PROFILE;
  let databaseCreated = false;
  let setupError: unknown;

  beforeAll(async () => {
    try {
      await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
      databaseCreated = true;
      const databaseUrl = withDatabase(adminUrl!, databaseName);
      const bootstrap = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await bootstrap`CREATE TABLE deployment_environment(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),profile text NOT NULL CHECK(profile IN ('staging','production')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;
        await bootstrap`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
      } finally {
        await bootstrap.end({ timeout: 5 });
      }
      process.env.DATABASE_URL = databaseUrl;
      process.env.OGC_DEPLOYMENT_PROFILE = "staging";
      await ensureDatabase();
      const sql = getSqlClient();
      await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status) VALUES(${ids.report},'https://customer-logistics.example/','customer-logistics.example','zh','completed')`;
      await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status)
        VALUES(${ids.order},${`checkout-${ids.order}`},'airwallex',${ids.report},'customer-logistics.example','encrypted',${`email-${ids.order}`},'v1','recommendation_forensics_v1','public_search_source_forensics_v1',3,'v3','terms-v1','refund-v1','zh','USD',2900,'paid','processing')`;
      await sql`INSERT INTO report_business_question_sets(id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
        VALUES(${ids.questions},${ids.report},${ids.order},1,'zh-CN','CN','candidate','high','v1','identity-neutral-v1','profile')`;
      for (const [ordinal, purpose] of [[1, "core_service_discovery"], [2, "customer_region_fit"], [3, "purchase_delivery_risk"]] as const) {
        await sql`INSERT INTO report_business_questions(id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
          VALUES(${`question-${ordinal}-${suffix}`},${ids.questions},${ordinal},${purpose},${`采购问题 ${ordinal}`},${`采购问题 ${ordinal}`},${`公开问题 ${ordinal}`},${`question-hash-${ordinal}-${suffix}`})`;
      }
      await sql`UPDATE report_business_question_sets SET status='locked',content_hash=${"a".repeat(64)},neutral_content_hash=${"b".repeat(64)},payload='{}'::jsonb,confirmed_at=now(),locked_at=now() WHERE id=${ids.questions}`;
      await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,status,credits_remaining,payment_order_id) VALUES(${ids.access},'v3',${`hmac-${ids.access}`},'exhausted',0,${ids.order})`;
      await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,stage,execution_state,current_phase,lease_owner,lease_expires_at,credit_reservation_id,checkpoint)
        VALUES(${ids.job},${ids.report},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',3,'combined_geo_report_v3',${ids.questions},'zh','synthesizing','running','terminalization',${ids.worker},now()+interval '1 hour',${ids.credit},${JSON.stringify({ freeDirectSemanticsVersion: "free-v4-direct-semantics-v1" })}::jsonb)`;
      await sql`UPDATE payment_orders SET fulfillment_job_id=${ids.job} WHERE id=${ids.order}`;
      await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,idempotency_key,payment_order_id,job_id,credits,status) VALUES(${ids.credit},${ids.access},${ids.report},${`credit-${ids.order}`},${ids.order},${ids.job},1,'reserved')`;
      await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash) VALUES(${ids.artifact},${ids.report},${ids.order},${ids.job},1,'combined_geo_report_v3','pending',${`payload-${suffix}`})`;
      await sql`INSERT INTO public_search_surface_authorities(authority_version,adapter_id,provider_id,product_id,model_id,adapter_version,surface_id,surface_version,environment,locale_capabilities,region_capabilities,terms_reviewed_at,evidence_references,active,captured_at)
        VALUES(${`direct-authority-${suffix}`},'fixture-adapter','fixture-provider','fixture-product','fixture-model','fixture-v1','fixture-search','fixture-search-v1','staging','["zh-CN"]','["CN"]',now(),'["fixture://review"]',true,now())`;
      for (const [index, snapshot] of snapshots.entries()) {
        await sql`INSERT INTO market_snapshot_questions(id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,surface_id,surface_version,fanout_version,status,completion_version,snapshot_kind,query_plan_version)
          VALUES(${snapshot.id},${snapshot.cacheIdentity},${`generic market question ${index + 1}`},${`direct-question-hash-${index}-${suffix}`},'zh-CN','CN',${`direct-authority-${suffix}`},'fixture-search','fixture-search-v1','fixture-fanout-v1','refreshing',1,'standard_question','fixture-plan-v1')`;
        await sql`INSERT INTO market_snapshot_queries(id,snapshot_id,query_order,query_text,query_hash,derivation_rule)
          VALUES(${snapshot.queryId},${snapshot.id},0,${`generic market query ${index + 1}`},${`direct-query-hash-${index}-${suffix}`},'exact-question')`;
        await sql`INSERT INTO market_search_attempts(id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage,configured_cost_micros,provider_cost_micros,cost_uncertain,completed_at)
          VALUES(${snapshot.attemptId},${snapshot.id},${snapshot.queryId},${`direct-authority-${suffix}`},1,'succeeded',${`direct-idempotency-${index}-${suffix}`},'{}',0,0,false,now()-interval '2 minutes')`;
        await sql`UPDATE market_snapshot_questions SET status='completed',query_fanout_hash=${`direct-fanout-hash-${index}-${suffix}`},completed_at=now()-interval '1 minute' WHERE id=${snapshot.id}`;
      }
    } catch (error) {
      setupError = error;
    }
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalDeploymentProfile === undefined) delete process.env.OGC_DEPLOYMENT_PROFILE;
    else process.env.OGC_DEPLOYMENT_PROFILE = originalDeploymentProfile;
    if (databaseCreated) await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 120_000);

  it("uses every Direct model step once, navigates four URLs, and completes without refund", async () => {
    expect(setupError, "disposable PostgreSQL setup must complete before the combined assertion").toBeUndefined();
    configureBrowser();
    const cutoffRow = (await getSqlClient()<Array<{ evidence_cutoff_at: string }>>`
      SELECT (now()-interval '1 second')::text AS evidence_cutoff_at`)[0]!;
    const evidenceCutoffAt = cutoffRow.evidence_cutoff_at;
    const forensicBase = {
      ...createTestSourceForensicReport({ reportId: ids.report, jobId: ids.job }),
      generatedAt: evidenceCutoffAt,
      evidenceCutoffAt
    };
    const questionSet = confirmedQuestions(forensicBase, ids.questions);
    const canonical = toCanonicalBuyerQuestionSet(questionSet).questions;
    const replacements = new Map(forensicBase.questions.questions.map((question, index) => [question.id, canonical[index]!.id]));
    const forensic = rewriteExactStrings(structuredClone(forensicBase), replacements);
    const rawFoundation = structuredClone(forensic.websiteFoundationAppendix);
    const targetUrl = forensic.targetUrl;
    const pages = Array.from({ length: 4 }, (_, index) => ({
      url: index === 0 ? targetUrl : `${targetUrl}page-${index}`,
      pageType: index === 0 ? "home" as const : "other" as const,
      title: `Page ${index}`,
      text: index === 0 ? JSON.stringify(rawFoundation) : `Verified page ${index} content.`
    }));
    const pageClient = completionClient({ analyses: pages.map((page) => ({
      url: page.url, pageType: page.pageType, summary: `页面 ${page.title} 的直接分析。`,
      organizationSignals: [], strengths: [], findings: []
    })) });
    const analyzed = await analyzePageBatch(pageClient, {
      pages, locale: forensic.locale, semanticValidation: "free_direct", maxAttempts: 1
    });
    expect(pageClient.completeJson).toHaveBeenCalledOnce();

    const synthesisClient = completionClient(rawFoundation);
    const synthesis = await synthesizeWebsiteReportWithRecovery(synthesisClient, {
      targetUrl, tier: "deep", locale: forensic.locale, pages, pageAnalyses: analyzed.analyses,
      coverage: { discoveredPages: 4, plannedPages: 4, analyzedPages: 4, failedPages: 0,
        samplingMethod: "四个代表页面的直接分析。", pageTypesCovered: ["home", "other"], limitations: [] },
      generatedAt: forensic.generatedAt
    }, { semanticValidation: "free_direct", maxAttempts: 1, delay: async () => undefined });
    expect(synthesisClient.completeJson).toHaveBeenCalledOnce();

    const questionIds = canonical.map(({ id }) => id) as [string, string, string];
    const q1 = answer(questionIds[0], 1);
    const answerReleases: Array<() => void> = [];
    let activeAnswers = 0;
    let maxActiveAnswers = 0;
    const provider = {
      providerId: "fixture", model: "fixture-model", searchMode: "native_web_search",
      answerWithSources: vi.fn(async ({ questionId }: { questionId: string }) => {
        activeAnswers += 1;
        maxActiveAnswers = Math.max(maxActiveAnswers, activeAnswers);
        await new Promise<void>((resolve) => answerReleases.push(() => { activeAnswers -= 1; resolve(); }));
        return answer(questionId, questionId === questionIds[1] ? 2 : 3);
      })
    } satisfies GenerativeSearchAnswerProvider;
    const answersPending = resolveGenerativeAnswerFirstV3({
      questionSet, provider, locale: forensic.locale, region: forensic.region, targetUrl,
      auditSources: [], targetPages: technicalReport(targetUrl).pages, semanticValidation: "free_direct",
      seededQ1: { questionSetIdentity: questionSet.contentHash, providerId: provider.providerId,
        model: provider.model, searchMode: provider.searchMode, locale: forensic.locale,
        region: forensic.region, answerResult: q1 }
    });
    await vi.waitFor(() => expect(provider.answerWithSources).toHaveBeenCalledTimes(2));
    expect(maxActiveAnswers).toBe(2);
    answerReleases.splice(0).forEach((release) => release());
    const answerResult = await answersPending;

    const cards = answerResult.answerCards;
    const q1Core = createFreeV4DirectCoreReceipt({
      questionSetIdentity: questionSet.contentHash, questions: cards.map(({ exactQuestion }) => exactQuestion),
      questionId: cards[0].questionId, questionText: cards[0].exactQuestion, answer: q1,
      sources: cards[0].sources, providerResponseId: q1.providerResponseId,
      providerId: cards[0].provenance.providerId, model: cards[0].provenance.model,
      searchMode: cards[0].provenance.searchMode, searchedAt: cards[0].provenance.searchedAt,
      completedAt: cards[0].provenance.completedAt, nonProseProjection: { questionId: cards[0].questionId }
    });
    const q1Analysis = { summary: "Q1 直接分析。", observations: [], recommendations: [], evidenceHandles: ["S1"] };
    const q1Bindings = [{ handle: "S1", evidenceRef: cards[0].sources[0]!.sourceId }];
    const q1AnalysisReceipt = createFreeV4DirectAnalysisReceipt({
      coreReceiptHash: q1Core.receiptHash, analysis: q1Analysis, handleBindings: q1Bindings,
      nonProseProjection: { questionId: cards[0].questionId, analysisStatus: "completed" }
    });
    const analysisReleases: Array<() => void> = [];
    let activeAnalyses = 0;
    let maxActiveAnalyses = 0;
    const analyze = vi.fn(async () => {
      activeAnalyses += 1;
      maxActiveAnalyses = Math.max(maxActiveAnalyses, activeAnalyses);
      await new Promise<void>((resolve) => analysisReleases.push(() => { activeAnalyses -= 1; resolve(); }));
      return { summary: "Paid Direct analysis.", observations: [], recommendations: [], evidenceHandles: ["S1"] };
    });
    const directPending = buildPaidV3DirectSemantics({
      questionSet, answerCards: cards, answerCheckpoint: answerResult.checkpoint,
      freeCheckpoint: { directAnalysisStatus: "completed", directCoreReceipt: q1Core,
        directAnalysis: q1Analysis, directAnalysisHandleBindings: q1Bindings,
        directAnalysisReceipt: q1AnalysisReceipt, q1AnswerDraft: cards[0] } as never,
      admission: { snapshot: { id: "snapshot" }, pages: [{ id: "page", normalizedUrl: targetUrl,
        contentHash: "content", analyzable: true, summary: "Target page" }] } as never,
      targetUrl, foundation: synthesis.report, locale: forensic.locale, analyze
    });
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    expect(maxActiveAnalyses).toBe(2);
    analysisReleases.splice(0).forEach((release) => release());
    const directSemantics = await directPending;
    expect(directSemantics.questions.map(({ analysisStatus }) => analysisStatus)).toEqual(["completed", "completed", "completed"]);
    const articleCompleteJson = vi.fn(async () => { throw new Error("article provider unavailable"); });
    const articleResearchProvider = {
      providerId: "fixture", model: "fixture-model", searchMode: "native_web_search",
      answerWithSources: vi.fn(async ({ questionId }: { questionId: string }) => answer(questionId, 4))
    } satisfies GenerativeSearchAnswerProvider;
    const geoArticleExample = await generateGeoArticleExample({
      client: { configuredModel: "fixture-model", completeJson: articleCompleteJson },
      researchProvider: articleResearchProvider,
      targetUrl, locale: forensic.locale, questionSet, answerCards: cards,
      aiReport: synthesis.report, technicalReport: technicalReport(targetUrl)
    });
    expect(articleResearchProvider.answerWithSources).toHaveBeenCalledOnce();
    expect(articleCompleteJson).toHaveBeenCalledOnce();
    expect(geoArticleExample).toMatchObject({version:"geo_article_deliverable_v3",kind:"article",generationMode:"deterministic_evidence_fallback",research:{outcome:"usable"}});
    expect(geoArticleExample.article.sections).toHaveLength(3);

    const visualReport = { ...synthesis.report, findings: Array.from({ length: 11 }, (_, index) => ({
      id: `visual-${index}`, title: `Finding ${index}`, severity: "opportunity" as const,
      impact: "Impact.", recommendation: "Recommendation.", confidence: "high" as const,
      evidence: [{ url: `${pages[index % 4]!.url}#citation-${index}`, quote: `Verified quote ${index}` }]
    })) };
    const storage = { provider: "filesystem" as const, put: vi.fn(async () => undefined),
      get: vi.fn(async () => null), delete: vi.fn(async () => undefined) };
    await captureReportVisualEvidence({ reportId: ids.report, jobId: ids.job, report: visualReport,
      pages: pages.map((page, index) => ({ url: page.url, contentHash: `content-${index}` })), storage });
    expect(browserMocks.goto).toHaveBeenCalledTimes(4);
    expect(browserMocks.saveEvidenceAsset).toHaveBeenCalledTimes(11);
    expect(new Set(browserMocks.saveEvidenceAsset.mock.calls.map(([asset]) => asset.evidenceHash)).size).toBe(11);
    expect(createPublicSourceAttemptBudget(244_000, { semanticValidation: "free_direct" })).toBeDefined();

    const evidenceAssets = buildVisualEvidenceRequests(synthesis.report, pages.map((page, index) => ({
      url: page.url, contentHash: `content-${index}`
    }))).map((request, index) => ({
      id: `asset-${index}-${suffix}`, reportId: ids.report, jobId: ids.job,
      findingId: request.findingId, citationIndex: request.citationIndex, kind: "context", status: "ready",
      sourceUrl: request.citation.url, quote: request.citation.quote, pageElement: request.citation.pageElement ?? null,
      capturedAt: new Date("2030-01-02T00:00:00.000Z"), viewportWidth: 1440, viewportHeight: 1000,
      contentHash: request.contentHash, evidenceHash: visualEvidenceHash(request), assetHash: "2".repeat(64),
      storageProvider: "filesystem", storageKey: `reports/${ids.report}/evidence/asset-${index}.jpg`,
      mimeType: "image/jpeg", byteSize: 4, failureCode: null,
      createdAt: new Date("2030-01-02T00:00:00.000Z"), updatedAt: new Date("2030-01-02T00:00:00.000Z")
    })) as PrepareCombinedGeoReportV3Input["evidenceAssets"];
    const report = prepareCombinedGeoReportV3({
      artifactRevisionId: ids.artifact, artifactRevision: 1, reportId: ids.report, orderId: ids.order,
      jobId: ids.job, originalPaidJobId: ids.job, targetUrl, technicalReport: technicalReport(targetUrl),
      aiReport: synthesis.report, evidenceAssets, businessQuestionSet: questionSet, answerCards: cards,
      sourceSelectionDiagnosis: answerResult.checkpoint.sourceSelectionDiagnosis!,
      engineProvenance: answerResult.checkpoint.engineProvenance,
      publicSourceForensics: forensic, providerDiscovery: providerDiscovery(), directSemantics, geoArticleExample
    }, { semanticValidation: "free_direct" });
    const html = renderCanonicalCombinedArtifactHtml({
      productContract: "combined_geo_report_v3", reportId: ids.report, locale: "zh",
      artifactRevisionId: ids.artifact, pdfStorageKey: "pending", evidenceAssets,
      technicalReport: report.technicalFoundation.technicalReport, combinedReport: report
    } as never);
    expect(html).toContain('data-geo-article-generation-mode="deterministic_evidence_fallback"');
    expect(html).toContain('data-geo-article-kind="article"');
    expect(html).toContain("GEO 完整文章");
    expect(html).toContain(geoArticleExample.article.title);
    expect(html).not.toContain("来源0");
    const deploymentProfile = process.env.OGC_DEPLOYMENT_PROFILE;
    delete process.env.OGC_DEPLOYMENT_PROFILE;
    const ready = await (async()=>{try{return await materializePreparedCombinedArtifactV3(report, [], { semanticValidation: "free_direct" });}finally{
      if(deploymentProfile===undefined)delete process.env.OGC_DEPLOYMENT_PROFILE;else process.env.OGC_DEPLOYMENT_PROFILE=deploymentProfile;
    }})();
    expect(ready.htmlSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(ready).not.toHaveProperty("pdf");
    expect(ready).not.toHaveProperty("pdfSha256");
    expect(ready).not.toHaveProperty("pdfStorageKey");
    expect(ready).not.toHaveProperty("pageCount");
    await getSqlClient()`UPDATE scan_jobs SET checkpoint=${JSON.stringify({
      freeDirectSemanticsVersion: "free-v4-direct-semantics-v1",
      answerFirstV3: { identityHash: answerResult.checkpoint.identityHash }
    })}::jsonb WHERE id=${ids.job}`;
    const result = await terminalizePaidCombinedReport({
      report, workerId: ids.worker, checkpointIdentityHash: answerResult.checkpoint.identityHash,
      snapshotRefs: snapshots.map((snapshot) => ({
        snapshotId: snapshot.id, cacheIdentity: snapshot.cacheIdentity, freshnessState: "fresh",
        actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: 0
      })), htmlSha256: ready.htmlSha256, semanticValidation: "free_direct"
    });
    expect(result).toMatchObject({ outcome: "completed", refundId: null });
    const state = (await getSqlClient()<Array<{ artifact_status: string; pdf_sha256: string | null; pdf_storage_key: string | null; readiness: Record<string, unknown>; stage: string; fulfillment: string; refund_status: string; refs: number; refunds: number }>>`
      SELECT (SELECT status FROM report_artifact_revisions WHERE id=${ids.artifact}) artifact_status,
        (SELECT pdf_sha256 FROM report_artifact_revisions WHERE id=${ids.artifact}) pdf_sha256,
        (SELECT pdf_storage_key FROM report_artifact_revisions WHERE id=${ids.artifact}) pdf_storage_key,
        (SELECT readiness FROM report_artifact_revisions WHERE id=${ids.artifact}) readiness,
        (SELECT stage FROM scan_jobs WHERE id=${ids.job}) stage,
        (SELECT fulfillment_status FROM payment_orders WHERE id=${ids.order}) fulfillment,
        (SELECT refund_status FROM payment_orders WHERE id=${ids.order}) refund_status,
        (SELECT count(*)::int FROM report_market_snapshot_refs WHERE job_id=${ids.job}) refs,
        (SELECT count(*)::int FROM payment_refunds WHERE order_id=${ids.order}) refunds`)[0]!;
    expect(state).toEqual({ artifact_status: "active", pdf_sha256: null, pdf_storage_key: null,
      readiness: { htmlCanonical: true }, stage: "completed", fulfillment: "completed", refund_status: "not_required", refs: 4, refunds: 0 });
  }, 120_000);
});

function completionClient(value: unknown): JsonCompletionClient {
  return { configuredModel: "fixture-model", completeJson: vi.fn(async () => ({
    value, modelId: "fixture-model", rawContent: JSON.stringify(value)
  })) };
}

function confirmedQuestions(forensic: ReturnType<typeof createTestSourceForensicReport>, id: string): ConfirmedBusinessQuestionSet {
  return { version: "business-questions-v1", id, revision: 1,
    locale: forensic.locale, region: forensic.region, confidence: "high", requiresAcknowledgement: false,
    profileEvidenceIdentity: "profile", identityExclusions: [], acknowledgedLowConfidence: false,
    confirmedAt: "2030-01-01T00:00:00.000Z", contentHash: "a".repeat(64),
    questions: forensic.questions.questions.map((question, index) => ({
      purpose: (["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const)[index]!,
      generatedText: question.normalizedText, privateText: question.normalizedText,
      neutralPublicText: question.normalizedText, evidenceUrls: [], service: question.normalizedText,
      audience: "采购方", marketRegion: forensic.region, edited: false,
      neutralizationVersion: "identity-neutral-v1", neutralContentHash: `neutral-${index}`
    })) };
}

function answer(questionId: string, index: number): GenerativeSearchAnswerResult {
  return { questionId, answerText: `服务商${index}提供跨境货运服务。`, sources: [{
    sourceId: `source-${index}`, title: `Source ${index}`, canonicalUrl: `https://source-${index}.example/item`,
    registrableDomain: `source-${index}.example`, citedText: `Verified source ${index}.`, providerResultOrder: 0
  }], refusal: null, providerResponseId: `response-${index}`, searchedAt: "2030-01-01T00:00:00.000Z",
  completedAt: "2030-01-01T00:00:01.000Z" };
}

function technicalReport(targetUrl: string): PrepareCombinedGeoReportV3Input["technicalReport"] {
  return { url: targetUrl, scannedAt: "2030-01-01T00:00:00.000Z", score: 80, pages: [{
    url: targetUrl, status: 200, title: "Customer Logistics", metaDescription: "Cross-border logistics services",
    h1: ["Customer Logistics"], h2: [], canonical: targetUrl, hasOpenGraph: true, hasJsonLd: true,
    readableTextLength: 500, internalLinks: 2
  }], findings: [], recommendations: [], machineReadableAssets: {
    robotsTxt: { url: `${targetUrl}robots.txt`, present: true, summary: "robots.txt is available." },
    sitemapXml: { url: `${targetUrl}sitemap.xml`, present: true, summary: "sitemap.xml is available." },
    llmsTxt: { url: `${targetUrl}llms.txt`, present: false, summary: "llms.txt was not found." }
  } };
}

function providerDiscovery(): PrepareCombinedGeoReportV3Input["providerDiscovery"] {
  return { version: "provider-discovery-v1", policy: { policyId: "logistics_self_operated_v1", policyVersion: "1" },
    identity: { candidateSetHash: "6".repeat(64), queryPlanVersion: "v1", passageSelectorVersion: "v1",
      claimExtractionContract: "provider-claim-extraction-v1", claimExtractionModel: "fixture-model", claimSetHash: "7".repeat(64) },
    execution: { plannedQueries: 1, completedQueries: 1, returnedObservations: 1, safelyRetrievedPages: 1,
      relevantPassages: 1, discoveredProviders: 1, strictProviders: 0, candidateProviders: 1,
      rejectedProviders: 0, coverage: "partial" }, strict: [], candidates: [{ entityId: "provider-1",
      canonicalName: "Logistics Provider", genericRole: "service_provider", policyRole: "carrier",
      leadEvidenceIds: ["provider-evidence-1"], missingProof: ["Direct asset evidence is unavailable."] }],
    evidence: [{ evidenceId: "provider-evidence-1", sourceEvidenceId: "source-provider-1",
      registrableDomain: "provider.example", title: "Logistics Provider", sourceAuthority: "company_owned",
      observedAt: "2030-01-01T00:00:00.000Z", exactExcerpt: "The provider publishes freight services.",
      capability: "linehaul_fleet" }], limitation: "Limited public evidence does not prove that a provider lacks capability." };
}

function configureBrowser(): void {
  vi.clearAllMocks();
  let currentUrl = "https://customer-logistics.example/";
  const page = { route: vi.fn(async () => undefined), goto: browserMocks.goto.mockImplementation(async (url: string) => { currentUrl = url; }),
    url: () => currentUrl, screenshot: vi.fn(async () => Buffer.from("jpeg")),
    locator: () => ({ evaluate: vi.fn(async () => null) }) };
  const context = { newPage: browserMocks.newPage.mockResolvedValue(page), close: vi.fn(async () => undefined) };
  const browser = { newContext: browserMocks.newContext.mockResolvedValue(context), close: vi.fn(async () => undefined) };
  browserMocks.launch.mockResolvedValue(browser);
  browserMocks.saveEvidenceAsset.mockResolvedValue(undefined);
}

function rewriteExactStrings<T>(value: T, replacements: ReadonlyMap<string, string>): T {
  if (typeof value === "string") return (replacements.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => rewriteExactStrings(item, replacements)) as T;
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, rewriteExactStrings(item, replacements)])
  ) as T;
  return value;
}

function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
