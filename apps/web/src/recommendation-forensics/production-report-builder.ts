import { createHash } from "node:crypto";
import {
  containsCanonicalBrand,
  createAnswerEngineSurfaceKey,
  type AnswerSnapshotCell
} from "@open-geo-console/answer-engine-observer";
import {
  assessEvidenceGrade,
  categorizeSource,
  type CitationSourceCategory,
  type EvidenceGrade,
  type RecommendationKind
} from "@open-geo-console/citation-intelligence";
import {
  RECOMMENDATION_FORENSIC_REPORT_VERSION,
  type RecommendationForensicReportV1
} from "@open-geo-console/ai-report-engine";
import type {
  RecommendationReportBuilder,
  RecommendationReportBuilderInput
} from "@/worker/recommendation-forensics";

type StoredCell = RecommendationReportBuilderInput["snapshotBundle"]["runs"][number]["cells"][number];
type StoredSucceededCell = Extract<StoredCell, { status: "succeeded" }>;

export class ProductionRecommendationReportBuilder implements RecommendationReportBuilder {
  async build(input: RecommendationReportBuilderInput): Promise<RecommendationForensicReportV1> {
    const selectedRun = selectRun(input);
    const cells = selectedRun.cells.map(stripStoredEvidence);
    const succeeded = selectedRun.cells.filter((cell): cell is StoredSucceededCell => cell.status === "succeeded");
    const entities = buildRecommendedEntities(succeeded, input.sourceClassificationAuthority.context.competitorRegistrableDomains);
    const citations = buildCitationSources(succeeded, entities, input.sourceClassificationAuthority.context);
    const evidenceGrades = citations.map((citation) => ({
      evidenceId: `evidence-${citation.id}`,
      citationSourceId: citation.id,
      cellId: citation.cellId,
      grade: gradeCitation(citation, entities)
    }));
    const sourceCategoryBreakdown = buildSourceBreakdown(citations);
    const gaps = buildGaps(succeeded, entities, input.websiteFoundation.provenance.locale);
    const successfulIds = succeeded.map(({ id }) => id);
    const commercialIds = commercialEvidenceIds(succeeded, input);
    const locale = input.websiteFoundation.provenance.locale;
    const failed = input.coverage.outcome === "failed";
    const priorities = buildPriorities(successfulIds, input);

    return {
      version: RECOMMENDATION_FORENSIC_REPORT_VERSION,
      reportId: input.reportId,
      jobId: input.jobId,
      targetUrl: input.targetUrl,
      executiveVerdict: buildVerdict(succeeded, commercialIds, entities, input),
      generatedQuestions: input.questions,
      answerSnapshotMatrix: {
        run: selectedRun.run,
        cells,
        commercialCoverage: input.coverage
      },
      recommendedEntities: entities,
      citationSources: citations,
      evidenceGrades,
      sourceCategoryBreakdown,
      customerVsCompetitorGaps: failed ? [] : gaps,
      homepageVsFullSiteBlindSpot: buildBlindSpot(input),
      executivePriorities: priorities,
      vendorTaskPackage: {
        version: "vendor-task-v1",
        tasks: failed ? [] : buildVendorTasks(commercialIds, input, locale)
      },
      websiteFoundationAppendix: input.websiteFoundation,
      provenanceAndLimitations: {
        generatedAt: latestTimestamp(selectedRun.run.startedAt, succeeded.map(({ executedAt }) => executedAt)),
        locale,
        region: selectedRun.run.region,
        certificationAuthorityVersion: input.certificationAuthority.authorityVersion,
        certificationCapturedAt: input.certificationAuthority.capturedAt,
        certificationProvenance: input.certificationAuthority.certifications
          .filter(({ surface }) => cells.some((cell) => createAnswerEngineSurfaceKey(cell.surface) === createAnswerEngineSurfaceKey(surface)))
          .map(({ surface, evidence }) => ({
            surfaceKey: createAnswerEngineSurfaceKey(surface), evidenceReference: evidence.evidenceReference
          })),
        limitations: localized(locale, [
          "This report describes observed answer-engine outputs and public source evidence; it does not reveal a private ranking algorithm or promise a future recommendation.",
          "Unavailable sources, ambiguous identities, and answers without inspectable citations remain Unknown (Grade D)."
        ], [
          "本报告仅描述已观察到的答案引擎输出与公开来源证据，不推断私有排序算法，也不承诺未来推荐结果。",
          "无法访问的来源、身份歧义以及缺少可检查引用的答案均保留为未知（D 级）。"
        ]),
        methodology: locale === "zh"
          ? "将持久化答案快照、提供商返回来源、受限检索证据与网站基础报告进行确定性组合；结论仅表示观察到的关联，不表示因果关系。"
          : "Deterministic composition of persisted answer snapshots, provider-returned sources, bounded retrieval evidence, and the website foundation report. Findings describe observed associations, not causation.",
        sourceCategoryContext: input.sourceClassificationAuthority.context,
        sourceClassificationAuthorityVersion: input.sourceClassificationAuthority.authorityVersion,
        sourceClassificationCapturedAt: input.sourceClassificationAuthority.capturedAt
      }
    };
  }
}

