/* eslint-disable @next/next/no-img-element -- protected evidence images must remain printable in canonical HTML */
import React, { type ReactNode } from "react";
import type {
  DimensionKey,
  GenerativeSearchAnswerCardV3,
  LegacyEvidenceBoundAnswerCardV3,
  OpenGeoAnswerOwnershipCategoryV3,
  PaidV3DirectQuestionSemantics,
  ReportV4DiagnosisOutput
} from "@open-geo-console/ai-report-engine";
import type { CombinedPrivateReportArtifactModelV3 } from "@/report/artifact-model";
import { SourceSelectionDiagnosisSection } from "./source-selection-diagnosis-section";

type PaidAnswerCard=CombinedPrivateReportArtifactModelV3["combinedReport"]["answerCards"][number];
type PaidReport=CombinedPrivateReportArtifactModelV3["combinedReport"];
type EvidenceSummary={verified:number;searchOnly:number;inaccessible:number;total:number};

const DECISION_COPY={
  zh:{overallVerdict:"核心诊断",primaryAction:"第一优先行动",keyMetrics:"本次真实结果",completeAnswers:"形成答案",targetEntered:"品牌进入答案",targetSourced:"官网成为来源",technicalScore:"技术基础",whatItMeans:"这意味着什么",whyAbsent:"为什么没有进入答案",gapBasis:"主要差距与行动依据",reasonFallback:"现有证据只能确认目标网站尚未形成稳定的答案来源优势；具体原因需要结合逐题诊断继续核对。",evidenceBridgeTitle:"三个买家问题如何验证这个结论",evidenceBridgeCopy:"下面三个问题不是新的话题，而是用来验证同一个核心问题：当潜在客户向 AI 寻找服务商、比较方案和制定采购标准时，目标网站能否进入答案并成为实际来源。",roadmapScope:"以下是网站层面的快速修复与持续任务，不替代上方的报告级第一优先行动。",verifiedEvidence:"已独立核验",searchOnly:"仅搜索来源",inaccessible:"当前不可访问",answerDetail:"查看完整回答与诊断",evidenceDetail:"查看完整来源与摘录",diagnosisDetail:"查看本题差距与行动",sourceLandscapeDetail:"查看来源选择诊断",technicalDetail:"查看完整技术发现、页面与截图",actionCount:"项行动",why:"为什么要做",how:"具体怎么做"},
  en:{overallVerdict:"Core diagnosis",primaryAction:"First priority",keyMetrics:"Observed result",completeAnswers:"Answers formed",targetEntered:"Target entered answers",targetSourced:"Target site used as source",technicalScore:"Technical foundation",whatItMeans:"What this means",whyAbsent:"Why the target did not enter",gapBasis:"Primary gaps and action basis",reasonFallback:"The available evidence confirms that the target has not established a stable answer-source advantage. The question-level diagnosis should be used to examine the specific gaps.",evidenceBridgeTitle:"How the three buyer questions test this conclusion",evidenceBridgeCopy:"The questions below are not three new topics. They test the same core issue: when buyers ask AI to find providers, compare solutions, and define procurement criteria, can the target enter the answer and become an actual source?",roadmapScope:"These are website-level quick fixes and ongoing tasks. They do not replace the report-level first priority above.",verifiedEvidence:"Independently verified",searchOnly:"Search source only",inaccessible:"Currently inaccessible",answerDetail:"View the complete answer and diagnosis",evidenceDetail:"View all sources and excerpts",diagnosisDetail:"View this question's gaps and actions",sourceLandscapeDetail:"View source-selection diagnosis",technicalDetail:"View all technical findings, pages, and screenshots",actionCount:"actions",why:"Why this matters",how:"What to do"}
} as const;

const DIMENSION_LABELS:Record<"en"|"zh",Record<DimensionKey,string>>={
  en:{organizationClarity:"Organization clarity",informationArchitecture:"Information architecture",contentCitability:"Content and citability",trustEvidence:"Trust evidence",entityConsistency:"Entity consistency",geoUnderstandability:"GEO understandability"},
  zh:{organizationClarity:"企业表达清晰度",informationArchitecture:"信息架构",contentCitability:"内容与可引用性",trustEvidence:"信任与权威证据",entityConsistency:"实体一致性",geoUnderstandability:"GEO 可理解性"}
};

