import type {
  AiWebsiteReportV1,
  DimensionKey,
  EvidenceCitation,
  RoadmapItem
} from "@open-geo-console/ai-report-engine";
import { ArrowUpRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";

const DIMENSION_LABELS: Record<Locale, Record<DimensionKey, string>> = {
  en: {
    organizationClarity: "Organization clarity",
    informationArchitecture: "Information architecture",
    contentCitability: "Content and citability",
    trustEvidence: "Trust evidence",
    entityConsistency: "Entity consistency",
    geoUnderstandability: "GEO understandability"
  },
  zh: {
    organizationClarity: "企业表达清晰度",
    informationArchitecture: "信息架构",
    contentCitability: "内容与可引用性",
    trustEvidence: "信任与权威证据",
    entityConsistency: "实体一致性",
    geoUnderstandability: "GEO 可理解性"
  }
};

export function AiReportContent({
  dictionary,
  locale,
  report
}: {
  dictionary: Dictionary;
  locale: Locale;
  report: AiWebsiteReportV1;
}) {
  const findings = report.tier === "free" ? report.findings.slice(0, 1) : report.findings;
  const isDeep = report.tier === "deep";

  return (
    <div className="space-y-6">
      <section className="workspace-surface p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[var(--teal)]">
              <Sparkles aria-hidden="true" className="size-5" />
              <span className="text-sm font-semibold">
                {isDeep ? dictionary.aiReport.deepLabel : dictionary.aiReport.previewLabel}
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {report.organizationProfile.organizationName ?? dictionary.aiReport.organizationProfile}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{report.organizationProfile.summary}</p>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--muted)]">
              <ShieldCheck aria-hidden="true" className="size-4 text-[var(--teal)]" />
              {report.organizationProfile.identityConsistency}
            </p>
          </div>
          <div className="min-w-56 rounded-lg bg-[var(--subtle)] p-4 text-sm">
            <p className="font-semibold">{dictionary.aiReport.coverage}</p>
            <dl className="mt-3 space-y-2 text-[var(--muted)]">
              <SummaryValue
                label={isDeep
                  ? (locale === "zh" ? "发现 URL" : "URLs discovered")
                  : (locale === "zh" ? "检测 URL（未分析）" : "Detected URLs (not analyzed)")}
                value={report.coverage.discoveredPages}
              />
              <SummaryValue label={locale === "zh" ? "计划页面" : "Pages planned"} value={report.coverage.plannedPages} />
              <SummaryValue label={locale === "zh" ? "已分析" : "Pages analyzed"} value={report.coverage.analyzedPages} />
            </dl>
          </div>
        </div>
      </section>

      {!isDeep ? (
        <section className="workspace-surface border border-[var(--teal)]/20 p-6 sm:p-8">
          <h2 className="text-xl font-semibold">{dictionary.aiReport.homepagePreviewNotice}</h2>
          {report.coverage.discoveredPages > 1 ? (
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              {dictionary.aiReport.detectedPagesEstimate.replace("{count}", String(report.coverage.discoveredPages))}
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{dictionary.aiReport.lockedDeepFeatures}</p>
        </section>
      ) : null}

      {isDeep ? (
        <>
      <section className="workspace-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold">{dictionary.aiReport.executiveSummary}</h2>
        <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--muted)]">{report.executiveSummary.overview}</p>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <SummaryList title={locale === "zh" ? "优势" : "Strengths"} values={report.executiveSummary.strengths} />
          <SummaryList title={locale === "zh" ? "关键风险" : "Key risks"} values={report.executiveSummary.keyRisks} />
          <SummaryList title={locale === "zh" ? "最高优先级" : "Top priorities"} values={report.executiveSummary.topPriorities} />
        </div>
      </section>

        </>
      ) : null}

      {isDeep ? (
      <section className="workspace-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-5 sm:px-8">
          <h2 className="text-xl font-semibold">{dictionary.aiReport.aiDimensions}</h2>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3">
          {report.dimensionScores.map((dimension) => (
            <article key={dimension.dimension} className="border-b border-[var(--border)] p-6 md:border-r sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-semibold">{DIMENSION_LABELS[locale][dimension.dimension]}</h3>
                <span className="text-2xl font-semibold text-[var(--teal)]">{dimension.score}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{dimension.explanation}</p>
              <p className="mt-4 text-xs text-[var(--muted)]">
                {dictionary.aiReport.confidence}: {dimension.confidence}
              </p>
            </article>
          ))}
        </div>
      </section>
      ) : null}

      <section className="workspace-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-5 sm:px-8">
          <h2 className="text-xl font-semibold">{dictionary.aiReport.topFindings}</h2>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {findings.map((finding) => (
            <article key={finding.id} className="p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal)]">{finding.severity}</p>
                  <h3 className="mt-2 text-lg font-semibold">{finding.title}</h3>
                </div>
                <span className="text-xs text-[var(--muted)]">{dictionary.aiReport.confidence}: {finding.confidence}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{finding.impact}</p>
              <div className="mt-5 rounded-lg bg-[var(--subtle)] p-4">
                <p className="font-semibold">{finding.recommendation}</p>
                {finding.rewriteExample ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{finding.rewriteExample}</p> : null}
              </div>
              <EvidenceList dictionary={dictionary} evidence={finding.evidence} />
            </article>
          ))}
        </div>
      </section>

      {isDeep ? (
        <>
          <section className="workspace-surface overflow-hidden">
            <div className="border-b border-[var(--border)] px-6 py-5 sm:px-8">
              <h2 className="text-xl font-semibold">{dictionary.aiReport.pageTypes}</h2>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {report.pageTypeAnalyses.map((analysis) => (
                <article key={analysis.pageType} className="p-6 sm:p-8">
                  <h3 className="text-lg font-semibold">{analysis.pageType}</h3>
                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    <SummaryList title={locale === "zh" ? "共性问题" : "Common issues"} values={analysis.commonIssues} />
                    <SummaryList title={locale === "zh" ? "修改建议" : "Recommendations"} values={analysis.recommendations} />
                  </div>
                  <EvidenceList dictionary={dictionary} evidence={analysis.evidence} />
                </article>
              ))}
            </div>
          </section>

          <section className="workspace-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold">{dictionary.aiReport.roadmap}</h2>
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <RoadmapColumn title={locale === "zh" ? "立即修复" : "Immediate"} items={report.roadmap.immediate} />
              <RoadmapColumn title={locale === "zh" ? "下一阶段" : "Next phase"} items={report.roadmap.nextPhase} />
              <RoadmapColumn title={locale === "zh" ? "持续优化" : "Ongoing"} items={report.roadmap.ongoing} />
            </div>
          </section>
        </>
      ) : null}

      <section className="workspace-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold">{dictionary.aiReport.coverage}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {isDeep ? report.coverage.samplingMethod : dictionary.aiReport.homepagePreviewNotice}
        </p>
        {report.coverage.limitations.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            {report.coverage.limitations.map((limitation) => <li key={limitation}>— {limitation}</li>)}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between gap-4"><dt>{label}</dt><dd className="font-semibold text-[var(--foreground)]">{value}</dd></div>;
}

function SummaryList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
        {values.map((value) => <li key={value} className="flex gap-2"><CheckCircle2 aria-hidden="true" className="mt-1 size-4 shrink-0 text-[var(--teal)]" />{value}</li>)}
      </ul>
    </div>
  );
}

function EvidenceList({ dictionary, evidence }: { dictionary: Dictionary; evidence: EvidenceCitation[] }) {
  if (evidence.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold">{dictionary.aiReport.evidence}</p>
      <div className="mt-3 space-y-3">
        {evidence.map((item, index) => (
          <blockquote key={`${item.url}-${index}`} className="border-l-2 border-[var(--teal)] pl-4 text-sm leading-6 text-[var(--muted)]">
            <p>“{item.quote}”</p>
            <a href={item.url} target="_blank" rel="noreferrer" className="text-link mt-1 inline-flex break-all">
              {item.url}<ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>
          </blockquote>
        ))}
      </div>
    </div>
  );
}

function RoadmapColumn({ title, items }: { title: string; items: RoadmapItem[] }) {
  return (
    <div>
      <h3 className="font-semibold text-[var(--teal)]">{title}</h3>
      <div className="mt-4 space-y-5">
        {items.map((item) => (
          <article key={item.title}>
            <h4 className="font-semibold">{item.title}</h4>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{item.rationale}</p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
              {item.actions.map((action) => <li key={action}>— {action}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