function selectRun(input: RecommendationReportBuilderInput) {
  const candidates = input.snapshotBundle.runs.filter(({ run }) =>
    run.reportId === input.reportId && run.jobId === input.jobId && run.questionSetVersion === input.questions.version
  );
  const selected = candidates.at(-1);
  if (!selected) throw new Error("The persisted answer snapshot run is unavailable for report composition.");
  return selected;
}

function stripStoredEvidence(cell: StoredCell): AnswerSnapshotCell {
  if (cell.status !== "succeeded") return cell;
  return {
    ...cell,
    sources: cell.sources.map(({ url, title, providerOrder, providerMetadata }) => ({
      url, title, providerOrder, providerMetadata
    }))
  };
}

function buildRecommendedEntities(
  cells: StoredSucceededCell[],
  competitorDomains: string[]
): RecommendationForensicReportV1["recommendedEntities"] {
  const byName = new Map<string, { name: string; signals: Array<{ cellId: string; kind: RecommendationKind; supportingQuote: string }> }>();
  for (const cell of cells.filter(({ recommendationOutcome }) => recommendationOutcome === "recommendations_present")) {
    for (const signal of extractSignals(cell.answerText)) {
      const key = signal.name.toLocaleLowerCase();
      const current = byName.get(key) ?? { name: signal.name, signals: [] };
      if (!current.signals.some(({ cellId, supportingQuote }) => cellId === cell.id && supportingQuote === signal.quote)) {
        current.signals.push({ cellId: cell.id, kind: signal.kind, supportingQuote: signal.quote });
      }
      byName.set(key, current);
    }
  }
  return [...byName.values()].map(({ name, signals }) => {
    const domain = findEntityDomain(name, cells, competitorDomains);
    const entityId = `entity-${sha256(`${name.toLocaleLowerCase()}\0${domain ?? "unknown"}`).slice(0, 20)}`;
    return {
      entityId,
      name,
      ...(domain ? { registrableDomain: domain } : {}),
      resolution: domain
        ? { status: "resolved" as const, entityId, basis: "registrable_domain" as const }
        : { status: "unresolved" as const, candidateEntityIds: [] },
      signals
    };
  });
}

