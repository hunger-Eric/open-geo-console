/* eslint-disable @next/next/no-img-element -- authorized evidence must remain printable from the canonical artifact */
import type { RecommendationPrivateReportArtifactModel } from "@/report/artifact-model";

const labels = {
  en: {
    privateReport: "PRIVATE RECOMMENDATION FORENSIC REPORT", html: "HTML report", pdf: "PDF report",
    verdict: "Executive verdict", questions: "Market questions", matrix: "Multi-engine observation matrix",
    entities: "Recommended and competing entities", chain: "Owned and third-party citation chains",
    gaps: "Customer vs competitor gaps", provenance: "Certification and methodology provenance",
    grades: "Evidence grades", blind: "Homepage vs full-site blind spots", priorities: "Three priority investments",
    vendor: "Independent vendor task package", appendix: "Website foundation appendix", unknown: "Unknown",
    observed: "Observed", noRecommendation: "No recommendation", unavailable: "Unavailable",
    acceptance: "Acceptance criteria", actions: "Required deliverables", retest: "Fixed retest questions",
    limitations: "Methodology and limitations", coverage: "Coverage context"
  },
  zh: {
    privateReport: "私密 AI 推荐取证报告", html: "HTML 报告", pdf: "PDF 报告",
    verdict: "老板结论", questions: "高意图市场问题", matrix: "多引擎观察矩阵",
    entities: "推荐与竞争对象", chain: "官网与第三方引用链", grades: "证据等级",
    gaps: "客户与竞争对象差距", provenance: "认证与方法溯源",
    blind: "首页与全站盲区", priorities: "三项优先投入", vendor: "独立供应商任务包",
    appendix: "网站基础附录", unknown: "未知", observed: "已观察", noRecommendation: "未返回推荐",
    unavailable: "不可用", acceptance: "验收标准", actions: "交付动作", retest: "固定复测问题",
    limitations: "方法与限制", coverage: "覆盖上下文"
  }
} as const;

