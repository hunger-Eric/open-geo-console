/* eslint-disable @next/next/no-img-element -- protected evidence images must render in the canonical printable HTML */
import type { CombinedPrivateReportArtifactModel } from "@/report/artifact-model";
import React from "react";

export function CombinedGeoReportArtifact({ model }: { model: CombinedPrivateReportArtifactModel }) {
  const report = model.combinedReport;
  const ai = report.technicalFoundation.aiReport;
  const technical = report.technicalFoundation.technicalReport;
  const forensic = report.publicSourceForensics;
  const zh = model.locale === "zh";
  const label = (kind: ArtifactLabelKind, value: string) => artifactValueLabel(kind, value, zh);
  const answers = report.businessQuestionAnswers?.answers ?? [];
  return <main className="recommendation-artifact combined-geo-artifact" data-artifact-revision={model.artifactRevisionId}>
    <nav className="artifact-actions no-print" aria-label="Report formats"><a href={`/reports/${model.reportId}/report.html`}>HTML</a><a className="primary" href={`/api/reports/${model.reportId}/artifacts/report.pdf`}>PDF</a></nav>
    <header className="cover artifact-section">
      <p className="eyebrow">OPEN GEO CONSOLE · {zh ? "GEO 综合报告" : "Combined GEO report"}</p>
      <h1>{ai.organizationProfile.organizationName ?? report.targetUrl}</h1>
      <p className="lede">{ai.executiveSummary.overview}</p>
      <dl className="cover-meta"><div><dt>URL</dt><dd>{report.targetUrl}</dd></div><div><dt>{zh ? "报告版本" : "Revision"}</dt><dd>{report.artifactRevision} · {model.artifactRevisionId}</dd></div><div><dt>{zh ? "证据截止" : "Evidence cutoff"}</dt><dd>{report.evidenceCutoffAt}</dd></div></dl>
    </header>

    <Section number="01" title={zh ? "技术与 AI 评分" : "Technical and AI scores"}>
      <div className="score-grid"><article className="score-card featured"><strong>{technical.score}</strong><span>{zh ? "确定性技术分" : "Deterministic technical"}</span></article>{ai.dimensionScores.map((score) => <article className="score-card" key={score.dimension}><strong>{score.score}</strong><span>{label("dimension", score.dimension)}</span><p>{score.explanation}</p></article>)}</div>
    </Section>

    <Section number="02" title={zh ? "完整技术分析" : "Complete technical analysis"}>
      <div className="finding-list">{technical.findings.map((finding) => <article className={`finding-card severity-${finding.severity}`} key={finding.id}><p className="citation-category">{label("severity", finding.severity)}</p><h3>{finding.title}</h3><p>{finding.description}</p><strong>{zh ? "建议" : "Recommendation"}</strong><p>{finding.recommendation}</p>{finding.url ? <a href={finding.url}>{finding.url}</a> : null}{finding.aggregation ? <p>{finding.aggregation.affectedCount} {zh ? "个受影响页面" : "affected"} · {finding.aggregation.representativeUrls.join(", ")}</p> : null}</article>)}</div>
      <table><thead><tr><th>URL</th><th>HTTP</th><th>{zh ? "标题" : "Title"}</th><th>H1</th><th>{zh ? "规范链接" : "Canonical"}</th><th>JSON-LD</th><th>{zh ? "正文长度" : "Text"}</th></tr></thead><tbody>{technical.pages.map((page) => <tr key={page.url}><td><a href={page.url}>{page.url}</a></td><td>{page.status}</td><td>{page.title ?? "—"}</td><td>{page.h1.join(" | ") || "—"}</td><td>{page.canonical ?? "—"}</td><td>{page.hasJsonLd ? (zh ? "是" : "Yes") : (zh ? "否" : "No")}</td><td>{page.readableTextLength}</td></tr>)}</tbody></table>
      <h3>{zh ? "机器可读资产" : "Machine-readable assets"}</h3><ul>{Object.entries(technical.machineReadableAssets).map(([name, asset]) => <li key={name}><strong>{name}</strong>: {label("asset", asset.present ? "ready" : "missing")} · <a href={asset.url}>{asset.url}</a> · {asset.summary}</li>)}</ul>
    </Section>

    <Section number="03" title={zh ? "全部验证发现与逐页证据" : "All verified findings and page evidence"}>
      {ai.findings.map((finding) => <article className={`finding-card severity-${finding.severity}`} key={finding.id}><p className="citation-category">{label("severity", finding.severity)}</p><h3>{finding.title}</h3><p>{finding.impact}</p><p><strong>{zh ? "建议" : "Recommendation"}:</strong> {finding.recommendation}</p>{finding.evidence.map((citation, index) => { const assets=model.evidenceAssets.filter((asset)=>asset.findingId===finding.id&&asset.citationIndex===index&&asset.status==="ready"); return <figure className="evidence-card" key={`${citation.url}-${index}`}><figcaption><p className="source-original-label">{zh ? "来源原文" : "Source original"}</p><blockquote>“{citation.quote}”</blockquote><a href={citation.url}>{citation.url}</a></figcaption>{assets.map((asset)=><img key={asset.id} src={`/api/reports/${model.reportId}/evidence/${asset.id}`} alt={`${finding.title} evidence`} />)}</figure>; })}</article>)}
    </Section>

    <Section number="04" title={zh ? "页面类型分析" : "Page-type analysis"}>{ai.pageTypeAnalyses.map((page) => <article className="vendor-task" key={page.pageType}><h3>{label("pageType", page.pageType)}</h3><p>{page.sampledUrls.join(" · ")}</p><div className="vendor-columns"><List title={zh ? "优势" : "Strengths"} values={page.strengths}/><List title={zh ? "常见问题" : "Common issues"} values={page.commonIssues}/><List title={zh ? "建议" : "Recommendations"} values={page.recommendations}/></div></article>)}</Section>

    <Section number="05" title={zh ? "三个业务问题与公开来源取证" : "Three business questions and public-source forensics"}>
      <div data-business-question-section="true" className="business-question-list">
        {report.businessQuestionSet.questions.map((question, index) => {
          const answer = answers[index];
          const publicQuestion = forensic.questions.questions[index];
          const snapshot = publicQuestion ? forensic.snapshotRefs.find((item) => item.questionId === publicQuestion.id) : undefined;
          const evidenceById = new Map(forensic.sourceGraph.evidence.map((item) => [item.evidenceId, item]));
          const sources = answer?.sourceEvidenceIds.map((id) => evidenceById.get(id)).filter((item) => item !== undefined) ?? [];
          return <article className="business-question-card" data-question-purpose={question.purpose} key={question.purpose}>
            <p className="citation-category">{zh ? `业务问题 ${index + 1} · ${label("purpose", question.purpose)}` : `Business question ${index + 1} · ${label("purpose", question.purpose)}`}</p>
            <h3>{question.privateText}</h3>
            <p className="business-question-answer">{answer?.answer ?? (zh ? "此问题的综合回答尚未生成。" : "This question's grounded answer has not been generated yet.")}</p>
            {sources.length > 0 ? <div className="business-question-source-block"><h4>{zh ? "支撑来源" : "Supporting sources"}</h4><ul className="business-question-sources">
              {sources.map((source) => <li key={source.evidenceId}><a href={source.canonicalUrl}>{source.registrableDomain}</a><span>{source.canonicalUrl}</span>{snapshot ? <time dateTime={snapshot.observedAt}>{label("freshness", snapshot.freshness)} · {snapshot.observedAt}</time> : null}</li>)}
            </ul></div> : null}
          </article>;
        })}
      </div>
    </Section>

    <Section number="06" title={zh ? "90 天路线图" : "90-day roadmap"}><div className="roadmap-grid"><Roadmap title={zh ? "立即执行" : "Immediate"} items={ai.roadmap.immediate}/><Roadmap title={zh ? "下一阶段" : "Next phase"} items={ai.roadmap.nextPhase}/><Roadmap title={zh ? "持续优化" : "Ongoing"} items={ai.roadmap.ongoing}/></div></Section>
    <Section number="07" title={zh ? "供应商任务包与验收标准" : "Vendor task package and acceptance criteria"}>{report.vendorTaskPackage.tasks.map((task) => <article className="vendor-task" key={task.id}><p className="citation-category">{label("vendor", task.vendor)}</p><h3>{task.title}</h3><p>{task.text}</p><div className="vendor-columns"><List title={zh ? "动作" : "Actions"} values={task.actions}/><List title={zh ? "验收标准" : "Acceptance criteria"} values={task.acceptanceCriteria}/></div></article>)}</Section>
    <Section number="08" title={zh ? "方法、覆盖、新鲜度与限制" : "Method, coverage, freshness, and limitations"}><dl className="provenance-grid"><div><dt>{zh ? "技术标识" : "Artifact identifier"}</dt><dd>{report.artifactContract} / {zh ? "版本" : "revision"} {report.artifactRevision}</dd></div><div><dt>{zh ? "技术覆盖" : "Technical coverage"}</dt><dd>{report.methodology.technicalCoverage}</dd></div><div><dt>{zh ? "证据新鲜度" : "Evidence freshness"}</dt><dd>{report.methodology.evidenceFreshness}</dd></div><div><dt>{zh ? "覆盖" : "Coverage"}</dt><dd>{label("coverage", forensic.coverage.status)} · {forensic.coverage.completedQueryCount}/{forensic.coverage.expectedQueryCount}</dd></div></dl><ul>{[...new Set([...ai.coverage.limitations, ...forensic.limitations, ...report.methodology.limitations])].map((item)=><li key={item}>{item}</li>)}</ul></Section>
  </main>;
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="artifact-section"><div className="section-heading"><span>{number}</span><h2>{title}</h2></div>{children}</section>; }
function List({ title, values }: { title: string; values: readonly string[] }) { return <div><h4>{title}</h4><ul>{values.map((value)=><li key={value}>{value}</li>)}</ul></div>; }
function Roadmap({ title, items }: { title: string; items: Array<{ title:string; rationale:string; actions:string[] }> }) { return <div className="roadmap-column"><h3>{title}</h3>{items.map((item)=><article key={item.title}><h4>{item.title}</h4><p>{item.rationale}</p><ul>{item.actions.map((action)=><li key={action}>{action}</li>)}</ul></article>)}</div>; }

