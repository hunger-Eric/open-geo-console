import React from "react";
import type {
  ObservableSelectionFactorKindV1,
  SourceContributionRoleV1,
  SourceSelectionBasisV1,
  SourceSelectionConfidenceV1,
  SourceSelectionDiagnosisV1,
  SourceSelectionProfileV1
} from "@open-geo-console/ai-report-engine";

export interface SourceSelectionDiagnosisSectionProps {
  diagnosis: SourceSelectionDiagnosisV1;
  locale: "zh" | "en";
  targetUrl: string;
  questions: readonly { id: string; text: string }[];
}

export function SourceSelectionDiagnosisSection({ diagnosis, locale, targetUrl, questions }: SourceSelectionDiagnosisSectionProps) {
  const zh = locale === "zh";
  const copy = zh ? ZH : EN;
  const questionById = new Map(questions.map((question, index) => [question.id, { ...question, index }]));
  const targetDomain = hostname(targetUrl);
  const targetRefs = diagnosis.sourceProfiles
    .filter(({ registrableDomain }) => targetDomain === registrableDomain || targetDomain.endsWith(`.${registrableDomain}`))
    .reduce((count, profile) => count + profile.sourceRefs.length, 0);
  const dominant = diagnosis.sharedPatterns[0]?.summary
    ?? diagnosis.limitations.find(({ code }) => code === "no_cross_question_pattern")?.message
    ?? copy.noPattern;
  const priority = diagnosis.targetActions[0]?.title ?? copy.noAction;

  return <section className="report-section source-selection-diagnosis" data-source-selection-diagnosis={diagnosis.version} data-diagnosis-status={diagnosis.status}>
    <header className="source-diagnosis-heading">
      <div><p className="section-index">03</p><h2>{copy.title}</h2><p>{copy.purpose}</p></div>
      <p className="source-diagnosis-method">{copy.method}</p>
    </header>

    {diagnosis.status === "unavailable" && diagnosis.sourceProfiles.length === 0
      ? <UnavailableState title={copy.unavailable} message={diagnosis.limitations.find(({ code }) => code === "analysis_unavailable")?.message ?? copy.unavailable} />
      : <>
        <div className="source-diagnosis-insights">
          <Insight label={copy.dominant} value={dominant}/>
          <Insight label={copy.targetPosition} value={targetRefs > 0 ? copy.targetUsed(targetRefs) : copy.targetAbsent}/>
          <Insight label={copy.breakthrough} value={priority}/>
        </div>

        <h3 className="source-profile-list-title">{copy.returnedSources}</h3>
        <div className="source-profile-list">
          {diagnosis.sourceProfiles.map((profile, index) => <SourceProfile key={profile.profileId} profile={profile} number={index + 1} zh={zh} questionById={questionById}/>) }
        </div>

        <div className="source-diagnosis-bottom">
          <article className="source-pattern-panel">
            <p className="source-diagnosis-eyeline">{copy.sharedPattern}</p>
            <h3>{copy.whatRecurs}</h3>
            {diagnosis.sharedPatterns.length
              ? <ul>{diagnosis.sharedPatterns.map((pattern) => <li key={pattern.patternId}>{pattern.summary}</li>)}</ul>
              : <p>{dominant}</p>}
          </article>
          <article className="target-action-path">
            <p className="source-diagnosis-eyeline">{copy.targetPath}</p>
            <h3>{copy.targetPathTitle}</h3>
            {diagnosis.targetActions.length
              ? <div className="target-action-steps">{diagnosis.targetActions.map((action, index) => <div className="target-action-step" key={action.actionId}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{priorityLabel(action.priority, zh)}</p><h4>{action.title}</h4><p>{action.rationale}</p></div></div>)}</div>
              : <p>{copy.noAction}</p>}
          </article>
        </div>

        {diagnosis.limitations.some(({ code }) => code !== "no_cross_question_pattern")
          ? <aside className="source-diagnosis-limitations"><h3>{copy.limitations}</h3><ul>{diagnosis.limitations.filter(({ code }) => code !== "no_cross_question_pattern").map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul></aside>
          : null}
      </>}

    <footer className="source-diagnosis-trust">
      <p><strong>{copy.canConfirm}</strong>{copy.confirmed}</p>
      <p><strong>{copy.cannotAssert}</strong>{copy.notCausal}</p>
    </footer>
  </section>;
}

function SourceProfile({ profile, number, zh, questionById }: {
  profile: SourceSelectionProfileV1;
  number: number;
  zh: boolean;
  questionById: Map<string, { id: string; text: string; index: number }>;
}) {
  const copy = zh ? ZH : EN;
  return <article className="source-profile-card" data-source-profile={profile.profileId}>
    <header className="source-profile-identity">
      <p className="source-profile-number">SOURCE {String(number).padStart(2, "0")}</p>
      <h4>{profile.registrableDomain}</h4>
      <p className={`source-profile-audit source-profile-audit-${profile.auditStatus}`}>{auditLabel(profile.auditStatus, zh)}</p>
      <div className="source-question-chips">{profile.coveredQuestionIds.map((id) => {
        const question = questionById.get(id);
        return <span title={question?.text} key={id}>{question ? `${copy.question} ${question.index + 1}` : id}</span>;
      })}</div>
    </header>
    <div className="source-profile-contribution">
      <p className="source-diagnosis-eyeline">{copy.contribution}</p>
      {profile.contributions.map((item) => {
        const question = questionById.get(item.questionId);
        return <div className="source-contribution-item" key={`${item.questionId}-${item.sourceId}`}>
          {question ? <p className="source-contribution-question">{copy.question} {question.index + 1} · {question.text}</p> : null}
          <h5>{roleLabel(item.role, zh)}</h5>
          <p>{item.summary}</p>
          {item.sourceExcerpt ? <blockquote><span>{copy.traceableExcerpt}</span>{item.sourceExcerpt}</blockquote> : <p className="source-contribution-unavailable">{copy.unconfirmed}</p>}
          <p className="source-analysis-basis">{basisLabel(item.basis, item.confidence, zh)}</p>
        </div>;
      })}
    </div>
    <div className="source-profile-factors">
      <p className="source-diagnosis-eyeline">{copy.factors}</p>
      <div className="source-factor-list">{profile.observableFactors.map((factor, index) => <article className="source-factor" key={`${factor.factor}-${index}`}><div><span className="source-factor-chip">{factorLabel(factor.factor, zh)}</span><span>{basisLabel(factor.basis, factor.confidence, zh)}</span></div><p>{factor.observation}</p></article>)}</div>
    </div>
    {profile.targetGaps.length ? <div className="source-profile-gaps"><p className="source-diagnosis-eyeline">{copy.targetGap}</p>{profile.targetGaps.map((gap, index) => <p key={`${gap.factor}-${index}`}><strong>{factorLabel(gap.factor, zh)}：</strong>{gap.comparison}</p>)}</div> : null}
  </article>;
}

function Insight({ label, value }: { label: string; value: string }) { return <article className="source-diagnosis-insight"><p>{label}</p><strong>{value}</strong></article>; }
function UnavailableState({ title, message }: { title: string; message: string }) { return <article className="source-diagnosis-unavailable"><h3>{title}</h3><p>{message}</p></article>; }
function hostname(value: string): string { try { return new URL(value).hostname.toLocaleLowerCase(); } catch { return value.toLocaleLowerCase(); } }

function roleLabel(value: SourceContributionRoleV1, zh: boolean): string {
  const labels: Record<SourceContributionRoleV1, [string, string]> = {
    candidate_discovery: ["候选发现", "Candidate discovery"], definition_or_framework: ["定义与框架", "Definition and framework"],
    first_party_capability: ["一手能力事实", "First-party capability"], constraint_or_risk: ["限制与风险", "Constraint and risk"],
    comparison: ["比较依据", "Comparison"], third_party_validation: ["第三方验证", "Third-party validation"], other: ["其他贡献", "Other contribution"]
  };
  return labels[value][zh ? 0 : 1];
}
function factorLabel(value: ObservableSelectionFactorKindV1, zh: boolean): string {
  const labels: Record<ObservableSelectionFactorKindV1, [string, string]> = {
    problem_match: ["问题匹配", "Problem match"], factual_specificity: ["事实具体度", "Factual specificity"], entity_clarity: ["实体清晰", "Entity clarity"],
    source_authority: ["来源角色", "Source authority"], accessibility: ["可访问性", "Accessibility"], freshness: ["时效性", "Freshness"]
  };
  return labels[value][zh ? 0 : 1];
}
function basisLabel(basis: SourceSelectionBasisV1, confidence: SourceSelectionConfidenceV1, zh: boolean): string {
  const labels: Record<SourceSelectionBasisV1, [string, string]> = {
    provider_returned: ["同次回答返回", "Returned with answer"], independently_verified: ["独立核验", "Independently verified"],
    analyst_inference: ["受限推断", "Bounded inference"], unavailable: ["当前不可确认", "Currently unavailable"]
  };
  const confidenceLabels: Record<SourceSelectionConfidenceV1, [string, string]> = { confirmed: ["已确认", "Confirmed"], supported: ["有支持", "Supported"], inferred: ["推断", "Inferred"], unavailable: ["不可用", "Unavailable"] };
  return `${labels[basis][zh ? 0 : 1]} · ${confidenceLabels[confidence][zh ? 0 : 1]}`;
}
function auditLabel(value: SourceSelectionProfileV1["auditStatus"], zh: boolean): string { return ({ verified: zh ? "正文已核验" : "Body verified", partial: zh ? "部分可核验" : "Partially verified", unavailable: zh ? "当前不可访问" : "Currently inaccessible" })[value]; }
function priorityLabel(value: "high" | "medium" | "low", zh: boolean): string { return ({ high: zh ? "高优先级" : "High priority", medium: zh ? "中优先级" : "Medium priority", low: zh ? "低优先级" : "Low priority" })[value]; }

const ZH = {
  title: "来源选择诊断", purpose: "解释这些答案为什么采用当前来源、来源分别贡献了什么，以及目标网站要补齐哪些条件，才更可能进入下一次生成式答案。",
  method: "可验证采用解释 · 非内部排名推测", dominant: "主导来源模式", targetPosition: "目标站当前位置", breakthrough: "优先突破口",
  targetUsed: (count: number) => `目标网站在 ${count} 处答案来源中被采用`, targetAbsent: "三个问题中均未成为引用来源", noPattern: "本次未形成跨问题重复来源模式", noAction: "当前证据不足以形成可靠行动",
  returnedSources: "反复或重要的回答来源", sharedPattern: "跨来源共同规律", whatRecurs: "哪些来源特征反复出现", targetPath: "目标站差距", targetPathTitle: "目标网站进入答案的优先路径",
  contribution: "为答案贡献了什么", factors: "可观察入选因素", targetGap: "与目标网站的对应差距", question: "问题", traceableExcerpt: "可回查片段", unconfirmed: "贡献关系当前无法确认。",
  limitations: "分析局限", canConfirm: "可以确认：", confirmed: "来源由同次回答返回，展示的引用片段和页面特征可以回查。", cannotAssert: "不能断言：", notCausal: "这些因素是模型内部排名权重，或调整某项因素就必然获得引用。", unavailable: "来源选择分析暂不可用"
};
const EN = {
  title: "Source selection diagnosis", purpose: "Explain what each returned source contributed, which observable characteristics made it useful, and what the target should improve to become a more usable source in a future answer.",
  method: "Traceable adoption explanation · not hidden-ranking speculation", dominant: "Dominant source pattern", targetPosition: "Target position", breakthrough: "Priority breakthrough",
  targetUsed: (count: number) => `The target was used in ${count} answer-source position${count === 1 ? "" : "s"}`, targetAbsent: "The target was not cited across the three questions", noPattern: "No source domain recurred across questions", noAction: "Current evidence does not support a reliable action",
  returnedSources: "Recurring or important answer sources", sharedPattern: "Cross-source pattern", whatRecurs: "Which source characteristics recur", targetPath: "Target gap", targetPathTitle: "Priority path for entering future answers",
  contribution: "What this source contributed", factors: "Observable selection factors", targetGap: "Corresponding target gap", question: "Question", traceableExcerpt: "Traceable excerpt", unconfirmed: "The contribution relationship cannot currently be confirmed.",
  limitations: "Analysis limitations", canConfirm: "Can confirm: ", confirmed: "the source was returned by the same answer operation, and displayed excerpts or page characteristics are traceable.", cannotAssert: "Cannot assert: ", notCausal: "these factors are hidden ranking weights or that changing one guarantees future citation.", unavailable: "Source selection analysis is unavailable"
};
