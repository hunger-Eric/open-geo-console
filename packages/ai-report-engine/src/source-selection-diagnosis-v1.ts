export const SOURCE_SELECTION_DIAGNOSIS_VERSION = "source_selection_diagnosis_v1" as const;
export const SOURCE_SELECTION_CONTRIBUTION_ANALYZER_VERSION = "deterministic-contribution-v1" as const;
export const SOURCE_SELECTION_FACTOR_ANALYZER_VERSION = "observable-factor-v1" as const;
export const SOURCE_SELECTION_TARGET_COMPARATOR_VERSION = "target-page-signal-v1" as const;

export type SourceSelectionBasisV1 = "provider_returned" | "independently_verified" | "analyst_inference" | "unavailable";
export type SourceSelectionConfidenceV1 = "confirmed" | "supported" | "inferred" | "unavailable";
export type SourceContributionRoleV1 = "candidate_discovery" | "definition_or_framework" | "first_party_capability" | "constraint_or_risk" | "comparison" | "third_party_validation" | "other";
export type ObservableSelectionFactorKindV1 = "problem_match" | "factual_specificity" | "entity_clarity" | "source_authority" | "accessibility" | "freshness";
export type SourceSelectionOwnershipCategoryV1 = "target_owned" | "competitor_owned" | "third_party_editorial" | "directory" | "government" | "other" | "institution" | "community" | "social" | "unknown";

export interface SourceSelectionSourceInputV1 {
  questionId: string;
  sourceId: string;
  title: string;
  canonicalUrl: string;
  registrableDomain: string;
  citedText: string | null;
  auditExcerpt: string | null;
  retrievalStatus: "verified_body" | "search_source_only" | "inaccessible";
  ownershipCategory: SourceSelectionOwnershipCategoryV1;
  providerResultOrder: number;
}

export interface SourceSelectionTargetPageInputV1 {
  id: string;
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  readableTextLength: number;
  hasJsonLd: boolean;
}

export interface SourceSelectionDiagnosisBuildInputV1 {
  locale: "zh" | "en";
  answerHash: string;
  sourceHash: string;
  targetFoundationHash: string;
  targetDomain: string;
  targetPages: SourceSelectionTargetPageInputV1[];
  questions: Array<{ questionId: string; answerText: string; sources: SourceSelectionSourceInputV1[] }>;
}

export interface SourceContributionV1 {
  questionId: string;
  sourceId: string;
  role: SourceContributionRoleV1;
  summary: string;
  answerExcerpt: string | null;
  sourceExcerpt: string | null;
  basis: SourceSelectionBasisV1;
  confidence: SourceSelectionConfidenceV1;
}

export interface ObservableSelectionFactorV1 {
  factor: ObservableSelectionFactorKindV1;
  observation: string;
  evidenceUrl: string | null;
  evidenceExcerpt: string | null;
  basis: SourceSelectionBasisV1;
  confidence: SourceSelectionConfidenceV1;
}

export interface TargetSourceGapV1 {
  factor: ObservableSelectionFactorKindV1;
  targetState: "present" | "weak" | "missing" | "unavailable";
  comparison: string;
  sourceEvidenceRefs: Array<{ questionId: string; sourceId: string; factor: ObservableSelectionFactorKindV1 }>;
  targetEvidenceRefs: Array<{ kind: "target_page" | "technical_finding"; id: string }>;
}

export interface SourceSelectionProfileV1 {
  profileId: string;
  registrableDomain: string;
  sourceRefs: Array<{ questionId: string; sourceId: string }>;
  coveredQuestionIds: string[];
  contributions: SourceContributionV1[];
  observableFactors: ObservableSelectionFactorV1[];
  targetGaps: TargetSourceGapV1[];
  auditStatus: "verified" | "partial" | "unavailable";
}

export interface SourceSelectionPatternV1 {
  patternId: string;
  summary: string;
  supportingProfileIds: string[];
  supportingQuestionIds: string[];
  factorKinds: ObservableSelectionFactorKindV1[];
}

