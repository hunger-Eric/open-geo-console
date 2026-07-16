import type { ReactNode } from "react";
import type {
  CombinedGeoReportV4,
  CombinedGeoReportV4Question,
  CombinedGeoReportV4Source,
  CombinedGeoReportV4SourceRetrievalStatus
} from "@open-geo-console/ai-report-engine";

export function CombinedGeoReportV4Artifact({ report }: { readonly report: CombinedGeoReportV4 }) {
  const copy = report.locale.toLocaleLowerCase("en-US").startsWith("zh") ? ZH : EN;
  return <main className="report-shell answer-first-report report-v4-artifact" data-report-version="4">
    <header className="report-hero answer-first-hero">
      <p className="eyebrow">{copy.kicker}</p>
      <h1>{copy.title}</h1>
      <p className="lede">{copy.introduction}</p>
      <dl className="metadata-grid">
        <Meta label={copy.target}>
          <a href={report.targetUrl} rel="noreferrer noopener" target="_blank">{report.targetUrl}</a>
        </Meta>
        <Meta label={copy.generated}>{report.generatedAt}</Meta>
      </dl>
    </header>

    <section className="report-section executive-summary" aria-labelledby="v4-website-conclusion">
      <p className="section-index">01</p>
      <h2 id="v4-website-conclusion">{copy.websiteConclusion}</h2>
      <div className="summary-copy" data-content-stage="conclusion">
        <p>{report.websiteSynthesis.summary}</p>
      </div>
      <div className="finding-list" data-content-stage="reason">
        <TextList className="finding-card" heading={copy.strengths} items={report.websiteSynthesis.strengths}/>
        <TextList className="finding-card" heading={copy.gaps} items={report.websiteSynthesis.gaps}/>
      </div>
      <div className="finding-card recommendation" data-content-stage="action">
        <h3>{copy.geoActions}</h3>
        <ol>{report.websiteSynthesis.actions.map((action, index) => <li key={index}>{action}</li>)}</ol>
      </div>
    </section>

    <section className="report-section" aria-labelledby="v4-customer-questions" data-answer-first-section="true">
      <p className="section-index">02</p>
      <h2 id="v4-customer-questions">{copy.customerQuestions}</h2>
      <p>{copy.questionIntroduction}</p>
      <div className="answer-card-list">
        {report.questions.map((question) => <QuestionCard copy={copy} key={question.questionId} question={question}/>) }
      </div>
    </section>
  </main>;
}

function QuestionCard({
  copy,
  question
}: {
  readonly copy: Copy;
  readonly question: CombinedGeoReportV4Question;
}) {
  const sources = question.sources
    .filter((source) => source.questionId === question.questionId)
    .slice(0, 5);
  const titleId = `v4-question-${question.order}-title`;
  return <article
    aria-labelledby={titleId}
    className="answer-card report-v4-question"
    data-question-order={question.order}
  >
    <header className="answer-card-heading">
      <div>
        <p className="eyebrow">{copy.question} {question.order}</p>
        <h2 id={titleId}>{question.questionText}</h2>
      </div>
      <p className="answer-status">{question.status === "answered" ? copy.answered : copy.unavailableStatus}</p>
    </header>

    <section className="answer-conclusion" data-question-stage="conclusion" aria-labelledby={`${titleId}-conclusion`}>
      <h3 id={`${titleId}-conclusion`}>{copy.conclusion}</h3>
      <p className="business-question-answer">{question.answer ?? copy.unavailableAnswer}</p>
    </section>

    {question.status === "answered" && <section
      className="answer-reasons"
      data-question-stage="reason"
      aria-labelledby={`${titleId}-reasons`}
    >
      <h3 id={`${titleId}-reasons`}>{copy.reasons}</h3>
      {question.diagnosis && <DiagnosisSummary copy={copy} question={question} sources={sources}/>}
      <QuestionSources copy={copy} sources={sources}/>
      {question.diagnosis && <DetailedEvidence copy={copy} question={question} sources={sources}/>}
    </section>}

    {question.diagnosis && <section
      className="diagnosis-followup report-v4-actions"
      data-question-stage="action"
      aria-labelledby={`${titleId}-actions`}
    >
      <h3 id={`${titleId}-actions`}>{copy.geoActions}</h3>
      <ol>
        {question.diagnosis.recommendedActions.map((item) => <li key={item.priority}>
          <span className="action-priority">{item.priority}</span> {item.action}
        </li>)}
      </ol>
    </section>}
  </article>;
}