export function CombinedGeoReportV3Artifact({ model }: { model: CombinedPrivateReportArtifactModelV3 }) {
  const { combinedReport: report } = model;
  const zh = model.locale === "zh";
  const copy = zh ? ZH : EN;
  const content = zh ? ZH_CONTENT : EN_CONTENT;
  const directByQuestion=new Map(report.directSemantics?.questions.map((result)=>[result.questionId,result])??[]);
  const ordinals=citationOrdinals(report.answerCards);
  const answered=report.answerCards.filter(({status})=>status==="answered").length;
  const limited=report.answerCards.filter(({status})=>status!=="answered").length;
  const mentioned=report.directSemantics ? null : report.answerCards.filter(({geoDiagnosis})=>geoDiagnosis.targetMentioned).length;
  const profile=report.technicalFoundation.aiReport.organizationProfile;
  const coverage=report.technicalFoundation.aiReport.coverage;
  const conclusion=reportConclusion(report,model.locale);
  const decisionCopy=DECISION_COPY[model.locale];
  const targetActions=report.sourceSelectionDiagnosis?.targetActions.slice(0,3)??[];
  return <main className="report-shell answer-first-report paid-report-template" data-artifact-revision={report.artifactRevisionId}>
    <div className="paid-report-frame">
      <aside className="paid-report-rail">
        <div className="paid-report-brand"><strong>Open GEO</strong><span>{copy.brandLine}</span></div>
        <nav className="artifact-toc" aria-label={copy.toc}>
          <a href="#artifact-sec-guide"><span>00</span>{content.guide}</a>
          <a href="#artifact-sec-context"><span>01</span>{copy.websiteContext}</a>
          <a href="#artifact-sec-answers"><span>02</span>{copy.answers}</a>
          <a href="#artifact-sec-evidence"><span>03</span>{copy.answerEvidence}</a>
          <a href="#artifact-sec-absence"><span>04</span>{copy.absenceReasons}</a>
          <a href="#artifact-sec-technical"><span>05</span>{copy.technical}</a>
          <a href="#artifact-sec-actions"><span>06</span>{copy.actions}</a>
          {report.geoArticleExample ? <a href="#artifact-sec-article"><span>07</span>{geoArticleHeading(report.geoArticleExample,model.locale)}</a> : null}
          <a href="#artifact-sec-appendix"><span>08</span>{copy.appendix}</a>
        </nav>
        <dl className="rail-metadata"><Meta label={copy.target}>{report.targetUrl}</Meta><Meta label={copy.generated}>{formatTimestamp(report.generatedAt,model.locale)}</Meta><Meta label={copy.revision}><span title={report.artifactRevisionId}>{shortRevisionId(report.artifactRevisionId)}</span></Meta></dl>
      </aside>
      <article className="paid-report-document">
    <header className="report-section report-guide" id="artifact-sec-guide" data-report-guide="true">
      <div className="guide-kicker"><span>{copy.kicker}</span><time dateTime={report.generatedAt}>{formatTimestamp(report.generatedAt,model.locale)}</time></div>
      <p className="section-index">00</p><h1>{content.guide}</h1>
      <div className="decision-verdict" data-decision-summary="true">
        <p className="decision-eyebrow">{decisionCopy.overallVerdict}</p>
        <h2>{conclusion.summary}</h2>
      </div>
      <dl className="decision-metrics" aria-label={decisionCopy.keyMetrics}>
        <Meta label={decisionCopy.completeAnswers}>{conclusion.complete}/{conclusion.total}</Meta>
        <Meta label={decisionCopy.targetEntered}>{conclusion.mentioned}/{conclusion.total}</Meta>
        <Meta label={decisionCopy.targetSourced}>{conclusion.sourced}/{conclusion.total}</Meta>
        <Meta label={report.technicalFoundation.technicalReport.scoreBreakdown?(zh?"可复算技术检查":"Reconstructable technical check"):(zh?"历史技术分":"Legacy technical score")}>{report.technicalFoundation.technicalReport.score}/100</Meta>
      </dl>
      <section className="decision-meaning" data-decision-meaning="true">
        <h2>{decisionCopy.whatItMeans}</h2><p>{conclusion.meaning}</p>
      </section>
      <section className="decision-reasons" data-decision-reasons="true">
        <h2>{conclusion.noAdoption?decisionCopy.whyAbsent:decisionCopy.gapBasis}</h2>
        {targetActions.length?<div className="decision-reason-grid">{targetActions.map((action,index)=><article key={action.actionId}><span>{String(index+1).padStart(2,"0")}</span><h3>{action.title}</h3><p>{action.rationale}</p></article>)}</div>:<p>{decisionCopy.reasonFallback}</p>}
      </section>
      {conclusion.priority?<section className="decision-primary-action" data-primary-business-action="true">
        <p>{decisionCopy.primaryAction}</p><h2>{conclusion.priority.title}</h2><span>{conclusion.priority.rationale}</span>
      </section>:null}
      <dl className="guide-metadata decision-metadata"><Meta label={copy.target}>{report.targetUrl}</Meta><Meta label={copy.generated}>{formatTimestamp(report.generatedAt,model.locale)}</Meta></dl>
    </header>

    <section className="report-section website-context" id="artifact-sec-context" data-website-context="true">
      <p className="section-index">01</p><h2>{copy.websiteContext}</h2>
      <p className="website-context-name">{profile.organizationName ?? report.targetUrl}</p>
      <p>{profile.summary}</p>
      <div className="website-context-grid">
        <List label={copy.services} items={(profile.productsAndServices ?? []).slice(0,8)}/>
        <List label={copy.audiences} items={(profile.targetAudiences ?? []).slice(0,6)}/>
        <List label={copy.regions} items={(profile.marketsAndRegions ?? []).slice(0,6)}/>
      </div>
      <h3>{copy.executive}</h3>
      <p className="summary-copy">{report.technicalFoundation.aiReport.executiveSummary.overview}</p>
      <dl className="answer-metric-grid website-context-metrics"><Meta label={copy.analyzedPages}>{coverage.analyzedPages ?? report.technicalFoundation.technicalReport.pages.length}</Meta><Meta label={copy.answered}>{answered}/{report.answerCards.length}</Meta><Meta label={copy.limited}>{limited}/{report.answerCards.length}</Meta>{mentioned === null ? null : <Meta label={copy.mentioned}>{mentioned}/{report.answerCards.length}</Meta>}</dl>
    </section>

    <section className="report-section report-analysis-flow" data-progressive-analysis="true">
      <div className="question-evidence-bridge" data-question-evidence-bridge="true">
        <h2>{decisionCopy.evidenceBridgeTitle}</h2><p>{decisionCopy.evidenceBridgeCopy}</p>
      </div>
      <div className="analysis-stage-heading analysis-stage-answers" id="artifact-sec-answers" data-answer-first-section="true">
        <p className="section-index">02</p><h2>{copy.answers}</h2>
      </div>
      {report.answerCards.map((card,cardIndex)=>card.answerMode==="generative_search_v1"
        ? <React.Fragment key={card.questionId}>
            <GenerativeSearchAnswerCard card={card} cardIndex={cardIndex} locale={model.locale} flowOrder={201+cardIndex}/>
            <QuestionEvidence card={card} cardIndex={cardIndex} locale={model.locale} ordinals={ordinals} flowOrder={301+cardIndex}/>
            <QuestionAbsence card={card} cardIndex={cardIndex} locale={model.locale} direct={directByQuestion.get(card.questionId)} flowOrder={401+cardIndex}/>
          </React.Fragment>
        : <LegacyEvidenceBoundAnswerCard card={card} cardIndex={cardIndex} locale={model.locale} ordinals={ordinals} flowOrder={201+cardIndex} key={card.questionId}/>)}
      <div className="analysis-stage-heading analysis-stage-evidence" id="artifact-sec-evidence" data-answer-evidence-section="true">
        <p className="section-index">03</p><h2>{copy.answerEvidence}</h2>
      </div>
      {report.sourceSelectionDiagnosis
        ? <details className="analysis-global-evidence report-detail" data-source-diagnosis-detail="true"><summary>{decisionCopy.sourceLandscapeDetail}</summary><div className="report-detail-body"><SourceSelectionDiagnosisSection diagnosis={report.sourceSelectionDiagnosis} locale={model.locale} targetUrl={report.targetUrl} questions={report.answerCards.map(({questionId,exactQuestion})=>({id:questionId,text:exactQuestion}))}/></div></details>
        : null}
      <div className="analysis-stage-heading analysis-stage-absence" id="artifact-sec-absence" data-target-absence-section="true">
        <p className="section-index">04</p><h2>{copy.absenceReasons}</h2>
      </div>
      {report.sourceSelectionDiagnosis ? null : <div className="analysis-global-absence"><LegacyCrossQuestionDiagnosis report={report} locale={model.locale}/></div>}
    </section>

      <section className="report-section" id="artifact-sec-technical" data-technical-analysis="true">
      <p className="section-index">05</p><h2>{copy.technical}</h2>
      <h3>{zh?"可复算技术检查":"Reconstructable technical check"}</h3>
      <TechnicalChecklist technical={report.technicalFoundation.technicalReport} locale={model.locale}/>
      <h3>{copy.dimensionScores}</h3>
      <p className="score-method-note">{zh?"以下六项是模型依据已抓取网页证据给出的内容与 GEO 表达评估，不是上方技术检查的分项，也不参与技术分计算。":"The six dimensions below are model-assisted assessments of the supplied website evidence. They are not components of the technical check above and do not determine its score."}</p>
      <TechnicalScoreSummary scores={report.technicalFoundation.aiReport.dimensionScores} locale={model.locale}/>
      <details className="report-detail technical-detail" data-technical-detail="true"><summary>{decisionCopy.technicalDetail}</summary><div className="report-detail-body">
        <h3>{copy.technicalFindings}</h3>
        <div className="finding-list">{report.technicalFoundation.technicalReport.findings.map((finding) => <article className="finding-card" key={finding.id}><h4>{finding.title}</h4><p>{finding.description}</p><p className="recommendation">{finding.recommendation}</p></article>)}</div>
        <h3>{copy.pageAnalysis}</h3>
        <div className="table-wrap"><table><thead><tr><th>URL</th><th>{copy.pageTitle}</th><th>H1</th><th>Canonical</th><th>{copy.body}</th></tr></thead><tbody>{report.technicalFoundation.technicalReport.pages.map((page) => <tr key={page.url}><td>{page.url}</td><td>{page.title ?? "—"}</td><td>{page.h1.join(" · ") || "—"}</td><td>{page.canonical ?? "—"}</td><td>{page.metaDescription ?? "—"}</td></tr>)}</tbody></table></div>
        <h3>{content.technicalAnalysis}</h3>
        <div className="finding-list">{report.technicalFoundation.aiReport.findings.map((finding) => <article className="finding-card" key={finding.id}><h4>{finding.title}</h4><p>{finding.impact}</p><p className="recommendation">{finding.recommendation}</p>{finding.evidence.map((evidence,index)=>{const assets=model.evidenceAssets.filter((asset)=>asset.findingId===finding.id&&asset.citationIndex===index&&asset.status==="ready");return <figure className="evidence-card technical-evidence-card" key={`${finding.id}-${index}`}><figcaption><p className="technical-evidence-label">{content.evidenceSnapshot}</p><blockquote>{evidence.quote}</blockquote><a href={evidence.url}>{evidence.url}</a></figcaption>{assets.map((asset)=><img data-evidence-asset={asset.id} key={asset.id} src={`/api/reports/${model.reportId}/evidence/${asset.id}`} alt={`${finding.title} evidence`}/>)}</figure>;})}</article>)}</div>
        <h3>{copy.pageTypes}</h3>
        {report.technicalFoundation.aiReport.pageTypeAnalyses.map((analysis,index)=><article className="technical-analysis-row" key={`${analysis.pageType}-${index}`}><h4>{analysis.pageType}</h4><p>{analysis.sampledUrls.join(" · ")}</p><List label={copy.strengths} items={analysis.strengths}/><List label={copy.issues} items={analysis.commonIssues}/><List label={copy.recommendations} items={analysis.recommendations}/></article>)}
      </div></details>
    </section>

      <section className="report-section unified-actions" id="artifact-sec-actions" data-unified-actions="true">
        <p className="section-index">06</p><h2>{copy.actions}</h2>
        <p className="roadmap-scope-note">{decisionCopy.roadmapScope}</p>
        <div className="technical-roadmap" data-roadmap-flow="true">{(["immediate","nextPhase","ongoing"] as const).map((phase,phaseIndex)=><details className="roadmap-phase" data-roadmap-phase={phase} open={phaseIndex===0} key={phase}><summary><span>{phaseIndex+1}</span><div><h4>{roadmapLabel(phase,zh)}</h4><small>{report.technicalFoundation.aiReport.roadmap[phase].length} {decisionCopy.actionCount}</small></div></summary><div className="roadmap-phase-body">{report.technicalFoundation.aiReport.roadmap[phase].map((item,index)=><article data-roadmap-action={`${phaseIndex+1}.${index+1}`} data-primary-action={phase==="immediate"&&index===0?"true":undefined} key={`${phase}-${index}`}><header><span>{phaseIndex+1}.{index+1}</span><h5>{item.title}</h5></header><div className="roadmap-analysis-chain"><section><h6>{decisionCopy.why}</h6><p>{item.rationale}</p></section><section><h6>{decisionCopy.how}</h6><ol>{item.actions.map((action)=><li key={action}>{action}</li>)}</ol></section></div></article>)}</div></details>)}</div>
      </section>
      {report.geoArticleExample ? <div id="artifact-sec-article">
        <GeoArticleSection deliverable={report.geoArticleExample} report={report} locale={model.locale}/>
      </div> : null}
      <section className="report-section methodology-appendix" id="artifact-sec-appendix" data-methodology-appendix="true">
      <p className="section-index">08</p><h2>{copy.appendix}</h2>
      <h3>{content.method}</h3><p>{content.methodSummary}</p>
      <dl className="provenance-grid"><Meta label={copy.searchSurface}>{report.engineProvenance.searchSurface}</Meta><Meta label={copy.searched}>{formatTimestamp(report.engineProvenance.searchedAt,model.locale)}</Meta><Meta label={copy.cutoff}>{formatTimestamp(report.engineProvenance.evidenceCutoffAt,model.locale)}</Meta><Meta label={copy.model}>{report.engineProvenance.synthesisModel}</Meta><Meta label={copy.queryPlan}>{report.engineProvenance.queryPlanVersion}</Meta><Meta label={copy.passage}>{report.engineProvenance.passageSelectorVersion}</Meta></dl>
      {report.geoArticleExample?<dl className="article-generation-note"><Meta label={copy.generationMode}>{geoArticleGenerationLabel(report.geoArticleExample,model.locale)}</Meta></dl>:null}
      {report.sourceSelectionDiagnosis?<div className="source-method-notes"><p><strong>{content.sourceBoundary}</strong>{content.sourceBoundaryText}</p><p><strong>{content.nonCausal}</strong>{content.nonCausalText}</p>{report.sourceSelectionDiagnosis.limitations.length?<><h3>{content.sourceLimitations}</h3><ul>{report.sourceSelectionDiagnosis.limitations.map((item,index)=><li key={`${item.code}-${index}`}>{item.message}</li>)}</ul></>:null}</div>:null}
      <h3>{copy.coverage}</h3><ul>{report.methodology.limitations.map((item)=><li key={item}>{item}</li>)}</ul>
      <div className="answer-audit-list">{report.answerCards.map((card) => card.answerMode === "generative_search_v1"
        ? <dl data-answer-audit={card.questionId} key={card.questionId}><Meta label={copy.verifiedBody}>{card.audit.verifiedBodyCount}</Meta><Meta label={copy.searchSourceOnly}>{card.audit.searchSourceOnlyCount}</Meta><Meta label={copy.inaccessible}>{card.audit.inaccessibleCount}</Meta></dl>
        : <dl data-answer-coverage={card.questionId} key={card.questionId}><Meta label={copy.plannedQueries}>{card.coverage.plannedQueries}</Meta><Meta label={copy.completedQueries}>{card.coverage.completedQueries}</Meta><Meta label={copy.returnedResults}>{card.coverage.returnedResults}</Meta><Meta label={copy.attemptedRetrievals}>{card.coverage.attemptedRetrievals}</Meta><Meta label={copy.safelyRetrievedPages}>{card.coverage.safelyRetrievedPages}</Meta><Meta label={copy.eligibleDirectEvidence}>{card.coverage.eligibleDirectEvidence}</Meta></dl>)}</div>
    </section>
      </article>
    </div>
    <a className="artifact-to-top" href="#artifact-sec-guide">{copy.backToTop}</a>
  </main>;
}

