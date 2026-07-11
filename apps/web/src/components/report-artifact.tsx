/* eslint-disable @next/next/no-img-element -- protected evidence is streamed through an authorized route and must remain printable */
import type { AiFinding, EvidenceCitation, RoadmapItem } from "@open-geo-console/ai-report-engine";
import type { PrivateReportArtifactModel } from "@/report/artifact-model";
import type { ReportEvidenceAssetRow } from "@/db/schema";

const copy = {
  en: {
    label: "PRIVATE DEEP REPORT",
    summary: "Executive summary",
    scores: "Scores",
    technical: "Technical GEO",
    findings: "Priority findings",
    evidence: "Verified visual evidence",
    captured: "Captured",
    unavailable: "Screenshot unavailable. The verified quote and source URL remain authoritative.",
    recommendation: "Recommendation",
    roadmap: "90-day roadmap",
    immediate: "Immediate",
    next: "Next phase",
    ongoing: "Ongoing",
    appendix: "Technical appendix",
    sources: "Source list",
    coverage: "Coverage",
    generated: "Generated",
    html: "HTML report",
    pdf: "PDF report"
  },
  zh: {
    label: "私密深度报告",
    summary: "执行摘要",
    scores: "评分概览",
    technical: "技术 GEO",
    findings: "优先问题",
    evidence: "已验证的视觉证据",
    captured: "捕获时间",
    unavailable: "截图不可用；已验证的引用文字和来源 URL 仍然有效。",
    recommendation: "改进建议",
    roadmap: "90 天路线图",
    immediate: "立即处理",
    next: "下一阶段",
    ongoing: "持续优化",
    appendix: "技术附录",
    sources: "来源列表",
    coverage: "覆盖范围",
    generated: "生成时间",
    html: "HTML 报告",
    pdf: "PDF 报告"
  }
} as const;