export interface SourceSelectionActionV1 {
  actionId: string;
  priority: "high" | "medium" | "low";
  actionFamily: "first_party_fact_page" | "entity_relationship" | "accessible_structure" | "freshness" | "third_party_validation";
  title: string;
  rationale: string;
  relatedProfileIds: string[];
  relatedGapFactors: ObservableSelectionFactorKindV1[];
}

export interface SourceSelectionLimitationV1 {
  code: "contribution_unconfirmed" | "source_inaccessible" | "target_comparison_unavailable" | "no_cross_question_pattern" | "analysis_unavailable";
  scope: "diagnosis" | "profile" | "contribution" | "target_gap";
  relatedIds: string[];
  message: string;
}

export interface SourceSelectionDiagnosisV1 {
  version: typeof SOURCE_SELECTION_DIAGNOSIS_VERSION;
  status: "complete" | "partial" | "unavailable";
  inputIdentity: {
    answerHash: string;
    sourceHash: string;
    targetFoundationHash: string;
    locale: "zh" | "en";
    contributionAnalyzerVersion: typeof SOURCE_SELECTION_CONTRIBUTION_ANALYZER_VERSION;
    factorAnalyzerVersion: typeof SOURCE_SELECTION_FACTOR_ANALYZER_VERSION;
    targetComparatorVersion: typeof SOURCE_SELECTION_TARGET_COMPARATOR_VERSION;
  };
  sourceProfiles: SourceSelectionProfileV1[];
  sharedPatterns: SourceSelectionPatternV1[];
  targetActions: SourceSelectionActionV1[];
  limitations: SourceSelectionLimitationV1[];
}