function evidenceSummary(card:PaidAnswerCard):EvidenceSummary{
  if(card.answerMode!=="generative_search_v1")return {verified:card.sourceEvidence.length,searchOnly:0,inaccessible:0,total:card.sourceEvidence.length};
  return {verified:card.audit.verifiedBodyCount,searchOnly:card.audit.searchSourceOnlyCount,inaccessible:card.audit.inaccessibleCount,total:card.sources.length};
}
function TechnicalChecklist({technical,locale}:{technical:PaidReport["technicalFoundation"]["technicalReport"];locale:"en"|"zh"}){
  const zh=locale==="zh",breakdown=technical.scoreBreakdown;
  if(!breakdown)return <div className="technical-checklist technical-checklist-legacy" data-technical-score-method="legacy"><strong>{technical.score}/100</strong><p>{zh?"这是历史报告保存的技术分。该版本没有保存逐项算式，因此不能从当前报告精确复算；下方技术发现仍可单独核对。":"This is a persisted legacy technical score. Its itemized arithmetic was not stored, so it cannot be reconstructed exactly from this report; the findings below remain independently reviewable."}</p></div>;
  return <div className="technical-checklist" data-technical-score-method={breakdown.version}>
    <header><div><span>{zh?"检查结果":"Check result"}</span><strong>{breakdown.finalScore}/100</strong></div><p>{breakdown.startingScore} − {breakdown.deductions.reduce((sum,item)=>sum+item.deducted,0)} = {breakdown.finalScore}</p></header>
    <dl><Meta label={zh?"检查方法":"Method"}>{breakdown.version}</Meta><Meta label={zh?"抽样页面":"Pages checked"}>{breakdown.checkedPages}</Meta><Meta label={zh?"规则数量":"Rules evaluated"}>{breakdown.evaluatedRules}</Meta></dl>
    <div className="technical-deductions"><h4>{zh?"本次扣分明细":"Applied deductions"}</h4>{breakdown.deductions.length?<ol>{breakdown.deductions.map((item)=>{const finding=technical.findings.find(({id})=>item.findingIds.includes(id));return <li key={item.rule}><div><strong>{finding?.title??item.rule}</strong><span>−{item.deducted}</span></div><p>{zh?`影响 ${item.affectedCount} 项；每项 ${item.pointsPerOccurrence} 分，同类最多扣 ${item.maximumDeduction} 分。`:`${item.affectedCount} affected; ${item.pointsPerOccurrence} points each, capped at ${item.maximumDeduction} for this rule.`}</p></li>;})}</ol>:<p>{zh?"本次检查未产生扣分。":"No deductions were applied in this check."}</p>}</div>
  </div>;
}

function TechnicalScoreSummary({scores,locale}:{scores:PaidReport["technicalFoundation"]["aiReport"]["dimensionScores"];locale:"en"|"zh"}){
  const zh=locale==="zh";
  return <div className="technical-score-summary">{scores.map((score)=>{const band=semanticScoreBand(score.score,locale);return <article key={score.dimension}><header><h4>{DIMENSION_LABELS[locale][score.dimension as DimensionKey]}</h4><strong>{band}</strong></header><div className="semantic-score-meta"><span>{score.score}/100</span><span>{zh?"置信度":"Confidence"}：{confidenceLabel(score.confidence,locale)}</span></div><meter min={0} max={100} value={score.score}>{score.score}/100</meter><p>{score.explanation}</p><details><summary>{zh?`查看 ${score.evidence.length} 条评分依据`:`View ${score.evidence.length} scoring evidence item(s)`}</summary>{score.evidence.length?<ul>{score.evidence.map((item,index)=><li key={`${item.url}-${index}`}><blockquote>{item.quote}</blockquote><a href={item.url}>{hostname(item.url)}</a></li>)}</ul>:<p>{zh?"当前没有保留下可核验依据；该项不应被视为高置信结论。":"No verifiable evidence was retained; do not treat this as a high-confidence conclusion."}</p>}</details></article>;})}</div>;
}

