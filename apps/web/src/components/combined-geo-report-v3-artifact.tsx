/* eslint-disable @next/next/no-img-element -- protected evidence images must remain printable in canonical HTML */
import React, { type ReactNode } from "react";
import type {
  GenerativeSearchAnswerCardV3,
  LegacyEvidenceBoundAnswerCardV3,
  OpenGeoAnswerOwnershipCategoryV3,
  PaidV3DirectQuestionSemantics,
  ReportV4DiagnosisOutput
} from "@open-geo-console/ai-report-engine";
import type { CombinedPrivateReportArtifactModelV3 } from "@/report/artifact-model";
import { SourceSelectionDiagnosisSection } from "./source-selection-diagnosis-section";

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
          {report.geoArticleExample ? <a href="#artifact-sec-article"><span>07</span>{copy.geoArticle}</a> : null}
          <a href="#artifact-sec-appendix"><span>08</span>{copy.appendix}</a>
        </nav>
        <dl className="rail-metadata"><Meta label={copy.target}>{report.targetUrl}</Meta><Meta label={copy.generated}>{formatTimestamp(report.generatedAt,model.locale)}</Meta><Meta label={copy.revision}><span title={report.artifactRevisionId}>{shortRevisionId(report.artifactRevisionId)}</span></Meta></dl>
      </aside>
      <article className="paid-report-document">
    <header className="report-section report-guide" id="artifact-sec-guide" data-report-guide="true">
      <div className="guide-kicker"><span>{copy.kicker}</span><time dateTime={report.generatedAt}>{formatTimestamp(report.generatedAt,model.locale)}</time></div>
      <p className="section-index">00</p><h1>{content.guide}</h1>
      <dl className="guide-metadata"><Meta label={copy.target}>{report.targetUrl}</Meta><Meta label={copy.generated}>{formatTimestamp(report.generatedAt,model.locale)}</Meta><Meta label={content.conclusion}>{conclusion.summary}</Meta>{conclusion.priority?<Meta label={content.priorityAction}>{conclusion.priority}</Meta>:null}</dl>
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
      <dl className="answer-metric-grid website-context-metrics">
        <Meta label={copy.analyzedPages}>{coverage.analyzedPages ?? report.technicalFoundation.technicalReport.pages.length}</Meta>
        <Meta label={copy.technicalScore}>{report.technicalFoundation.technicalReport.score}</Meta>
        <Meta label={copy.answered}>{answered}/3</Meta><Meta label={copy.limited}>{limited}/3</Meta>{mentioned === null ? null : <Meta label={copy.mentioned}>{mentioned}/3</Meta>}
      </dl>
    </section>

    <section className="report-section report-analysis-flow" data-progressive-analysis="true">
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
        ? <div className="analysis-global-evidence"><SourceSelectionDiagnosisSection
            diagnosis={report.sourceSelectionDiagnosis}
            locale={model.locale}
            targetUrl={report.targetUrl}
            questions={report.answerCards.map(({questionId,exactQuestion})=>({id:questionId,text:exactQuestion}))}
          /></div>
        : null}
      <div className="analysis-stage-heading analysis-stage-absence" id="artifact-sec-absence" data-target-absence-section="true">
        <p className="section-index">04</p><h2>{copy.absenceReasons}</h2>
      </div>
      {report.sourceSelectionDiagnosis ? null : <div className="analysis-global-absence"><LegacyCrossQuestionDiagnosis report={report} locale={model.locale}/></div>}
    </section>

      <section className="report-section" id="artifact-sec-technical" data-technical-analysis="true">
      <p className="section-index">05</p><h2>{copy.technical}</h2>
      <h3>{copy.technicalFindings}</h3>
      <div className="finding-list">{report.technicalFoundation.technicalReport.findings.map((finding) => <article className="finding-card" key={finding.id}><h4>{finding.title}</h4><p>{finding.description}</p><p className="recommendation">{finding.recommendation}</p></article>)}</div>
      <h3>{copy.pageAnalysis}</h3>
      <div className="table-wrap"><table><thead><tr><th>URL</th><th>{copy.pageTitle}</th><th>H1</th><th>Canonical</th><th>{copy.body}</th></tr></thead><tbody>
        {report.technicalFoundation.technicalReport.pages.map((page) => <tr key={page.url}><td>{page.url}</td><td>{page.title ?? "—"}</td><td>{page.h1.join(" · ") || "—"}</td><td>{page.canonical ?? "—"}</td><td>{page.metaDescription ?? "—"}</td></tr>)}
      </tbody></table></div>
      <h3>{copy.dimensionScores}</h3>
      <div className="technical-score-list">{report.technicalFoundation.aiReport.dimensionScores.map((score)=><article key={score.dimension}><strong>{score.score}</strong><div><h4>{score.dimension}</h4><p>{score.explanation}</p></div></article>)}</div>
      <h3>{content.technicalAnalysis}</h3>
      <div className="finding-list">{report.technicalFoundation.aiReport.findings.map((finding) => <article className="finding-card" key={finding.id}><h4>{finding.title}</h4><p>{finding.impact}</p><p className="recommendation">{finding.recommendation}</p>{finding.evidence.map((evidence, index) => {
        const assets=model.evidenceAssets.filter((asset)=>asset.findingId===finding.id&&asset.citationIndex===index&&asset.status==="ready");
        return <figure className="evidence-card technical-evidence-card" key={`${finding.id}-${index}`}><figcaption><p className="technical-evidence-label">{content.evidenceSnapshot}</p><blockquote>{evidence.quote}</blockquote><a href={evidence.url}>{evidence.url}</a></figcaption>{assets.map((asset)=><img data-evidence-asset={asset.id} key={asset.id} src={`/api/reports/${model.reportId}/evidence/${asset.id}`} alt={`${finding.title} evidence`}/>)}</figure>;
      })}</article>)}</div>
      <h3>{copy.pageTypes}</h3>
      {report.technicalFoundation.aiReport.pageTypeAnalyses.map((analysis,index)=><article className="technical-analysis-row" key={`${analysis.pageType}-${index}`}><h4>{analysis.pageType}</h4><p>{analysis.sampledUrls.join(" · ")}</p><List label={copy.strengths} items={analysis.strengths}/><List label={copy.issues} items={analysis.commonIssues}/><List label={copy.recommendations} items={analysis.recommendations}/></article>)}
    </section>

      <section className="report-section unified-actions" id="artifact-sec-actions" data-unified-actions="true">
        <p className="section-index">06</p><h2>{copy.actions}</h2>
        <div className="technical-roadmap">{(["immediate","nextPhase","ongoing"] as const).map((phase)=><section key={phase}><h4>{roadmapLabel(phase,zh)}</h4>{report.technicalFoundation.aiReport.roadmap[phase].map((item,index)=><article key={`${phase}-${index}`}><h5>{item.title}</h5><p>{item.rationale}</p><ul>{item.actions.map((action)=><li key={action}>{action}</li>)}</ul></article>)}</section>)}</div>
      </section>
      {report.geoArticleExample ? <div id="artifact-sec-article">
        <GeoArticleSection article={report.geoArticleExample} locale={model.locale}/>
      </div> : null}
      <section className="report-section methodology-appendix" id="artifact-sec-appendix" data-methodology-appendix="true">
      <p className="section-index">08</p><h2>{copy.appendix}</h2>
      <h3>{content.method}</h3><p>{content.methodSummary}</p>
      <dl className="provenance-grid"><Meta label={copy.searchSurface}>{report.engineProvenance.searchSurface}</Meta><Meta label={copy.searched}>{formatTimestamp(report.engineProvenance.searchedAt,model.locale)}</Meta><Meta label={copy.cutoff}>{formatTimestamp(report.engineProvenance.evidenceCutoffAt,model.locale)}</Meta><Meta label={copy.model}>{report.engineProvenance.synthesisModel}</Meta><Meta label={copy.queryPlan}>{report.engineProvenance.queryPlanVersion}</Meta><Meta label={copy.passage}>{report.engineProvenance.passageSelectorVersion}</Meta></dl>
      {report.geoArticleExample?<dl className="article-generation-note"><Meta label={copy.generationMode}>{report.geoArticleExample.generationMode==="model"?copy.modelGenerated:copy.fallbackGenerated}</Meta></dl>:null}
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

