import type { CombinedPrivateReportArtifactModelV2 } from "@/report/artifact-model";

export function CombinedGeoReportV2Artifact({ model }: { model: CombinedPrivateReportArtifactModelV2 }) {
  const report = model.combinedReport;
  const discovery = report.providerDiscovery;
  const zh = model.locale === "zh";
  const strictA = discovery.strict.filter(({ tier }) => tier === "verified_full_chain");
  const strictB = discovery.strict.filter(({ tier }) => tier === "verified_core_segments");
  return <main className="recommendation-artifact combined-geo-artifact combined-geo-artifact-v2" data-artifact-revision={model.artifactRevisionId}>
    <nav className="artifact-actions no-print" aria-label="Report format"><a href={`/reports/${model.reportId}/report.html`}>HTML</a></nav>
    <header className="cover artifact-section">
      <p className="eyebrow">OPEN GEO CONSOLE · {zh ? "证据约束型 GEO 报告" : "Evidence-bound GEO report"}</p>
      <h1>{report.technicalFoundation.aiReport.organizationProfile.organizationName ?? report.targetUrl}</h1>
      <p className="lede">{zh ? "供应商能力按公开证据逐环节核验；未找到证据不等于没有能力。" : "Provider capabilities are verified stage by stage from public evidence; missing evidence does not prove absence."}</p>
      <dl className="cover-meta"><div><dt>{zh ? "证据截止" : "Evidence cutoff"}</dt><dd>{report.evidenceCutoffAt}</dd></div><div><dt>{zh ? "覆盖状态" : "Coverage"}</dt><dd>{coverage(discovery.execution.coverage, zh)}</dd></div></dl>
    </header>
    <section className="artifact-section"><h2>{zh ? "01 · 供应商发现执行摘要" : "01 · Provider discovery execution"}</h2><div className="score-grid">
      <Metric label={zh ? "业务问题" : "Business questions"} value={3}/>
      <Metric label={zh ? "计划查询" : "Planned queries"} value={discovery.execution.plannedQueries}/>
      <Metric label={zh ? "完成查询" : "Completed queries"} value={discovery.execution.completedQueries}/>
      <Metric label={zh ? "返回搜索结果" : "Returned observations"} value={discovery.execution.returnedObservations}/>
      <Metric label={zh ? "成功安全抓取页面" : "Safely retrieved pages"} value={discovery.execution.safelyRetrievedPages}/>
      <Metric label={zh ? "相关证据段落" : "Relevant passages"} value={discovery.execution.relevantPassages}/>
      <Metric label={zh ? "严格核验供应商" : "Strict providers"} value={discovery.execution.strictProviders}/>
      <Metric label={zh ? "候选供应商" : "Candidate providers"} value={discovery.execution.candidateProviders}/>
    </div></section>
    <ProviderTier title={zh ? "02 · 全链路自营已证实" : "02 · Verified full-chain operation"} providers={strictA} discovery={discovery} zh={zh}/>
    <ProviderTier title={zh ? "03 · 核心环节自营已证实" : "03 · Verified core segments"} providers={strictB} discovery={discovery} zh={zh}/>
    <section className="artifact-section"><h2>{zh ? "04 · 候选但证据不足" : "04 · Candidates with insufficient evidence"}</h2>{discovery.candidates.length === 0
      ? <p>{zh ? "当前没有仅凭线索保留的候选供应商。" : "No evidence-limited candidates remain."}</p>
      : <table><thead><tr><th>{zh ? "供应商" : "Provider"}</th><th>{zh ? "角色" : "Role"}</th><th>{zh ? "尚缺证明" : "Missing proof"}</th><th>{zh ? "参考来源" : "Reference sources"}</th></tr></thead><tbody>{discovery.candidates.map((provider) => <tr key={provider.entityId}><td>{provider.canonicalName}</td><td>{provider.policyRole}</td><td>{provider.missingProof.join(zh ? "；" : "; ")}</td><td>{evidenceDomains(provider.leadEvidenceIds, discovery.evidence).join(", ")}</td></tr>)}</tbody></table>}</section>
    <section className="artifact-section"><h2>{zh ? "05 · 业务问题的逐声明证据" : "05 · Claim-level evidence for business questions"}</h2>{report.businessQuestionAnswers.answers.map((answer) => <article key={answer.questionId} className="finding-card"><h3>{answer.purpose === "customer_region_fit" ? (zh ? "区域与客户适配" : "Region and customer fit") : (zh ? "采购与交付风险" : "Purchase and delivery risk")}</h3>{answer.claims.length === 0 ? <p className="muted">{zh ? "本次没有取得可直接支持结论的公开证据。" : "No direct public evidence was available to support a factual conclusion."}</p> : answer.claims.map((claim) => <div key={claim.claimId}><p>{claim.text}</p>{claim.limitation && <p className="muted">{claim.limitation}</p>}<ul>{claim.evidenceIds.map((id) => { const source = report.groundedAnswerEvidence.find((item) => item.evidenceId === id && item.subjectKey === claim.subjectKey); return source ? <li key={`${id}-${source.registrableDomain}`}><strong>{source.registrableDomain}</strong>：<span lang="">{clip(source.exactExcerpt)}</span></li> : null; })}</ul></div>)}</article>)}</section>
    <section className="artifact-section"><h2>{zh ? "06 · 方法限制" : "06 · Method limitations"}</h2><p>{discovery.limitation}</p><p>{zh ? "结论只反映证据截止时能够安全访问且通过相关性验证的公开资料，不构成实时报价、运力承诺或采购背书。" : "Conclusions reflect only safely accessible, relevance-validated public evidence at the cutoff; they are not real-time pricing, capacity commitments, or procurement endorsements."}</p></section>
  </main>;
}