function DiagnosisSummary({
  copy,
  question,
  sources
}: {
  readonly copy: Copy;
  readonly question: CombinedGeoReportV4Question;
  readonly sources: readonly CombinedGeoReportV4Source[];
}) {
  const diagnosis = question.diagnosis!;
  return <section className="geo-diagnosis" aria-label={copy.diagnosis}>
    <h4>{copy.sourceUseSummary}</h4>
    <p>{diagnosis.selectionSummary}</p>
    <h4>{copy.observableFactors}</h4>
    <ul>
      {diagnosis.observableFactors.map((factor, index) => <li key={index}>{factor.observation}</li>)}
    </ul>
    <h4>{copy.targetGap}</h4>
    <p>{diagnosis.targetGap}</p>
    {sources.length === 0 && <p className="source-limitation">{copy.noSources}</p>}
  </section>;
}

function QuestionSources({ copy, sources }: { readonly copy: Copy; readonly sources: readonly CombinedGeoReportV4Source[] }) {
  if (sources.length === 0) return null;
  return <section className="answer-sources" aria-label={copy.sources}>
    <h4>{copy.sources}</h4>
    <ol className="source-card-list">
      {sources.map((source, index) => <li className="source-card" data-question-source="true" key={source.sourceId}>
        <div className="source-ordinal" aria-hidden="true">[{index + 1}]</div>
        <div className="source-content">
          <h5>
            <a href={source.canonicalUrl} rel="noreferrer noopener" target="_blank">{source.title}</a>
          </h5>
          <p className={`source-audit-badge source-audit-${source.retrievalStatus}`}>
            {retrievalStatusLabel(source.retrievalStatus, copy)}
          </p>
          <p className="source-url">{source.canonicalUrl}</p>
        </div>
      </li>)}
    </ol>
  </section>;
}

function DetailedEvidence({
  copy,
  question,
  sources
}: {
  readonly copy: Copy;
  readonly question: CombinedGeoReportV4Question;
  readonly sources: readonly CombinedGeoReportV4Source[];
}) {
  const refs = new Set(question.diagnosis!.detailedEvidenceRefs);
  const detailedSources = sources.filter((source) => refs.has(source.sourceId));
  return <details className="methodology-appendix question-evidence-details">
    <summary>{copy.viewDetailedEvidence}</summary>
    <div className="answer-audit-list">
      {detailedSources.length > 0
        ? detailedSources.map((source) => <article className="evidence-card" key={source.sourceId}>
            <h5>{source.title}</h5>
            <p className={`source-audit-badge source-audit-${source.retrievalStatus}`}>
              {retrievalStatusLabel(source.retrievalStatus, copy)}
            </p>
            {source.citedText && <blockquote><span>{copy.sourceExcerpt}</span>{source.citedText}</blockquote>}
          </article>)
        : <p>{copy.noDetailedEvidence}</p>}
    </div>
  </details>;
}

function TextList({
  className,
  heading,
  items
}: {
  readonly className: string;
  readonly heading: string;
  readonly items: readonly string[];
}) {
  if (items.length === 0) return null;
  return <section className={className}>
    <h3>{heading}</h3>
    <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
  </section>;
}

