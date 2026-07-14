import type { CombinedPrivateReportArtifactModelV3 } from "@/report/artifact-model";

export function CombinedGeoReportV3Artifact({ model }: { model: CombinedPrivateReportArtifactModelV3 }) {
  const { combinedReport: report } = model;
  const zh = model.locale === "zh";
  const copy = zh ? ZH : EN;
  return <main className="report-shell" data-artifact-revision={report.artifactRevisionId}>
    <header className="report-hero">
      <p className="eyebrow">{copy.kicker}</p>
      <h1>{copy.title}</h1>
      <p>{copy.scope}</p>
      <dl className="metadata-grid">
        <div><dt>{copy.target}</dt><dd>{report.targetUrl}</dd></div>
        <div><dt>{copy.generated}</dt><dd>{report.generatedAt}</dd></div>
        <div><dt>{copy.revision}</dt><dd>{report.artifactRevisionId}</dd></div>
      </dl>
    </header>

    <section className="report-section" data-answer-first-section="true">
      <h2>{copy.answers}</h2>
      <p>{copy.answerMethod}</p>
      {report.answerCards.map((card, cardIndex) => <article className="answer-card" data-open-geo-answer-card="true" key={card.questionId}>
        <p className="eyebrow">{copy.question} {cardIndex + 1}</p>
        <h3>{card.exactQuestion}</h3>
        <p className={`answer-status answer-status-${card.status}`}>{statusLabel(card.status, zh)}</p>
        {card.status === "insufficient" && <p className="business-question-answer">{copy.insufficient}</p>}
        {card.sentences.map((sentence, sentenceIndex) => <div className="answer-sentence" key={sentence.sentenceId}>
          <p className="business-question-answer"><span>{sentenceIndex + 1}. </span>{sentence.text}</p>
          {sentence.kind === "grounded_claim" && <div className="answer-sources">
            <h4>{copy.sources}</h4>
            {sentence.evidenceIds.map((evidenceId) => {
              const evidence = card.sourceEvidence.find((candidate) => candidate.evidenceId === evidenceId);
              if (!evidence) return null;
              return <article className="source-card" data-answer-source={evidence.evidenceId} data-source-type={evidence.ownershipCategory} key={evidence.evidenceId}>
                <h5><a href={evidence.canonicalUrl}>{evidence.title}</a></h5>
                <p>{evidence.registrableDomain} · {sourceTypeLabel(evidence.ownershipCategory, zh)} · {evidence.observedAt}</p>
                <p className="source-url">{evidence.canonicalUrl}</p>
                <blockquote>{evidence.exactExcerpt}</blockquote>
              </article>;
            })}
          </div>}
        </div>)}
        <section className="geo-diagnosis">
          <h4>{copy.diagnosis}</h4>
          <dl className="metadata-grid">
            <div><dt>{copy.targetMention}</dt><dd>{card.geoDiagnosis.targetMentioned ? copy.yes : copy.no}</dd></div>
            <div><dt>{copy.firstPosition}</dt><dd>{card.geoDiagnosis.targetFirstSentence ?? copy.notPresent}</dd></div>
            <div><dt>{copy.targetRoles}</dt><dd>{card.geoDiagnosis.targetRoles.join(" · ") || copy.none}</dd></div>
            <div><dt>{copy.competitors}</dt><dd>{card.geoDiagnosis.competitorEntityIds.join(", ") || copy.none}</dd></div>
            <div><dt>{copy.sourceStructure}</dt><dd>{Object.entries(card.geoDiagnosis.citedOwnership).filter(([, count]) => count > 0).map(([type, count]) => `${sourceTypeLabel(type, zh)} ${count}`).join(" · ") || copy.none}</dd></div>
          </dl>
          <h5>{copy.missing}</h5>
          <ul>{card.geoDiagnosis.missingEvidenceFamilies.map((item) => <li key={item}>{item}</li>)}</ul>
          <p><strong>{copy.retest}</strong> {card.geoDiagnosis.retestQuestion}</p>
        </section>
      </article>)}
    </section>

    <section className="report-section" data-technical-analysis="true">
      <h2>{copy.technical}</h2>
      <p>{report.technicalFoundation.aiReport.executiveSummary.overview}</p>
      <h3>{copy.technicalFindings}</h3>
      {report.technicalFoundation.technicalReport.findings.map((finding) => <article className="finding-card" key={finding.id}>
        <h4>{finding.title}</h4><p>{finding.description}</p><p>{finding.recommendation}</p>
      </article>)}
      <h3>{copy.pageAnalysis}</h3>
      <div className="table-wrap"><table><thead><tr><th>URL</th><th>{copy.pageTitle}</th><th>H1</th><th>Canonical</th><th>{copy.body}</th></tr></thead><tbody>
        {report.technicalFoundation.technicalReport.pages.map((page) => <tr key={page.url}><td>{page.url}</td><td>{page.title ?? "—"}</td><td>{page.h1.join(" · ") || "—"}</td><td>{page.canonical ?? "—"}</td><td>{page.metaDescription ?? "—"}</td></tr>)}
      </tbody></table></div>
      <h3>{copy.aiAnalysis}</h3>
      {report.technicalFoundation.aiReport.findings.map((finding) => <article className="finding-card" key={finding.id}>
        <h4>{finding.title}</h4><p>{finding.impact}</p><p>{finding.recommendation}</p>
        {finding.evidence.map((evidence, index) => <blockquote key={`${finding.id}-${index}`}>{evidence.quote}<br/><a href={evidence.url}>{evidence.url}</a></blockquote>)}
      </article>)}
    </section>
  </main>;
}