export function ReportArtifact({ model }: { model: PrivateReportArtifactModel }) {
  const t = copy[model.locale];
  const report = model.aiReport;
  const sourceUrls = [...new Set([
    ...report.findings.flatMap((finding) => finding.evidence.map((item) => item.url)),
    ...model.technicalReport.pages.map((page) => page.url)
  ])];

  return (
    <main>
      <nav className="artifact-actions no-print" aria-label="Report formats">
        <a href={`/reports/${model.reportId}/report.html`}>{t.html}</a>
        <a className="primary" href={`/api/reports/${model.reportId}/artifacts/report.pdf`}>{t.pdf}</a>
      </nav>

      <header className="cover artifact-section">
        <p className="eyebrow">OPEN GEO CONSOLE · {t.label}</p>
        <h1>{report.organizationProfile.organizationName ?? model.technicalReport.url}</h1>
        <p className="lede">{report.organizationProfile.summary}</p>
        <dl className="cover-meta">
          <div><dt>URL</dt><dd>{model.technicalReport.url}</dd></div>
          <div><dt>{t.generated}</dt><dd>{formatDate(report.provenance.generatedAt, model.locale)}</dd></div>
          <div><dt>{t.coverage}</dt><dd>{report.coverage.analyzedPages} / {report.coverage.plannedPages}</dd></div>
        </dl>
      </header>

      <section className="artifact-section" id="summary">
        <SectionHeading number="01" title={t.summary} />
        <p className="summary-copy">{report.executiveSummary.overview}</p>
        <div className="summary-grid">
          <SummaryList title={model.locale === "zh" ? "优势" : "Strengths"} values={report.executiveSummary.strengths} />
          <SummaryList title={model.locale === "zh" ? "关键风险" : "Key risks"} values={report.executiveSummary.keyRisks} />
          <SummaryList title={model.locale === "zh" ? "最高优先级" : "Top priorities"} values={report.executiveSummary.topPriorities} />
        </div>
      </section>

      <section className="artifact-section" id="scores">
        <SectionHeading number="02" title={t.scores} />
        <div className="score-grid">
          <article className="score-card featured"><strong>{model.technicalReport.score}</strong><span>{t.technical}</span></article>
          {report.dimensionScores.map((score) => (
            <article className="score-card" key={score.dimension}>
              <strong>{score.score}</strong><span>{humanize(score.dimension)}</span><p>{score.explanation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="artifact-section" id="findings">
        <SectionHeading number="03" title={t.findings} />
        <div className="finding-list">
          {report.findings.map((finding, index) => (
            <FindingCard
              assets={model.evidenceAssets.filter((asset) => asset.findingId === finding.id)}
              finding={finding}
              key={finding.id}
              locale={model.locale}
              number={index + 1}
              reportId={model.reportId}
            />
          ))}
        </div>
      </section>

      <section className="artifact-section" id="roadmap">
        <SectionHeading number="04" title={t.roadmap} />
        <div className="roadmap-grid">
          <Roadmap title={t.immediate} items={report.roadmap.immediate} />
          <Roadmap title={t.next} items={report.roadmap.nextPhase} />
          <Roadmap title={t.ongoing} items={report.roadmap.ongoing} />
        </div>
      </section>

      <section className="artifact-section appendix" id="appendix">
        <SectionHeading number="05" title={t.appendix} />
        <div className="coverage-note">
          <strong>{t.coverage}</strong>
          <p>{report.coverage.samplingMethod}</p>
          {report.coverage.limitations.length ? <ul>{report.coverage.limitations.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </div>
        <table>
          <thead><tr><th>URL</th><th>HTTP</th><th>H1</th><th>JSON-LD</th></tr></thead>
          <tbody>{model.technicalReport.pages.map((page) => (
            <tr key={page.url}><td>{page.url}</td><td>{page.status}</td><td>{page.h1.length}</td><td>{page.hasJsonLd ? "Yes" : "No"}</td></tr>
          ))}</tbody>
        </table>
        <h3 className="source-title">{t.sources}</h3>
        <ol className="source-list">{sourceUrls.map((url) => <li key={url}><a href={url}>{url}</a></li>)}</ol>
      </section>
    </main>
  );
}

function FindingCard({
  assets,
  finding,
  locale,
  number,
  reportId
}: {
  assets: ReportEvidenceAssetRow[];
  finding: AiFinding;
  locale: "en" | "zh";
  number: number;
  reportId: string;
}) {
  const t = copy[locale];
  return (
    <article className={`finding-card severity-${finding.severity}`}>
      <div className="finding-heading">
        <span className="finding-number">{String(number).padStart(2, "0")}</span>
        <div><p className="severity">{finding.severity}</p><h3>{finding.title}</h3></div>
      </div>
      <p className="impact">{finding.impact}</p>
      <div className="recommendation"><strong>{t.recommendation}</strong><p>{finding.recommendation}</p></div>
      <div className="evidence-list">
        {finding.evidence.map((citation, citationIndex) => (
          <EvidenceCard
            assets={assets.filter((asset) => asset.citationIndex === citationIndex)}
            citation={citation}
            key={`${citation.url}-${citationIndex}`}
            locale={locale}
            reportId={reportId}
          />
        ))}
      </div>
    </article>
  );
}

function EvidenceCard({ assets, citation, locale, reportId }: {
  assets: ReportEvidenceAssetRow[];
  citation: EvidenceCitation;
  locale: "en" | "zh";
  reportId: string;
}) {
  const t = copy[locale];
  const ready = assets.filter((asset) => asset.status === "ready");
  const primary = ready.find((asset) => asset.kind === "issue_crop")
    ?? ready.find((asset) => asset.kind === "compact")
    ?? ready.find((asset) => asset.kind === "viewport");
  const context = ready.find((asset) => asset.kind === "context");
  const capturedAt = primary?.capturedAt ?? assets[0]?.capturedAt;
  return (
    <figure className="evidence-card">
      <figcaption><span>{t.evidence}</span><blockquote>“{citation.quote}”</blockquote></figcaption>
      {primary ? (
        <div className={`evidence-images ${context ? "has-context" : ""}`}>
          <img src={`/api/reports/${reportId}/evidence/${primary.id}`} alt="Evidence screenshot" />
          {context ? <img className="context-image" src={`/api/reports/${reportId}/evidence/${context.id}`} alt="Page context" /> : null}
        </div>
      ) : <div className="evidence-unavailable">{t.unavailable}</div>}
      <div className="evidence-meta">
        <a href={citation.url}>{citation.url}</a>
        {citation.pageElement ? <span>{citation.pageElement}</span> : null}
        {capturedAt ? <time dateTime={capturedAt.toISOString()}>{t.captured}: {formatDate(capturedAt, locale)}</time> : null}
      </div>
    </figure>
  );
}

function SectionHeading({ number, title }: { number: string; title: string }) {
  return <div className="section-heading"><span>{number}</span><h2>{title}</h2></div>;
}

function SummaryList({ title, values }: { title: string; values: string[] }) {
  return <article><h3>{title}</h3><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></article>;
}

function Roadmap({ title, items }: { title: string; items: RoadmapItem[] }) {
  return <div className="roadmap-column"><h3>{title}</h3>{items.map((item) => <article key={item.title}><h4>{item.title}</h4><p>{item.rationale}</p><ul>{item.actions.map((action) => <li key={action}>{action}</li>)}</ul></article>)}</div>;
}

function humanize(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value: string | Date, locale: "en" | "zh") {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