function semanticScoreBand(score:number,locale:"en"|"zh"):string{const key=score<40?0:score<60?1:score<75?2:score<90?3:4;return (locale==="zh"?["证据不足","较弱","基本成立","较强","证据充分"]:["Insufficient","Weak","Adequate","Strong","Exceptional"])[key]!;}
function confidenceLabel(value:"low"|"medium"|"high",locale:"en"|"zh"):string{return locale==="zh"?({low:"低",medium:"中",high:"高"} as const)[value]:value;}

function Meta({label,children}:{label:string;children:ReactNode}){return <div><dt>{label}</dt><dd>{children}</dd></div>;}
function formatTimestamp(value:string,locale:"en"|"zh"){const date=new Date(value);if(Number.isNaN(date.getTime()))return value;return new Intl.DateTimeFormat(locale==="zh"?"zh-CN":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(date);}
function shortRevisionId(value:string){return value.length>12?`${value.slice(0,8)}…`:value;}
function List({label,items}:{label:string;items:readonly string[]}){return items.length?<div><strong>{label}</strong><ul>{items.map((item)=><li key={item}>{item}</li>)}</ul></div>:null;}
function citationOrdinals(cards:CombinedPrivateReportArtifactModelV3["combinedReport"]["answerCards"]){const result=new Map<string,number>();for(const card of cards){if(card.answerMode === "generative_search_v1")continue;for(const sentence of card.sentences)for(const id of sentence.evidenceIds)if(!result.has(id))result.set(id,result.size+1);}return result;}
function reportConclusion(report:CombinedPrivateReportArtifactModelV3["combinedReport"],locale:"en"|"zh"){
  const complete=report.answerCards.filter(({status})=>status==="answered").length;
  const mentioned=report.answerCards.filter(({geoDiagnosis})=>geoDiagnosis.targetMentioned).length;
  const total=report.answerCards.length;
  const targetDomain=hostname(report.targetUrl);
  const sourced=report.answerCards.filter((card)=>answerSourceDomains(card).some((domain)=>sameSite(domain,targetDomain))).length;
  const sourceAction=report.sourceSelectionDiagnosis?.targetActions[0];
  const priority=sourceAction?{title:sourceAction.title,rationale:sourceAction.rationale}:null;
  const noAdoption=mentioned===0&&sourced===0;
  const summary=locale==="zh"
    ? noAdoption
      ? complete===total
        ? "AI 已能回答这些买家问题，但还不会主动推荐或引用目标网站。"
        : `本次 ${total} 个买家问题中有 ${complete} 个形成完整答案；目标品牌和官网尚未进入答案或来源。`
      : `AI 已形成 ${complete}/${total} 个答案；目标品牌进入 ${mentioned}/${total} 个答案，官网成为 ${sourced}/${total} 个答案的来源。`
    : noAdoption
      ? complete===total
        ? "AI can answer these buyer questions, but it does not yet recommend or cite the target."
        : `${complete} of ${total} buyer questions formed complete answers; the target brand and site did not enter the answers or sources.`
      : `AI formed ${complete}/${total} answers; the target entered ${mentioned}/${total} and its site sourced ${sourced}/${total}.`;
  const meaning=locale==="zh"
    ? noAdoption
      ? "报告已经读取并识别了网站公开内容，但本次答案没有选择目标品牌或官网作为来源。当前差距不是“有没有写”，而是这些公开事实是否足够集中、明确并可被答案采用。"
      : `目标内容已经获得一定采用，但品牌进入答案（${mentioned}/${total}）与官网成为来源（${sourced}/${total}）仍是两个不同结果，需要分别核对。`
    : noAdoption
      ? "The report read and identified the site's public content, but the answers did not select the target brand or site as a source. The gap is not simply whether content exists, but whether its facts are concentrated, explicit, and adoptable."
      : `The target has some adoption, but entering an answer (${mentioned}/${total}) and sourcing it (${sourced}/${total}) remain separate outcomes.`;
  return {summary,meaning,priority,complete,mentioned,sourced,total,noAdoption};
}

function answerSourceDomains(card:PaidAnswerCard):string[]{
  return card.answerMode==="generative_search_v1"?card.sources.map(({registrableDomain})=>registrableDomain):card.sourceEvidence.map(({registrableDomain})=>registrableDomain);
}
function hostname(value:string):string{try{return new URL(value).hostname.toLowerCase().replace(/^www\./u,"");}catch{return "";}}
function sameSite(left:string,right:string):boolean{const a=left.toLowerCase().replace(/^www\./u,""),b=right.toLowerCase().replace(/^www\./u,"");return Boolean(a&&b&&(a===b||a.endsWith(`.${b}`)||b.endsWith(`.${a}`)));}

function GeoArticleSection({deliverable,report,locale}:{deliverable:NonNullable<PaidReport["geoArticleExample"]>;report:PaidReport;locale:"en"|"zh"}){
  const zh=locale==="zh";
  const labels=zh?{
    outlineNotice:"这是一份历史内容提纲，不是完整文章。",readerQuestion:"文章要回答的问题",directAnswer:"当前可支持的直接回答",plannedSections:"建议正文结构",evidenceToAdd:"成文前还需补充",faqAngles:"可延展的常见问题",explanation:"为什么这样组织这篇文章",faq:"买家常见问题",research:"参考资料",researchUnavailable:"专题搜索未返回可用公开来源；文章已使用网站事实和现有报告证据完成。",query:"内部研究问题",provider:"生成技术信息",supportingNotes:"资料来源与写作说明"
  }:{
    outlineNotice:"This is a historical content outline, not a complete article.",readerQuestion:"Question the article must answer",directAnswer:"Direct answer supported now",plannedSections:"Recommended article structure",evidenceToAdd:"Evidence to add before drafting",faqAngles:"Related FAQ angles",explanation:"Why this article is structured this way",faq:"Buyer FAQ",research:"Reference sources",researchUnavailable:"Focused search returned no usable public source; the article was completed from website facts and existing report evidence.",query:"Internal research question",provider:"Generation details",supportingNotes:"Sources and writing notes"
  };
  const mode=geoArticleGenerationMode(deliverable);
  if(deliverable.version==="geo_article_example_v1"){
    const isArticle=deliverable.generationMode==="model";
    return <section className="report-section geo-article-example" data-geo-article-kind={isArticle?"article":"outline"} data-geo-article-generation-mode={mode}>
      <p className="section-index">07</p><h2>{geoArticleHeading(deliverable,locale)}</h2>
      {!isArticle?<p className="geo-outline-notice">{labels.outlineNotice}</p>:null}
      <article className={isArticle?"geo-article-body":"geo-outline-body"}><h3>{displayLegacyGeoArticleText(deliverable.title)}</h3><p className="geo-article-introduction">{displayLegacyGeoArticleText(deliverable.introduction)}</p>
        {deliverable.sections.map((section)=><section className="geo-article-section" key={section.id}><h4>{displayLegacyGeoArticleText(section.heading)}</h4>{section.paragraphs.map((paragraph,index)=><p key={index}>{displayLegacyGeoArticleText(paragraph)}</p>)}</section>)}
        <section className="geo-article-faq"><h4>{labels.faq}</h4>{deliverable.faq.map((entry,index)=><article key={index}><h5>{displayLegacyGeoArticleText(entry.question)}</h5><p>{displayLegacyGeoArticleText(entry.answer)}</p></article>)}</section>
      </article>
      <ArticleExplanation entries={deliverable.rationale.map((entry)=>({elementId:entry.sectionId,heading:displayLegacyGeoArticleText(deliverable.sections.find(({id})=>id===entry.sectionId)?.heading??entry.sectionId),reason:displayLegacyGeoArticleText(entry.reason),geoFunction:zh?"帮助读者与 AI 理解本节在完整回答中的作用。":"Helps readers and AI understand this section's role in the complete answer.",evidenceRefs:entry.evidenceRefs}))} report={report} locale={locale} heading={labels.explanation}/>
    </section>;
  }
  if(deliverable.kind==="outline")return <section className="report-section geo-article-example geo-article-outline" data-geo-article-kind="outline" data-geo-article-generation-mode={mode}>
    <p className="section-index">07</p><h2>{geoArticleHeading(deliverable,locale)}</h2><p className="geo-outline-notice">{labels.outlineNotice}</p>
    <article className="geo-outline-body"><h3>{deliverable.outline.workingTitle}</h3>
      <dl className="geo-outline-summary"><Meta label={labels.readerQuestion}>{deliverable.outline.readerQuestion}</Meta><Meta label={labels.directAnswer}>{deliverable.outline.directAnswer}</Meta></dl>
      <h4>{labels.plannedSections}</h4><ol className="geo-outline-sections">{deliverable.outline.plannedSections.map((section)=><li key={section.id}><h5>{section.heading}</h5><p>{section.purpose}</p><ArticleEvidenceRefs refs={section.evidenceRefs} report={report} locale={locale}/></li>)}</ol>
      <div className="geo-outline-followup"><List label={labels.evidenceToAdd} items={deliverable.outline.evidenceToAdd}/><List label={labels.faqAngles} items={deliverable.outline.faqAngles}/></div>
    </article>
    <ArticleExplanation entries={deliverable.explanation} report={report} locale={locale} heading={labels.explanation}/>
  </section>;
  return <section className="report-section geo-article-example" data-geo-article-kind="article" data-geo-article-generation-mode={mode}>
    <p className="section-index">07</p><h2>{geoArticleHeading(deliverable,locale)}</h2>
    <article className="geo-article-body"><h3>{deliverable.article.title}</h3><div className="geo-article-introduction"><p>{deliverable.article.introduction.text}</p></div>
      {deliverable.article.sections.map((section)=><section className="geo-article-section" key={section.id}><h4>{section.heading}</h4>{section.paragraphs.map((paragraph,index)=><div className="geo-article-paragraph" key={index}><p>{paragraph.text}</p></div>)}</section>)}
      <section className="geo-article-faq"><h4>{labels.faq}</h4>{deliverable.article.faq.map((entry,index)=><article key={index}><h5>{entry.question}</h5><p>{entry.answer.text}</p></article>)}</section>
    </article>
    {deliverable.version==="geo_article_deliverable_v3"
      ? <details className="article-supporting-notes" data-article-supporting-notes="true"><summary>{labels.supportingNotes}</summary><div><ArticleResearch deliverable={deliverable} locale={locale} labels={labels}/><ArticleExplanation entries={deliverable.explanation} report={report} locale={locale} heading={labels.explanation}/></div></details>
      : <ArticleExplanation entries={deliverable.explanation} report={report} locale={locale} heading={labels.explanation}/>}
  </section>;
}

function ArticleResearch({deliverable,locale,labels}:{deliverable:Extract<NonNullable<PaidReport["geoArticleExample"]>,{version:"geo_article_deliverable_v3"}>;locale:"en"|"zh";labels:{research:string;researchUnavailable:string;query:string;provider:string}}){
  const research=deliverable.research;
  return <aside className="geo-article-research" data-geo-article-research={research.outcome}>
    <h3>{labels.research}</h3><dl><Meta label={labels.query}>{research.query}</Meta><Meta label={labels.provider}>{research.providerId} · {research.model} · {research.searchMode}</Meta></dl>
    {research.outcome==="usable"?<ul>{research.result.sources.filter(({citedText})=>Boolean(citedText)).map((source)=><li key={source.sourceId}><a href={source.canonicalUrl}>{source.title}</a><p>{source.citedText}</p><small>{source.registrableDomain} · {formatTimestamp(research.result.searchedAt,locale)}</small></li>)}</ul>:<p>{labels.researchUnavailable}</p>}
  </aside>;
}

function ArticleExplanation({entries,report,locale,heading}:{entries:readonly {elementId:string;heading:string;reason:string;geoFunction:string;evidenceRefs:readonly string[]}[];report:PaidReport;locale:"en"|"zh";heading:string}){
  const functionLabel=locale==="zh"?"GEO 作用":"GEO function";
  return <aside className="article-writing-strategy" data-article-writing-strategy="true"><h3>{heading}</h3><ol>{entries.map((entry)=><li key={entry.elementId}><strong>{entry.heading}</strong><p>{entry.reason}</p><p className="geo-function"><b>{functionLabel}：</b>{entry.geoFunction}</p><ArticleEvidenceRefs refs={entry.evidenceRefs} report={report} locale={locale}/></li>)}</ol></aside>;
}

function ArticleEvidenceRefs({refs,report,locale}:{refs:readonly string[];report:PaidReport;locale:"en"|"zh"}){
  const citations=refs.map((ref)=>resolveArticleEvidence(ref,report)).filter((item):item is {key:string;label:string;url?:string}=>Boolean(item));
  if(!citations.length)return null;
  return <small className="geo-article-citations"><span>{locale==="zh"?"依据":"Evidence"}：</span>{citations.map((citation,index)=><React.Fragment key={citation.key}>{index>0?" · ":null}{citation.url?<a href={citation.url}>{citation.label}</a>:citation.label}</React.Fragment>)}</small>;
}

function resolveArticleEvidence(ref:string,report:PaidReport):{key:string;label:string;url?:string}|null{
  const separator=ref.indexOf(":");
  const kind=separator<0?ref:ref.slice(0,separator),id=separator<0?"":ref.slice(separator+1);
  if(!id)return null;
  if(kind==="question"){
    const index=report.answerCards.findIndex((card)=>card.questionId===id);
    return index<0?null:{key:ref,label:`Q${index+1}`};
  }
  if(kind==="source")for(let cardIndex=0;cardIndex<report.answerCards.length;cardIndex+=1){
    const card=report.answerCards[cardIndex]!;
    const source=card.answerMode==="generative_search_v1"?card.sources.find((item)=>item.sourceId===id):card.sourceEvidence.find((item)=>item.evidenceId===id);
    if(source){
      const ordered=report.answerCards.flatMap((item)=>item.answerMode==="generative_search_v1"?item.sources.map((entry)=>entry.sourceId):item.sourceEvidence.map((entry)=>entry.evidenceId));
      return {key:ref,label:`[${ordered.indexOf(id)+1}] ${source.title}`,url:source.canonicalUrl};
    }
  }
  if(kind==="finding"){
    const finding=report.technicalFoundation.aiReport.findings.find((item)=>item.id===id);
    return finding?{key:ref,label:finding.title}:null;
  }
  if(kind==="technical"){
    const finding=report.technicalFoundation.technicalReport.findings.find((item)=>item.id===id);
    return finding?{key:ref,label:finding.title}:null;
  }
  if(kind==="research"){
    const article=report.geoArticleExample;
    if(article?.version!=="geo_article_deliverable_v3"||article.research.outcome!=="usable")return null;
    const source=article.research.result.sources.find((item)=>item.sourceId===id);
    return source?{key:ref,label:source.title,url:source.canonicalUrl}:null;
  }
  if(kind==="website"){
    const profile=report.technicalFoundation.aiReport.organizationProfile;
    const [field,indexText]=id.split(":");
    const index=Number(indexText);
    const value=field==="organization"?profile.organizationName:field==="summary"?profile.summary:field==="service"?profile.productsAndServices?.[index]:field==="audience"?profile.targetAudiences?.[index]:field==="region"?profile.marketsAndRegions?.[index]:undefined;
    return value?{key:ref,label:value}:null;
  }
  return null;
}

function displayLegacyGeoArticleText(value:string):string{
  return value.replace(/(?:来源|source)\s*([0-9]+)/giu,(_match,ordinal:string)=>`[${Number(ordinal)+1}]`);
}

function geoArticleGenerationMode(deliverable:NonNullable<PaidReport["geoArticleExample"]>):string{
  if(deliverable.version==="geo_article_deliverable_v3")return deliverable.generationMode;
  return deliverable.version==="geo_article_example_v1"?deliverable.generationMode:deliverable.kind==="article"?"model":"deterministic_fallback";
}
function geoArticleHeading(deliverable:NonNullable<PaidReport["geoArticleExample"]>,locale:"en"|"zh"):string{
  if(deliverable.version==="geo_article_deliverable_v3")return locale==="zh"?"GEO 完整文章":"Complete GEO article";
  const article=deliverable.version==="geo_article_example_v1"?deliverable.generationMode==="model":deliverable.kind==="article";
  return locale==="zh"?(article?"可发布文章示例":"GEO 内容提纲"):(article?"Publishable article example":"GEO content outline");
}
function geoArticleGenerationLabel(deliverable:NonNullable<PaidReport["geoArticleExample"]>,locale:"en"|"zh"):string{
  const mode=geoArticleGenerationMode(deliverable);
  if(locale==="zh")return mode==="model_researched"?"专题搜索与 AI 成文均完成":mode==="model_existing_evidence"?"专题搜索不可用，AI 使用现有证据完成文章":mode==="deterministic_evidence_fallback"?"使用已验证证据确定性完成文章":mode==="model"?"AI 生成并通过文章契约与质量校验":"历史确定性内容提纲";
  return mode==="model_researched"?"Completed with focused research and AI drafting":mode==="model_existing_evidence"?"Focused search was unavailable; AI completed the article from existing evidence":mode==="deterministic_evidence_fallback"?"Completed deterministically from validated evidence":mode==="model"?"AI-generated and validated against the article contract":"Historical deterministic content outline";
}

function LegacyCrossQuestionDiagnosis({report,locale}:{report:CombinedPrivateReportArtifactModelV3["combinedReport"];locale:"en"|"zh"}){
  const copy=locale==="zh"?ZH:EN;
  const answered=report.answerCards.filter(({status})=>status==="answered").length;
  const limited=report.answerCards.filter(({status})=>status!=="answered").length;
  const mentioned=report.answerCards.filter(({geoDiagnosis})=>geoDiagnosis.targetMentioned).length;
  return <section className="cross-question-diagnosis" data-cross-question-diagnosis="true">
    <h3>{copy.crossQuestion}</h3>
    <dl className="answer-metric-grid"><Meta label={copy.answered}>{answered}/3</Meta><Meta label={copy.limited}>{limited}/3</Meta><Meta label={copy.mentioned}>{mentioned}/3</Meta></dl>
    <div className="cross-question-grid"><div><h3>{copy.competitors}</h3><p>{[...new Set(report.answerCards.flatMap(({geoDiagnosis})=>geoDiagnosis.competitorEntityIds))].join(", ")||copy.none}</p></div><div><h3>{copy.missing}</h3><ul>{[...new Set(report.answerCards.flatMap(({geoDiagnosis})=>geoDiagnosis.missingEvidenceFamilies))].map((item)=><li key={item}>{item}</li>)}</ul></div></div>
  </section>;
}

function AnswerCardShell({cardIndex,status,question,locale,flowOrder,children}:{cardIndex:number;status:string;question:string;locale:"en"|"zh";flowOrder:number;children:ReactNode}){
  const copy=locale==="zh"?ZH:EN;
  const decisionCopy=DECISION_COPY[locale];
  return <details className="answer-card answer-detail" data-open-geo-answer-card="true" style={{order:flowOrder}}>
    <summary className="answer-card-heading"><div><p className="eyebrow">{copy.question} {cardIndex+1}</p><h3>{question}</h3><small>{decisionCopy.answerDetail}</small></div><p className={`answer-status answer-status-${status}`}>{statusLabel(status,locale==="zh")}</p></summary>
    <div className="answer-detail-body">{children}</div>
  </details>;
}

function GenerativeSearchAnswerCard({card,cardIndex,locale,flowOrder}:{card:GenerativeSearchAnswerCardV3;cardIndex:number;locale:"en"|"zh";flowOrder:number}){
  const copy=locale==="zh"?ZH:EN;
  const displayedAnswer=displayGenerativeAnswer(card);
  return <AnswerCardShell cardIndex={cardIndex} status={card.status} question={card.exactQuestion} locale={locale} flowOrder={flowOrder}>
    {card.status === "refused"
      ? <p className="business-question-answer refusal-answer" data-typed-refusal={card.refusal!.code}>{card.refusal!.reason}</p>
      : <><p className="business-question-answer generated-answer" data-generative-answer={card.questionId}>{displayedAnswer}</p>{displayedAnswer!==card.answerText?<span data-canonical-answer={card.answerText}/>:null}</>}
    {card.status === "source_limited" && <p className="source-limitation" data-source-limited="true">{copy.sourceLimited}</p>}
  </AnswerCardShell>;
}

function DirectAnalysis({result,locale}:{result:PaidV3DirectQuestionSemantics;locale:"en"|"zh"}){
  const copy=locale==="zh"?ZH:EN;
  const content=locale==="zh"?ZH_CONTENT:EN_CONTENT;
  if(result.analysisStatus!=="completed"||!result.analysis){
    return <section className="model-diagnosis direct-analysis" data-direct-analysis-status="incomplete"><h4>{content.questionConclusion}</h4><p>{content.analysisUnavailable}</p></section>;
  }
  return <section className="model-diagnosis direct-analysis" data-direct-analysis-status="completed">
    <h4>{content.questionConclusion}</h4><p className="selection-summary">{result.analysis.summary}</p>
    <List label={copy.observableFactors} items={result.analysis.observations}/>
    <List label={copy.recommendedActions} items={result.analysis.recommendations}/>
  </section>;
}

function LegacyEvidenceBoundAnswerCard({card,cardIndex,locale,ordinals,flowOrder}:{card:LegacyEvidenceBoundAnswerCardV3;cardIndex:number;locale:"en"|"zh";ordinals:Map<string,number>;flowOrder:number}){
  const copy=locale==="zh"?ZH:EN;
  return <AnswerCardShell cardIndex={cardIndex} status={card.status} question={card.exactQuestion} locale={locale} flowOrder={flowOrder}>
    {card.status === "insufficient" && <p className="business-question-answer insufficient-answer">{copy.insufficient}</p>}
    <div className="answer-prose">{card.sentences.map((sentence)=><div className="answer-sentence" data-answer-sentence={sentence.sentenceId} key={sentence.sentenceId}>
      <p className="business-question-answer">{sentence.text}{sentence.kind!=="scope_note"&&<span className="sentence-citations">{sentence.evidenceIds.map((id)=><sup data-citation-ordinal={ordinals.get(id)} key={id}>[{ordinals.get(id)}]</sup>)}</span>}</p>
      {sentence.evidenceIds.length?<div className="legacy-sentence-sources">{sentence.evidenceIds.map((id)=>{const source=card.sourceEvidence.find((item)=>item.evidenceId===id);return source?<article data-answer-source={source.evidenceId} data-citation-ordinal={ordinals.get(id)} data-supported-sentence={sentence.sentenceId} data-source-ownership={source.ownershipCategory} data-source-observed={source.observedAt} key={id}><strong>[{ordinals.get(id)}] <a href={source.canonicalUrl}>{source.title}</a></strong><p>{source.exactExcerpt}</p><small>{source.registrableDomain} · {sourceTypeLabel(source.ownershipCategory,locale==="zh")} · {formatTimestamp(source.observedAt,locale)}</small></article>:null;})}</div>:null}
    </div>)}</div>
    {card.diagnosis?<DiagnosisSummary diagnosis={card.diagnosis} locale={locale}/>:<GeoDiagnosis card={card} locale={locale}/>}
  </AnswerCardShell>;
}

function QuestionEvidence({card,cardIndex,locale,ordinals,flowOrder}:{card:PaidAnswerCard;cardIndex:number;locale:"en"|"zh";ordinals:Map<string,number>;flowOrder:number}){
  const zh=locale==="zh",copy=zh?ZH:EN;
  const decisionCopy=DECISION_COPY[locale],counts=evidenceSummary(card);
  const rows=card.answerMode==="generative_search_v1"
    ? card.sources.map((source,index)=>({id:source.sourceId,ordinal:index+1,title:source.title,url:source.canonicalUrl,domain:source.registrableDomain,type:sourceTypeLabel(source.ownershipCategory,zh),excerpt:source.citedText||copy.none,sentence:undefined}))
    : card.sourceEvidence.map((source)=>({id:source.evidenceId,ordinal:ordinals.get(source.evidenceId)!,title:source.title,url:source.canonicalUrl,domain:source.registrableDomain,type:sourceTypeLabel(source.ownershipCategory,zh),excerpt:source.exactExcerpt,sentence:card.sentences.find((item)=>item.evidenceIds.includes(source.evidenceId))?.sentenceId}));
  return <article className="question-evidence" data-question-evidence={card.questionId} style={{order:flowOrder}}>
    <h3><span>Q{cardIndex+1}</span>{card.exactQuestion}</h3>
    <details className="evidence-detail" data-evidence-detail={card.questionId}><summary><span>{decisionCopy.evidenceDetail}</span><dl><Meta label={decisionCopy.verifiedEvidence}>{counts.verified}</Meta><Meta label={decisionCopy.searchOnly}>{counts.searchOnly}</Meta><Meta label={decisionCopy.inaccessible}>{counts.inaccessible}</Meta></dl></summary><div className="report-detail-body">
      {rows.length?<div className="table-wrap"><table className="source-evidence-table" data-generative-sources={card.answerMode==="generative_search_v1"?card.questionId:undefined}><thead><tr><th>#</th><th>{copy.source}</th><th>{copy.contribution}</th></tr></thead><tbody>{rows.map((source)=><tr data-answer-source={source.id} data-citation-ordinal={source.ordinal} data-supported-sentence={source.sentence} key={source.id}><td>[{source.ordinal}]</td><td><strong><a href={source.url}>{source.title}</a></strong><small>{source.domain} · {source.type}</small><a className="source-url" href={source.url}>{source.url}</a></td><td>{source.excerpt}</td></tr>)}</tbody></table></div>:<p className="source-limitation">{copy.sourceLimited}</p>}
      {card.answerMode==="generative_search_v1"?<dl className="answer-provenance"><Meta label={copy.model}>{card.provenance.model}</Meta><Meta label={copy.searchMode}>{card.provenance.searchMode}</Meta><Meta label={copy.searched}>{card.provenance.searchedAt}</Meta></dl>:null}
    </div></details>
  </article>;
}

function QuestionAbsence({card,cardIndex,locale,direct,flowOrder}:{card:PaidAnswerCard;cardIndex:number;locale:"en"|"zh";direct?:PaidV3DirectQuestionSemantics;flowOrder:number}){
  const copy=locale==="zh"?ZH:EN;
  return <details className="question-absence diagnosis-detail" data-question-absence={card.questionId} style={{order:flowOrder}}><summary><span>Q{cardIndex+1}</span><strong>{card.exactQuestion}</strong><small>{DECISION_COPY[locale].diagnosisDetail}</small></summary><div className="report-detail-body">{direct?<DirectAnalysis result={direct} locale={locale}/>:card.diagnosis?<DiagnosisSummary diagnosis={card.diagnosis} locale={locale}/>:<GeoDiagnosis card={card} locale={locale}/>}<p className="absence-conclusion"><strong>{copy.absenceConclusion}</strong>{card.geoDiagnosis.targetMentioned?copy.targetPresent:copy.targetAbsent}</p></div></details>;
}

function displayGenerativeAnswer(card:GenerativeSearchAnswerCardV3):string{
  return card.answerText.replace(/来源\s*([0-9]+(?:\s*[、,，]\s*[0-9]+)*)/gu,(_match:string,list:string)=>list.split(/\s*[、,，]\s*/u).map((value)=>{
    const providerIndex=Number(value);
    let displayIndex=card.sources.findIndex((source)=>source.providerResultOrder===providerIndex);
    if(displayIndex<0&&providerIndex>=0&&providerIndex<card.sources.length)displayIndex=providerIndex;
    return displayIndex>=0?`[${displayIndex+1}]`:value;
  }).join(" "));
}

function GeoDiagnosis({card,locale}:{card:GenerativeSearchAnswerCardV3|LegacyEvidenceBoundAnswerCardV3;locale:"en"|"zh"}){
  const zh=locale==="zh",copy=zh?ZH:EN;
  return <section className="geo-diagnosis"><h4>{copy.diagnosis}</h4><dl className="diagnosis-grid"><Meta label={copy.targetMention}>{card.geoDiagnosis.targetMentioned?copy.yes:copy.no}</Meta><Meta label={copy.firstPosition}>{card.geoDiagnosis.targetFirstSentence??copy.notPresent}</Meta><Meta label={copy.targetRoles}>{card.geoDiagnosis.targetRoles.join(" · ")||copy.none}</Meta><Meta label={copy.competitors}>{card.geoDiagnosis.competitorEntityIds.join(", ")||copy.none}</Meta><Meta label={copy.sourceStructure}>{Object.entries(card.geoDiagnosis.citedOwnership).filter(([,count])=>count>0).map(([type,count])=>`${sourceTypeLabel(type as OpenGeoAnswerOwnershipCategoryV3,zh)} ${count}`).join(" · ")||copy.none}</Meta></dl><div className="diagnosis-followup"><div><h5>{copy.missing}</h5><ul>{card.geoDiagnosis.missingEvidenceFamilies.map((item)=><li key={item}>{item}</li>)}</ul></div><p><strong>{copy.retest}</strong><br/>{card.geoDiagnosis.retestQuestion}</p></div></section>;
}

function DiagnosisSummary({diagnosis,locale}:{diagnosis:ReportV4DiagnosisOutput;locale:"en"|"zh"}){
  const copy=locale==="zh"?ZH:EN;
  return <section className="model-diagnosis" data-question-diagnosis="true">
    <h4>{copy.questionDiagnosis}</h4>
    <p className="selection-summary">{diagnosis.selectionSummary}</p>
    <h5>{copy.observableFactors}</h5>
    <ul className="observable-factor-list">{diagnosis.observableFactors.map((factor,index)=><li key={index}>{factor.observation}</li>)}</ul>
    <h5>{copy.targetGap}</h5>
    <p className="target-gap">{diagnosis.targetGap}</p>
    <h5>{copy.recommendedActions}</h5>
    <ol className="recommended-action-list">{diagnosis.recommendedActions.map((action)=><li key={action.priority}><span className="action-priority">{action.priority}</span> {action.action}</li>)}</ol>
  </section>;
}
const ZH_CONTENT = {
  guide:"核心结论",conclusion:"当前结论",priorityAction:"首要行动",technicalAnalysis:"网站内容与可引用性问题",evidenceSnapshot:"网页证据与截图",
  method:"分析口径",methodSummary:"报告先读取目标网站公开信息，再使用同一组三个买家问题记录公开答案与来源，并将目标网站与已采用来源逐项比较。",
  sourceBoundary:"可确认：",sourceBoundaryText:"来源由同次答案返回，展示的片段、页面特征和截图可以回查。",
  nonCausal:"不能断言：",nonCausalText:"这些观察等同于模型内部排名权重，或完成某一项改动就必然获得引用。",
  sourceLimitations:"来源覆盖与限制",articleStrategy:"写作策略与证据依据",questionConclusion:"本题结论",analysisUnavailable:"现有公开证据不足以形成可靠的来源差距结论。"
};
const EN_CONTENT = {
  guide:"Core conclusion",conclusion:"Current conclusion",priorityAction:"First priority",technicalAnalysis:"Website content and citation-readiness issues",evidenceSnapshot:"Page evidence and screenshot",
  method:"Analysis basis",methodSummary:"The report reads the target's public website, records public answers and sources for the same three buyer questions, and compares the target with the sources that were returned.",
  sourceBoundary:"Can confirm: ",sourceBoundaryText:"the sources came from the same answer operations, and the displayed excerpts, page characteristics, and screenshots are traceable.",
  nonCausal:"Cannot assert: ",nonCausalText:"these observations are hidden model-ranking weights or that completing one change guarantees a future citation.",
  sourceLimitations:"Source coverage and limitations",articleStrategy:"Writing strategy and evidence basis",questionConclusion:"Question conclusion",analysisUnavailable:"The available public evidence does not support a reliable source-gap conclusion."
};
const ZH = { brandLine:"帮你决策的报告",kicker:"EXECUTIVE DECISION BRIEF · 高管决策简报",guide:"报告导读",purpose:"报告目的",oneLine:"报告一句话",oneLineValue:"先还原网站事实，再判断这些事实是否足以进入买家的 AI 答案。",contextBridge:"基于以上网站公开信息，下面用真实买家问题检验：这些内容是否足以让 AI 理解、选择并引用该网站。",answerEvidence:"答案依据",answerEvidenceIntro:"答案不是凭空生成的。这里逐题列出形成答案的公开来源、具体片段和它们对答案的作用。",absenceReasons:"未出现原因",absenceIntro:"目标网站为什么没有进入答案，必须沿着答案和来源逐题解释，而不是只给出“证据不足”的提示。",source:"来源",contribution:"对答案的作用",audit:"核验状态",absenceConclusion:"本题结论：",targetPresent:"目标网站已进入答案，仍需核对它在答案中的角色与证据独立性。",targetAbsent:"目标网站未进入答案；下列差距说明目前缺少哪些可被理解和引用的公开证据。",title:"从网站事实到 GEO 行动",scope:"先建立网站事实，再沿用同一组三个买家问题解释答案、来源、目标网站差距与改进路径。",target:"目标网站",generated:"报告日期",revision:"报告版本",websiteContext:"网站现状：我们看到了什么",services:"产品与服务",audiences:"目标客户",regions:"服务区域",analyzedPages:"已分析页面",technicalScore:"技术得分",executive:"网站概览",answered:"完整答案",limited:"有限答案",mentioned:"目标品牌出现",answers:"买家问题与核心答案",answerMethod:"先看 AI 对每个买家问题给出的完整答案；来源解释和目标网站差距在后续章节逐层展开。",question:"买家问题",insufficient:"证据不足：当前公开证据不足以生成可靠答案。",plannedQueries:"计划查询",completedQueries:"完成查询",returnedResults:"搜索返回",attemptedRetrievals:"取回尝试",safelyRetrievedPages:"安全取回",eligibleDirectEvidence:"合格直接证据",sources:"本句来源",answerSources:"本次回答来源",domain:"域名",sourceType:"来源类型",observed:"观察时间",excerpt:"来源原文",providerExcerpt:"模型返回的引用片段",diagnosis:"GEO 诊断",questionDiagnosis:"本题诊断",targetMention:"目标品牌出现",firstPosition:"首次出现句序",targetRoles:"目标品牌角色",competitors:"竞争品牌",sourceStructure:"引用来源结构",missing:"缺失证据",retest:"复测问题：",yes:"是",no:"否",notPresent:"未出现",none:"无",crossQuestion:"跨问题 GEO 总结",technical:"网站可见性与技术诊断",technicalFindings:"确定性技术发现",pageAnalysis:"页面级分析",pageTitle:"页面标题",body:"页面描述",dimensionScores:"模型辅助的内容与 GEO 表达评估",aiAnalysis:"模型技术说明与建议",pageTypes:"页面类型分析",strengths:"优势",issues:"问题",recommendations:"建议",roadmap:"实施路线图",actions:"快速修复与持续任务",actionsIntro:"以下路线图汇总网站技术、内容与答案证据中的改进任务，并按可执行顺序排列。",geoArticle:"GEO 文章示例",articleRationale:"为什么这样写",articleFaq:"买家常见问题",generationMode:"文章生成方式",modelGenerated:"AI 生成并通过证据契约校验",fallbackGenerated:"确定性证据降级稿",evidenceRefs:"依据",appendix:"来源与方法",searchSurface:"公开搜索面",searched:"搜索时间",cutoff:"证据截止时间",model:"综合模型",searchMode:"搜索模式",queryPlan:"查询计划",passage:"段落选择",coverage:"局限与覆盖",sourceLimited:"答案已生成，但同次回答没有可安全展示的公开来源。",verifiedBody:"正文已独立核验",searchSourceOnly:"仅模型搜索来源",inaccessible:"当前无法访问",observableFactors:"可观察因素",targetGap:"目标官网差距",recommendedActions:"优先行动",toc:"报告目录",backToTop:"回到顶部",sourceDiagnosis:"来源选择诊断" };
const EN = { brandLine:"Decision-ready reporting",kicker:"EXECUTIVE DECISION BRIEF",guide:"Report guide",purpose:"Report purpose",oneLine:"Report in one line",oneLineValue:"Reconstruct the website facts first, then test whether those facts can enter a buyer's AI answer.",contextBridge:"Using the public website facts above, the report now tests whether AI can understand, select, and cite the target for real buyer questions.",answerEvidence:"Answer evidence",answerEvidenceIntro:"These answers are not generated in isolation. Each row shows the public source, the exact contribution, and its verification state.",absenceReasons:"Why the target did not appear",absenceIntro:"Target absence is explained question by question from the answer and its sources, not reduced to a generic insufficient-evidence warning.",source:"Source",contribution:"Contribution to the answer",audit:"Verification",absenceConclusion:"Question conclusion:",targetPresent:"The target appears in the answer; its role and independent support still need review.",targetAbsent:"The target does not appear in the answer; the gaps below show which public evidence is still missing.",title:"From website facts to GEO action",scope:"The report establishes website facts first, then follows the same three buyer questions through answers, sources, target-site gaps, and actions.",target:"Target website",generated:"Report date",revision:"Report revision",websiteContext:"Website status: what we found",services:"Products and services",audiences:"Target audiences",regions:"Service regions",analyzedPages:"Pages analyzed",technicalScore:"Technical score",executive:"Website overview",answered:"Complete answers",limited:"Limited answers",mentioned:"Target mentioned",answers:"Buyer questions and core answers",answerMethod:"Start with the complete AI answer to each buyer question; the source reasoning and target-site gaps follow in the next sections.",question:"Buyer question",insufficient:"Insufficient evidence: the available public evidence cannot support a reliable answer.",plannedQueries:"Planned queries",completedQueries:"Completed queries",returnedResults:"Search results returned",attemptedRetrievals:"Retrieval attempts",safelyRetrievedPages:"Safely retrieved",eligibleDirectEvidence:"Eligible direct evidence",sources:"Sources for this sentence",answerSources:"Sources returned with this answer",domain:"Domain",sourceType:"Source type",observed:"Observed",excerpt:"Source excerpt",providerExcerpt:"Provider-returned cited text",diagnosis:"GEO diagnosis",questionDiagnosis:"Question diagnosis",targetMention:"Target brand mentioned",firstPosition:"First sentence position",targetRoles:"Target roles",competitors:"Competitors",sourceStructure:"Citation-source structure",missing:"Missing evidence",retest:"Retest question:",yes:"Yes",no:"No",notPresent:"Not present",none:"None",crossQuestion:"Cross-question GEO summary",technical:"Website visibility and technical diagnosis",technicalFindings:"Deterministic technical findings",pageAnalysis:"Page-level analysis",pageTitle:"Page title",body:"Page description",dimensionScores:"Model-assisted content and GEO assessment",aiAnalysis:"Model technical analysis and recommendations",pageTypes:"Page-type analysis",strengths:"Strengths",issues:"Issues",recommendations:"Recommendations",roadmap:"Implementation roadmap",actions:"Unified priority actions",actionsIntro:"This roadmap combines website, technical, content, and answer evidence in an executable order.",geoArticle:"GEO article example",articleRationale:"Why this section is written this way",articleFaq:"Buyer FAQ",generationMode:"Article generation",modelGenerated:"AI-generated and validated against the evidence contract",fallbackGenerated:"Deterministic evidence-grounded fallback",evidenceRefs:"Evidence",appendix:"Sources and methodology",searchSurface:"Public-search surface",searched:"Searched",cutoff:"Evidence cutoff",model:"Synthesis model",searchMode:"Search mode",queryPlan:"Query plan",passage:"Passage selector",coverage:"Coverage and limitations",sourceLimited:"The answer was generated, but the same operation returned no public source that can be displayed safely.",verifiedBody:"Body independently verified",searchSourceOnly:"Model search source only",inaccessible:"Currently inaccessible",observableFactors:"Observable factors",targetGap:"Target website gap",recommendedActions:"Recommended actions",toc:"Contents",backToTop:"Back to top",sourceDiagnosis:"Source selection diagnosis" };
function statusLabel(status:string,zh:boolean){return zh?({answered:"已回答",source_limited:"答案已生成，来源有限",refused:"模型拒绝回答",limited:"有限证据",observed:"仅搜索观察",unresolved:"尚无法核验",insufficient:"证据不足"}[status]??status):({answered:"Answered",source_limited:"Answered, sources limited",refused:"Provider refusal",limited:"Limited evidence",observed:"Search observation only",unresolved:"Not yet verifiable",insufficient:"Insufficient evidence"}[status]??status);}
function sourceTypeLabel(value:OpenGeoAnswerOwnershipCategoryV3,zh:boolean){const labels:Record<OpenGeoAnswerOwnershipCategoryV3,[string,string]>={target_owned:["目标品牌自有","Target-owned"],competitor_owned:["竞争品牌自有","Competitor-owned"],third_party_editorial:["第三方编辑来源","Third-party editorial"],directory:["目录","Directory"],government:["政府","Government"],other:["其他","Other"],institution:["机构","Institution"],community:["社区","Community"],social:["社交平台","Social"],unknown:["未分类","Unknown"]};return labels[value][zh?0:1];}
function roadmapLabel(value:"immediate"|"nextPhase"|"ongoing",zh:boolean){return zh?({immediate:"立即执行",nextPhase:"下一阶段",ongoing:"持续执行"}[value]):({immediate:"Immediate",nextPhase:"Next phase",ongoing:"Ongoing"}[value]);}