export function buildSourceSelectionDiagnosisV1(input: SourceSelectionDiagnosisBuildInputV1): SourceSelectionDiagnosisV1 {
  const zh = input.locale === "zh";
  const sourceGroups = new Map<string, Array<{ source: SourceSelectionSourceInputV1; answerText: string; questionIndex: number }>>();
  input.questions.forEach((question, questionIndex) => {
    for (const source of question.sources) {
      const domain = source.registrableDomain.trim().toLocaleLowerCase();
      const group = sourceGroups.get(domain) ?? [];
      group.push({ source, answerText: question.answerText, questionIndex });
      sourceGroups.set(domain, group);
    }
  });

  const limitations: SourceSelectionLimitationV1[] = [];
  const sourceProfiles = [...sourceGroups.entries()].map(([domain, entries]) => {
    const sorted = entries.toSorted((left, right) => left.questionIndex - right.questionIndex || left.source.providerResultOrder - right.source.providerResultOrder || left.source.sourceId.localeCompare(right.source.sourceId));
    const coveredQuestionIds = [...new Set(sorted.map(({ source }) => source.questionId))];
    const contributions = sorted.map(({ source, answerText, questionIndex }) => contribution(source, answerText, questionIndex, zh, limitations));
    const observableFactors = factors(sorted.map(({ source }) => source), zh);
    const inaccessibleCount = sorted.filter(({ source }) => source.retrievalStatus === "inaccessible").length;
    const verifiedCount = sorted.filter(({ source }) => source.retrievalStatus === "verified_body").length;
    const auditStatus: SourceSelectionProfileV1["auditStatus"] = verifiedCount === sorted.length
      ? "verified"
      : inaccessibleCount === sorted.length ? "unavailable" : "partial";
    if (inaccessibleCount > 0) {
      limitations.push({
        code: "source_inaccessible",
        scope: "profile",
        relatedIds: sorted.filter(({ source }) => source.retrievalStatus === "inaccessible").map(({ source }) => source.sourceId),
        message: zh ? `${domain} 由同次回答返回，但部分页面当前无法独立访问。` : `${domain} was returned with the answer, but some pages are currently inaccessible for independent review.`
      });
    }
    const sourceRefs = sorted.map(({ source }) => ({ questionId: source.questionId, sourceId: source.sourceId }));
    const targetGaps: TargetSourceGapV1[] = domain === input.targetDomain.toLocaleLowerCase() ? [] : [{
      factor: "problem_match",
      targetState: input.targetPages.length ? "weak" : "unavailable",
      comparison: zh
        ? `该来源已进入当前答案；目标网站在本次三个问题的返回来源中未承担同类角色。`
        : "This source entered the current answers; the target did not play the same source role in the three returned source sets.",
      sourceEvidenceRefs: sourceRefs.map((ref) => ({ ...ref, factor: "problem_match" as const })),
      targetEvidenceRefs: input.targetPages.map(({ id }) => ({ kind: "target_page" as const, id }))
    }];
    return {
      profileId: `source-profile-${safeId(domain)}`,
      registrableDomain: domain,
      sourceRefs,
      coveredQuestionIds,
      contributions,
      observableFactors,
      targetGaps,
      auditStatus
    } satisfies SourceSelectionProfileV1;
  }).toSorted((left, right) => right.coveredQuestionIds.length - left.coveredQuestionIds.length || earliestOrder(left, sourceGroups) - earliestOrder(right, sourceGroups) || left.registrableDomain.localeCompare(right.registrableDomain));

  const repeated = sourceProfiles.filter(({ coveredQuestionIds }) => coveredQuestionIds.length >= 2);
  const sharedPatterns: SourceSelectionPatternV1[] = repeated.length ? [{
    patternId: "cross-question-repeated-source",
    summary: zh
      ? `有 ${repeated.length} 个来源域名跨多个问题反复出现，说明它们同时提供了发现、比较或核验所需的信息。`
      : `${repeated.length} source domain recurred across questions, providing information usable for discovery, comparison, or verification.`,
    supportingProfileIds: repeated.map(({ profileId }) => profileId),
    supportingQuestionIds: [...new Set(repeated.flatMap(({ coveredQuestionIds }) => coveredQuestionIds))],
    factorKinds: [...new Set(repeated.flatMap(({ observableFactors }) => observableFactors.map(({ factor }) => factor)))]
  }] : [];
  if (!sharedPatterns.length) {
    limitations.push({
      code: "no_cross_question_pattern",
      scope: "diagnosis",
      relatedIds: sourceProfiles.map(({ profileId }) => profileId),
      message: zh ? "本次三个问题未形成重复来源模式。" : "No source domain recurred across the three questions."
    });
  }

  if (!sourceProfiles.length) {
    limitations.push({
      code: "analysis_unavailable",
      scope: "diagnosis",
      relatedIds: [],
      message: zh ? "本次回答没有可安全展示的来源，来源选择分析暂不可用。" : "No safely displayable source was returned, so source selection analysis is unavailable."
    });
  }
  if (!input.targetPages.length) {
    limitations.push({
      code: "target_comparison_unavailable",
      scope: "target_gap",
      relatedIds: [],
      message: zh ? "目标页面信号不可用，无法完成页面级差距比较。" : "Target page signals are unavailable, so page-level gap comparison could not be completed."
    });
  }

  const targetPresent = sourceProfiles.some(({ registrableDomain }) => registrableDomain === input.targetDomain.toLocaleLowerCase());
  const profileIds = sourceProfiles.map(({ profileId }) => profileId);
  const factorSet = new Set(sourceProfiles.flatMap(({ observableFactors }) => observableFactors.map(({ factor }) => factor)));
  const targetActions: SourceSelectionActionV1[] = [];
  if (sourceProfiles.length && !targetPresent) {
    targetActions.push({
      actionId: "action-first-party-fact-page",
      priority: "high",
      actionFamily: "first_party_fact_page",
      title: zh ? "建设可独立引用的服务事实页" : "Publish independently citable service fact pages",
      rationale: zh ? "目标网站未进入本次三个问题的来源集合；先用独立页面明确服务、区域、条件与限制。" : "The target did not enter the source sets for the three questions; first publish dedicated pages that state services, regions, conditions, and constraints.",
      relatedProfileIds: profileIds,
      relatedGapFactors: ["problem_match"]
    });
  }
  if (factorSet.has("entity_clarity") && !targetPresent) {
    targetActions.push({
      actionId: "action-entity-relationship",
      priority: "medium",
      actionFamily: "entity_relationship",
      title: zh ? "明确品牌、服务与适用场景关系" : "Clarify brand, service, and use-case relationships",
      rationale: zh ? "已采用来源能清楚识别实体和服务关系；目标页面应使用稳定名称与具体能力陈述。" : "Accepted sources expose clear entity-service relationships; target pages should use stable names and specific capability statements.",
      relatedProfileIds: profileIds,
      relatedGapFactors: ["entity_clarity"]
    });
  }
  if (factorSet.has("source_authority") && !targetPresent) {
    targetActions.push({
      actionId: "action-third-party-validation",
      priority: "medium",
      actionFamily: "third_party_validation",
      title: zh ? "补充可核验的第三方背书" : "Build independently verifiable third-party validation",
      rationale: zh ? "当前答案采用了第三方或机构来源；目标品牌需要争取目录、协会、客户案例或编辑来源的独立验证。" : "The answers used third-party or institutional sources; the target should earn independent validation from directories, associations, customer cases, or editorial sources.",
      relatedProfileIds: profileIds,
      relatedGapFactors: ["source_authority"]
    });
  }

  const result: SourceSelectionDiagnosisV1 = {
    version: SOURCE_SELECTION_DIAGNOSIS_VERSION,
    status: !sourceProfiles.length ? "unavailable" : limitations.some(({ code }) => code === "source_inaccessible" || code === "contribution_unconfirmed" || code === "target_comparison_unavailable") ? "partial" : "complete",
    inputIdentity: {
      answerHash: input.answerHash,
      sourceHash: input.sourceHash,
      targetFoundationHash: input.targetFoundationHash,
      locale: input.locale,
      contributionAnalyzerVersion: SOURCE_SELECTION_CONTRIBUTION_ANALYZER_VERSION,
      factorAnalyzerVersion: SOURCE_SELECTION_FACTOR_ANALYZER_VERSION,
      targetComparatorVersion: SOURCE_SELECTION_TARGET_COMPARATOR_VERSION
    },
    sourceProfiles,
    sharedPatterns,
    targetActions,
    limitations
  };
  return parseSourceSelectionDiagnosisV1(result, { questions: input.questions });
}

