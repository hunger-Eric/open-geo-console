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
  const directByQuestion=new Map(report.directSemantics?.questions.map((result)=>[result.questionId,result])??[]);
  const ordinals=citationOrdinals(report.answerCards);
  const answered=report.answerCards.filter(({status})=>status==="answered").length;
  const limited=report.answerCards.filter(({status})=>status!=="answered").length;
  const mentioned=report.directSemantics ? null : report.answerCards.filter(({geoDiagnosis})=>geoDiagnosis.targetMentioned).length;
  const diagnosisTitle=report.sourceSelectionDiagnosis ? copy.sourceDiagnosis : copy.crossQuestion;
  const profile=report.technicalFoundation.aiReport.organizationProfile;
  const coverage=report.technicalFoundation.aiReport.coverage;
  return <main className="report-shell answer-first-report" data-artifact-revision={report.artifactRevisionId}>
    <header className="report-hero answer-first-hero">
      <p className="eyebrow">{copy.kicker}</p>
      <h1>{copy.title}</h1>
      <p className="lede">{copy.scope}</p>
      <dl className="metadata-grid">
        <Meta label={copy.target}>{report.targetUrl}</Meta>
        <Meta label={copy.generated}>{formatTimestamp(report.generatedAt,model.locale)}</Meta>
        <Meta label={copy.revision}><span title={report.artifactRevisionId}>{shortRevisionId(report.artifactRevisionId)}</span></Meta>
      </dl>
    </header>

    <div className="artifact-read-layout">
      <nav className="artifact-toc" aria-label={copy.toc}>
        <a href="#artifact-sec-context"><span>01</span>{copy.websiteContext}</a>
        <a href="#artifact-sec-answers"><span>02</span>{copy.answers}</a>
        <a href="#artifact-sec-diagnosis"><span>03</span>{diagnosisTitle}</a>
        <a href="#artifact-sec-technical"><span>04</span>{copy.technical}</a>
        <a href="#artifact-sec-actions"><span>05</span>{copy.actions}</a>
        {report.geoArticleExample ? <a href="#artifact-sec-article"><span>06</span>{copy.geoArticle}</a> : null}
        <a href="#artifact-sec-appendix"><span>07</span>{copy.appendix}</a>
      </nav>
      <div className="artifact-read-content">

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

      <div className="artifact-foldbar"><button type="button" data-fold="open">{copy.expandAll}</button><button type="button" data-fold="close">{copy.collapseAll}</button></div>
      <Fold id="artifact-sec-answers" index="02" title={copy.answers}>

    <section className="report-section" data-answer-first-section="true">
      <p className="section-index">02</p><h2>{copy.answers}</h2>
      <p>{copy.answerMethod}</p>
      <div className="answer-card-list">
        {report.answerCards.map((card, cardIndex) => card.answerMode === "generative_search_v1"
          ? <GenerativeSearchAnswerCard card={card} cardIndex={cardIndex} locale={model.locale} direct={directByQuestion.get(card.questionId)} key={card.questionId}/>
          : <LegacyEvidenceBoundAnswerCard card={card} cardIndex={cardIndex} locale={model.locale} ordinals={ordinals} key={card.questionId}/>)}
      </div>
    </section>

      </Fold>
      <Fold id="artifact-sec-diagnosis" index="03" title={diagnosisTitle}>
      {report.sourceSelectionDiagnosis
      ? <SourceSelectionDiagnosisSection
          diagnosis={report.sourceSelectionDiagnosis}
          locale={model.locale}
          targetUrl={report.targetUrl}
          questions={report.answerCards.map(({questionId,exactQuestion})=>({id:questionId,text:exactQuestion}))}
        />
      : <LegacyCrossQuestionDiagnosis report={report} locale={model.locale}/>}

      </Fold>
      <Fold id="artifact-sec-technical" index="04" title={copy.technical}>
      <section className="report-section" data-technical-analysis="true">
      <p className="section-index">04</p><h2>{copy.technical}</h2>
      <h3>{copy.technicalFindings}</h3>
      <div className="finding-list">{report.technicalFoundation.technicalReport.findings.map((finding) => <article className="finding-card" key={finding.id}><h4>{finding.title}</h4><p>{finding.description}</p><p className="recommendation">{finding.recommendation}</p></article>)}</div>
      <h3>{copy.pageAnalysis}</h3>
      <div className="table-wrap"><table><thead><tr><th>URL</th><th>{copy.pageTitle}</th><th>H1</th><th>Canonical</th><th>{copy.body}</th></tr></thead><tbody>
        {report.technicalFoundation.technicalReport.pages.map((page) => <tr key={page.url}><td>{page.url}</td><td>{page.title ?? "—"}</td><td>{page.h1.join(" · ") || "—"}</td><td>{page.canonical ?? "—"}</td><td>{page.metaDescription ?? "—"}</td></tr>)}
      </tbody></table></div>
      <h3>{copy.dimensionScores}</h3>
      <div className="technical-score-list">{report.technicalFoundation.aiReport.dimensionScores.map((score)=><article key={score.dimension}><strong>{score.score}</strong><div><h4>{score.dimension}</h4><p>{score.explanation}</p></div></article>)}</div>
      <h3>{copy.aiAnalysis}</h3>
      <div className="finding-list">{report.technicalFoundation.aiReport.findings.map((finding) => <article className="finding-card" key={finding.id}><h4>{finding.title}</h4><p>{finding.impact}</p><p className="recommendation">{finding.recommendation}</p>{finding.evidence.map((evidence, index) => {
        const assets=model.evidenceAssets.filter((asset)=>asset.findingId===finding.id&&asset.citationIndex===index&&asset.status==="ready");
        return <figure className="evidence-card" key={`${finding.id}-${index}`}><figcaption><blockquote>{evidence.quote}</blockquote><a href={evidence.url}>{evidence.url}</a></figcaption>{assets.map((asset)=><img key={asset.id} src={`/api/reports/${model.reportId}/evidence/${asset.id}`} alt={`${finding.title} evidence`}/>)}</figure>;
      })}</article>)}</div>
      <h3>{copy.pageTypes}</h3>
      {report.technicalFoundation.aiReport.pageTypeAnalyses.map((analysis,index)=><article className="technical-analysis-row" key={`${analysis.pageType}-${index}`}><h4>{analysis.pageType}</h4><p>{analysis.sampledUrls.join(" · ")}</p><List label={copy.strengths} items={analysis.strengths}/><List label={copy.issues} items={analysis.commonIssues}/><List label={copy.recommendations} items={analysis.recommendations}/></article>)}
    </section>

      </Fold>
      <Fold id="artifact-sec-actions" index="05" title={copy.actions}>
      <section className="report-section unified-actions" data-unified-actions="true">
        <p className="section-index">05</p><h2>{copy.actions}</h2>
        <p>{copy.actionsIntro}</p>
        <div className="technical-roadmap">{(["immediate","nextPhase","ongoing"] as const).map((phase)=><section key={phase}><h4>{roadmapLabel(phase,zh)}</h4>{report.technicalFoundation.aiReport.roadmap[phase].map((item,index)=><article key={`${phase}-${index}`}><h5>{item.title}</h5><p>{item.rationale}</p><ul>{item.actions.map((action)=><li key={action}>{action}</li>)}</ul></article>)}</section>)}</div>
      </section>
      </Fold>
      {report.geoArticleExample ? <Fold id="artifact-sec-article" index="06" title={copy.geoArticle}>
        <GeoArticleSection article={report.geoArticleExample} locale={model.locale}/>
      </Fold> : null}
      <Fold id="artifact-sec-appendix" index="07" title={copy.appendix}>
      <section className="report-section methodology-appendix" data-methodology-appendix="true">
      <p className="section-index">07</p><h2>{copy.appendix}</h2>
      <p>{copy.scope}</p>
      <dl className="provenance-grid"><Meta label={copy.searchSurface}>{report.engineProvenance.searchSurface}</Meta><Meta label={copy.searched}>{formatTimestamp(report.engineProvenance.searchedAt,model.locale)}</Meta><Meta label={copy.cutoff}>{formatTimestamp(report.engineProvenance.evidenceCutoffAt,model.locale)}</Meta><Meta label={copy.model}>{report.engineProvenance.synthesisModel}</Meta><Meta label={copy.queryPlan}>{report.engineProvenance.queryPlanVersion}</Meta><Meta label={copy.passage}>{report.engineProvenance.passageSelectorVersion}</Meta></dl>
      <h3>{copy.coverage}</h3><ul>{report.methodology.limitations.map((item)=><li key={item}>{item}</li>)}</ul>
      <div className="answer-audit-list">{report.answerCards.map((card) => card.answerMode === "generative_search_v1"
        ? <dl data-answer-audit={card.questionId} key={card.questionId}><Meta label={copy.verifiedBody}>{card.audit.verifiedBodyCount}</Meta><Meta label={copy.searchSourceOnly}>{card.audit.searchSourceOnlyCount}</Meta><Meta label={copy.inaccessible}>{card.audit.inaccessibleCount}</Meta></dl>
        : <dl data-answer-coverage={card.questionId} key={card.questionId}><Meta label={copy.plannedQueries}>{card.coverage.plannedQueries}</Meta><Meta label={copy.completedQueries}>{card.coverage.completedQueries}</Meta><Meta label={copy.returnedResults}>{card.coverage.returnedResults}</Meta><Meta label={copy.attemptedRetrievals}>{card.coverage.attemptedRetrievals}</Meta><Meta label={copy.safelyRetrievedPages}>{card.coverage.safelyRetrievedPages}</Meta><Meta label={copy.eligibleDirectEvidence}>{card.coverage.eligibleDirectEvidence}</Meta></dl>)}</div>
    </section>
      </Fold>
      </div>
    </div>
    <button type="button" className="artifact-to-top">{copy.backToTop}</button>
    <script dangerouslySetInnerHTML={{ __html: ARTIFACT_READ_SCRIPT }} />
  </main>;
}

