import React, { type ReactNode } from "react";
import type {
  CombinedGeoReportV4,
  CombinedGeoReportV4Question,
  CombinedGeoReportV4Source,
  CombinedGeoReportV4SourceRetrievalStatus,
  CombinedGeoReportV4WebsiteSynthesis,
  HistoricalCombinedGeoReportV4,
  PersistedCombinedGeoReportV4
} from "@open-geo-console/ai-report-engine";
import { isHistoricalCombinedGeoReportV4 } from "@open-geo-console/ai-report-engine";

export function CombinedGeoReportV4Artifact({ report }: { readonly report: PersistedCombinedGeoReportV4 }) {
  if (isHistoricalCombinedGeoReportV4(report)) return <HistoricalV4Artifact report={report}/>;
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
        <Meta label={copy.generated}>{formatTimestamp(report.generatedAt, report.locale)}</Meta>
      </dl>
    </header>

    <section className="report-section" aria-labelledby="v4-page-coverage">
      <p className="section-index">01</p>
      <h2 id="v4-page-coverage">{copy.pageCoverage}</h2>
      <p>{copy.pageCoverageIntroduction}</p>
      <dl className="metadata-grid">
        <Meta label={copy.totalPages}>{report.pageCoverage.counts.total}</Meta>
        <Meta label={copy.analyzedPages}>{report.pageCoverage.counts.analyzed}</Meta>
        <Meta label={copy.crawlUnavailablePages}>{report.pageCoverage.counts.crawlUnavailable}</Meta>
        <Meta label={copy.excludedPages}>{report.pageCoverage.counts.excluded}</Meta>
        <Meta label={copy.analysisUnavailablePages}>{report.pageCoverage.counts.analysisUnavailable}</Meta>
      </dl>
      <ol className="source-card-list page-outcome-list">
        {report.pageCoverage.pages.map((page) => <li className="source-card" key={page.pageId} data-page-outcome={page.status}>
          <div className="source-ordinal" aria-hidden="true">{page.ordinal}</div>
          <div className="source-content">
            <h3><a href={page.url} rel="noreferrer noopener" target="_blank">{page.url}</a></h3>
            <p className={`source-audit-badge page-outcome-${page.status}`}>{pageOutcomeLabel(page.status, copy)}</p>
            {page.reasonCode && <p className="source-limitation">{copy.observationReason}: <code>{page.reasonCode}</code></p>}
          </div>
        </li>)}
      </ol>
    </section>

    <section className="report-section executive-summary" aria-labelledby="v4-website-conclusion">
      <p className="section-index">02</p>
      <h2 id="v4-website-conclusion">{copy.websiteConclusion}</h2>
      {report.websiteSynthesis.status === "available" ? <>
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
      </> : <div className="summary-copy source-limitation" data-content-stage="conclusion">
        <p>{websiteUnavailableCopy(report.websiteSynthesis.reason, copy)}</p>
      </div>}
    </section>

    <section className="report-section" aria-labelledby="v4-customer-questions" data-answer-first-section="true">
      <p className="section-index">03</p>
      <h2 id="v4-customer-questions">{copy.customerQuestions}</h2>
      <p>{copy.questionIntroduction}</p>
      <div className="answer-card-list">
        {report.questions.map((question) => <QuestionCard copy={copy} key={question.questionId} question={question}/>) }
      </div>
    </section>
  </main>;
}