export function parseSourceSelectionDiagnosisV1(
  value: unknown,
  context: {
    questions: Array<{ questionId: string; answerText: string; sources: SourceSelectionSourceInputV1[] }>;
    allowPersistedIndependentExcerpts?: boolean;
  }
): SourceSelectionDiagnosisV1 {
  rejectProhibitedKeys(value);
  const root = object(value, "$sourceSelectionDiagnosis");
  exact(root.version, SOURCE_SELECTION_DIAGNOSIS_VERSION, "$sourceSelectionDiagnosis.version");
  oneOf(root.status, ["complete", "partial", "unavailable"] as const, "$sourceSelectionDiagnosis.status");
  const identity = object(root.inputIdentity, "$sourceSelectionDiagnosis.inputIdentity");
  for (const key of ["answerHash", "sourceHash", "targetFoundationHash"] as const) sha256(identity[key], `$sourceSelectionDiagnosis.inputIdentity.${key}`);
  oneOf(identity.locale, ["zh", "en"] as const, "$sourceSelectionDiagnosis.inputIdentity.locale");
  exact(identity.contributionAnalyzerVersion, SOURCE_SELECTION_CONTRIBUTION_ANALYZER_VERSION, "$sourceSelectionDiagnosis.inputIdentity.contributionAnalyzerVersion");
  exact(identity.factorAnalyzerVersion, SOURCE_SELECTION_FACTOR_ANALYZER_VERSION, "$sourceSelectionDiagnosis.inputIdentity.factorAnalyzerVersion");
  exact(identity.targetComparatorVersion, SOURCE_SELECTION_TARGET_COMPARATOR_VERSION, "$sourceSelectionDiagnosis.inputIdentity.targetComparatorVersion");

  const questionById = new Map(context.questions.map((question) => [question.questionId, question]));
  const sourceByKey = new Map(context.questions.flatMap((question) => question.sources.map((source) => [`${question.questionId}:${source.sourceId}`, source] as const)));
  const profiles = array(root.sourceProfiles, "$sourceSelectionDiagnosis.sourceProfiles");
  const profileIds = new Set<string>();
  const gapFactors = new Set<ObservableSelectionFactorKindV1>();
  for (const [profileIndex, profileValue] of profiles.entries()) {
    const profile = object(profileValue, `$sourceSelectionDiagnosis.sourceProfiles[${profileIndex}]`);
    const profileId = bounded(profile.profileId, `${profileIndex}.profileId`, 500);
    if (profileIds.has(profileId)) throw new TypeError("Source selection profile IDs must be unique.");
    profileIds.add(profileId);
    bounded(profile.registrableDomain, `${profileIndex}.registrableDomain`, 500);
    const refs = array(profile.sourceRefs, `${profileIndex}.sourceRefs`);
    if (!refs.length) throw new TypeError("Source selection profiles require source refs.");
    for (const refValue of refs) {
      const ref = object(refValue, `${profileIndex}.sourceRef`);
      const questionId = bounded(ref.questionId, "sourceRef.questionId", 500);
      const sourceId = bounded(ref.sourceId, "sourceRef.sourceId", 500);
      if (!sourceByKey.has(`${questionId}:${sourceId}`)) throw new TypeError(`Source selection diagnosis references unknown source ${questionId}:${sourceId}.`);
    }
    for (const contributionValue of array(profile.contributions, `${profileIndex}.contributions`)) {
      const contribution = object(contributionValue, "contribution");
      const questionId = bounded(contribution.questionId, "contribution.questionId", 500);
      const sourceId = bounded(contribution.sourceId, "contribution.sourceId", 500);
      const source = sourceByKey.get(`${questionId}:${sourceId}`);
      if (!source) throw new TypeError(`Source selection diagnosis references unknown source ${questionId}:${sourceId}.`);
      oneOf(contribution.role, ["candidate_discovery", "definition_or_framework", "first_party_capability", "constraint_or_risk", "comparison", "third_party_validation", "other"] as const, "contribution.role");
      customerText(contribution.summary, "contribution.summary");
      const answerExcerpt = nullableText(contribution.answerExcerpt, "contribution.answerExcerpt", 2_000);
      if (answerExcerpt && !questionById.get(questionId)?.answerText.includes(answerExcerpt)) throw new TypeError("Contribution answer excerpt must be an exact persisted answer substring.");
      const sourceExcerpt = nullableText(contribution.sourceExcerpt, "contribution.sourceExcerpt", 2_000);
      if (sourceExcerpt && sourceExcerpt !== source.citedText && sourceExcerpt !== source.auditExcerpt &&
          !(context.allowPersistedIndependentExcerpts && contribution.basis === "independently_verified")) {
        throw new TypeError("Contribution source excerpt is not bound to the persisted source.");
      }
      validateBasisConfidence(contribution.basis, contribution.confidence, "contribution");
    }
    for (const factorValue of array(profile.observableFactors, `${profileIndex}.observableFactors`)) {
      const factor = object(factorValue, "factor");
      const kind = oneOf(factor.factor, ["problem_match", "factual_specificity", "entity_clarity", "source_authority", "accessibility", "freshness"] as const, "factor.factor");
      gapFactors.add(kind);
      customerText(factor.observation, "factor.observation");
      nullableText(factor.evidenceUrl, "factor.evidenceUrl", 2_000);
      nullableText(factor.evidenceExcerpt, "factor.evidenceExcerpt", 2_000);
      validateBasisConfidence(factor.basis, factor.confidence, "factor");
    }
    for (const gapValue of array(profile.targetGaps, `${profileIndex}.targetGaps`)) {
      const gap = object(gapValue, "targetGap");
      gapFactors.add(oneOf(gap.factor, ["problem_match", "factual_specificity", "entity_clarity", "source_authority", "accessibility", "freshness"] as const, "targetGap.factor"));
      oneOf(gap.targetState, ["present", "weak", "missing", "unavailable"] as const, "targetGap.targetState");
      customerText(gap.comparison, "targetGap.comparison");
      array(gap.sourceEvidenceRefs, "targetGap.sourceEvidenceRefs");
      array(gap.targetEvidenceRefs, "targetGap.targetEvidenceRefs");
    }
    oneOf(profile.auditStatus, ["verified", "partial", "unavailable"] as const, "profile.auditStatus");
  }

  for (const patternValue of array(root.sharedPatterns, "$sourceSelectionDiagnosis.sharedPatterns")) {
    const pattern = object(patternValue, "sharedPattern");
    bounded(pattern.patternId, "sharedPattern.patternId", 500);
    customerText(pattern.summary, "sharedPattern.summary");
    const supportingProfiles = stringArray(pattern.supportingProfileIds, "sharedPattern.supportingProfileIds");
    const supportingQuestions = stringArray(pattern.supportingQuestionIds, "sharedPattern.supportingQuestionIds");
    if (supportingProfiles.some((id) => !profileIds.has(id))) throw new TypeError("Shared source pattern references an unknown profile.");
    if (supportingProfiles.length < 2 && supportingQuestions.length < 2) throw new TypeError("Shared source patterns require two profiles or two questions.");
    array(pattern.factorKinds, "sharedPattern.factorKinds");
  }
  for (const actionValue of array(root.targetActions, "$sourceSelectionDiagnosis.targetActions")) {
    const action = object(actionValue, "targetAction");
    bounded(action.actionId, "targetAction.actionId", 500);
    oneOf(action.priority, ["high", "medium", "low"] as const, "targetAction.priority");
    oneOf(action.actionFamily, ["first_party_fact_page", "entity_relationship", "accessible_structure", "freshness", "third_party_validation"] as const, "targetAction.actionFamily");
    customerText(action.title, "targetAction.title");
    customerText(action.rationale, "targetAction.rationale");
    if (stringArray(action.relatedProfileIds, "targetAction.relatedProfileIds").some((id) => !profileIds.has(id))) throw new TypeError("Target action references an unknown profile.");
    if (stringArray(action.relatedGapFactors, "targetAction.relatedGapFactors").some((factor) => !gapFactors.has(factor as ObservableSelectionFactorKindV1))) throw new TypeError("Target action references an unknown gap factor.");
  }
  for (const limitationValue of array(root.limitations, "$sourceSelectionDiagnosis.limitations")) {
    const limitation = object(limitationValue, "limitation");
    oneOf(limitation.code, ["contribution_unconfirmed", "source_inaccessible", "target_comparison_unavailable", "no_cross_question_pattern", "analysis_unavailable"] as const, "limitation.code");
    oneOf(limitation.scope, ["diagnosis", "profile", "contribution", "target_gap"] as const, "limitation.scope");
    stringArray(limitation.relatedIds, "limitation.relatedIds");
    customerText(limitation.message, "limitation.message");
  }
  return value as SourceSelectionDiagnosisV1;
}

