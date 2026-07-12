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
    const commercialIds = commercialEvidenceIds(succeeded, input);
    const locale = input.websiteFoundation.provenance.locale;
    const failed = input.coverage.outcome === "failed";
    const priorities = buildPriorities(succeeded, entities, citations, gaps, input);

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
        tasks: failed ? [] : buildVendorTasks(commercialIds, entities, citations, gaps, input, locale)
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

function buildPriorities(
  cells: StoredSucceededCell[],
  entities: RecommendationForensicReportV1["recommendedEntities"],
  citations: RecommendationForensicReportV1["citationSources"],
  gaps: RecommendationForensicReportV1["customerVsCompetitorGaps"],
  input: RecommendationReportBuilderInput
): RecommendationForensicReportV1["executivePriorities"] {
  const zh = input.websiteFoundation.provenance.locale === "zh";
  const finding = input.websiteFoundation.findings.find(({ evidence }) => evidence.length > 0);
  const gap = gaps[0];
  const citation = citations.find(({ retrieval }) => retrieval.state === "available") ?? citations[0];
  const blindCitation = citations.find(({ id }) => id !== citation?.id) ?? citation;
  const fallbackCell = cells[0];
  if (!finding && !gap && !citation && !fallbackCell) {
    throw new Error("Recommendation priorities require persisted answer or website evidence.");
  }
  const questionForCell = (cellId: string | undefined) => {
    const questionId = cells.find(({ id }) => id === cellId)?.questionId;
    return input.questions.questions.find(({ id }) => id === questionId)?.exactText ?? (zh ? "未知问题" : "Unknown question");
  };
  const gapEntities = gap?.competitorEntityIds.map((id) => entities.find((entity) => entity.entityId === id)?.name).filter(Boolean).join(", ") || (zh ? "未知对象" : "Unknown entity");
  const blindEvidence = buildBlindSpot(input).omissions[0] ?? buildBlindSpot(input).limitations[0];
  return [
    {
      order: 1,
      title: gap?.title ?? (zh ? "未知推荐差距：先补采集" : "Unknown recommendation gap: collect evidence first"),
      rationale: gap
        ? (zh ? `${gap.title}涉及 ${gapEntities}，对应问题“${questionForCell(gap.evidenceCellIds[0])}”；仅表示已观察关联。` : `${gap.title} involves ${gapEntities} for “${questionForCell(gap.evidenceCellIds[0])}”; this is an observed association only.`)
        : (zh ? `未知推荐差距：当前没有可审计推荐对象；以 ${finding?.title ?? "网站证据未知"} 为现有证据边界。` : `Unknown recommendation gap: no auditable entity was observed; ${finding?.title ?? "Website evidence Unknown"} is the current evidence boundary.`),
      evidenceCellIds: gap?.evidenceCellIds.slice(0, 3) ?? (fallbackCell ? [fallbackCell.id] : []),
      websiteFindingIds: !gap && finding ? [finding.id] : [], citationSourceIds: [], gapIds: gap ? [gap.id] : []
    },
    {
      order: 2,
      title: finding?.title ?? (zh ? "网站盲区未知：补采集" : "Website blind spot Unknown: collect evidence"),
      rationale: finding
        ? (zh ? `${finding.title}与首页/全站差异“${blindEvidence}”相关。` : `${finding.title} is tied to the homepage/full-site difference “${blindEvidence}”.`)
        : blindCitation
          ? (zh ? `网站盲区未知：没有带证据的网站发现；以来源类别 ${blindCitation.category} 为边界补采集。` : `Website blind spot Unknown: no evidence-backed website finding exists; collect evidence within the ${blindCitation.category} source boundary.`)
          : gap
            ? (zh ? `网站盲区未知：没有带证据的网站发现；以差距“${gap.title}”为边界采集首页与全站差异。` : `Website blind spot Unknown: no evidence-backed website finding exists; collect homepage/full-site differences within the boundary of “${gap.title}”.`)
            : (zh ? `网站盲区未知：没有带证据的网站发现；以问题“${questionForCell(fallbackCell?.id)}”的成功观察为边界补采集。` : `Website blind spot Unknown: no evidence-backed website finding exists; collect evidence from the successful observation for “${questionForCell(fallbackCell?.id)}”.`),
      evidenceCellIds: finding ? [] : blindCitation ? [blindCitation.cellId] : gap ? gap.evidenceCellIds.slice(0, 3) : fallbackCell ? [fallbackCell.id] : [],
      websiteFindingIds: finding ? [finding.id] : [], citationSourceIds: !finding && blindCitation ? [blindCitation.id] : [], gapIds: !finding && !blindCitation && gap ? [gap.id] : []
    },
    {
      order: 3,
      title: citation ? `${citation.category} ${zh ? "来源证据" : "source evidence"}` : (zh ? "来源证据未知：补采集" : "Source evidence Unknown: collect evidence"),
      rationale: citation
        ? (zh ? `${citation.category} 出现在问题“${questionForCell(citation.cellId)}”的提供商返回来源中，当前等级由检索状态决定。` : `${citation.category} appears in provider-returned sources for “${questionForCell(citation.cellId)}”; its grade follows the observed retrieval state.`)
        : (zh ? `来源证据未知：没有可引用来源；${finding?.title ?? "网站证据未知"} 是当前证据边界，不预设媒体或目录动作。` : `Source evidence Unknown: no citeable source was observed; ${finding?.title ?? "Website evidence Unknown"} is the current boundary, so do not prescribe media or directory work.`),
      evidenceCellIds: citation ? [citation.cellId] : (fallbackCell ? [fallbackCell.id] : []),
      websiteFindingIds: !citation && finding ? [finding.id] : [], citationSourceIds: citation ? [citation.id] : [], gapIds: []
    }
  ];
}