function Meta({label,children}:{label:string;children:ReactNode}){return <div><dt>{label}</dt><dd>{children}</dd></div>;}
function Fold({id,index,title,children}:{id:string;index:string;title:string;children:ReactNode}){
  return <details className="fold" id={id}>
    <summary><span className="sn">{index}</span><span className="st">{title}</span><span className="chev" aria-hidden="true">▸</span></summary>
    <div className="fold-body">{children}</div>
  </details>;
}

const ARTIFACT_READ_SCRIPT = `(function(){
  var links=[].slice.call(document.querySelectorAll('.artifact-toc a[href^="#"]'));
  var secs=links.map(function(a){return document.querySelector(a.getAttribute('href'));}).filter(Boolean);
  function mark(id){links.forEach(function(l){l.classList.toggle('active',l.getAttribute('href')==='#'+id);});}
  links.forEach(function(l){l.addEventListener('click',function(){var t=document.querySelector(l.getAttribute('href'));if(t&&t.tagName==='DETAILS')t.open=true;if(t)mark(t.id);});});
  if('IntersectionObserver' in window){
    var obs=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){mark(e.target.id);}});},{rootMargin:'-5% 0px -75% 0px'});
    secs.forEach(function(s){obs.observe(s);});
  }
  var openBtn=document.querySelector('[data-fold="open"]');
  var closeBtn=document.querySelector('[data-fold="close"]');
  if(openBtn)openBtn.addEventListener('click',function(){document.querySelectorAll('details.fold').forEach(function(d){d.open=true;});});
  if(closeBtn)closeBtn.addEventListener('click',function(){document.querySelectorAll('details.fold').forEach(function(d){d.open=false;});});
  var top=document.querySelector('.artifact-to-top');
  if(top)top.addEventListener('click',function(){window.scrollTo({top:0,behavior:'smooth'});});
})();`;
function formatTimestamp(value:string,locale:"en"|"zh"){const date=new Date(value);if(Number.isNaN(date.getTime()))return value;return new Intl.DateTimeFormat(locale==="zh"?"zh-CN":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(date);}
function shortRevisionId(value:string){return value.length>12?`${value.slice(0,8)}…`:value;}
function List({label,items}:{label:string;items:readonly string[]}){return items.length?<div><strong>{label}</strong><ul>{items.map((item)=><li key={item}>{item}</li>)}</ul></div>:null;}
function citationOrdinals(cards:CombinedPrivateReportArtifactModelV3["combinedReport"]["answerCards"]){const result=new Map<string,number>();for(const card of cards){if(card.answerMode === "generative_search_v1")continue;for(const sentence of card.sentences)for(const id of sentence.evidenceIds)if(!result.has(id))result.set(id,result.size+1);}return result;}

function GeoArticleSection({article,locale}:{article:NonNullable<CombinedPrivateReportArtifactModelV3["combinedReport"]["geoArticleExample"]>;locale:"en"|"zh"}){
  const copy=locale==="zh"?ZH:EN;
  const rationaleBySection=new Map(article.rationale.map((entry)=>[entry.sectionId,entry]));
  return <section className="report-section geo-article-example" data-geo-article-generation-mode={article.generationMode}>
    <p className="section-index">06</p><h2>{copy.geoArticle}</h2>
    <p className="article-mode">{copy.generationMode}：{article.generationMode==="model"?copy.modelGenerated:copy.fallbackGenerated}</p>
    <article className="geo-article-body"><h3>{article.title}</h3><p className="geo-article-introduction">{article.introduction}</p>
      {article.sections.map((section)=>{const rationale=rationaleBySection.get(section.id);return <section className="geo-article-section" key={section.id}>
        <div><h4>{section.heading}</h4>{section.paragraphs.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>
        {rationale?<aside className="article-rationale"><strong>{copy.articleRationale}</strong><p>{rationale.reason}</p><small>{copy.evidenceRefs}：{rationale.evidenceRefs.join(" · ")}</small></aside>:null}
      </section>;})}
      <section className="geo-article-faq"><h4>{copy.articleFaq}</h4>{article.faq.map((entry,index)=><article key={index}><h5>{entry.question}</h5><p>{entry.answer}</p></article>)}</section>
    </article>
  </section>;
}

function LegacyCrossQuestionDiagnosis({report,locale}:{report:CombinedPrivateReportArtifactModelV3["combinedReport"];locale:"en"|"zh"}){
  const copy=locale==="zh"?ZH:EN;
  const answered=report.answerCards.filter(({status})=>status==="answered").length;
  const limited=report.answerCards.filter(({status})=>status!=="answered").length;
  const mentioned=report.answerCards.filter(({geoDiagnosis})=>geoDiagnosis.targetMentioned).length;
  return <section className="report-section cross-question-diagnosis" data-cross-question-diagnosis="true">
    <p className="section-index">03</p><h2>{copy.crossQuestion}</h2>
    <dl className="answer-metric-grid"><Meta label={copy.answered}>{answered}/3</Meta><Meta label={copy.limited}>{limited}/3</Meta><Meta label={copy.mentioned}>{mentioned}/3</Meta></dl>
    <div className="cross-question-grid"><div><h3>{copy.competitors}</h3><p>{[...new Set(report.answerCards.flatMap(({geoDiagnosis})=>geoDiagnosis.competitorEntityIds))].join(", ")||copy.none}</p></div><div><h3>{copy.missing}</h3><ul>{[...new Set(report.answerCards.flatMap(({geoDiagnosis})=>geoDiagnosis.missingEvidenceFamilies))].map((item)=><li key={item}>{item}</li>)}</ul></div></div>
  </section>;
}

function AnswerCardShell({cardIndex,status,question,locale,children}:{cardIndex:number;status:string;question:string;locale:"en"|"zh";children:ReactNode}){
  const copy=locale==="zh"?ZH:EN;
  return <article className="answer-card" data-open-geo-answer-card="true">
    <header className="answer-card-heading"><div><p className="eyebrow">{copy.question} {cardIndex+1}</p><h3>{question}</h3></div><p className={`answer-status answer-status-${status}`}>{statusLabel(status,locale==="zh")}</p></header>
    {children}
  </article>;
}

function GenerativeSearchAnswerCard({card,cardIndex,locale,direct}:{card:GenerativeSearchAnswerCardV3;cardIndex:number;locale:"en"|"zh";direct?:PaidV3DirectQuestionSemantics}){
  const zh=locale==="zh", copy=zh?ZH:EN;
  return <AnswerCardShell cardIndex={cardIndex} status={card.status} question={card.exactQuestion} locale={locale}>
    {card.status === "refused"
      ? <p className="business-question-answer refusal-answer" data-typed-refusal={card.refusal!.code}>{card.refusal!.reason}</p>
      : <p className="business-question-answer generated-answer" data-generative-answer={card.questionId}>{card.answerText}</p>}
    {card.status === "source_limited" && <p className="source-limitation" data-source-limited="true">{copy.sourceLimited}</p>}
    {card.sources.length>0 && <div className="answer-sources generative-answer-sources" data-generative-sources={card.questionId}>
      <h4>{copy.answerSources}</h4>
      {card.sources.map((source,index)=><article className="source-card" data-answer-source={source.sourceId} data-source-audit={source.retrievalStatus} key={source.sourceId}>
        <div className="source-ordinal">[{index+1}]</div><div className="source-content">
          <h5><a href={source.canonicalUrl}>{source.title}</a></h5>
          <p className={`source-audit-badge source-audit-${source.retrievalStatus}`}>{retrievalStatusLabel(source.retrievalStatus,zh)}</p>
          <dl className="source-metadata"><Meta label={copy.domain}>{source.registrableDomain}</Meta><Meta label={copy.sourceType}>{sourceTypeLabel(source.ownershipCategory,zh)}</Meta></dl>
          <p className="source-url"><a href={source.canonicalUrl}>{source.canonicalUrl}</a></p>
          {source.citedText && <blockquote><span>{copy.providerExcerpt}</span>{source.citedText}</blockquote>}
        </div>
      </article>)}
    </div>}
    {direct
      ? <DirectAnalysis result={direct} locale={locale}/>
      : card.diagnosis
        ? <DiagnosisSummary diagnosis={card.diagnosis} locale={locale}/>
        : <GeoDiagnosis card={card} locale={locale}/>}
    <dl className="answer-provenance"><Meta label={copy.model}>{card.provenance.model}</Meta><Meta label={copy.searchMode}>{card.provenance.searchMode}</Meta><Meta label={copy.searched}>{card.provenance.searchedAt}</Meta></dl>
  </AnswerCardShell>;
}

function DirectAnalysis({result,locale}:{result:PaidV3DirectQuestionSemantics;locale:"en"|"zh"}){
  const copy=locale==="zh"?ZH:EN;
  if(result.analysisStatus!=="completed"||!result.analysis){
    return <section className="model-diagnosis direct-analysis" data-direct-analysis-status="incomplete"><h4>{copy.aiAnalysis}</h4><p>{locale==="zh"?"本题答案及来源已保留；附加分析未完成。":"The answer and its sources are retained; optional analysis is unavailable."}</p></section>;
  }
  return <section className="model-diagnosis direct-analysis" data-direct-analysis-status="completed">
    <h4>{copy.aiAnalysis}</h4><p className="selection-summary">{result.analysis.summary}</p>
    <List label={copy.observableFactors} items={result.analysis.observations}/>
    <List label={copy.recommendedActions} items={result.analysis.recommendations}/>
  </section>;
}

function LegacyEvidenceBoundAnswerCard({card,cardIndex,locale,ordinals}:{card:LegacyEvidenceBoundAnswerCardV3;cardIndex:number;locale:"en"|"zh";ordinals:Map<string,number>}){
  const zh=locale==="zh", copy=zh?ZH:EN;
  return <AnswerCardShell cardIndex={cardIndex} status={card.status} question={card.exactQuestion} locale={locale}>
    {card.status === "insufficient" && <p className="business-question-answer insufficient-answer">{copy.insufficient}</p>}
    <div className="answer-prose">{card.sentences.map((sentence)=><div className="answer-sentence" data-answer-sentence={sentence.sentenceId} key={sentence.sentenceId}>
      <p className="business-question-answer">{sentence.text}{sentence.kind!=="scope_note"&&<span className="sentence-citations">{sentence.evidenceIds.map((id)=><sup data-citation-ordinal={ordinals.get(id)} key={id}>[{ordinals.get(id)}]</sup>)}</span>}</p>
      {sentence.kind!=="scope_note"&&<div className="answer-sources"><h4>{copy.sources}</h4>{sentence.evidenceIds.map((id)=>{const evidence=card.sourceEvidence.find((candidate)=>candidate.evidenceId===id);if(!evidence)return null;const ordinal=ordinals.get(id)!;return <article className="source-card" data-answer-source={id} data-citation-ordinal={ordinal} data-source-type={evidence.ownershipCategory} data-supported-sentence={sentence.sentenceId} key={id}><div className="source-ordinal">[{ordinal}]</div><div className="source-content"><h5><a href={evidence.canonicalUrl}>{evidence.title}</a></h5><dl className="source-metadata"><Meta label={copy.domain}>{evidence.registrableDomain}</Meta><Meta label={copy.sourceType}>{sourceTypeLabel(evidence.ownershipCategory,zh)}</Meta><Meta label={copy.observed}><time dateTime={evidence.observedAt}>{formatTimestamp(evidence.observedAt,locale)}</time></Meta></dl><p className="source-url"><a href={evidence.canonicalUrl}>{evidence.canonicalUrl}</a></p><blockquote><span>{copy.excerpt}</span>{evidence.exactExcerpt}</blockquote></div></article>;})}</div>}
    </div>)}</div>
    {card.diagnosis
      ? <DiagnosisSummary diagnosis={card.diagnosis} locale={locale}/>
      : <GeoDiagnosis card={card} locale={locale}/>}
  </AnswerCardShell>;
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
const ZH = { kicker:"Open GEO 付费深度报告",title:"从网站事实到 GEO 行动",scope:"先建立网站事实，再沿用同一组三个买家问题解释答案、来源、目标网站差距与改进路径。",target:"检测网站",generated:"生成时间",revision:"报告版本",websiteContext:"网站事实与业务背景",services:"产品与服务",audiences:"目标客户",regions:"市场与区域",analyzedPages:"已分析页面",technicalScore:"技术得分",executive:"网站概览",answered:"完整答案",limited:"有限答案",mentioned:"目标品牌出现",answers:"三个标准客户问题",answerMethod:"每个问题先给出答案，再紧邻展示同次回答返回的来源与诊断。",question:"客户问题",insufficient:"证据不足：当前公开证据不足以生成可靠答案。",plannedQueries:"计划查询",completedQueries:"完成查询",returnedResults:"搜索返回",attemptedRetrievals:"取回尝试",safelyRetrievedPages:"安全取回",eligibleDirectEvidence:"合格直接证据",sources:"本句来源",answerSources:"本次回答来源",domain:"域名",sourceType:"来源类型",observed:"观察时间",excerpt:"来源原文",providerExcerpt:"模型返回的引用片段",diagnosis:"GEO 诊断",questionDiagnosis:"本题诊断",targetMention:"目标品牌出现",firstPosition:"首次出现句序",targetRoles:"目标品牌角色",competitors:"竞争品牌",sourceStructure:"引用来源结构",missing:"缺失证据",retest:"复测问题：",yes:"是",no:"否",notPresent:"未出现",none:"无",crossQuestion:"跨问题 GEO 总结",technical:"完整技术分析",technicalFindings:"确定性技术发现",pageAnalysis:"页面级分析",pageTitle:"页面标题",body:"页面描述",dimensionScores:"技术维度评分",aiAnalysis:"模型技术说明与建议",pageTypes:"页面类型分析",strengths:"优势",issues:"问题",recommendations:"建议",roadmap:"实施路线图",actions:"统一行动方案",actionsIntro:"以下路线图汇总网站技术、内容与答案证据中的改进任务。",geoArticle:"GEO 文章示例",articleRationale:"为什么这样写",articleFaq:"买家常见问题",generationMode:"文章生成方式",modelGenerated:"AI 生成并通过证据契约校验",fallbackGenerated:"确定性证据降级稿",evidenceRefs:"依据",appendix:"证据与方法附录",searchSurface:"公开搜索面",searched:"搜索时间",cutoff:"证据截止时间",model:"综合模型",searchMode:"搜索模式",queryPlan:"查询计划",passage:"段落选择",coverage:"局限与覆盖",sourceLimited:"答案已生成，但同次回答没有可安全展示的公开来源。",verifiedBody:"正文已独立核验",searchSourceOnly:"仅模型搜索来源",inaccessible:"当前无法访问",observableFactors:"可观察因素",targetGap:"目标官网差距",recommendedActions:"优先行动",toc:"报告目录",expandAll:"全部展开",collapseAll:"全部收起",backToTop:"回到顶部",sourceDiagnosis:"来源选择诊断" };
const EN = { kicker:"Open GEO paid deep report",title:"From website facts to GEO action",scope:"The report establishes website facts first, then follows the same three buyer questions through answers, sources, target-site gaps, and actions.",target:"Audited website",generated:"Generated",revision:"Artifact revision",websiteContext:"Website facts and business context",services:"Products and services",audiences:"Target audiences",regions:"Markets and regions",analyzedPages:"Pages analyzed",technicalScore:"Technical score",executive:"Website overview",answered:"Complete answers",limited:"Limited answers",mentioned:"Target mentioned",answers:"Three standard customer questions",answerMethod:"Each question shows its answer first, followed immediately by the sources and diagnosis from the same answer chain.",question:"Customer question",insufficient:"Insufficient evidence: the available public evidence cannot support a reliable answer.",plannedQueries:"Planned queries",completedQueries:"Completed queries",returnedResults:"Search results returned",attemptedRetrievals:"Retrieval attempts",safelyRetrievedPages:"Safely retrieved",eligibleDirectEvidence:"Eligible direct evidence",sources:"Sources for this sentence",answerSources:"Sources returned with this answer",domain:"Domain",sourceType:"Source type",observed:"Observed",excerpt:"Source excerpt",providerExcerpt:"Provider-returned cited text",diagnosis:"GEO diagnosis",questionDiagnosis:"Question diagnosis",targetMention:"Target brand mentioned",firstPosition:"First sentence position",targetRoles:"Target roles",competitors:"Competitors",sourceStructure:"Citation-source structure",missing:"Missing evidence",retest:"Retest question:",yes:"Yes",no:"No",notPresent:"Not present",none:"None",crossQuestion:"Cross-question GEO summary",technical:"Complete technical analysis",technicalFindings:"Deterministic technical findings",pageAnalysis:"Page-level analysis",pageTitle:"Page title",body:"Page description",dimensionScores:"Technical dimension scores",aiAnalysis:"Model technical analysis and recommendations",pageTypes:"Page-type analysis",strengths:"Strengths",issues:"Issues",recommendations:"Recommendations",roadmap:"Implementation roadmap",actions:"Unified action plan",actionsIntro:"This roadmap combines the report's website, technical, content, and answer evidence into one execution path.",geoArticle:"GEO article example",articleRationale:"Why this section is written this way",articleFaq:"Buyer FAQ",generationMode:"Article generation",modelGenerated:"AI-generated and validated against the evidence contract",fallbackGenerated:"Deterministic evidence-grounded fallback",evidenceRefs:"Evidence",appendix:"Evidence and methodology appendix",searchSurface:"Public-search surface",searched:"Searched",cutoff:"Evidence cutoff",model:"Synthesis model",searchMode:"Search mode",queryPlan:"Query plan",passage:"Passage selector",coverage:"Coverage and limitations",sourceLimited:"The answer was generated, but the same operation returned no public source that can be displayed safely.",verifiedBody:"Body independently verified",searchSourceOnly:"Model search source only",inaccessible:"Currently inaccessible",observableFactors:"Observable factors",targetGap:"Target website gap",recommendedActions:"Recommended actions",toc:"Contents",expandAll:"Expand all",collapseAll:"Collapse all",backToTop:"Back to top",sourceDiagnosis:"Source selection diagnosis" };
function statusLabel(status:string,zh:boolean){return zh?({answered:"已回答",source_limited:"答案已生成，来源有限",refused:"模型拒绝回答",limited:"有限证据",observed:"仅搜索观察",unresolved:"尚无法核验",insufficient:"证据不足"}[status]??status):({answered:"Answered",source_limited:"Answered, sources limited",refused:"Provider refusal",limited:"Limited evidence",observed:"Search observation only",unresolved:"Not yet verifiable",insufficient:"Insufficient evidence"}[status]??status);}
function sourceTypeLabel(value:OpenGeoAnswerOwnershipCategoryV3,zh:boolean){const labels:Record<OpenGeoAnswerOwnershipCategoryV3,[string,string]>={target_owned:["目标品牌自有","Target-owned"],competitor_owned:["竞争品牌自有","Competitor-owned"],third_party_editorial:["第三方编辑来源","Third-party editorial"],directory:["目录","Directory"],government:["政府","Government"],other:["其他","Other"],institution:["机构","Institution"],community:["社区","Community"],social:["社交平台","Social"],unknown:["未分类","Unknown"]};return labels[value][zh?0:1];}
function retrievalStatusLabel(value:GenerativeSearchAnswerCardV3["sources"][number]["retrievalStatus"],zh:boolean){return zh?({verified_body:"正文已独立核验",search_source_only:"仅模型搜索来源",inaccessible:"当前无法访问"}[value]):({verified_body:"Body independently verified",search_source_only:"Model search source only",inaccessible:"Currently inaccessible"}[value]);}
function roadmapLabel(value:"immediate"|"nextPhase"|"ongoing",zh:boolean){return zh?({immediate:"立即执行",nextPhase:"下一阶段",ongoing:"持续执行"}[value]):({immediate:"Immediate",nextPhase:"Next phase",ongoing:"Ongoing"}[value]);}