function contribution(source: SourceSelectionSourceInputV1, answerText: string, questionIndex: number, zh: boolean, limitations: SourceSelectionLimitationV1[]): SourceContributionV1 {
  const sourceExcerpt = source.auditExcerpt ?? source.citedText;
  const basis: SourceSelectionBasisV1 = source.auditExcerpt ? "independently_verified" : source.citedText ? "provider_returned" : "unavailable";
  const confidence: SourceSelectionConfidenceV1 = source.auditExcerpt ? "supported" : source.citedText ? "supported" : "unavailable";
  if (!sourceExcerpt) limitations.push({
    code: "contribution_unconfirmed",
    scope: "contribution",
    relatedIds: [source.sourceId],
    message: zh ? `${source.registrableDomain} 由回答返回，但当前无法确认它对答案的具体贡献。` : `${source.registrableDomain} was returned with the answer, but its specific contribution could not be confirmed.`
  });
  const role = roleFor(questionIndex, source.ownershipCategory);
  return {
    questionId: source.questionId,
    sourceId: source.sourceId,
    role,
    summary: contributionCopy(role, zh),
    answerExcerpt: sourceExcerpt && answerText.includes(sourceExcerpt) ? sourceExcerpt : null,
    sourceExcerpt,
    basis,
    confidence
  };
}

