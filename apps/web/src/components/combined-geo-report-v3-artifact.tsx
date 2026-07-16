/* eslint-disable @next/next/no-img-element -- protected evidence images must remain printable in canonical HTML */
import React, { type ReactNode } from "react";
import type {
  GenerativeSearchAnswerCardV3,
  LegacyEvidenceBoundAnswerCardV3,
  OpenGeoAnswerOwnershipCategoryV3
} from "@open-geo-console/ai-report-engine";
import type { CombinedPrivateReportArtifactModelV3 } from "@/report/artifact-model";

export function CombinedGeoReportV3Artifact({ model }: { model: CombinedPrivateReportArtifactModelV3 }) {
  const { combinedReport: report } = model;
  const zh = model.locale === "zh";
  const copy = zh ? ZH : EN;
  const ordinals=citationOrdinals(report.answerCards);
  const answered=report.answerCards.filter(({status})=>status==="answered").length;
  const limited=report.answerCards.filter(({status})=>status!=="answered").length;
  const mentioned=report.answerCards.filter(({geoDiagnosis})=>geoDiagnosis.targetMentioned).length;
  return <main className="report-shell answer-first-report" data-artifact-revision={report.artifactRevisionId}>
    <header className="report-hero answer-first-hero">
      <p className="eyebrow">{copy.kicker}</p>
      <h1>{copy.title}</h1>
      <p className="lede">{copy.scope}</p>
      <dl className="metadata-grid">
        <Meta label={copy.target}>{report.targetUrl}</Meta>
        <Meta label={copy.generated}>{report.generatedAt}</Meta>
        <Meta label={copy.revision}>{report.artifactRevisionId}</Meta>
      </dl>
    </header>

    <section className="report-section executive-summary" data-executive-summary="true">
      <p className="section-index">01</p><h2>{copy.executive}</h2>
      <p className="summary-copy">{report.technicalFoundation.aiReport.executiveSummary.overview}</p>
      <dl className="answer-metric-grid">
        <Meta label={copy.answered}>{answered}/3</Meta><Meta label={copy.limited}>{limited}/3</Meta><Meta label={copy.mentioned}>{mentioned}/3</Meta>
      </dl>
    </section>

    <section className="report-section" data-answer-first-section="true">
      <p className="section-index">02</p><h2>{copy.answers}</h2>
      <p>{copy.answerMethod}</p>
      <div className="answer-card-list">
        {report.answerCards.map((card, cardIndex) => card.answerMode === "generative_search_v1"
          ? <GenerativeSearchAnswerCard card={card} cardIndex={cardIndex} locale={model.locale} key={card.questionId}/>
          : <LegacyEvidenceBoundAnswerCard card={card} cardIndex={cardIndex} locale={model.locale} ordinals={ordinals} key={card.questionId}/>)}
      </div>
    </section>

    <section className="report-section cross-question-diagnosis" data-cross-question-diagnosis="true">
      <p className="section-index">03</p><h2>{copy.crossQuestion}</h2>
      <dl className="answer-metric-grid"><Meta label={copy.answered}>{answered}/3</Meta><Meta label={copy.limited}>{limited}/3</Meta><Meta label={copy.mentioned}>{mentioned}/3</Meta></dl>
      <div className="cross-question-grid"><div><h3>{copy.competitors}</h3><p>{[...new Set(report.answerCards.flatMap(({geoDiagnosis})=>geoDiagnosis.competitorEntityIds))].join(", ")||copy.none}</p></div><div><h3>{copy.missing}</h3><ul>{[...new Set(report.answerCards.flatMap(({geoDiagnosis})=>geoDiagnosis.missingEvidenceFamilies))].map((item)=><li key={item}>{item}</li>)}</ul></div></div>
    </section>

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
      <h3>{copy.roadmap}</h3>
      <div className="technical-roadmap">{(["immediate","nextPhase","ongoing"] as const).map((phase)=><section key={phase}><h4>{roadmapLabel(phase,zh)}</h4>{report.technicalFoundation.aiReport.roadmap[phase].map((item,index)=><article key={`${phase}-${index}`}><h5>{item.title}</h5><p>{item.rationale}</p><ul>{item.actions.map((action)=><li key={action}>{action}</li>)}</ul></article>)}</section>)}</div>
    </section>

    <section className="report-section methodology-appendix" data-methodology-appendix="true">
      <p className="section-index">05</p><h2>{copy.appendix}</h2>
      <p>{copy.scope}</p>
      <dl className="provenance-grid"><Meta label={copy.searchSurface}>{report.engineProvenance.searchSurface}</Meta><Meta label={copy.searched}>{report.engineProvenance.searchedAt}</Meta><Meta label={copy.cutoff}>{report.engineProvenance.evidenceCutoffAt}</Meta><Meta label={copy.model}>{report.engineProvenance.synthesisModel}</Meta><Meta label={copy.queryPlan}>{report.engineProvenance.queryPlanVersion}</Meta><Meta label={copy.passage}>{report.engineProvenance.passageSelectorVersion}</Meta></dl>
      <h3>{copy.coverage}</h3><ul>{report.methodology.limitations.map((item)=><li key={item}>{item}</li>)}</ul>
      <div className="answer-audit-list">{report.answerCards.map((card) => card.answerMode === "generative_search_v1"
        ? <dl data-answer-audit={card.questionId} key={card.questionId}><Meta label={copy.verifiedBody}>{card.audit.verifiedBodyCount}</Meta><Meta label={copy.searchSourceOnly}>{card.audit.searchSourceOnlyCount}</Meta><Meta label={copy.inaccessible}>{card.audit.inaccessibleCount}</Meta></dl>
        : <dl data-answer-coverage={card.questionId} key={card.questionId}><Meta label={copy.plannedQueries}>{card.coverage.plannedQueries}</Meta><Meta label={copy.completedQueries}>{card.coverage.completedQueries}</Meta><Meta label={copy.returnedResults}>{card.coverage.returnedResults}</Meta><Meta label={copy.attemptedRetrievals}>{card.coverage.attemptedRetrievals}</Meta><Meta label={copy.safelyRetrievedPages}>{card.coverage.safelyRetrievedPages}</Meta><Meta label={copy.eligibleDirectEvidence}>{card.coverage.eligibleDirectEvidence}</Meta></dl>)}</div>
    </section>
  </main>;
}

