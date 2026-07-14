/* eslint-disable @next/next/no-img-element -- protected evidence images must render in the canonical printable HTML */
import type { CombinedPrivateReportArtifactModel } from "@/report/artifact-model";
import React from "react";

export function CombinedGeoReportArtifact({ model }: { model: CombinedPrivateReportArtifactModel }) {
  const report = model.combinedReport;
  const ai = report.technicalFoundation.aiReport;
  const technical = report.technicalFoundation.technicalReport;
  const forensic = report.publicSourceForensics;
  const zh = model.locale === "zh";
  const answers = report.businessQuestionAnswers?.answers ?? [];
  return <main className="recommendation-artifact combined-geo-artifact" data-artifact-revision={model.artifactRevisionId}>
    <nav className="artifact-actions no-print" aria-label="Report formats"><a href={`/reports/${model.reportId}/report.html`}>HTML</a><a className="primary" href={`/api/reports/${model.reportId}/artifacts/report.pdf`}>PDF</a></nav>
    <header className="cover artifact-section">
      <p className="eyebrow">OPEN GEO CONSOLE · COMBINED GEO REPORT V1</p>
      <h1>{ai.organizationProfile.organizationName ?? report.targetUrl}</h1>
      <p className="lede">{ai.executiveSummary.overview}</p>
      <dl className="cover-meta"><div><dt>URL</dt><dd>{report.targetUrl}</dd></div><div><dt>Revision</dt><dd>{report.artifactRevision} · {model.artifactRevisionId}</dd></div><div><dt>{zh ? "证据截止" : "Evidence cutoff"}</dt><dd>{report.evidenceCutoffAt}</dd></div></dl>
    </header>

    <Section number="01" title={zh ? "技术与 AI 评分" : "Technical and AI scores"}>
      <div className="score-grid"><article className="score-card featured"><strong>{technical.score}</strong><span>{zh ? "确定性技术分" : "Deterministic technical"}</span></article>{ai.dimensionScores.map((score) => <article className="score-card" key={score.dimension}><strong>{score.score}</strong><span>{score.dimension}</span><p>{score.explanation}</p></article>)}</div>
    </Section>

    <Section number="02" title={zh ? "完整技术分析" : "Complete technical analysis"}>
      <div className="finding-list">{technical.findings.map((finding) => <article className={`finding-card severity-${finding.severity}`} key={finding.id}><h3>{finding.title}</h3><p>{finding.description}</p><strong>{zh ? "建议" : "Recommendation"}</strong><p>{finding.recommendation}</p>{finding.url ? <a href={finding.url}>{finding.url}</a> : null}{finding.aggregation ? <p>{finding.aggregation.affectedCount} affected · {finding.aggregation.representativeUrls.join(", ")}</p> : null}</article>)}</div>
      <table><thead><tr><th>URL</th><th>HTTP</th><th>Title</th><th>H1</th><th>Canonical</th><th>JSON-LD</th><th>Text</th></tr></thead><tbody>{technical.pages.map((page) => <tr key={page.url}><td><a href={page.url}>{page.url}</a></td><td>{page.status}</td><td>{page.title ?? "—"}</td><td>{page.h1.join(" | ") || "—"}</td><td>{page.canonical ?? "—"}</td><td>{page.hasJsonLd ? "Yes" : "No"}</td><td>{page.readableTextLength}</td></tr>)}</tbody></table>
      <h3>{zh ? "机器可读资产" : "Machine-readable assets"}</h3><ul>{Object.entries(technical.machineReadableAssets).map(([name, asset]) => <li key={name}><strong>{name}</strong>: {asset.present ? "ready" : "missing"} · <a href={asset.url}>{asset.url}</a> · {asset.summary}</li>)}</ul>
    </Section>

    <Section number="03" title={zh ? "全部验证发现与逐页证据" : "All verified findings and page evidence"}>
      {ai.findings.map((finding) => <article className={`finding-card severity-${finding.severity}`} key={finding.id}><h3>{finding.title}</h3><p>{finding.impact}</p><p><strong>{zh ? "建议" : "Recommendation"}:</strong> {finding.recommendation}</p>{finding.evidence.map((citation, index) => { const assets=model.evidenceAssets.filter((asset)=>asset.findingId===finding.id&&asset.citationIndex===index&&asset.status==="ready"); return <figure className="evidence-card" key={`${citation.url}-${index}`}><figcaption><blockquote>“{citation.quote}”</blockquote><a href={citation.url}>{citation.url}</a></figcaption>{assets.map((asset)=><img key={asset.id} src={`/api/reports/${model.reportId}/evidence/${asset.id}`} alt={`${finding.title} evidence`} />)}</figure>; })}</article>)}
    </Section>

    <Section number="04" title={zh ? "页面类型分析" : "Page-type analysis"}>{ai.pageTypeAnalyses.map((page) => <article className="vendor-task" key={page.pageType}><h3>{page.pageType}</h3><p>{page.sampledUrls.join(" · ")}</p><div className="vendor-columns"><List title={zh ? "优势" : "Strengths"} values={page.strengths}/><List title={zh ? "常见问题" : "Common issues"} values={page.commonIssues}/><List title={zh ? "建议" : "Recommendations"} values={page.recommendations}/></div></article>)}</Section>

    <Section number="05" title={zh ? "三个业务问题与公开来源取证" : "Three business questions and public-source forensics"}>
      <div data-business-question-section="true" className="business-question-list">
        {report.businessQuestionSet.questions.map((question, index) => {
          const answer = answers[index];
          const publicQuestion = forensic.questions.questions[index];
          const snapshot = publicQuestion ? forensic.snapshotRefs.find((item) => item.questionId === publicQuestion.id) : undefined;
          const evidenceById = new Map(forensic.sourceGraph.evidence.map((item) => [item.evidenceId, item]));
          const sources = answer?.sourceEvidenceIds.map((id) => evidenceById.get(id)).filter((item) => item !== undefined) ?? [];
          return <article className="business-question-card" data-question-purpose={question.purpose} key={question.purpose}>
            <p className="citation-category">{zh ? `业务问题 ${index + 1}` : `Business question ${index + 1}`}</p>
            <h3>{question.privateText}</h3>
            <p className="business-question-answer">{answer?.answer ?? (zh ? "此问题的综合回答尚未生成。" : "This question's grounded answer has not been generated yet.")}</p>
            {sources.length > 0 ? <div className="business-question-source-block"><h4>{zh ? "支撑来源" : "Supporting sources"}</h4><ul className="business-question-sources">
              {sources.map((source) => <li key={source.evidenceId}><a href={source.canonicalUrl}>{source.registrableDomain}</a><span>{source.canonicalUrl}</span>{snapshot ? <time dateTime={snapshot.observedAt}>{snapshot.freshness} · {snapshot.observedAt}</time> : null}</li>)}
            </ul></div> : null}
          </article>;
        })}
      </div>
    </Section>

    <Section number="06" title={zh ? "90 天路线图" : "90-day roadmap"}><div className="roadmap-grid"><Roadmap title={zh ? "立即执行" : "Immediate"} items={ai.roadmap.immediate}/><Roadmap title={zh ? "下一阶段" : "Next phase"} items={ai.roadmap.nextPhase}/><Roadmap title={zh ? "持续优化" : "Ongoing"} items={ai.roadmap.ongoing}/></div></Section>
    <Section number="07" title={zh ? "供应商任务包与验收标准" : "Vendor task package and acceptance criteria"}>{report.vendorTaskPackage.tasks.map((task) => <article className="vendor-task" key={task.id}><p className="citation-category">{task.vendor}</p><h3>{task.title}</h3><p>{task.text}</p><div className="vendor-columns"><List title={zh ? "动作" : "Actions"} values={task.actions}/><List title={zh ? "验收标准" : "Acceptance criteria"} values={task.acceptanceCriteria}/></div></article>)}</Section>
    <Section number="08" title={zh ? "方法、覆盖、新鲜度与限制" : "Method, coverage, freshness, and limitations"}><dl className="provenance-grid"><div><dt>Artifact</dt><dd>{report.artifactContract} / revision {report.artifactRevision}</dd></div><div><dt>{zh ? "技术覆盖" : "Technical coverage"}</dt><dd>{report.methodology.technicalCoverage}</dd></div><div><dt>{zh ? "搜索表面" : "Public search surface"}</dt><dd>{report.methodology.publicSearchSurface}</dd></div><div><dt>{zh ? "证据新鲜度" : "Evidence freshness"}</dt><dd>{report.methodology.evidenceFreshness}</dd></div><div><dt>{zh ? "覆盖" : "Coverage"}</dt><dd>{forensic.coverage.status} · {forensic.coverage.completedQueryCount}/{forensic.coverage.expectedQueryCount}</dd></div></dl><ul>{[...ai.coverage.limitations, ...forensic.limitations, ...report.methodology.limitations].map((item,index)=><li key={`${index}-${item}`}>{item}</li>)}</ul></Section>
  </main>;
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="artifact-section"><div className="section-heading"><span>{number}</span><h2>{title}</h2></div>{children}</section>; }
function List({ title, values }: { title: string; values: readonly string[] }) { return <div><h4>{title}</h4><ul>{values.map((value)=><li key={value}>{value}</li>)}</ul></div>; }
function Roadmap({ title, items }: { title: string; items: Array<{ title:string; rationale:string; actions:string[] }> }) { return <div className="roadmap-column"><h3>{title}</h3>{items.map((item)=><article key={item.title}><h4>{item.title}</h4><p>{item.rationale}</p><ul>{item.actions.map((action)=><li key={action}>{action}</li>)}</ul></article>)}</div>; }