function factors(sources: SourceSelectionSourceInputV1[], zh: boolean): ObservableSelectionFactorV1[] {
  const first = sources[0]!;
  const excerptSource = sources.find(({ auditExcerpt }) => auditExcerpt)?.auditExcerpt ?? sources.find(({ citedText }) => citedText)?.citedText ?? null;
  const verified = sources.some(({ retrievalStatus }) => retrievalStatus === "verified_body");
  const accessible = sources.some(({ retrievalStatus }) => retrievalStatus !== "inaccessible");
  const basis: SourceSelectionBasisV1 = verified ? "independently_verified" : accessible ? "provider_returned" : "unavailable";
  const confidence: SourceSelectionConfidenceV1 = verified ? "confirmed" : accessible ? "supported" : "unavailable";
  const result: ObservableSelectionFactorV1[] = [{
    factor: "accessibility",
    observation: accessible ? (zh ? "来源页面可由回答返回并进行公开访问检查。" : "The source was returned with the answer and was available for public-access review.") : (zh ? "来源由回答返回，但页面当前无法独立访问。" : "The source was returned with the answer, but the page is currently inaccessible for independent review."),
    evidenceUrl: first.canonicalUrl,
    evidenceExcerpt: null,
    basis,
    confidence
  }];
  if (excerptSource) {
    result.unshift({ factor: "problem_match", observation: zh ? "返回片段直接包含当前问题所需的服务或条件信息。" : "The returned excerpt contains service or condition information relevant to the question.", evidenceUrl: first.canonicalUrl, evidenceExcerpt: excerptSource, basis, confidence: verified ? "supported" : confidence });
    if (specific(excerptSource)) result.push({ factor: "factual_specificity", observation: zh ? "来源使用了具体服务、区域、条件或限制信息，而不是泛化品牌介绍。" : "The source states concrete services, regions, conditions, or constraints rather than generic brand copy.", evidenceUrl: first.canonicalUrl, evidenceExcerpt: excerptSource, basis, confidence: verified ? "supported" : confidence });
  }
  if (first.ownershipCategory !== "unknown") result.push({ factor: "entity_clarity", observation: zh ? "来源身份及其与所述服务的关系可以被明确分类。" : "The source identity and its relationship to the stated service can be classified clearly.", evidenceUrl: first.canonicalUrl, evidenceExcerpt: null, basis: verified ? "independently_verified" : "analyst_inference", confidence: verified ? "supported" : "inferred" });
  if (["third_party_editorial", "directory", "government", "institution"].includes(first.ownershipCategory)) result.push({ factor: "source_authority", observation: zh ? "该来源提供品牌自述之外的第三方、目录、政府或机构视角。" : "The source provides a third-party, directory, government, or institutional perspective beyond brand self-description.", evidenceUrl: first.canonicalUrl, evidenceExcerpt: null, basis: "analyst_inference", confidence: "inferred" });
  return result;
}