function Meta({label,children}:{label:string;children:ReactNode}){return <div><dt>{label}</dt><dd>{children}</dd></div>;}
function List({label,items}:{label:string;items:readonly string[]}){return items.length?<div><strong>{label}</strong><ul>{items.map((item)=><li key={item}>{item}</li>)}</ul></div>:null;}
function citationOrdinals(cards:CombinedPrivateReportArtifactModelV3["combinedReport"]["answerCards"]){const result=new Map<string,number>();for(const card of cards){if(card.answerMode === "generative_search_v1")continue;for(const sentence of card.sentences)for(const id of sentence.evidenceIds)if(!result.has(id))result.set(id,result.size+1);}return result;}

function AnswerCardShell({cardIndex,status,question,locale,children}:{cardIndex:number;status:string;question:string;locale:"en"|"zh";children:ReactNode}){
  const copy=locale==="zh"?ZH:EN;
  return <article className="answer-card" data-open-geo-answer-card="true">
    <header className="answer-card-heading"><div><p className="eyebrow">{copy.question} {cardIndex+1}</p><h3>{question}</h3></div><p className={`answer-status answer-status-${status}`}>{statusLabel(status,locale==="zh")}</p></header>
    {children}
  </article>;
}

function GenerativeSearchAnswerCard({card,cardIndex,locale}:{card:GenerativeSearchAnswerCardV3;cardIndex:number;locale:"en"|"zh"}){
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
    <GeoDiagnosis card={card} locale={locale}/>
    <dl className="answer-provenance"><Meta label={copy.model}>{card.provenance.model}</Meta><Meta label={copy.searchMode}>{card.provenance.searchMode}</Meta><Meta label={copy.searched}>{card.provenance.searchedAt}</Meta></dl>
  </AnswerCardShell>;
}