const ZH = { kicker: "Open GEO 生成式答案", title: "答案优先 GEO 报告", scope: "以下答案由 Open GEO 基于公开搜索结果、网页证据和模型综合生成，不代表任何外部问答平台的实际回答。", target: "检测网站", generated: "生成时间", revision: "报告版本", answers: "三个标准客户问题", answerMethod: "事实句仅使用同一问题和主体的直接证据；来源紧邻其支持的句子。", question: "客户问题", insufficient: "证据不足：当前公开证据不足以生成可靠答案。", sources: "本句来源", diagnosis: "GEO 诊断", targetMention: "目标品牌出现", firstPosition: "首次出现句序", targetRoles: "目标品牌角色", competitors: "竞争品牌", sourceStructure: "引用来源结构", missing: "缺失证据", retest: "复测问题：", yes: "是", no: "否", notPresent: "未出现", none: "无", technical: "完整技术分析", technicalFindings: "确定性技术发现", pageAnalysis: "页面级分析", pageTitle: "页面标题", body: "页面描述", aiAnalysis: "模型技术说明与建议" };
const EN = { kicker: "Open GEO generated answer", title: "Answer-first GEO report", scope: "Open GEO generated these answers from public-search results, webpage evidence, and model synthesis. They are not answers observed from any external answer platform.", target: "Audited website", generated: "Generated", revision: "Artifact revision", answers: "Three standard customer questions", answerMethod: "Each factual sentence uses direct evidence for the same question and subject, shown immediately beside it.", question: "Customer question", insufficient: "Insufficient evidence: the available public evidence cannot support a reliable answer.", sources: "Sources for this sentence", diagnosis: "GEO diagnosis", targetMention: "Target brand mentioned", firstPosition: "First sentence position", targetRoles: "Target roles", competitors: "Competitors", sourceStructure: "Citation-source structure", missing: "Missing evidence", retest: "Retest question:", yes: "Yes", no: "No", notPresent: "Not present", none: "None", technical: "Complete technical analysis", technicalFindings: "Deterministic technical findings", pageAnalysis: "Page-level analysis", pageTitle: "Page title", body: "Page description", aiAnalysis: "Model technical analysis and recommendations" };
function statusLabel(status: string, zh: boolean): string { return zh ? ({ answered: "证据充分", limited: "有限证据", insufficient: "证据不足" }[status] ?? status) : ({ answered: "Answered", limited: "Limited evidence", insufficient: "Insufficient evidence" }[status] ?? status); }
function sourceTypeLabel(value: string, zh: boolean): string { const labels: Record<string, [string, string]> = { target_owned: ["目标品牌自有", "Target-owned"], competitor_owned: ["竞争品牌自有", "Competitor-owned"], third_party_editorial: ["第三方编辑来源", "Third-party editorial"], directory: ["目录", "Directory"], government: ["政府", "Government"], other: ["其他", "Other"] }; return labels[value]?.[zh ? 0 : 1] ?? value; }