function roleFor(questionIndex: number, ownership: SourceSelectionOwnershipCategoryV1): SourceContributionRoleV1 {
  if (["third_party_editorial", "directory", "government", "institution"].includes(ownership)) return questionIndex === 0 ? "candidate_discovery" : "third_party_validation";
  if (questionIndex === 0) return "candidate_discovery";
  if (questionIndex === 1) return "first_party_capability";
  if (questionIndex === 2) return "constraint_or_risk";
  return "other";
}

function contributionCopy(role: SourceContributionRoleV1, zh: boolean): string {
  const copy: Record<SourceContributionRoleV1, [string, string]> = {
    candidate_discovery: ["为答案提供候选服务商或服务方式的发现线索。", "Provides discovery leads for candidate providers or service approaches."],
    definition_or_framework: ["为答案提供定义、判断框架或比较标准。", "Provides a definition, decision framework, or comparison criteria."],
    first_party_capability: ["为答案提供具体服务能力或覆盖范围。", "Provides specific service capability or coverage information."],
    constraint_or_risk: ["为答案提供限制条件、风险或交付边界。", "Provides constraints, risks, or delivery boundaries."],
    comparison: ["为答案提供可比较的产品或服务事实。", "Provides comparable product or service facts."],
    third_party_validation: ["为答案提供独立于品牌自述的第三方验证。", "Provides third-party validation independent of brand self-description."],
    other: ["为答案提供与当前问题相关的公开信息。", "Provides public information relevant to the question."]
  };
  return copy[role][zh ? 0 : 1];
}

