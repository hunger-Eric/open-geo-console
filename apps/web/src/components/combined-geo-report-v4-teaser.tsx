import React, { type ReactNode } from "react";
import type {
  OpenGeoAnswerCardV3
} from "@open-geo-console/ai-report-engine";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { ARTIFACT_CSS } from "@/report/artifact-styles";

const TEASER_EXTRA_CSS = `
.report-shell{max-width:1120px;margin:0 auto;padding:32px;display:grid;gap:24px}
.report-v4-teaser .report-hero,.report-v4-teaser .report-section{background:var(--surface,#fffdf7);border:1px solid var(--line,#d9d8cf);border-radius:10px;padding:clamp(26px,5vw,54px)}
.technical-score-hero{display:flex;align-items:baseline;gap:8px;margin:18px 0 24px}
.score-big{font-size:64px;font-weight:800;line-height:1;color:var(--teal,#0c7a6d)}
.score-label{font-size:24px;color:var(--muted,#687570)}
.dimension-score-list{display:grid;gap:1px;background:var(--line,#d9d8cf);border:1px solid var(--line,#d9d8cf);border-radius:8px;overflow:hidden}
.dimension-row{display:grid;grid-template-columns:72px minmax(0,1fr);gap:20px;background:var(--surface,#fffdf7);padding:18px;align-items:center}
.dimension-row strong{color:var(--teal,#0c7a6d);font-family:ui-monospace,monospace;font-size:28px}
.dimension-row h4{margin:0;color:var(--forest,#173f37)}
.absence-summary{font-size:18px;line-height:1.7;color:var(--muted,#687570)}
.issue-title-list{display:grid;gap:12px;margin:18px 0 0;padding:0;list-style:none}
.issue-title-list li{border:1px solid var(--line,#d9d8cf);border-radius:8px;padding:16px;background:#fff}
.locked-remediation{margin-top:10px;color:var(--muted,#687570);font-size:14px}
.teaser-q1-card{border-top-color:var(--teal,#0c7a6d)}
.teaser-locked-card{border-top:4px solid var(--line,#d9d8cf);background:#fff;border-radius:6px;padding:clamp(22px,4vw,38px)}
.locked-content-placeholder{display:grid;place-items:center;gap:12px;padding:32px 18px;text-align:center;color:var(--muted,#687570)}
.lock-icon{font-size:32px}
.cta-inline{color:var(--teal,#0c7a6d);font-weight:700;text-decoration:underline;text-underline-offset:3px}
.teaser-cta-section{text-align:center;display:grid;place-items:center;gap:14px}
.teaser-cta-section p{color:var(--muted,#687570);max-width:560px}
.cta-button{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:var(--teal,#0c7a6d);color:#fff;font-weight:700;padding:14px 28px;text-decoration:none;transition:background .15s}
.cta-button:hover{background:var(--teal-strong,#0b635d)}
.model-diagnosis{border-top:1px solid var(--line,#d9d8cf);margin-top:24px;padding-top:20px}
.model-diagnosis h4{color:var(--forest,#173f37);margin:0 0 10px}
.model-diagnosis h5{color:var(--forest,#173f37);margin:16px 0 8px;font-size:14px}
.model-diagnosis ul,.model-diagnosis ol{margin:0;padding-left:20px}
.model-diagnosis li{margin:6px 0;font-size:14px;line-height:1.6}
.action-priority{color:var(--teal,#0c7a6d);font-weight:800;font-family:ui-monospace,monospace}
@media(max-width:760px){.report-shell{padding:14px}.dimension-row{grid-template-columns:52px minmax(0,1fr)}.score-big{font-size:48px}}
`;

export interface FreeTeaserModel {
  readonly reportId: string;
  readonly targetUrl: string;
  readonly locale: "en" | "zh";
  readonly generatedAt: string;
  readonly technicalReport: { score: number; findings: { id: string; title: string; description: string; recommendation: string }[] };
  readonly aiReport: AiWebsiteReportV1;
  readonly questionSet: ConfirmedBusinessQuestionSet;
  readonly q1AnswerCard: OpenGeoAnswerCardV3 | null;
  readonly brandMentionCount: number;
  readonly competitorMentionCount: number;
}