function HistoricalV4Artifact({ report }: { readonly report: HistoricalCombinedGeoReportV4 }) {
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
        <Meta label={copy.generated}>{formatTimestamp(report.generatedAt, report.locale)}</Meta>
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
      <p className={`answer-status answer-status-${question.status}`}>{question.status === "answered" ? copy.answered : copy.unavailableStatus}</p>
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
        <div className="source-ordinal" aria-hidden="true">{index + 1}</div>
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

function formatTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale.toLocaleLowerCase("en-US").startsWith("zh") ? "zh-CN" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function retrievalStatusLabel(status: CombinedGeoReportV4SourceRetrievalStatus, copy: Copy): string {
  switch (status) {
    case "available": return copy.sourceAvailable;
    case "inaccessible": return copy.sourceInaccessible;
    case "not_checked": return copy.sourceNotChecked;
  }
}

function pageOutcomeLabel(status: CombinedGeoReportV4["pageCoverage"]["pages"][number]["status"], copy: Copy): string {
  switch (status) {
    case "analyzed": return copy.pageAnalyzed;
    case "crawl_unavailable": return copy.pageCrawlUnavailable;
    case "excluded": return copy.pageExcluded;
    case "analysis_unavailable": return copy.pageAnalysisUnavailable;
  }
}

function websiteUnavailableCopy(
  reason: Extract<CombinedGeoReportV4WebsiteSynthesis, { status: "unavailable" }>["reason"],
  copy: Copy
): string {
  switch (reason) {
    case "no_crawl_readable_pages": return copy.noCrawlReadablePages;
    case "all_page_analyses_unavailable": return copy.allPageAnalysesUnavailable;
    case "website_synthesis_unavailable": return copy.websiteSynthesisUnavailable;
  }
}

interface Copy {
  readonly kicker: string;
  readonly title: string;
  readonly introduction: string;
  readonly target: string;
  readonly generated: string;
  readonly pageCoverage: string;
  readonly pageCoverageIntroduction: string;
  readonly totalPages: string;
  readonly analyzedPages: string;
  readonly crawlUnavailablePages: string;
  readonly excludedPages: string;
  readonly analysisUnavailablePages: string;
  readonly pageAnalyzed: string;
  readonly pageCrawlUnavailable: string;
  readonly pageExcluded: string;
  readonly pageAnalysisUnavailable: string;
  readonly observationReason: string;
  readonly noCrawlReadablePages: string;
  readonly allPageAnalysesUnavailable: string;
  readonly websiteSynthesisUnavailable: string;
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
  pageCoverage: "Page crawl coverage",
  pageCoverageIntroduction: "Each row is a terminal observation from this Open GEO crawl. A crawl-unavailable page is part of the result, not a whole-report failure.",
  totalPages: "Observed pages",
  analyzedPages: "Analyzed",
  crawlUnavailablePages: "Crawl unavailable",
  excludedPages: "Excluded",
  analysisUnavailablePages: "Internal analysis unavailable",
  pageAnalyzed: "Page analyzed",
  pageCrawlUnavailable: "Unavailable to this Open GEO crawl",
  pageExcluded: "Excluded from analysis",
  pageAnalysisUnavailable: "Crawled; internal page analysis unavailable",
  observationReason: "Observation code",
  noCrawlReadablePages: "This Open GEO crawl could not obtain readable content from any observed page. The page outcomes above are the GEO result; no website synthesis was fabricated.",
  allPageAnalysesUnavailable: "Readable pages were obtained, but their internal semantic analyses were unavailable. The crawl observations above remain valid; no website synthesis was fabricated.",
  websiteSynthesisUnavailable: "Readable page analyses remain available, but the internal website synthesis was unavailable. The page observations and customer-question answers remain part of this limited report; no website conclusion was fabricated.",
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
  pageCoverage: "页面爬取覆盖",
  pageCoverageIntroduction: "每一行都是本次 Open GEO 爬取的终态观察。页面爬取不到是检测结果的一部分，不代表整份报告失败。",
  totalPages: "观察页面",
  analyzedPages: "已分析",
  crawlUnavailablePages: "爬取不可用",
  excludedPages: "已排除",
  analysisUnavailablePages: "内部分析不可用",
  pageAnalyzed: "页面已分析",
  pageCrawlUnavailable: "本次 Open GEO 爬取不可用",
  pageExcluded: "已从分析中排除",
  pageAnalysisUnavailable: "已爬取，内部页面分析不可用",
  observationReason: "观察代码",
  noCrawlReadablePages: "本次 Open GEO 爬取未能从任何观察页面取得可读内容。上方页面终态就是 GEO 检测结果；系统没有编造网站综合结论。",
  allPageAnalysesUnavailable: "系统取得了可读页面，但内部语义分析不可用。上方爬取观察仍然有效；系统没有编造网站综合结论。",
  websiteSynthesisUnavailable: "页面语义分析仍然可用，但内部网站综合分析不可用。页面观察和客户问题回答仍属于这份受限报告；系统没有编造网站综合结论。",
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