function validateBasisConfidence(basisValue: unknown, confidenceValue: unknown, path: string): void {
  const basis = oneOf(basisValue, ["provider_returned", "independently_verified", "analyst_inference", "unavailable"] as const, `${path}.basis`);
  const confidence = oneOf(confidenceValue, ["confirmed", "supported", "inferred", "unavailable"] as const, `${path}.confidence`);
  const valid = basis === "provider_returned" ? confidence === "supported"
    : basis === "independently_verified" ? confidence === "confirmed" || confidence === "supported"
      : basis === "analyst_inference" ? confidence === "inferred"
        : confidence === "unavailable";
  if (!valid) throw new TypeError(`${path} basis and confidence are inconsistent.`);
}

function customerText(value: unknown, path: string): string {
  const result = bounded(value, path, 500);
  if (/(?:保证|必然).{0,12}(?:选择|引用|推荐)|排名权重|隐藏权重|guarantee.{0,20}(?:select|citation|recommend)|ranking weight|hidden weight|because.{0,20}(?:model|provider).{0,20}(?:selected|ranked)/iu.test(result)) {
    throw new TypeError(`Causal guarantee language is prohibited at ${path}.`);
  }
  return result;
}

function rejectProhibitedKeys(value: unknown, path = "$sourceSelectionDiagnosis"): void {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectProhibitedKeys(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(?:score|weight|probability|rankingWeight)$/iu.test(key)) throw new TypeError(`Source selection scores and weights are prohibited at ${path}.${key}.`);
    rejectProhibitedKeys(item, `${path}.${key}`);
  }
}

function earliestOrder(profile: SourceSelectionProfileV1, groups: Map<string, Array<{ source: SourceSelectionSourceInputV1 }>>): number {
  return Math.min(...(groups.get(profile.registrableDomain) ?? []).map(({ source }) => source.providerResultOrder));
}
function specific(value: string): boolean { return value.trim().length >= 12 || /\d|提供|覆盖|限制|条件|服务|provide|cover|limit|condition|service/iu.test(value); }
function safeId(value: string): string { return value.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "") || "source"; }
function object(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`); return value; }
function exact(value: unknown, expected: unknown, path: string): void { if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`); }
function sha256(value: unknown, path: string): string { const result = bounded(value, path, 64); if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${path} must be a SHA-256 hash.`); return result; }
function bounded(value: unknown, path: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${path} must be non-empty text no longer than ${max} characters.`); return value.trim(); }
function nullableText(value: unknown, path: string, max: number): string | null { return value === null ? null : bounded(value, path, max); }
function stringArray(value: unknown, path: string): string[] { return array(value, path).map((item, index) => bounded(item, `${path}[${index}]`, 500)); }
function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] { if (typeof value !== "string" || !allowed.includes(value)) throw new TypeError(`${path} must be one of ${allowed.join(", ")}.`); return value as T[number]; }