export function CombinedGeoReportV4Teaser({ model }: { readonly model: FreeTeaserModel }) {
  const copy = model.locale === "zh" ? ZH : EN;
  const questions = model.questionSet.questions;
  return <>
  <style dangerouslySetInnerHTML={{ __html: ARTIFACT_CSS + TEASER_EXTRA_CSS }} />
  <main className="report-shell report-v4-teaser" data-report-version="4-teaser" data-artifact-revision="free-teaser">
    <header className="report-hero answer-first-hero">
      <p className="eyebrow">{copy.kicker}</p>
      <h1>{copy.title}</h1>
      <p className="lede">{copy.introduction}</p>
      <dl className="metadata-grid">
        <Meta label={copy.target}>{model.targetUrl}</Meta>
        <Meta label={copy.generated}>{model.generatedAt}</Meta>
      </dl>
    </header>

    <section className="report-section executive-summary" data-executive-summary="true">
      <p className="section-index">01</p><h2>{copy.techScore}</h2>
      <div className="technical-score-hero">
        <span className="score-big">{model.technicalReport.score}</span>
        <span className="score-label">/100</span>
      </div>
      <div className="dimension-score-list">
        {model.aiReport.dimensionScores.map((score) => <article key={score.dimension} className="dimension-row">
          <strong>{score.score}</strong><div><h4>{score.dimension}</h4></div>
        </article>)}
      </div>
    </section>

    <section className="report-section" data-ai-absence="true">
      <p className="section-index">02</p><h2>{copy.aiAbsence}</h2>
      <p className="absence-summary">{copy.absenceSummary(model.brandMentionCount, model.competitorMentionCount)}</p>
    </section>

    <section className="report-section" data-issue-preview="true">
      <p className="section-index">03</p><h2>{copy.issuePreview}</h2>
      <ul className="issue-title-list">{model.technicalReport.findings.map((finding) => <li key={finding.id}>
        <strong>{finding.title}</strong>
        <p className="locked-remediation" data-locked-remediation="true">&#x1F512; {copy.remediationLocked}</p>
      </li>)}</ul>
    </section>

    <section className="report-section" data-answer-first-section="true">
      <p className="section-index">04</p><h2>{copy.customerQuestions}</h2>
      <div className="answer-card-list">
        {questions.map((question, index) => {
          if (index === 0 && model.q1AnswerCard) {
            return <TeaserQ1Card key={question.neutralPublicText} card={model.q1AnswerCard} question={question.neutralPublicText} locale={model.locale} copy={copy}/>;
          }
          return <TeaserLockedCard key={question.neutralPublicText} question={question.neutralPublicText} questionOrder={index + 1} copy={copy}/>;
        })}
      </div>
    </section>

    <section className="report-section teaser-cta-section" data-teaser-cta="true">
      <h2>{copy.ctaTitle}</h2>
      <p>{copy.ctaBody}</p>
      <a className="cta-button" href="#checkout">{copy.ctaButton}</a>
    </section>
  </main>
  </>;
}