function ProviderTier({ title, providers, discovery, zh }: { title: string; providers: CombinedPrivateReportArtifactModelV2["combinedReport"]["providerDiscovery"]["strict"]; discovery: CombinedPrivateReportArtifactModelV2["combinedReport"]["providerDiscovery"]; zh: boolean }) {
  return <section className="artifact-section"><h2>{title}</h2>{providers.length === 0
    ? <p>{zh ? "本次公开证据中没有供应商达到该严格等级。" : "No provider reached this strict tier in the reviewed public evidence."}</p>
    : <table><thead><tr><th>{zh ? "供应商" : "Provider"}</th><th>{zh ? "服务与线路" : "Services and routes"}</th><th>{zh ? "环节能力" : "Stage capabilities"}</th><th>{zh ? "证据" : "Evidence"}</th></tr></thead><tbody>{providers.map((provider) => <tr key={provider.entityId}><td>{provider.canonicalName}<br/><small>{provider.policyRole}</small></td><td>{[...provider.serviceScope, ...provider.routeScope].join(zh ? "；" : "; ") || (zh ? "未知" : "Unknown")}</td><td><ul>{provider.capabilities.map((capability) => <li key={capability.dimensionId}>{capability.dimensionId}: <strong>{state(capability.state, zh)}</strong>{capability.contradictory ? ` (${zh ? "存在冲突" : "conflicting evidence"})` : ""}</li>)}</ul></td><td>{provider.evidenceIds.map((id) => { const source = discovery.evidence.find((item) => item.evidenceId === id); return source ? <details key={id}><summary>{source.registrableDomain} · {source.capability}</summary><p>{source.title} · {source.sourceAuthority} · {source.observedAt}</p><blockquote lang="">{clip(source.exactExcerpt)}</blockquote></details> : null; })}</td></tr>)}</tbody></table>}</section>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="score-card"><strong>{value}</strong><span>{label}</span></div>; }
function clip(value: string) { return value.length > 300 ? `${value.slice(0, 297)}…` : value; }
function evidenceDomains(ids: readonly string[], sources: readonly { evidenceId: string; registrableDomain: string }[]) { return [...new Set(ids.flatMap((id) => sources.filter((source) => source.evidenceId === id).map(({ registrableDomain }) => registrableDomain)))]; }
function coverage(value: string, zh: boolean) { return value === "complete" ? (zh ? "完整" : "Complete") : value === "partial" ? (zh ? "部分" : "Partial") : (zh ? "不足" : "Insufficient"); }
function state(value: string, zh: boolean) { const map: Record<string, [string, string]> = { self_operated: ["自营", "Self-operated"], dedicated_controlled: ["专属受控", "Dedicated controlled"], owned: ["自有", "Owned"], dedicated_charter: ["专属包机", "Dedicated charter"], partner: ["合作方", "Partner"], mixed: ["混合", "Mixed"], unknown: ["未知", "Unknown"], verified: ["已核验", "Verified"], unverified: ["未核验", "Unverified"], in_house_licensed: ["自有持牌", "In-house licensed"], managed_partner: ["受管理合作方", "Managed partner"], no_outsourcing_verified: ["已核验无外包", "No outsourcing verified"], outsourcing_present: ["存在外包", "Outsourcing present"] }; return (map[value] ?? [value, value])[zh ? 0 : 1]; }