export function RecommendationReportArtifact({ model }: { model: RecommendationPrivateReportArtifactModel }) {
  const t = labels[model.locale];
  const report = model.recommendationReport;
  const succeeded = report.answerSnapshotMatrix.cells.filter((cell) => cell.status === "succeeded");
  const providers = new Set(report.answerSnapshotMatrix.cells.map(({ surface }) => `${surface.providerId}/${surface.productId}/${surface.modelId}`));
  const gradeByCitation = new Map(report.evidenceGrades.map((grade) => [grade.citationSourceId, grade.grade]));
  const questions = new Map(report.generatedQuestions.questions.map((question) => [question.id, question]));

  return (
    <main className="recommendation-artifact">
      <nav className="artifact-actions no-print" aria-label="Report formats">
        <a href={`/reports/${model.reportId}/recommendation-report.html`}>{t.html}</a>
        <a className="primary" href={`/api/reports/${model.reportId}/artifacts/recommendation-report.pdf`}>{t.pdf}</a>
      </nav>

      <header className="cover forensic-cover artifact-section">
        <p className="eyebrow">OPEN GEO CONSOLE · {t.privateReport}</p>
        <h1>{report.websiteFoundationAppendix.organizationProfile.organizationName ?? report.targetUrl}</h1>
        <p className="verdict-copy">{report.executiveVerdict.summary}</p>
        <div className="verdict-status" aria-label={t.verdict}>
          <strong>{mentionText(report.executiveVerdict.customerMentioned, model.locale)}</strong>
          <span>{report.executiveVerdict.primaryGap}</span>
        </div>
        <dl className="cover-meta">
          <div><dt>URL</dt><dd>{report.targetUrl}</dd></div>
          <div><dt>{t.coverage}</dt><dd>{succeeded.length}/{report.answerSnapshotMatrix.cells.length} cells · {providers.size} engines · {report.generatedQuestions.questions.length} questions</dd></div>
          <div><dt>Region / time</dt><dd>{report.provenanceAndLimitations.region} · {formatDate(report.provenanceAndLimitations.generatedAt, model.locale)}</dd></div>
        </dl>
      </header>

      <section className="artifact-section" id="questions">
        <Heading number="01" title={t.questions} />
        <ol className="question-list">{report.generatedQuestions.questions.map((question) => (
          <li key={question.id}><strong>{question.exactText}</strong><p>{question.inferenceBasis.join(" · ")}</p></li>
        ))}</ol>
      </section>

      <section className="artifact-section" id="matrix">
        <Heading number="02" title={t.matrix} />
        <p className="table-summary">{matrixSummary(succeeded.length, report.answerSnapshotMatrix.cells.length, providers.size, report.generatedQuestions.questions.length, model.locale)}</p>
        <div className="table-scroll"><table>
          <caption>{model.locale === "zh" ? "每个问题与每个实际执行表面的观察结果；未知与失败不会被隐藏。" : "Observed result for every question and executed surface; Unknown and failures remain visible."}</caption>
          <thead><tr><th scope="col">{model.locale === "zh" ? "问题" : "Question"}</th><th scope="col">{model.locale === "zh" ? "表面" : "Surface"}</th><th scope="col">{model.locale === "zh" ? "结果" : "Outcome"}</th><th scope="col">{model.locale === "zh" ? "答案快照" : "Answer snapshot"}</th><th scope="col">{model.locale === "zh" ? "来源" : "Sources"}</th></tr></thead>
          <tbody>{report.answerSnapshotMatrix.cells.map((cell) => (
            <tr key={cell.id}>
              <th scope="row">{questions.get(cell.questionId)?.exactText ?? cell.questionId}</th>
              <td>{cell.surface.providerId}<br/><small>{cell.surface.productId} / {cell.surface.modelId}<br/>{cell.surface.collectionSurface} · {cell.surface.region}</small></td>
              <td>{cell.status === "failed" ? `${t.unknown}: ${cell.errorClass}` : cell.recommendationOutcome === "no_recommendation" ? t.noRecommendation : t.observed}</td>
              <td>{cell.status === "succeeded" ? cell.answerText : t.unavailable}</td>
              <td>{cell.status === "succeeded" ? `${cell.sources.length} / ${cell.sources.length}` : `0 / 0`}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="artifact-section" id="entities">
        <Heading number="03" title={t.entities} />
        {report.recommendedEntities.length ? <div className="entity-list">{report.recommendedEntities.map((entity) => (
          <article key={entity.entityId} className="entity-row">
            <div><h3>{entity.name}</h3><p>{entity.registrableDomain ?? t.unknown} · {resolutionText(entity.resolution.status, model.locale)}</p></div>
            <ul>{entity.signals.map((signal) => <li key={`${signal.cellId}-${signal.supportingQuote}`}><strong>{signal.kind}</strong> — “{signal.supportingQuote}”</li>)}</ul>
          </article>
        ))}</div> : <p>{t.unknown}</p>}
        <h3>{t.gaps}</h3>
        {report.customerVsCompetitorGaps.length ? <div className="gap-list">{report.customerVsCompetitorGaps.map((gap) => (
          <article key={gap.id} className="gap-row"><h4>{gap.title}</h4><p>{gap.rationale}</p><dl><div><dt>{model.locale === "zh" ? "来源模式" : "Source pattern"}</dt><dd>{gap.sourcePattern}</dd></div><div><dt>{model.locale === "zh" ? "建议动作" : "Suggested action"}</dt><dd>{gap.suggestedAction}</dd></div><div><dt>{model.locale === "zh" ? "证据分母" : "Evidence denominator"}</dt><dd>{gap.evidenceCellIds.length} cell(s) · {gap.competitorEntityIds.length} entity/entities</dd></div></dl></article>
        ))}</div> : <p>{t.unknown}</p>}
      </section>

      <section className="artifact-section" id="citation-chain">
        <Heading number="04" title={t.chain} />
        <p className="table-summary">{sourceSummary(report.sourceCategoryBreakdown, model.locale)}</p>
        <div className="table-scroll"><table><caption>{model.locale === "zh" ? "所有来源类别及其实际citation ID。" : "Every observed source category and its exact citation IDs."}</caption><thead><tr><th scope="col">{model.locale === "zh" ? "类别" : "Category"}</th><th scope="col">{model.locale === "zh" ? "数量" : "Count"}</th><th scope="col">Citation IDs</th></tr></thead><tbody>{report.sourceCategoryBreakdown.map((row) => <tr key={row.category}><th scope="row">{row.category}</th><td>{row.sourceCount}</td><td>{row.citationSourceIds.join(", ") || t.unknown}</td></tr>)}</tbody></table></div>
        <h3>{t.grades}</h3>
        <ul className="grade-legend">
          <li><strong>A</strong> — {model.locale === "zh" ? "直接支持：可访问来源与精确答案映射。" : "Direct support: retrievable source with precise answer mapping."}</li>
          <li><strong>B</strong> — {model.locale === "zh" ? "强关联：来源支持对象与能力，但无精确句子映射。" : "Strong association: source supports the entity and capability without precise sentence mapping."}</li>
          <li><strong>C</strong> — {model.locale === "zh" ? "重复模式：跨问题或表面重复出现，仅用于优先级。" : "Repeated pattern across questions or surfaces; used for prioritization only."}</li>
          <li><strong>D</strong> — {model.locale === "zh" ? "未知：来源不可用、身份歧义或没有可检查证据。" : "Unknown: unavailable source, ambiguous identity, or no inspectable evidence."}</li>
        </ul>
        <div className="citation-list">{report.citationSources.map((source) => (
          <article className="citation-row" key={source.id}>
            <div className="grade-mark" aria-label={`${t.grades}: ${gradeByCitation.get(source.id) ?? "D"}`}>{gradeByCitation.get(source.id) ?? "D"}</div>
            <div><p className="citation-category">{source.category} · #{source.providerOrder + 1}</p><h3><a href={source.url}>{source.title}</a></h3>
              <p>{source.retrieval.verifiedExcerpt ?? `${t.unknown}: ${source.retrieval.state}`}</p>
              <small>{model.locale === "zh" ? "观察到的引用关联；不表示该来源导致排序。" : "Observed citation association; this does not mean the source caused a ranking."}</small>
            </div>
          </article>
        ))}</div>
      </section>

      <section className="artifact-section" id="blind-spots">
        <Heading number="05" title={t.blind} />
        <div className="comparison-grid"><article><h3>{model.locale === "zh" ? "AI 第一印象（首页）" : "AI first impression (homepage)"}</h3><p>{report.homepageVsFullSiteBlindSpot.homepageSummary}</p></article><article><h3>{model.locale === "zh" ? "完整站点表达" : "Full-site expression"}</h3><p>{report.homepageVsFullSiteBlindSpot.fullSiteSummary}</p></article></div>
        <DetailList title={model.locale === "zh" ? "遗漏" : "Omissions"} values={report.homepageVsFullSiteBlindSpot.omissions} unknown={t.unknown} />
        <DetailList title={model.locale === "zh" ? "矛盾" : "Contradictions"} values={report.homepageVsFullSiteBlindSpot.contradictions} unknown={t.unknown} />
        <DetailList title={model.locale === "zh" ? "置信变化" : "Confidence changes"} values={report.homepageVsFullSiteBlindSpot.confidenceChanges} unknown={t.unknown} />
        <DetailList title={model.locale === "zh" ? "盲区限制" : "Blind-spot limitations"} values={report.homepageVsFullSiteBlindSpot.limitations} unknown={t.unknown} />
      </section>

      <section className="artifact-section" id="priorities">
        <Heading number="06" title={t.priorities} />
        <div className="priority-grid">{report.executivePriorities.map((priority) => <article key={priority.order}><span>0{priority.order}</span><h3>{priority.title}</h3><p>{priority.rationale}</p><small>{priority.evidenceCellIds.length} answer cell(s) + {priority.websiteFindingIds.length} website finding(s)</small></article>)}</div>
      </section>

      <section className="artifact-section vendor-package" id="vendor-package">
        <Heading number="07" title={t.vendor} />
        {report.vendorTaskPackage.tasks.map((task) => <article className="vendor-task" key={task.id}>
          <p className="citation-category">{task.vendor}</p><h3>{task.title}</h3><p>{task.rationale}</p>
          <div className="vendor-columns"><div><h4>{t.actions}</h4><ul>{task.actions.map((action) => <li key={action}>{action}</li>)}</ul></div><div><h4>{t.acceptance}</h4><ul>{task.acceptanceCriteria.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
          <h4>{t.retest}</h4><ol>{task.retestQuestionIds.map((id) => <li key={id}>{questions.get(id)?.exactText ?? id}</li>)}</ol>
          <p className="evidence-refs"><strong>{model.locale === "zh" ? "结构化证据引用" : "Structured evidence references"}:</strong> cells [{task.evidenceCellIds.join(", ")}] · findings [{task.websiteFindingIds.join(", ") || t.unknown}] · citations [{task.citationSourceIds.join(", ") || t.unknown}] · gaps [{task.gapIds.join(", ") || t.unknown}]</p>
        </article>)}
      </section>

      <section className="artifact-section appendix" id="website-foundation">
        <Heading number="08" title={t.appendix} />
        <p>{report.websiteFoundationAppendix.executiveSummary.overview}</p>
        <div className="foundation-scores">{report.websiteFoundationAppendix.dimensionScores.map((score) => <article key={score.dimension}><strong>{score.score}/100</strong><h3>{humanize(score.dimension)}</h3><p>{score.explanation}</p></article>)}</div>
        {report.websiteFoundationAppendix.findings.map((finding) => <article className="foundation-finding" key={finding.id}><h3>{finding.title}</h3><p>{finding.impact}</p><p><strong>{model.locale === "zh" ? "建议" : "Recommendation"}:</strong> {finding.recommendation}</p>{model.evidenceAssets.filter((asset) => asset.findingId === finding.id && asset.status === "ready").slice(0, 1).map((asset) => <img key={asset.id} src={`/api/reports/${model.reportId}/evidence/recommendation/${asset.id}`} alt={model.locale === "zh" ? `网站证据：${finding.title}` : `Website evidence: ${finding.title}`} />)}</article>)}
        <h3>{model.locale === "zh" ? "网站基础路线图" : "Website foundation roadmap"}</h3>
        <div className="roadmap-grid"><RoadmapColumn title={model.locale === "zh" ? "立即" : "Immediate"} items={report.websiteFoundationAppendix.roadmap.immediate} /><RoadmapColumn title={model.locale === "zh" ? "下一阶段" : "Next phase"} items={report.websiteFoundationAppendix.roadmap.nextPhase} /><RoadmapColumn title={model.locale === "zh" ? "持续" : "Ongoing"} items={report.websiteFoundationAppendix.roadmap.ongoing} /></div>
        <h3>{model.locale === "zh" ? "确定性技术审计" : "Deterministic technical audit"}</h3>
        <p><strong>{model.locale === "zh" ? "技术分数" : "Technical score"}: {model.technicalReport.score}/100</strong> · {model.technicalReport.pages.length} page(s) · {model.technicalReport.findings.length} finding(s)</p>
        <div className="table-scroll"><table><caption>{model.locale === "zh" ? "技术审计实际页面分母。" : "Actual page denominator for the technical audit."}</caption><thead><tr><th scope="col">URL</th><th scope="col">HTTP</th><th scope="col">H1</th><th scope="col">JSON-LD</th></tr></thead><tbody>{model.technicalReport.pages.map((page) => <tr key={page.url}><th scope="row">{page.url}</th><td>{page.status}</td><td>{page.h1.length}</td><td>{page.hasJsonLd ? "Yes" : "No"}</td></tr>)}</tbody></table></div>
        <ul>{model.technicalReport.findings.map((finding) => <li key={finding.id}><strong>{finding.title}</strong> — {finding.description} <em>{finding.recommendation}</em></li>)}</ul>
        <h3>{t.limitations}</h3><ul>{report.provenanceAndLimitations.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p>{report.provenanceAndLimitations.methodology}</p>
      </section>

      <section className="artifact-section appendix" id="provenance">
        <Heading number="09" title={t.provenance} />
        <dl className="provenance-grid"><div><dt>{model.locale === "zh" ? "认证authority" : "Certification authority"}</dt><dd>{report.provenanceAndLimitations.certificationAuthorityVersion} · {report.provenanceAndLimitations.certificationCapturedAt}</dd></div><div><dt>{model.locale === "zh" ? "来源分类authority" : "Source authority"}</dt><dd>{report.provenanceAndLimitations.sourceClassificationAuthorityVersion} · {report.provenanceAndLimitations.sourceClassificationCapturedAt}</dd></div><div><dt>{model.locale === "zh" ? "报告区域/时间" : "Report region/time"}</dt><dd>{report.provenanceAndLimitations.region} · {report.provenanceAndLimitations.generatedAt}</dd></div></dl>
        <h3>{model.locale === "zh" ? "实际认证表面与证据引用" : "Executed certified surfaces and evidence references"}</h3>
        {report.provenanceAndLimitations.certificationProvenance.length ? <ul>{report.provenanceAndLimitations.certificationProvenance.map((item) => <li key={item.surfaceKey}><code>{item.surfaceKey}</code> — {item.evidenceReference}</li>)}</ul> : <p>{t.unknown}</p>}
        <h3>{t.limitations}</h3><ul>{report.provenanceAndLimitations.limitations.map((item) => <li key={item}>{item}</li>)}</ul><p>{report.provenanceAndLimitations.methodology}</p>
      </section>
    </main>
  );
}

function Heading({ number, title }: { number: string; title: string }) { return <div className="section-heading"><span>{number}</span><h2>{title}</h2></div>; }
function DetailList({ title, values, unknown }: { title: string; values: string[]; unknown: string }) { return <div className="detail-list"><h3>{title}</h3>{values.length ? <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul> : <p>{unknown}</p>}</div>; }
function RoadmapColumn({ title, items }: { title: string; items: RecommendationPrivateReportArtifactModel["recommendationReport"]["websiteFoundationAppendix"]["roadmap"]["immediate"] }) { return <div className="roadmap-column"><h3>{title}</h3>{items.map((item) => <article key={item.title}><h4>{item.title}</h4><p>{item.rationale}</p><ul>{item.actions.map((action) => <li key={action}>{action}</li>)}</ul></article>)}</div>; }
function formatDate(value: string, locale: "en" | "zh") { return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function humanize(value: string) { return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()); }
function mentionText(value: "yes" | "no" | "mixed" | "unknown", locale: "en" | "zh") { return locale === "zh" ? ({ yes: "客户被提及", no: "客户未被提及", mixed: "客户部分被提及", unknown: "客户提及未知" } as const)[value] : ({ yes: "Customer mentioned", no: "Customer not mentioned", mixed: "Customer mention is mixed", unknown: "Customer mention unknown" } as const)[value]; }
function resolutionText(value: string, locale: "en" | "zh") { return locale === "zh" ? ({ resolved: "已解析身份", ambiguous: "身份歧义", unresolved: "身份未知" } as Record<string,string>)[value] : value; }
function matrixSummary(success: number, total: number, engines: number, questions: number, locale: "en" | "zh") { return locale === "zh" ? `${engines} 个实际引擎表面 × ${questions} 个问题；${success}/${total} 个观察单元成功。` : `${engines} executed engine surfaces × ${questions} questions; ${success}/${total} observation cells succeeded.`; }
function sourceSummary(rows: Array<{ category: string; sourceCount: number }>, locale: "en" | "zh") { const summary = rows.map(({ category, sourceCount }) => `${category}: ${sourceCount}`).join(" · "); return locale === "zh" ? `提供商返回来源按实际分母统计：${summary || "无"}` : `Provider-returned sources by observed denominator: ${summary || "none"}`; }