function LegacyEvidenceBoundAnswerCard({card,cardIndex,locale,ordinals}:{card:LegacyEvidenceBoundAnswerCardV3;cardIndex:number;locale:"en"|"zh";ordinals:Map<string,number>}){
  const zh=locale==="zh", copy=zh?ZH:EN;
  return <AnswerCardShell cardIndex={cardIndex} status={card.status} question={card.exactQuestion} locale={locale}>
    {card.status === "insufficient" && <p className="business-question-answer insufficient-answer">{copy.insufficient}</p>}
    <div className="answer-prose">{card.sentences.map((sentence)=><div className="answer-sentence" data-answer-sentence={sentence.sentenceId} key={sentence.sentenceId}>
      <p className="business-question-answer">{sentence.text}{sentence.kind!=="scope_note"&&<span className="sentence-citations">{sentence.evidenceIds.map((id)=><sup data-citation-ordinal={ordinals.get(id)} key={id}>[{ordinals.get(id)}]</sup>)}</span>}</p>
      {sentence.kind!=="scope_note"&&<div className="answer-sources"><h4>{copy.sources}</h4>{sentence.evidenceIds.map((id)=>{const evidence=card.sourceEvidence.find((candidate)=>candidate.evidenceId===id);if(!evidence)return null;const ordinal=ordinals.get(id)!;return <article className="source-card" data-answer-source={id} data-citation-ordinal={ordinal} data-source-type={evidence.ownershipCategory} data-supported-sentence={sentence.sentenceId} key={id}><div className="source-ordinal">[{ordinal}]</div><div className="source-content"><h5><a href={evidence.canonicalUrl}>{evidence.title}</a></h5><dl className="source-metadata"><Meta label={copy.domain}>{evidence.registrableDomain}</Meta><Meta label={copy.sourceType}>{sourceTypeLabel(evidence.ownershipCategory,zh)}</Meta><Meta label={copy.observed}>{evidence.observedAt}</Meta></dl><p className="source-url"><a href={evidence.canonicalUrl}>{evidence.canonicalUrl}</a></p><blockquote><span>{copy.excerpt}</span>{evidence.exactExcerpt}</blockquote></div></article>;})}</div>}
    </div>)}</div>
    <GeoDiagnosis card={card} locale={locale}/>
  </AnswerCardShell>;
}