function extractSignals(answerText: string): Array<{ name: string; quote: string; kind: RecommendationKind }> {
  const clauses = answerText.match(/[^.!?。！？]+[.!?。！？]?/gu) ?? [answerText];
  const results: Array<{ name: string; quote: string; kind: RecommendationKind }> = [];
  const patterns: Array<[RecommendationKind, RegExp]> = [
    ["direct_candidate", /(?<name>[A-Z][\p{L}\p{N}&'.-]*(?:\s+[A-Z][\p{L}\p{N}&'.-]*){0,5})\s+(?:is|are)\s+(?:an?\s+)?(?:strong\s+|leading\s+|viable\s+|top\s+)?candidate/gu],
    ["preferred_choice", /(?<name>[A-Z][\p{L}\p{N}&'.-]*(?:\s+[A-Z][\p{L}\p{N}&'.-]*){0,5})\s+(?:is|are)\s+(?:the\s+|a\s+)?(?:recommended|preferred|best)(?:\s+choice)?/gu],
    ["suitability", /(?<name>[A-Z][\p{L}\p{N}&'.-]*(?:\s+[A-Z][\p{L}\p{N}&'.-]*){0,5})\s+(?:is|are)\s+(?:well\s+)?suitable/gu],
    ["preferred_choice", /(?:推荐|首选)\s*(?<name>[A-Z][\p{L}\p{N}&'.-]*(?:\s+[A-Z][\p{L}\p{N}&'.-]*){0,5})/gu],
    ["direct_candidate", /(?<name>[A-Z][\p{L}\p{N}&'.-]*(?:\s+[A-Z][\p{L}\p{N}&'.-]*){0,5})\s*(?:是|可作为)(?:一个)?(?:有力|主要|合适)?候选/gu],
    ["preferred_choice", /(?:推荐|首选)(?<name>[\p{Script=Han}A-Za-z0-9&·.-]{2,32})/gu],
    ["direct_candidate", /(?<name>[\p{Script=Han}A-Za-z0-9&·.-]{2,32})(?:是|可作为)(?:一个)?(?:有力|主要|合适)?候选/gu]
  ];
  for (const clause of clauses) {
    for (const [kind, pattern] of patterns) {
      pattern.lastIndex = 0;
      for (const match of clause.matchAll(pattern)) {
        const name = match.groups?.name?.trim();
        const quote = clause.trim();
        if (name && quote.toLocaleLowerCase().includes(name.toLocaleLowerCase())) results.push({ name, quote, kind });
      }
    }
  }
  return results;
}