function TeaserQ1Card({ card, question, locale, copy }: { card: OpenGeoAnswerCardV3; question: string; locale: "en" | "zh"; copy: Copy }) {
  return <article className="answer-card teaser-q1-card" data-open-geo-answer-card="true" data-question-order="1">
    <header className="answer-card-heading">
      <div><p className="eyebrow">{copy.question} 1</p><h3>{question}</h3></div>
      <p className={`answer-status answer-status-${card.status}`}>{statusLabel(card.status, locale === "zh")}</p>
    </header>
    {card.answerMode === "generative_search_v1"
      ? <>
          <p className="business-question-answer generated-answer" data-generative-answer={card.questionId}>{card.answerText}</p>
          {card.sources.length > 0 && <div className="answer-sources generative-answer-sources" data-generative-sources={card.questionId}>
            <h4>{copy.sources}</h4>
            {card.sources.map((source) => <article className="source-card" data-answer-source={source.sourceId} data-source-audit={source.retrievalStatus} key={source.sourceId}>
              <div className="source-content">
                <h5><a href={source.canonicalUrl}>{source.title}</a></h5>
                <p className={`source-audit-badge source-audit-${source.retrievalStatus}`}>{sourceStatusLabel(source.retrievalStatus, locale === "zh")}</p>
                <p className="source-url"><a href={source.canonicalUrl}>{source.canonicalUrl}</a></p>
                {source.citedText && <blockquote>{source.citedText}</blockquote>}
              </div>
            </article>)}</div>}
        </>
      : <div className="answer-prose">{card.sentences.filter((sentence) => sentence.kind !== "scope_note").map((sentence) => <p className="business-question-answer" key={sentence.sentenceId}>{sentence.text}</p>)}</div>}
    {card.diagnosis && <section className="model-diagnosis" data-question-diagnosis="true">
      <h4>{copy.questionDiagnosis}</h4>
      <p>{card.diagnosis.selectionSummary}</p>
      <h5>{copy.observableFactors}</h5>
      <ul>{card.diagnosis.observableFactors.map((factor, index) => <li key={index}>{factor.observation}</li>)}</ul>
      <h5>{copy.targetGap}</h5>
      <p>{card.diagnosis.targetGap}</p>
      <h5>{copy.recommendedActions}</h5>
      <ol>{card.diagnosis.recommendedActions.map((action) => <li key={action.priority}><span className="action-priority">{action.priority}</span> {action.action}</li>)}</ol>
    </section>}
  </article>;
}
function TeaserLockedCard({ question, questionOrder, copy }: { question: string; questionOrder: number; copy: Copy }) {
  return <article className="answer-card teaser-locked-card" data-locked-question="true" data-question-order={questionOrder}>
    <header className="answer-card-heading">
      <div><p className="eyebrow">{copy.question} {questionOrder}</p><h3>{question}</h3></div>
      <p className="answer-status locked">{copy.locked}</p>
    </header>
    <div className="locked-content-placeholder">
      <span className="lock-icon" aria-hidden="true">&#x1F512;</span>
      <p>{copy.lockedBody}</p>
      <a className="cta-inline" href={`#checkout`}>{copy.ctaInline}</a>
    </div>
  </article>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

interface Copy {
  kicker: string; title: string; introduction: string; target: string; generated: string;
  techScore: string; aiAbsence: string; absenceSummary: (brand: number, competitor: number) => string;
  issuePreview: string; remediationLocked: string; customerQuestions: string; question: string; locked: string; lockedBody: string; ctaInline: string;
  ctaTitle: string; ctaBody: string; ctaButton: string;
  sources: string; questionDiagnosis: string; observableFactors: string; targetGap: string; recommendedActions: string;
}

const EN: Copy = {
  kicker: "Free preview", title: "Your website's AI visibility snapshot", introduction: "See how your website appears to AI-generated answers — and what to fix.",
  target: "Audited website", generated: "Generated",
  techScore: "Technical score", aiAbsence: "AI answer presence",
  absenceSummary: (brand, competitor) => `Across 3 buyer questions, your brand appeared ${brand} time(s) while competitors appeared ${competitor} time(s).`,
  issuePreview: "Issue preview", remediationLocked: "Remediation is included in the full report.",
  customerQuestions: "Buyer questions", question: "Question", locked: "Locked", lockedBody: "Unlock the full answer with sources and diagnosis.", ctaInline: "Unlock full report",
  ctaTitle: "Get the complete analysis", ctaBody: "Unlock all 3 answers with sources, per-question diagnosis, and prioritized GEO actions.", ctaButton: "Unlock full report",
  sources: "Sources", questionDiagnosis: "Question diagnosis", observableFactors: "Observable factors", targetGap: "Target website gap", recommendedActions: "Recommended actions"
};

const ZH: Copy = {
  kicker: "免费预览", title: "你的官网 AI 可见性快照", introduction: "了解你的官网在 AI 生成答案中的表现，以及需要修复的问题。",
  target: "检测网站", generated: "生成时间",
  techScore: "技术评分", aiAbsence: "AI 答案存在感",
  absenceSummary: (brand, competitor) => `在 3 个买家问题中，你的品牌出现了 ${brand} 次，竞品出现了 ${competitor} 次。`,
  issuePreview: "问题清单预览", remediationLocked: "修复建议包含在完整报告中。",
  customerQuestions: "买家问题", question: "问题", locked: "已锁定", lockedBody: "解锁完整答案、来源和诊断。", ctaInline: "解锁完整报告",
  ctaTitle: "获取完整分析", ctaBody: "解锁全部 3 个问题的答案、来源、逐题诊断和优先 GEO 行动。", ctaButton: "解锁完整报告",
  sources: "本题来源", questionDiagnosis: "本题诊断", observableFactors: "可观察因素", targetGap: "目标官网差距", recommendedActions: "优先行动"
};

function statusLabel(status: string, zh: boolean): string {
  if (zh) return ({ answered: "已回答", source_limited: "来源有限", refused: "模型拒绝", limited: "有限", observed: "仅观察", unresolved: "未核验", insufficient: "证据不足" } as Record<string, string>)[status] ?? status;
  return ({ answered: "Answered", source_limited: "Sources limited", refused: "Refused", limited: "Limited", observed: "Observed", unresolved: "Unresolved", insufficient: "Insufficient" } as Record<string, string>)[status] ?? status;
}
function sourceStatusLabel(status: "verified_body" | "search_source_only" | "inaccessible", zh: boolean): string {
  return zh
    ? ({ verified_body: "正文已独立核验", search_source_only: "仅模型搜索来源", inaccessible: "当前无法访问" } as const)[status]
    : ({ verified_body: "Body independently verified", search_source_only: "Model search source only", inaccessible: "Currently inaccessible" } as const)[status];
}