function Meta({label,children}:{label:string;children:ReactNode}){return <div><dt>{label}</dt><dd>{children}</dd></div>;}
function formatTimestamp(value:string,locale:"en"|"zh"){const date=new Date(value);if(Number.isNaN(date.getTime()))return value;return new Intl.DateTimeFormat(locale==="zh"?"zh-CN":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(date);}
function shortRevisionId(value:string){return value.length>12?`${value.slice(0,8)}…`:value;}
function List({label,items}:{label:string;items:readonly string[]}){return items.length?<div><strong>{label}</strong><ul>{items.map((item)=><li key={item}>{item}</li>)}</ul></div>:null;}
function citationOrdinals(cards:CombinedPrivateReportArtifactModelV3["combinedReport"]["answerCards"]){const result=new Map<string,number>();for(const card of cards){if(card.answerMode === "generative_search_v1")continue;for(const sentence of card.sentences)for(const id of sentence.evidenceIds)if(!result.has(id))result.set(id,result.size+1);}return result;}
function reportConclusion(report:CombinedPrivateReportArtifactModelV3["combinedReport"],locale:"en"|"zh"){
  const answered=report.answerCards.filter(({status})=>status==="answered").length;
  const targetMentions=report.answerCards.filter(({geoDiagnosis})=>geoDiagnosis.targetMentioned).length;
  const total=report.answerCards.length;
  const score=report.technicalFoundation.technicalReport.score;
  const priority=report.sourceSelectionDiagnosis?.targetActions[0]?.title??report.technicalFoundation.aiReport.roadmap.immediate[0]?.title??null;
  const summary=locale==="zh"
    ? targetMentions===0
      ? `${total} 个买家问题中已有 ${answered} 个形成完整答案，目标品牌尚未进入这些答案；网站当前技术得分为 ${score}。`
      : `${total} 个买家问题中已有 ${answered} 个形成完整答案，目标品牌出现在其中 ${targetMentions} 个答案里；网站当前技术得分为 ${score}。`
    : targetMentions===0
      ? `${answered} of ${total} buyer questions have complete answers; the target is absent from those answers. The current technical score is ${score}.`
      : `${answered} of ${total} buyer questions have complete answers; the target appears in ${targetMentions}. The current technical score is ${score}.`;
  return {summary,priority};
}

function GeoArticleSection({article,locale}:{article:NonNullable<CombinedPrivateReportArtifactModelV3["combinedReport"]["geoArticleExample"]>;locale:"en"|"zh"}){
  const copy=locale==="zh"?ZH:EN;
  const content=locale==="zh"?ZH_CONTENT:EN_CONTENT;
  return <section className="report-section geo-article-example" data-geo-article-generation-mode={article.generationMode}>
    <p className="section-index">07</p><h2>{copy.geoArticle}</h2>
    <article className="geo-article-body"><h3>{article.title}</h3><p className="geo-article-introduction">{article.introduction}</p>
      {article.sections.map((section)=><section className="geo-article-section" key={section.id}><h4>{section.heading}</h4>{section.paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>)}
      <section className="geo-article-faq"><h4>{copy.articleFaq}</h4>{article.faq.map((entry,index)=><article key={index}><h5>{entry.question}</h5><p>{entry.answer}</p></article>)}</section>
    </article>
    <aside className="article-writing-strategy" data-article-writing-strategy="true"><h3>{content.articleStrategy}</h3><ol>{article.rationale.map((entry)=><li key={entry.sectionId}><strong>{article.sections.find(({id})=>id===entry.sectionId)?.heading??entry.sectionId}</strong><p>{entry.reason}</p><small>{copy.evidenceRefs}：{entry.evidenceRefs.join(" · ")}</small></li>)}</ol></aside>
  </section>;
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
  return <article className="answer-card" data-open-geo-answer-card="true" style={{order:flowOrder}}>
    <header className="answer-card-heading"><div><p className="eyebrow">{copy.question} {cardIndex+1}</p><h3>{question}</h3></div><p className={`answer-status answer-status-${status}`}>{statusLabel(status,locale==="zh")}</p></header>
    {children}
  </article>;
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

type PaidAnswerCard=CombinedPrivateReportArtifactModelV3["combinedReport"]["answerCards"][number];
function QuestionEvidence({card,cardIndex,locale,ordinals,flowOrder}:{card:PaidAnswerCard;cardIndex:number;locale:"en"|"zh";ordinals:Map<string,number>;flowOrder:number}){
  const zh=locale==="zh",copy=zh?ZH:EN;
  const rows=card.answerMode==="generative_search_v1"
    ? card.sources.map((source,index)=>({id:source.sourceId,ordinal:index+1,title:source.title,url:source.canonicalUrl,domain:source.registrableDomain,type:sourceTypeLabel(source.ownershipCategory,zh),audit:retrievalStatusLabel(source.retrievalStatus,zh),excerpt:source.citedText||copy.none,sentence:undefined}))
    : card.sourceEvidence.map((source)=>({id:source.evidenceId,ordinal:ordinals.get(source.evidenceId)!,title:source.title,url:source.canonicalUrl,domain:source.registrableDomain,type:sourceTypeLabel(source.ownershipCategory,zh),audit:formatTimestamp(source.observedAt,locale),excerpt:source.exactExcerpt,sentence:card.sentences.find((item)=>item.evidenceIds.includes(source.evidenceId))?.sentenceId}));
  return <article className="question-evidence" data-question-evidence={card.questionId} style={{order:flowOrder}}>
    <h3><span>Q{cardIndex+1}</span>{card.exactQuestion}</h3>
    {rows.length?<div className="table-wrap"><table className="source-evidence-table" data-generative-sources={card.answerMode==="generative_search_v1"?card.questionId:undefined}><thead><tr><th>#</th><th>{copy.source}</th><th>{copy.contribution}</th><th>{copy.audit}</th></tr></thead><tbody>{rows.map((source)=><tr data-answer-source={source.id} data-citation-ordinal={source.ordinal} data-supported-sentence={source.sentence} key={source.id}><td>[{source.ordinal}]</td><td><strong><a href={source.url}>{source.title}</a></strong><small>{source.domain} · {source.type}</small><a className="source-url" href={source.url}>{source.url}</a></td><td>{source.excerpt}</td><td>{source.audit}</td></tr>)}</tbody></table></div>:<p className="source-limitation">{copy.sourceLimited}</p>}
    {card.answerMode==="generative_search_v1"?<dl className="answer-provenance"><Meta label={copy.model}>{card.provenance.model}</Meta><Meta label={copy.searchMode}>{card.provenance.searchMode}</Meta><Meta label={copy.searched}>{card.provenance.searchedAt}</Meta></dl>:null}
  </article>;
}

function QuestionAbsence({card,cardIndex,locale,direct,flowOrder}:{card:PaidAnswerCard;cardIndex:number;locale:"en"|"zh";direct?:PaidV3DirectQuestionSemantics;flowOrder:number}){
  const copy=locale==="zh"?ZH:EN;
  return <article className="question-absence" data-question-absence={card.questionId} style={{order:flowOrder}}><h3><span>Q{cardIndex+1}</span>{card.exactQuestion}</h3>{direct?<DirectAnalysis result={direct} locale={locale}/>:card.diagnosis?<DiagnosisSummary diagnosis={card.diagnosis} locale={locale}/>:<GeoDiagnosis card={card} locale={locale}/>}<p className="absence-conclusion"><strong>{copy.absenceConclusion}</strong>{card.geoDiagnosis.targetMentioned?copy.targetPresent:copy.targetAbsent}</p></article>;
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
const ZH = { brandLine:"帮你决策的报告",kicker:"EXECUTIVE DECISION BRIEF · 高管决策简报",guide:"报告导读",purpose:"报告目的",oneLine:"报告一句话",oneLineValue:"先还原网站事实，再判断这些事实是否足以进入买家的 AI 答案。",contextBridge:"基于以上网站公开信息，下面用真实买家问题检验：这些内容是否足以让 AI 理解、选择并引用该网站。",answerEvidence:"答案依据",answerEvidenceIntro:"答案不是凭空生成的。这里逐题列出形成答案的公开来源、具体片段和它们对答案的作用。",absenceReasons:"未出现原因",absenceIntro:"目标网站为什么没有进入答案，必须沿着答案和来源逐题解释，而不是只给出“证据不足”的提示。",source:"来源",contribution:"对答案的作用",audit:"核验状态",absenceConclusion:"本题结论：",targetPresent:"目标网站已进入答案，仍需核对它在答案中的角色与证据独立性。",targetAbsent:"目标网站未进入答案；下列差距说明目前缺少哪些可被理解和引用的公开证据。",title:"从网站事实到 GEO 行动",scope:"先建立网站事实，再沿用同一组三个买家问题解释答案、来源、目标网站差距与改进路径。",target:"目标网站",generated:"报告日期",revision:"报告版本",websiteContext:"网站现状：我们看到了什么",services:"产品与服务",audiences:"目标客户",regions:"服务区域",analyzedPages:"已分析页面",technicalScore:"技术得分",executive:"网站概览",answered:"完整答案",limited:"有限答案",mentioned:"目标品牌出现",answers:"买家问题与核心答案",answerMethod:"先看 AI 对每个买家问题给出的完整答案；来源解释和目标网站差距在后续章节逐层展开。",question:"买家问题",insufficient:"证据不足：当前公开证据不足以生成可靠答案。",plannedQueries:"计划查询",completedQueries:"完成查询",returnedResults:"搜索返回",attemptedRetrievals:"取回尝试",safelyRetrievedPages:"安全取回",eligibleDirectEvidence:"合格直接证据",sources:"本句来源",answerSources:"本次回答来源",domain:"域名",sourceType:"来源类型",observed:"观察时间",excerpt:"来源原文",providerExcerpt:"模型返回的引用片段",diagnosis:"GEO 诊断",questionDiagnosis:"本题诊断",targetMention:"目标品牌出现",firstPosition:"首次出现句序",targetRoles:"目标品牌角色",competitors:"竞争品牌",sourceStructure:"引用来源结构",missing:"缺失证据",retest:"复测问题：",yes:"是",no:"否",notPresent:"未出现",none:"无",crossQuestion:"跨问题 GEO 总结",technical:"网站可见性与技术诊断",technicalFindings:"确定性技术发现",pageAnalysis:"页面级分析",pageTitle:"页面标题",body:"页面描述",dimensionScores:"技术维度评分",aiAnalysis:"模型技术说明与建议",pageTypes:"页面类型分析",strengths:"优势",issues:"问题",recommendations:"建议",roadmap:"实施路线图",actions:"统一优先行动",actionsIntro:"以下路线图汇总网站技术、内容与答案证据中的改进任务，并按可执行顺序排列。",geoArticle:"GEO 文章示例",articleRationale:"为什么这样写",articleFaq:"买家常见问题",generationMode:"文章生成方式",modelGenerated:"AI 生成并通过证据契约校验",fallbackGenerated:"确定性证据降级稿",evidenceRefs:"依据",appendix:"来源与方法",searchSurface:"公开搜索面",searched:"搜索时间",cutoff:"证据截止时间",model:"综合模型",searchMode:"搜索模式",queryPlan:"查询计划",passage:"段落选择",coverage:"局限与覆盖",sourceLimited:"答案已生成，但同次回答没有可安全展示的公开来源。",verifiedBody:"正文已独立核验",searchSourceOnly:"仅模型搜索来源",inaccessible:"当前无法访问",observableFactors:"可观察因素",targetGap:"目标官网差距",recommendedActions:"优先行动",toc:"报告目录",backToTop:"回到顶部",sourceDiagnosis:"来源选择诊断" };
const EN = { brandLine:"Decision-ready reporting",kicker:"EXECUTIVE DECISION BRIEF",guide:"Report guide",purpose:"Report purpose",oneLine:"Report in one line",oneLineValue:"Reconstruct the website facts first, then test whether those facts can enter a buyer's AI answer.",contextBridge:"Using the public website facts above, the report now tests whether AI can understand, select, and cite the target for real buyer questions.",answerEvidence:"Answer evidence",answerEvidenceIntro:"These answers are not generated in isolation. Each row shows the public source, the exact contribution, and its verification state.",absenceReasons:"Why the target did not appear",absenceIntro:"Target absence is explained question by question from the answer and its sources, not reduced to a generic insufficient-evidence warning.",source:"Source",contribution:"Contribution to the answer",audit:"Verification",absenceConclusion:"Question conclusion:",targetPresent:"The target appears in the answer; its role and independent support still need review.",targetAbsent:"The target does not appear in the answer; the gaps below show which public evidence is still missing.",title:"From website facts to GEO action",scope:"The report establishes website facts first, then follows the same three buyer questions through answers, sources, target-site gaps, and actions.",target:"Target website",generated:"Report date",revision:"Report revision",websiteContext:"Website status: what we found",services:"Products and services",audiences:"Target audiences",regions:"Service regions",analyzedPages:"Pages analyzed",technicalScore:"Technical score",executive:"Website overview",answered:"Complete answers",limited:"Limited answers",mentioned:"Target mentioned",answers:"Buyer questions and core answers",answerMethod:"Start with the complete AI answer to each buyer question; the source reasoning and target-site gaps follow in the next sections.",question:"Buyer question",insufficient:"Insufficient evidence: the available public evidence cannot support a reliable answer.",plannedQueries:"Planned queries",completedQueries:"Completed queries",returnedResults:"Search results returned",attemptedRetrievals:"Retrieval attempts",safelyRetrievedPages:"Safely retrieved",eligibleDirectEvidence:"Eligible direct evidence",sources:"Sources for this sentence",answerSources:"Sources returned with this answer",domain:"Domain",sourceType:"Source type",observed:"Observed",excerpt:"Source excerpt",providerExcerpt:"Provider-returned cited text",diagnosis:"GEO diagnosis",questionDiagnosis:"Question diagnosis",targetMention:"Target brand mentioned",firstPosition:"First sentence position",targetRoles:"Target roles",competitors:"Competitors",sourceStructure:"Citation-source structure",missing:"Missing evidence",retest:"Retest question:",yes:"Yes",no:"No",notPresent:"Not present",none:"None",crossQuestion:"Cross-question GEO summary",technical:"Website visibility and technical diagnosis",technicalFindings:"Deterministic technical findings",pageAnalysis:"Page-level analysis",pageTitle:"Page title",body:"Page description",dimensionScores:"Technical dimension scores",aiAnalysis:"Model technical analysis and recommendations",pageTypes:"Page-type analysis",strengths:"Strengths",issues:"Issues",recommendations:"Recommendations",roadmap:"Implementation roadmap",actions:"Unified priority actions",actionsIntro:"This roadmap combines website, technical, content, and answer evidence in an executable order.",geoArticle:"GEO article example",articleRationale:"Why this section is written this way",articleFaq:"Buyer FAQ",generationMode:"Article generation",modelGenerated:"AI-generated and validated against the evidence contract",fallbackGenerated:"Deterministic evidence-grounded fallback",evidenceRefs:"Evidence",appendix:"Sources and methodology",searchSurface:"Public-search surface",searched:"Searched",cutoff:"Evidence cutoff",model:"Synthesis model",searchMode:"Search mode",queryPlan:"Query plan",passage:"Passage selector",coverage:"Coverage and limitations",sourceLimited:"The answer was generated, but the same operation returned no public source that can be displayed safely.",verifiedBody:"Body independently verified",searchSourceOnly:"Model search source only",inaccessible:"Currently inaccessible",observableFactors:"Observable factors",targetGap:"Target website gap",recommendedActions:"Recommended actions",toc:"Contents",backToTop:"Back to top",sourceDiagnosis:"Source selection diagnosis" };
function statusLabel(status:string,zh:boolean){return zh?({answered:"已回答",source_limited:"答案已生成，来源有限",refused:"模型拒绝回答",limited:"有限证据",observed:"仅搜索观察",unresolved:"尚无法核验",insufficient:"证据不足"}[status]??status):({answered:"Answered",source_limited:"Answered, sources limited",refused:"Provider refusal",limited:"Limited evidence",observed:"Search observation only",unresolved:"Not yet verifiable",insufficient:"Insufficient evidence"}[status]??status);}
function sourceTypeLabel(value:OpenGeoAnswerOwnershipCategoryV3,zh:boolean){const labels:Record<OpenGeoAnswerOwnershipCategoryV3,[string,string]>={target_owned:["目标品牌自有","Target-owned"],competitor_owned:["竞争品牌自有","Competitor-owned"],third_party_editorial:["第三方编辑来源","Third-party editorial"],directory:["目录","Directory"],government:["政府","Government"],other:["其他","Other"],institution:["机构","Institution"],community:["社区","Community"],social:["社交平台","Social"],unknown:["未分类","Unknown"]};return labels[value][zh?0:1];}
function retrievalStatusLabel(value:GenerativeSearchAnswerCardV3["sources"][number]["retrievalStatus"],zh:boolean){return zh?({verified_body:"正文已独立核验",search_source_only:"仅模型搜索来源",inaccessible:"当前无法访问"}[value]):({verified_body:"Body independently verified",search_source_only:"Model search source only",inaccessible:"Currently inaccessible"}[value]);}
function roadmapLabel(value:"immediate"|"nextPhase"|"ongoing",zh:boolean){return zh?({immediate:"立即执行",nextPhase:"下一阶段",ongoing:"持续执行"}[value]):({immediate:"Immediate",nextPhase:"Next phase",ongoing:"Ongoing"}[value]);}