function buildVendorTasks(
  commercialIds: string[],
  entities: RecommendationForensicReportV1["recommendedEntities"],
  citations: RecommendationForensicReportV1["citationSources"],
  gaps: RecommendationForensicReportV1["customerVsCompetitorGaps"],
  input: RecommendationReportBuilderInput,
  locale: string
): RecommendationForensicReportV1["vendorTaskPackage"]["tasks"] {
  const defaultCellId = commercialIds[0];
  if (!defaultCellId) return [];
  const finding = input.websiteFoundation.findings.find(({ evidence }) => evidence.length > 0);
  const gap = gaps[0];
  const citation = citations.find(({ retrieval }) => retrieval.state === "available") ?? citations[0];
  const question = input.questions.questions[0]!;
  const retestQuestionIds = input.questions.questions.map(({ id }) => id);
  const zh = locale === "zh";
  const competitorNames = gap?.competitorEntityIds.map((id) => entities.find((entity) => entity.entityId === id)?.name).filter(Boolean).join(", ") || (zh ? "未知对象" : "Unknown entity");
  const findingTitle = finding?.title ?? (zh ? "网站证据未知" : "Website evidence Unknown");
  const gapTitle = gap?.title ?? (zh ? "推荐差距未知" : "Recommendation gap Unknown");
  const sourceCategory = citation?.category ?? "unknown";
  const websiteRefs = finding ? [finding.id] : [];
  const gapRefs = gap ? [gap.id] : [];
  const citationRefs = citation ? [citation.id] : [];
  const citationCells = citation ? [citation.cellId] : [defaultCellId];
  const gapCells = gap?.evidenceCellIds.slice(0, 3) ?? [defaultCellId];
  const tasks: RecommendationForensicReportV1["vendorTaskPackage"]["tasks"] = [
    {
      id: "vendor-task-website", vendor: "website", title: findingTitle,
      rationale: finding
        ? (zh ? `${findingTitle} 是网站基础附录中的实际finding。` : `${findingTitle} is the evidence-backed website finding in the appendix.`)
        : (zh ? `${gapTitle}涉及 ${competitorNames}，但网站证据未知。` : `${gapTitle} involves ${competitorNames}, but website evidence is Unknown.`),
      actions: finding ? [finding.recommendation, zh ? `把引用证据附到问题“${question.exactText}”对应的归属页面。` : `Attach the cited evidence to the owner page for “${question.exactText}”.`] : [zh ? "未知：先采集可核验的网站发现，不改写页面。" : "Unknown: collect a verifiable website finding before changing owner pages."],
      acceptanceCriteria: [zh ? `交付物逐项引用finding“${findingTitle}”及其URL。` : `Every deliverable cites the finding “${findingTitle}” and its URLs.`],
      evidenceCellIds: finding ? [defaultCellId] : gapCells, websiteFindingIds: websiteRefs, citationSourceIds: [], gapIds: finding ? [] : gapRefs, retestQuestionIds
    },
    {
      id: "vendor-task-seo", vendor: "seo", title: zh ? "问题到页面的证据映射" : "Question-to-page evidence map",
      rationale: finding
        ? (zh ? `${findingTitle}需要映射实际问题“${question.exactText}”；未观察到的 Schema/FAQ 保留为未知。` : `${findingTitle} must be mapped to the actual question “${question.exactText}”; unobserved Schema/FAQ needs remain Unknown.`)
        : (zh ? `${gapTitle}涉及 ${competitorNames}；问题到页面证据未知，先做证据收集。` : `${gapTitle} involves ${competitorNames}; question-to-page evidence is Unknown, so collect evidence first.`),
      actions: [zh ? `把“${question.exactText}”映射到现有owner page；仅在${findingTitle}证据支持时提出结构化数据草案。` : `Map “${question.exactText}” to an existing owner page; propose structured-data drafts only when supported by ${findingTitle}.`],
      acceptanceCriteria: [zh ? "附件列出实际问题、owner page、现有答案和未知证据。" : "Attachment lists the actual question, owner page, current answer, and Unknown evidence."],
      evidenceCellIds: finding ? [defaultCellId] : gapCells, websiteFindingIds: websiteRefs, citationSourceIds: [], gapIds: finding ? [] : gapRefs, retestQuestionIds
    },
    {
      id: "vendor-task-content", vendor: "content", title: gapTitle,
      rationale: zh ? `${gapTitle}涉及 ${competitorNames} 与问题“${question.exactText}”。` : `${gapTitle} involves ${competitorNames} for “${question.exactText}”.`,
      actions: [zh ? `围绕 ${competitorNames} 的已观察差距制作带方法、日期和边界的内容brief。` : `Create a method-, date-, and boundary-labeled content brief for the observed gap involving ${competitorNames}.`],
      acceptanceCriteria: [zh ? `brief逐项回链 ${gapTitle} 的cell与问题。` : `The brief links every claim to ${gapTitle}, its cells, and its question.`],
      evidenceCellIds: gapCells, websiteFindingIds: [], citationSourceIds: [], gapIds: gapRefs, retestQuestionIds
    },
    {
      id: "vendor-task-communications", vendor: "communications", title: citation ? (zh ? `${sourceCategory} 来源证据跟进` : `${sourceCategory} evidence follow-up`) : (zh ? "来源机会未知：证据收集" : "Source opportunity Unknown: evidence collection"),
      rationale: citation ? (zh ? `${sourceCategory} 是实际观察到的来源类别。` : `${sourceCategory} is the observed source category.`) : (zh ? `${gapTitle}当前没有citation source；媒体、目录与社区动作保持未知。` : `${gapTitle} has no citation source; media, directory, and community work remains Unknown.`),
      actions: citation ? [zh ? `核验 ${sourceCategory} 来源的公开证据要求，不承诺收录。` : `Verify the public evidence requirements for the ${sourceCategory} source; do not promise placement.`] : [zh ? "未知：先做媒体、目录与社区证据收集，不进行外联。" : "Unknown: collect media, directory, and community evidence before outreach."],
      acceptanceCriteria: [zh ? "记录来源类别、URL、证据要求与未知状态。" : "Record source category, URL, evidence requirement, and Unknown state."],
      evidenceCellIds: citation ? citationCells : gapCells, websiteFindingIds: [], citationSourceIds: citationRefs, gapIds: citation ? [] : gapRefs, retestQuestionIds
    },
    {
      id: "vendor-task-retest", vendor: "cross-functional", title: gapTitle,
      rationale: zh ? `${gapTitle}必须使用本报告实际生成的 ${retestQuestionIds.length} 个问题复测。` : `${gapTitle} must be retested with the ${retestQuestionIds.length} questions generated in this report.`,
      actions: input.questions.questions.map((item) => zh ? `固定复测问题：${item.exactText}` : `Fixed retest question: ${item.exactText}`),
      acceptanceCriteria: [zh ? "验收记录问题、表面、模型、地区、时间、来源、等级与未知状态。" : "Acceptance records question, surface, model, region, time, sources, grade, and Unknown state."],
      evidenceCellIds: gapCells, websiteFindingIds: [], citationSourceIds: [], gapIds: gapRefs, retestQuestionIds
    }
  ];
  return tasks;
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