function Meta({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function retrievalStatusLabel(status: CombinedGeoReportV4SourceRetrievalStatus, copy: Copy): string {
  switch (status) {
    case "available": return copy.sourceAvailable;
    case "inaccessible": return copy.sourceInaccessible;
    case "not_checked": return copy.sourceNotChecked;
  }
}

interface Copy {
  readonly kicker: string;
  readonly title: string;
  readonly introduction: string;
  readonly target: string;
  readonly generated: string;
  readonly websiteConclusion: string;
  readonly strengths: string;
  readonly gaps: string;
  readonly geoActions: string;
  readonly customerQuestions: string;
  readonly questionIntroduction: string;
  readonly question: string;
  readonly answered: string;
  readonly unavailableStatus: string;
  readonly conclusion: string;
  readonly unavailableAnswer: string;
  readonly reasons: string;
  readonly diagnosis: string;
  readonly sourceUseSummary: string;
  readonly observableFactors: string;
  readonly targetGap: string;
  readonly sources: string;
  readonly noSources: string;
  readonly sourceAvailable: string;
  readonly sourceInaccessible: string;
  readonly sourceNotChecked: string;
  readonly viewDetailedEvidence: string;
  readonly sourceExcerpt: string;
  readonly noDetailedEvidence: string;
}

const EN: Copy = {
  kicker: "Generated-answer visibility",
  title: "Open GEO report",
  introduction: "Conclusions, supporting reasons and GEO actions for the audited website.",
  target: "Audited website",
  generated: "Generated",
  websiteConclusion: "Website conclusion",
  strengths: "Supporting strengths",
  gaps: "Observed gaps",
  geoActions: "GEO actions",
  customerQuestions: "Customer questions",
  questionIntroduction: "Each answer is followed only by sources and diagnosis for that question.",
  question: "Question",
  answered: "Answered",
  unavailableStatus: "Temporarily unavailable",
  conclusion: "Conclusion",
  unavailableAnswer: "This question is temporarily unavailable.",
  reasons: "Why this answer",
  diagnosis: "Question-level GEO diagnosis",
  sourceUseSummary: "Source-use summary",
  observableFactors: "Observable factors",
  targetGap: "Target website gap",
  sources: "Sources for this question",
  noSources: "No question-owned source is available to display.",
  sourceAvailable: "Page independently readable",
  sourceInaccessible: "Page temporarily unavailable for independent reading",
  sourceNotChecked: "Independent reading not yet checked",
  viewDetailedEvidence: "View detailed evidence",
  sourceExcerpt: "Source excerpt: ",
  noDetailedEvidence: "No source excerpt is available for this diagnosis."
};

const ZH: Copy = {
  kicker: "生成式答案可见性",
  title: "Open GEO 报告",
  introduction: "按结论、依据和 GEO 行动呈现目标官网分析。",
  target: "检测网站",
  generated: "生成时间",
  websiteConclusion: "官网结论",
  strengths: "支持结论的优势",
  gaps: "可观察缺口",
  geoActions: "GEO 行动",
  customerQuestions: "客户问题",
  questionIntroduction: "每个答案后只展示属于该问题的来源和诊断。",
  question: "问题",
  answered: "已回答",
  unavailableStatus: "暂不可用",
  conclusion: "结论",
  unavailableAnswer: "该问题暂不可用。",
  reasons: "结论依据",
  diagnosis: "问题级 GEO 诊断",
  sourceUseSummary: "来源采用摘要",
  observableFactors: "可观察因素",
  targetGap: "目标官网缺口",
  sources: "本题来源",
  noSources: "当前没有可展示的本题来源。",
  sourceAvailable: "页面可独立读取",
  sourceInaccessible: "页面暂时无法独立读取",
  sourceNotChecked: "尚未独立核验",
  viewDetailedEvidence: "查看详细依据",
  sourceExcerpt: "来源摘录：",
  noDetailedEvidence: "当前诊断没有可展示的来源摘录。"
};