function GeoDiagnosis({card,locale}:{card:GenerativeSearchAnswerCardV3|LegacyEvidenceBoundAnswerCardV3;locale:"en"|"zh"}){
  const zh=locale==="zh",copy=zh?ZH:EN;
  return <section className="geo-diagnosis"><h4>{copy.diagnosis}</h4><dl className="diagnosis-grid"><Meta label={copy.targetMention}>{card.geoDiagnosis.targetMentioned?copy.yes:copy.no}</Meta><Meta label={copy.firstPosition}>{card.geoDiagnosis.targetFirstSentence??copy.notPresent}</Meta><Meta label={copy.targetRoles}>{card.geoDiagnosis.targetRoles.join(" · ")||copy.none}</Meta><Meta label={copy.competitors}>{card.geoDiagnosis.competitorEntityIds.join(", ")||copy.none}</Meta><Meta label={copy.sourceStructure}>{Object.entries(card.geoDiagnosis.citedOwnership).filter(([,count])=>count>0).map(([type,count])=>`${sourceTypeLabel(type as OpenGeoAnswerOwnershipCategoryV3,zh)} ${count}`).join(" · ")||copy.none}</Meta></dl><div className="diagnosis-followup"><div><h5>{copy.missing}</h5><ul>{card.geoDiagnosis.missingEvidenceFamilies.map((item)=><li key={item}>{item}</li>)}</ul></div><p><strong>{copy.retest}</strong><br/>{card.geoDiagnosis.retestQuestion}</p></div></section>;
}
const ZH = { kicker:"Open GEO 生成式答案",title:"答案优先 GEO 报告",scope:"以下答案由 Open GEO 通过带联网搜索的模型生成；每个答案下方仅列出同次回答返回的来源，不代表任何外部问答平台的实际回答。",target:"检测网站",generated:"生成时间",revision:"报告版本",executive:"执行摘要",answered:"完整答案",limited:"有限答案",mentioned:"目标品牌出现",answers:"三个标准客户问题",answerMethod:"先展示完整答案，再紧邻展示同次模型回答返回的来源；独立取回核验仅作为次要审计标签。",question:"客户问题",insufficient:"证据不足：当前公开证据不足以生成可靠答案。",plannedQueries:"计划查询",completedQueries:"完成查询",returnedResults:"搜索返回",attemptedRetrievals:"取回尝试",safelyRetrievedPages:"安全取回",eligibleDirectEvidence:"合格直接证据",sources:"本句来源",answerSources:"本次回答来源",domain:"域名",sourceType:"来源类型",observed:"观察时间",excerpt:"来源原文",providerExcerpt:"模型返回的引用片段",diagnosis:"GEO 诊断",targetMention:"目标品牌出现",firstPosition:"首次出现句序",targetRoles:"目标品牌角色",competitors:"竞争品牌",sourceStructure:"引用来源结构",missing:"缺失证据",retest:"复测问题：",yes:"是",no:"否",notPresent:"未出现",none:"无",crossQuestion:"跨问题 GEO 总结",technical:"完整技术分析",technicalFindings:"确定性技术发现",pageAnalysis:"页面级分析",pageTitle:"页面标题",body:"页面描述",dimensionScores:"技术维度评分",aiAnalysis:"模型技术说明与建议",pageTypes:"页面类型分析",strengths:"优势",issues:"问题",recommendations:"建议",roadmap:"实施路线图",appendix:"证据与方法附录",searchSurface:"公开搜索面",searched:"搜索时间",cutoff:"证据截止时间",model:"综合模型",searchMode:"搜索模式",queryPlan:"查询计划",passage:"段落选择",coverage:"局限与覆盖",sourceLimited:"答案已生成，但同次回答没有可安全展示的公开来源。",verifiedBody:"正文已独立核验",searchSourceOnly:"仅模型搜索来源",inaccessible:"当前无法访问" };
const EN = { kicker:"Open GEO generated answer",title:"Answer-first GEO report",scope:"Open GEO generated these answers with a web-search-enabled model. Sources shown below each answer are only those returned by that same operation; these are not answers observed from an external answer platform.",target:"Audited website",generated:"Generated",revision:"Artifact revision",executive:"Executive summary",answered:"Complete answers",limited:"Limited answers",mentioned:"Target mentioned",answers:"Three standard customer questions",answerMethod:"The complete answer appears first, followed immediately by sources returned by the same model operation. Independent retrieval is a secondary audit label.",question:"Customer question",insufficient:"Insufficient evidence: the available public evidence cannot support a reliable answer.",plannedQueries:"Planned queries",completedQueries:"Completed queries",returnedResults:"Search results returned",attemptedRetrievals:"Retrieval attempts",safelyRetrievedPages:"Safely retrieved",eligibleDirectEvidence:"Eligible direct evidence",sources:"Sources for this sentence",answerSources:"Sources returned with this answer",domain:"Domain",sourceType:"Source type",observed:"Observed",excerpt:"Source excerpt",providerExcerpt:"Provider-returned cited text",diagnosis:"GEO diagnosis",targetMention:"Target brand mentioned",firstPosition:"First sentence position",targetRoles:"Target roles",competitors:"Competitors",sourceStructure:"Citation-source structure",missing:"Missing evidence",retest:"Retest question:",yes:"Yes",no:"No",notPresent:"Not present",none:"None",crossQuestion:"Cross-question GEO summary",technical:"Complete technical analysis",technicalFindings:"Deterministic technical findings",pageAnalysis:"Page-level analysis",pageTitle:"Page title",body:"Page description",dimensionScores:"Technical dimension scores",aiAnalysis:"Model technical analysis and recommendations",pageTypes:"Page-type analysis",strengths:"Strengths",issues:"Issues",recommendations:"Recommendations",roadmap:"Implementation roadmap",appendix:"Evidence and methodology appendix",searchSurface:"Public-search surface",searched:"Searched",cutoff:"Evidence cutoff",model:"Synthesis model",searchMode:"Search mode",queryPlan:"Query plan",passage:"Passage selector",coverage:"Coverage and limitations",sourceLimited:"The answer was generated, but the same operation returned no public source that can be displayed safely.",verifiedBody:"Body independently verified",searchSourceOnly:"Model search source only",inaccessible:"Currently inaccessible" };
function statusLabel(status:string,zh:boolean){return zh?({answered:"已回答",source_limited:"答案已生成，来源有限",refused:"模型拒绝回答",limited:"有限证据",observed:"仅搜索观察",unresolved:"尚无法核验",insufficient:"证据不足"}[status]??status):({answered:"Answered",source_limited:"Answered, sources limited",refused:"Provider refusal",limited:"Limited evidence",observed:"Search observation only",unresolved:"Not yet verifiable",insufficient:"Insufficient evidence"}[status]??status);}
function sourceTypeLabel(value:OpenGeoAnswerOwnershipCategoryV3,zh:boolean){const labels:Record<OpenGeoAnswerOwnershipCategoryV3,[string,string]>={target_owned:["目标品牌自有","Target-owned"],competitor_owned:["竞争品牌自有","Competitor-owned"],third_party_editorial:["第三方编辑来源","Third-party editorial"],directory:["目录","Directory"],government:["政府","Government"],other:["其他","Other"],institution:["机构","Institution"],community:["社区","Community"],social:["社交平台","Social"],unknown:["未分类","Unknown"]};return labels[value][zh?0:1];}
function retrievalStatusLabel(value:GenerativeSearchAnswerCardV3["sources"][number]["retrievalStatus"],zh:boolean){return zh?({verified_body:"正文已独立核验",search_source_only:"仅模型搜索来源",inaccessible:"当前无法访问"}[value]):({verified_body:"Body independently verified",search_source_only:"Model search source only",inaccessible:"Currently inaccessible"}[value]);}
function roadmapLabel(value:"immediate"|"nextPhase"|"ongoing",zh:boolean){return zh?({immediate:"立即执行",nextPhase:"下一阶段",ongoing:"持续执行"}[value]):({immediate:"Immediate",nextPhase:"Next phase",ongoing:"Ongoing"}[value]);}