function findEntityDomain(name: string, cells: StoredSucceededCell[], competitorDomains: string[]): string | undefined {
  for (const cell of cells) {
    for (const source of cell.sources) {
      const evidenceText = `${source.title}\n${source.evidence?.excerpt ?? ""}`.toLocaleLowerCase();
      if (!evidenceText.includes(name.toLocaleLowerCase())) continue;
      const hostname = new URL(source.url).hostname.toLocaleLowerCase();
      const domain = competitorDomains.find((candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`));
      if (domain) return domain;
    }
  }
  return undefined;
}

function buildCitationSources(
  cells: StoredSucceededCell[],
  entities: RecommendationForensicReportV1["recommendedEntities"],
  sourceContext: RecommendationReportBuilderInput["sourceClassificationAuthority"]["context"]
): RecommendationForensicReportV1["citationSources"] {
  return cells.flatMap((cell) => cell.sources.map((source) => {
    const evidence = source.evidence;
    const supported = entities.filter(({ name }) => evidence?.excerpt?.toLocaleLowerCase().includes(name.toLocaleLowerCase())).map(({ entityId }) => entityId);
    return {
      id: source.id,
      cellId: cell.id,
      url: source.url,
      title: source.title,
      category: categorizeSource(source.url, sourceContext),
      providerOrder: source.providerOrder,
      retrieval: {
        state: evidence?.retrievalState ?? "not_retrieved",
        ...(evidence?.retrievedAt ? { retrievedAt: evidence.retrievedAt } : {}),
        ...(evidence?.contentHash ? { contentHash: evidence.contentHash } : {}),
        ...(evidence?.excerpt ? { verifiedExcerpt: evidence.excerpt } : {}),
        mapping: supported.length > 0 ? "association" as const : "none" as const,
        supportedEntityIds: supported
      }
    };
  }));
}

function gradeCitation(
  citation: RecommendationForensicReportV1["citationSources"][number],
  entities: RecommendationForensicReportV1["recommendedEntities"]
): EvidenceGrade {
  const supported = citation.retrieval.supportedEntityIds.map((id) => entities.find((entity) => entity.entityId === id)!);
  const excerpt = citation.retrieval.verifiedExcerpt?.toLocaleLowerCase() ?? "";
  return assessEvidenceGrade({
    evidenceId: `evidence-${citation.id}`,
    cellId: citation.cellId,
    sourceUrl: citation.url,
    providerReturned: true,
    retrievalState: citation.retrieval.state,
    verifiedExcerpt: citation.retrieval.verifiedExcerpt,
    directSupport: false,
    preciseMapping: false,
    relevantEntityEvidence: supported.length > 0 && supported.every(({ name }) => excerpt.includes(name.toLocaleLowerCase())),
    entityAmbiguous: supported.some(({ resolution }) => resolution.status !== "resolved")
  });
}

function buildSourceBreakdown(citations: RecommendationForensicReportV1["citationSources"]) {
  const grouped = new Map<CitationSourceCategory, string[]>();
  for (const citation of citations) grouped.set(citation.category, [...(grouped.get(citation.category) ?? []), citation.id]);
  return [...grouped].map(([category, citationSourceIds]) => ({ category, sourceCount: citationSourceIds.length, citationSourceIds }));
}

function buildGaps(
  cells: StoredSucceededCell[],
  entities: RecommendationForensicReportV1["recommendedEntities"],
  locale: string
): RecommendationForensicReportV1["customerVsCompetitorGaps"] {
  if (entities.length === 0) {
    const noRecommendationIds = cells.filter(({ recommendationOutcome }) => recommendationOutcome === "no_recommendation").map(({ id }) => id);
    return noRecommendationIds.length === 0 ? [] : [{
      id: "gap-no-recommendation", title: locale === "zh" ? "未观察到供应商推荐" : "No supplier recommendation observed",
      rationale: locale === "zh" ? "本次成功快照未返回可审计的供应商推荐。" : "The successful observation set did not return an auditable supplier recommendation.",
      evidenceCellIds: noRecommendationIds, sourcePattern: "no recommendation",
      suggestedAction: locale === "zh" ? "保留固定问题集，在补充公开证据后按同一协议复测。" : "Preserve the fixed question set and rerun the same protocol after public evidence is improved.",
      competitorEntityIds: [], outcome: "no_recommendation"
    }];
  }
  return entities.map((entity) => ({
    id: `gap-${entity.entityId}`,
    title: locale === "zh" ? `${entity.name} 推荐证据差距` : `${entity.name} recommendation evidence gap`,
    rationale: locale === "zh" ? `${entity.name} 出现在已观察到的推荐答案中；这表示关联证据，不表示排序原因。` : `${entity.name} appears in observed recommendation answers. This is association evidence, not a ranking cause.`,
    evidenceCellIds: [...new Set(entity.signals.map(({ cellId }) => cellId))],
    sourcePattern: "provider-returned recommendation and citation evidence",
    suggestedAction: locale === "zh" ? "制作可由第三方独立核验的事实、案例与比较材料。" : "Prepare facts, cases, and comparison material that independent sources can verify.",
    competitorEntityIds: [entity.entityId], outcome: "competitor_gap"
  }));
}

function buildVerdict(
  cells: StoredSucceededCell[],
  commercialIds: string[],
  entities: RecommendationForensicReportV1["recommendedEntities"],
  input: RecommendationReportBuilderInput
): RecommendationForensicReportV1["executiveVerdict"] {
  const brands = [input.questions.organizationName, ...input.questions.brandAliases];
  const mentions = cells.map(({ answerText }) => containsCanonicalBrand(answerText, brands));
  const customerMentioned = cells.length === 0 ? "unknown" : mentions.every(Boolean) ? "yes" : mentions.some(Boolean) ? "mixed" : "no";
  const zh = input.websiteFoundation.provenance.locale === "zh";
  if (input.coverage.outcome === "failed") return {
    summary: zh ? "没有足够的认证答案引擎覆盖，不能形成商业推荐结论。" : "Certified answer-engine coverage is insufficient for a commercial recommendation conclusion.",
    customerMentioned: "unknown", primaryGap: zh ? "认证观察覆盖不可用。" : "Certified observation coverage is unavailable.",
    evidenceCellIds: [], coverageOutcome: "failed"
  };
  return {
    summary: zh
      ? `在 ${input.coverage.successfulQuestionCount} 个成功观察单元中，客户提及状态为${mentionLabel(customerMentioned, true)}，并观察到 ${entities.length} 个推荐对象。`
      : `Across ${input.coverage.successfulQuestionCount} successful observation cells, the customer mention outcome is ${mentionLabel(customerMentioned, false)} and ${entities.length} recommended entities were observed.`,
    customerMentioned,
    primaryGap: entities.length > 0
      ? (zh ? "竞争对象拥有更多可由答案与来源共同审计的公开证据链。" : "Competitors have more public evidence chains that can be audited across answers and sources.")
      : (zh ? "本次未观察到可审计的供应商推荐，应保留固定问题集继续复测。" : "No auditable supplier recommendation was observed; preserve the fixed question set for retesting."),
    evidenceCellIds: commercialIds.slice(0, Math.max(1, Math.min(3, commercialIds.length))),
    coverageOutcome: input.coverage.outcome
  };
}

function commercialEvidenceIds(cells: StoredSucceededCell[], input: RecommendationReportBuilderInput): string[] {
  const certified = new Set(input.certificationAuthority.certifications.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  return cells.filter(({ surface }) => certified.has(createAnswerEngineSurfaceKey(surface))).map(({ id }) => id);
}

function buildBlindSpot(input: RecommendationReportBuilderInput): RecommendationForensicReportV1["homepageVsFullSiteBlindSpot"] {
  const report = input.websiteFoundation;
  const homepage = report.organizationProfile.evidence.filter(({ url }) => sameUrl(url, input.targetUrl));
  const fullSite = report.organizationProfile.evidence;
  const zh = report.provenance.locale === "zh";
  return {
    homepageSummary: zh ? `首页提供 ${homepage.length} 条公司身份证据。` : `The homepage provides ${homepage.length} organization-profile evidence item(s).`,
    fullSiteSummary: zh ? `完整站点提供 ${fullSite.length} 条公司身份证据，覆盖 ${report.coverage.analyzedPages}/${report.coverage.plannedPages} 个计划页面。` : `The full site provides ${fullSite.length} organization-profile evidence item(s) across ${report.coverage.analyzedPages}/${report.coverage.plannedPages} planned pages.`,
    omissions: fullSite.filter(({ url }) => !sameUrl(url, input.targetUrl)).map(({ quote }) => quote).slice(0, 5),
    contradictions: report.organizationProfile.identityConsistency.toLocaleLowerCase().includes("consistent") ? [] : [report.organizationProfile.identityConsistency],
    confidenceChanges: [zh ? `完整站点身份置信度：${report.organizationProfile.confidence}` : `Full-site organization confidence: ${report.organizationProfile.confidence}`],
    limitations: [zh ? "比较仅基于公开首页与合格深度抓取证据，不代表企业内部事实。" : "The comparison uses public homepage and eligible deep-crawl evidence, not private company facts."]
  };
}

function buildPriorities(successfulIds: string[], input: RecommendationReportBuilderInput): RecommendationForensicReportV1["executivePriorities"] {
  const findings = input.websiteFoundation.findings.filter(({ evidence }) => evidence.length > 0).map(({ id }) => id);
  const firstCell = successfulIds[0];
  const firstFinding = findings[0];
  if (!firstCell && !firstFinding) throw new Error("Recommendation priorities require persisted answer or website evidence.");
  const zh = input.websiteFoundation.provenance.locale === "zh";
  const items = zh ? [
    ["统一官方事实与实体身份", "先修复公开页面中的公司、产品、受众与市场表述，使供应商有单一事实源。"],
    ["建立可引用的客户证据", "将数据、方法、案例和比较边界发布为第三方可独立核验的材料。"],
    ["扩展第三方证据面", "按观察到的来源类别安排媒体、目录、机构与社区验证机会。"]
  ] : [
    ["Unify official facts and entity identity", "Repair company, product, audience, and market statements so vendors work from one public source of truth."],
    ["Build citation-worthy customer evidence", "Publish data, methods, cases, and bounded comparisons that third parties can independently verify."],
    ["Expand third-party evidence coverage", "Prioritize editorial, directory, institution, and community opportunities reflected in observed source categories."]
  ];
  return items.map(([title, rationale], index) => ({
    order: (index + 1) as 1 | 2 | 3,
    title,
    rationale,
    evidenceCellIds: firstCell ? [firstCell] : [],
    websiteFindingIds: firstFinding ? [firstFinding] : []
  })) as RecommendationForensicReportV1["executivePriorities"];
}

function buildVendorTasks(commercialIds: string[], input: RecommendationReportBuilderInput, locale: string) {
  const evidenceCellIds = commercialIds.slice(0, 1);
  if (evidenceCellIds.length === 0) return [];
  const retestQuestionIds = input.questions.questions.map(({ id }) => id);
  const zh = locale === "zh";
  const definitions = zh ? [
    ["website", "修正官方事实与实体身份", ["统一公司名称、产品分类、目标客户与服务地区。", "在相关页面附上可核验事实来源。"], ["所有关键事实在首页、关于页和产品页保持一致。"]],
    ["seo", "交付 Schema、FAQ 与页面附件", ["提交 Organization/Product/Service Schema 草案。", "为固定复测问题建立 FAQ 与页面映射附件。"], ["Schema 通过语法验证，FAQ 答案可在公开页面找到。"]],
    ["content", "制作可引用数据、案例与内容简报", ["发布带方法、日期和样本边界的数据页。", "制作客户案例、比较页和专家评论简报。"], ["每项主张都有公开来源、方法和审核人。"]],
    ["communications", "建立媒体、目录与社区机会清单", ["按来源类别整理媒体、目录、机构和社区机会。", "仅提交可由接收方独立验证的证据包。"], ["每个机会记录适配主题、证据要求和负责人。"]],
    ["cross-functional", "按固定问题集验收与复测", ["冻结本报告的 3–5 个问题和观察协议。", "完成任务后在同地区、语言和认证表面复测。"], ["验收记录含问题、表面、模型、地区、时间、来源和 Unknown 状态。"]]
  ] : [
    ["website", "Correct official facts and entity identity", ["Align company name, product category, audience, and served markets.", "Attach verifiable public evidence to the relevant pages."], ["Homepage, about, and product pages state the same key facts."]],
    ["seo", "Deliver Schema, FAQ, and page attachments", ["Provide Organization/Product/Service Schema drafts.", "Map the fixed retest questions to FAQ answers and owner pages."], ["Schema passes syntax validation and every FAQ answer is present on a public page."]],
    ["content", "Produce citeable data, cases, and content briefs", ["Publish a data page with method, date, and sample limits.", "Prepare case-study, comparison, and expert-commentary briefs."], ["Every material claim has a public source, method, and reviewer."]],
    ["communications", "Build media, directory, and community opportunities", ["Prioritize editorial, directory, institution, and community categories.", "Share only evidence packs recipients can independently verify."], ["Each opportunity records topic fit, evidence requirement, and owner."]],
    ["cross-functional", "Accept and retest with fixed questions", ["Freeze the report's 3–5 questions and observation protocol.", "After delivery, rerun the same locale, region, and certified surfaces."], ["Acceptance records question, surface, model, region, time, sources, and Unknown states."]]
  ];
  return definitions.map(([vendor, title, actions, acceptanceCriteria], index) => ({
    id: `vendor-task-${index + 1}`,
    vendor: vendor as "website" | "seo" | "content" | "communications" | "cross-functional",
    title: title as string,
    rationale: zh ? "该任务对应本报告中的答案快照、来源证据与网站基础发现。" : "This task maps to persisted answer snapshots, source evidence, and website-foundation findings in this report.",
    actions: actions as string[],
    acceptanceCriteria: acceptanceCriteria as string[],
    evidenceCellIds,
    retestQuestionIds
  }));
}

function mentionLabel(value: "yes" | "no" | "mixed" | "unknown", zh: boolean) {
  return zh ? ({ yes: "有提及", no: "未提及", mixed: "部分提及", unknown: "未知" } as const)[value] : value;
}

function localized(locale: string, en: string[], zh: string[]) { return locale === "zh" ? zh : en; }
function sameUrl(left: string, right: string) {
  try { return new URL(left).href.replace(/\/$/, "") === new URL(right).href.replace(/\/$/, ""); } catch { return false; }
}
function latestTimestamp(fallback: string, values: string[]) {
  return [...values, fallback].sort((a, b) => Date.parse(b) - Date.parse(a))[0]!;
}
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