type ArtifactLabelKind = "dimension" | "pageType" | "severity" | "vendor" | "purpose" | "freshness" | "coverage" | "asset";
const ZH_ARTIFACT_LABELS: Record<ArtifactLabelKind, Record<string, string>> = {
  dimension: { organizationClarity: "组织清晰度", informationArchitecture: "信息架构", contentCitability: "内容可引用性", trustEvidence: "信任证据", entityConsistency: "实体一致性", geoUnderstandability: "GEO 可理解性" },
  pageType: { home: "首页", product: "产品页", service: "服务页", about: "关于页", pricing: "定价页", "case-study": "案例页", contact: "联系页", blog: "博客页", news: "新闻页", documentation: "文档页", legal: "法律页", other: "其他页面" },
  severity: { critical: "严重", warning: "警告", opportunity: "机会", high: "高", medium: "中", low: "低", info: "提示" },
  vendor: { website: "网站", content: "内容", seo: "SEO", communications: "传播", "cross-functional": "跨职能" },
  purpose: { core_service_discovery: "核心服务发现", customer_region_fit: "客户与区域匹配", purchase_delivery_risk: "采购与交付风险" },
  freshness: { fresh: "最新", mixed: "混合时效", stale: "已陈旧", expired: "已失效" },
  coverage: { complete: "完整", partial: "部分", limited: "有限", unavailable: "不可用", insufficient: "证据不足" },
  asset: { ready: "已就绪", missing: "缺失" }
};
const EN_ARTIFACT_LABELS: Record<ArtifactLabelKind, Record<string, string>> = {
  dimension: { organizationClarity: "Organization clarity", informationArchitecture: "Information architecture", contentCitability: "Content citability", trustEvidence: "Trust evidence", entityConsistency: "Entity consistency", geoUnderstandability: "GEO understandability" },
  pageType: { home: "Home", product: "Product", service: "Service", about: "About", pricing: "Pricing", "case-study": "Case study", contact: "Contact", blog: "Blog", news: "News", documentation: "Documentation", legal: "Legal", other: "Other" },
  severity: { critical: "Critical", warning: "Warning", opportunity: "Opportunity", high: "High", medium: "Medium", low: "Low", info: "Info" },
  vendor: { website: "Website", content: "Content", seo: "SEO", communications: "Communications", "cross-functional": "Cross-functional" },
  purpose: { core_service_discovery: "Core service discovery", customer_region_fit: "Customer and region fit", purchase_delivery_risk: "Purchase and delivery risk" },
  freshness: { fresh: "Fresh", mixed: "Mixed freshness", stale: "Stale", expired: "Expired" },
  coverage: { complete: "Complete", partial: "Partial", limited: "Limited", unavailable: "Unavailable", insufficient: "Insufficient evidence" },
  asset: { ready: "Ready", missing: "Missing" }
};
function artifactValueLabel(kind: ArtifactLabelKind, value: string, zh: boolean): string {
  return (zh ? ZH_ARTIFACT_LABELS : EN_ARTIFACT_LABELS)[kind][value] ?? value;
}
