import React, { type ReactNode } from "react";
import type {
  FreeV4DirectAnalysis,
  OpenGeoAnswerCardV3
} from "@open-geo-console/ai-report-engine";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { ARTIFACT_CSS } from "@/report/artifact-styles";

const TEASER_EXTRA_CSS = `
.report-shell{max-width:1180px;margin:0 auto;padding:28px;display:grid;gap:20px}
.report-v4-teaser{--teaser-soft:#eef5f1;--teaser-warm:#f5efe3;--teaser-ink:#173f37}
.report-v4-teaser .report-hero,.report-v4-teaser .report-section{background:var(--surface,#fffdf7);border:1px solid var(--line,#d9d8cf);border-radius:18px;padding:clamp(24px,4vw,46px);box-shadow:0 18px 50px -42px rgba(23,63,55,.55)}
.report-v4-teaser .report-hero{background:linear-gradient(135deg,#f8f5eb 0%,#edf5f0 72%,#dcebe4 100%);position:relative;overflow:hidden}
.report-v4-teaser .report-hero:after{background:var(--teal,#0c7a6d);border-radius:999px;content:"";height:180px;opacity:.08;position:absolute;right:-62px;top:-82px;width:180px}
.report-v4-teaser .answer-first-hero{grid-template-columns:minmax(0,1.65fr) minmax(250px,.75fr);column-gap:54px;align-items:end}
.report-v4-teaser .answer-first-hero>.metadata-grid{align-self:stretch;background:rgba(255,255,255,.68);border:1px solid rgba(23,63,55,.12);border-radius:14px;display:grid;grid-template-columns:minmax(0,1fr);gap:18px;padding:20px;position:relative;z-index:1}
.report-v4-teaser .answer-first-hero h1{font-size:clamp(38px,5.4vw,64px);max-width:760px}
.hero-actions{align-items:center;display:flex;flex-wrap:wrap;gap:14px;grid-column:1;margin-top:12px}
.hero-assurance{color:var(--muted,#687570);font-size:12px;font-weight:650;margin:0}
.cta-button{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:var(--teal,#0c7a6d);box-shadow:0 12px 25px -16px rgba(12,122,109,.9);color:#fff;font-weight:750;padding:14px 24px;text-decoration:none;transition:background .15s,transform .15s}
.cta-button:hover{background:var(--teal-strong,#0b635d);transform:translateY(-1px)}
.teaser-overview-grid{align-items:start;display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:20px}
.teaser-overview-grid .report-section{padding:clamp(24px,3vw,34px)}
.technical-score-layout{align-items:center;display:grid;grid-template-columns:150px minmax(0,1fr);gap:28px;margin-top:18px}
.technical-score-hero{align-items:baseline;display:flex;gap:6px;margin:0}
.score-big{font-size:64px;font-weight:800;line-height:1;color:var(--teal,#0c7a6d)}
.score-label{font-size:20px;color:var(--muted,#687570)}
.dimension-score-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.dimension-row{align-items:center;background:var(--teaser-soft);border-radius:10px;display:grid;gap:3px;grid-template-columns:44px minmax(0,1fr);padding:12px}
.dimension-row strong{color:var(--teal,#0c7a6d);font-family:ui-monospace,monospace;font-size:20px}
.dimension-row h4{color:var(--forest,#173f37);font-size:12px;line-height:1.35;margin:0}
.absence-figures{align-items:end;display:flex;gap:12px;margin:24px 0 14px}
.absence-figure{background:var(--teaser-soft);border-radius:12px;flex:1;padding:18px}
.absence-figure.competitor{background:var(--teaser-warm)}
.absence-figure strong{color:var(--forest,#173f37);display:block;font-size:38px;line-height:1}
.absence-figure span{color:var(--muted,#687570);font-size:11px;font-weight:750}
.absence-summary{font-size:15px;line-height:1.65;color:var(--muted,#687570);margin-bottom:0}
.semantic-outcome{background:var(--teaser-soft);border-radius:12px;display:grid;gap:10px;margin-top:20px;padding:20px}.semantic-outcome strong{color:var(--forest,#173f37);font-size:20px}.semantic-outcome p{color:var(--muted,#687570);line-height:1.65;margin:0}.semantic-outcome dl{display:grid;gap:8px;margin:0}.semantic-outcome dt{color:var(--muted,#687570);font-size:11px;font-weight:750}.semantic-outcome dd{color:var(--forest,#173f37);margin:0}
.technical-score-layout--solo{grid-template-columns:minmax(0,1fr);justify-items:start}
.semantic-outcome p{max-width:75ch}.semantic-outcome ul,.semantic-outcome ol{display:grid;gap:10px;list-style:none;margin:6px 0 0;max-width:88ch;padding:0}.semantic-outcome li{color:var(--muted,#687570);font-size:14px;line-height:1.7;padding-left:20px;position:relative}.semantic-outcome ul>li:before{background:var(--teal,#0c7a6d);border-radius:999px;content:"";height:6px;left:2px;position:absolute;top:9px;width:6px}.semantic-outcome ol{counter-reset:semantic-rec}.semantic-outcome ol>li{counter-increment:semantic-rec;padding-left:36px}.semantic-outcome ol>li:before{align-items:center;background:var(--teal,#0c7a6d);border-radius:999px;color:#fff;content:counter(semantic-rec,decimal-leading-zero);display:flex;font-family:ui-monospace,monospace;font-size:10px;font-weight:800;height:22px;justify-content:center;left:0;position:absolute;top:1px;width:22px}
.report-v4-teaser .executive-summary{position:sticky;top:20px}
.teaser-proof-section>h2{max-width:800px}
.teaser-q1-card{background:#fff;border:1px solid var(--line,#d9d8cf);border-top:5px solid var(--teal,#0c7a6d);border-radius:14px;padding:clamp(22px,4vw,38px);box-shadow:none}
.formatted-answer{color:#293b35;display:grid;font-size:16px;gap:14px;line-height:1.78;margin-top:4px}
.formatted-answer>*{margin:0}.formatted-answer h4{color:var(--forest,#173f37);font-size:18px;margin-top:8px}.formatted-answer ul,.formatted-answer ol{padding-left:22px}.formatted-answer li+li{margin-top:7px}
.teaser-sources{background:var(--paper,#f4f1e8);border-radius:14px;margin-top:28px;padding:clamp(18px,3vw,28px)}
.teaser-sources-heading{align-items:end;display:flex;justify-content:space-between;gap:16px;margin-bottom:14px}
.teaser-sources-heading h4{color:var(--forest,#173f37);font-size:17px;margin:0}.teaser-sources-heading p{color:var(--muted,#687570);font-size:12px;margin:0}
.teaser-source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.teaser-source-card{background:#fff;border:1px solid var(--line,#d9d8cf);border-radius:11px;display:block;min-width:0;padding:16px}
.teaser-source-card h5{font-size:14px;line-height:1.45;margin:0 0 10px}.teaser-source-card h5 a{color:var(--forest,#173f37)}
.teaser-source-meta{align-items:center;display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}.teaser-source-index{color:var(--teal,#0c7a6d);font-family:ui-monospace,monospace;font-size:11px;font-weight:800}.source-audit-badge{background:var(--teaser-soft);border-radius:999px;color:var(--teal,#0c7a6d);font-size:10px;font-weight:750;margin:0;padding:5px 8px}
.teaser-source-card .source-url{font-size:10px;margin:0}.teaser-source-card blockquote{border-left:2px solid #9bb9af;color:#56645f;display:-webkit-box;font-size:12px;line-height:1.6;margin:12px 0 0;overflow:hidden;padding:0 0 0 11px;-webkit-box-orient:vertical;-webkit-line-clamp:4}
.teaser-more-sources{border-top:1px solid var(--line,#d9d8cf);margin-top:18px;padding-top:16px}.teaser-more-sources:not([open])>.teaser-source-grid{display:none}.teaser-more-sources summary{color:var(--teal,#0c7a6d);cursor:pointer;font-size:13px;font-weight:750;list-style-position:inside}.teaser-more-sources[open] summary{margin-bottom:14px}
.teaser-diagnosis{background:linear-gradient(135deg,#173f37,#24584e);border-radius:14px;color:#f7fbf8;margin-top:28px;padding:clamp(22px,4vw,34px)}
.teaser-diagnosis .diagnosis-kicker{color:#9dd7c8;font-size:11px;font-weight:800;letter-spacing:.11em;margin:0 0 10px;text-transform:uppercase}.teaser-diagnosis h4{color:#fff;font-size:22px;margin:0 0 12px}.teaser-diagnosis-summary{color:#dceae5;font-size:15px;line-height:1.7;margin:0;max-width:850px}
.diagnosis-factor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:22px}.diagnosis-factor{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:15px}.diagnosis-factor span{color:#9dd7c8;font-family:ui-monospace,monospace;font-size:11px;font-weight:800}.diagnosis-factor p{font-size:13px;line-height:1.6;margin:8px 0 0}
.diagnosis-gap{background:#f2eadb;border-radius:10px;color:#29473f;margin-top:12px;padding:16px}.diagnosis-gap strong{display:block;font-size:11px;letter-spacing:.06em;margin-bottom:6px;text-transform:uppercase}.diagnosis-gap p{font-size:14px;line-height:1.6;margin:0}
.diagnosis-actions{display:grid;gap:8px;margin-top:12px}.diagnosis-action{align-items:start;background:rgba(255,255,255,.09);border-radius:10px;display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;padding:13px}.action-priority{align-items:center;background:#9dd7c8;border-radius:999px;color:#173f37;display:flex;font-family:ui-monospace,monospace;font-size:11px;font-weight:850;height:26px;justify-content:center;width:26px}.diagnosis-action p{font-size:13px;line-height:1.6;margin:2px 0 0}
.locked-question-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:22px}.teaser-locked-card{background:#fff;border:1px solid var(--line,#d9d8cf);border-top:4px solid #b7c3be;border-radius:12px;padding:22px}.teaser-locked-card .answer-card-heading h3{font-size:18px;margin-bottom:8px}.locked-content-placeholder{align-items:center;border-top:1px solid var(--line,#d9d8cf);color:var(--muted,#687570);display:grid;gap:8px;grid-template-columns:auto minmax(0,1fr);margin-top:10px;padding-top:16px}.locked-content-placeholder p{font-size:13px;margin:0}.lock-icon{font-size:20px}.cta-inline{color:var(--teal,#0c7a6d);font-size:12px;font-weight:750;text-decoration:underline;text-underline-offset:3px}
.issue-title-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:18px 0 0;padding:0;list-style:none}.issue-title-list li{background:#fff;border:1px solid var(--line,#d9d8cf);border-radius:10px;padding:15px}.issue-title-list strong{color:var(--forest,#173f37);font-size:14px}.locked-remediation{color:var(--muted,#687570);font-size:11px;margin:8px 0 0}
.teaser-cta-section{background:linear-gradient(135deg,#f4eee1,#e5f0ea)!important;text-align:center;display:grid;place-items:center;gap:12px}.teaser-cta-section p{color:var(--muted,#687570);max-width:620px;margin:0}
@media(max-width:900px){.teaser-overview-grid,.technical-score-layout{grid-template-columns:minmax(0,1fr)}.report-v4-teaser .answer-first-hero{column-gap:28px}.diagnosis-factor-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:760px){.report-shell{padding:12px;gap:12px}.report-v4-teaser .report-hero,.report-v4-teaser .report-section{border-radius:14px;padding:22px}.report-v4-teaser .answer-first-hero{grid-template-columns:minmax(0,1fr)}.report-v4-teaser .answer-first-hero>.metadata-grid{grid-column:1;grid-row:auto;margin-top:18px}.hero-actions{grid-column:1}.score-big{font-size:50px}.dimension-score-list,.teaser-source-grid,.locked-question-grid,.issue-title-list{grid-template-columns:minmax(0,1fr)}.teaser-source-card{padding:14px}.teaser-sources-heading{align-items:start;display:grid}.answer-card-heading{gap:8px}.formatted-answer{font-size:15px}.absence-figure strong{font-size:32px}}
`;

interface FreeTeaserModelBase {
  readonly reportId: string;
  readonly targetUrl: string;
  readonly locale: "en" | "zh";
  readonly generatedAt: string;
  readonly technicalReport: { score: number; findings: { id: string; title: string; description: string; recommendation: string }[] };
  readonly aiReport: AiWebsiteReportV1;
  readonly questionSet: ConfirmedBusinessQuestionSet;
  readonly q1AnswerCard: OpenGeoAnswerCardV3 | DirectQ1Core | null;
}

export type FreeTeaserModel = FreeTeaserModelBase & ({
  readonly directAnalysisStatus: "completed" | "incomplete";
  readonly directAnalysis: FreeV4DirectAnalysis | null;
  readonly brandMentionCount?: never;
  readonly competitorMentionCount?: never;
} | {
  readonly directAnalysisStatus?: never;
  readonly directAnalysis?: never;
  readonly brandMentionCount: number;
  readonly competitorMentionCount: number;
});

export function CombinedGeoReportV4Teaser({ model }: { readonly model: FreeTeaserModel }) {
  const copy = model.locale === "zh" ? ZH : EN;
  const questions = model.questionSet.questions;
  const isDirect = model.directAnalysisStatus !== undefined;
  const checkoutEligible = !isDirect || model.directAnalysisStatus === "completed";
  return <>
  <style dangerouslySetInnerHTML={{ __html: ARTIFACT_CSS + TEASER_EXTRA_CSS }} />
  <main className="report-shell report-v4-teaser" data-report-version="4-teaser" data-artifact-revision="free-teaser">
    <header className="report-hero answer-first-hero">
      <p className="eyebrow">{copy.kicker}</p>
      <h1>{copy.title}</h1>
      <p className="lede">{copy.introduction}</p>
      {checkoutEligible ? <div className="hero-actions">
        <a className="cta-button" data-teaser-cta-position="early" href="#checkout">{copy.ctaButton}</a>
        <p className="hero-assurance">{copy.ctaAssurance}</p>
      </div> : null}
      <dl className="metadata-grid">
        <Meta label={copy.target}>{model.targetUrl}</Meta>
        <Meta label={copy.generated}><time dateTime={model.generatedAt}>{formatGeneratedAt(model.generatedAt, model.locale)}</time></Meta>
      </dl>
    </header>

    <div className="teaser-overview-grid">
      <section className="report-section executive-summary" data-executive-summary="true">
        <p className="section-index">01</p><h2>{copy.techScore}</h2>
        <div className={`technical-score-layout${model.aiReport.dimensionScores.length === 0 ? " technical-score-layout--solo" : ""}`}>
          <div className="technical-score-hero">
            <span className="score-big">{model.technicalReport.score}</span>
            <span className="score-label">/100</span>
          </div>
          {model.aiReport.dimensionScores.length > 0 ? <div className="dimension-score-list">
            {model.aiReport.dimensionScores.map((score) => <article key={score.dimension} className="dimension-row">
              <strong>{score.score}</strong><div><h4>{humanizeDimension(score.dimension)}</h4></div>
            </article>)}
          </div> : null}
        </div>
      </section>

      <section className="report-section" data-ai-absence="true">
        <p className="section-index">02</p><h2>{isDirect ? copy.q1SemanticOutcome : copy.aiAbsence}</h2>
        {isDirect ? <DirectAnalysis status={model.directAnalysisStatus} analysis={model.directAnalysis} copy={copy}/> : <>
          <div className="absence-figures" aria-label={copy.aiAbsence}>
            <div className="absence-figure"><strong>{model.brandMentionCount}</strong><span>{copy.brandMentions}</span></div>
            <div className="absence-figure competitor"><strong>{model.competitorMentionCount}</strong><span>{copy.competitorMentions}</span></div>
          </div>
          <p className="absence-summary">{copy.absenceSummary(model.brandMentionCount, model.competitorMentionCount)}</p>
        </>}
      </section>
    </div>

    <section className="report-section teaser-proof-section" data-answer-first-section="true">
      <p className="section-index">03</p><h2>{copy.customerQuestions}</h2>
      {model.q1AnswerCard
        ? <TeaserQ1Card card={model.q1AnswerCard} question={questions[0]!.neutralPublicText} locale={model.locale} copy={copy}/>
        : <TeaserLockedCard question={questions[0]!.neutralPublicText} questionOrder={1} copy={copy} showCta={checkoutEligible}/>
      }
      <div className="locked-question-grid">
        {questions.slice(1).map((question, index) => <TeaserLockedCard key={question.neutralPublicText} question={question.neutralPublicText} questionOrder={index + 2} copy={copy} showCta={checkoutEligible}/>)}
      </div>
    </section>

    <section className="report-section" data-issue-preview="true">
      <p className="section-index">04</p><h2>{copy.issuePreview}</h2>
      <ul className="issue-title-list">{model.technicalReport.findings.map((finding) => <li key={finding.id}>
        <strong>{finding.title}</strong>
        <p className="locked-remediation" data-locked-remediation="true">&#x1F512; {copy.remediationLocked}</p>
      </li>)}</ul>
    </section>

    {checkoutEligible ? <section className="report-section teaser-cta-section" data-teaser-cta="true">
      <h2>{copy.ctaTitle}</h2>
      <p>{copy.ctaBody}</p>
      <a className="cta-button" data-teaser-cta-position="final" href="#checkout">{copy.ctaButton}</a>
    </section> : null}
  </main>
  </>;
}

function DirectAnalysis({ status, analysis, copy }: {
  readonly status: "completed" | "incomplete";
  readonly analysis: FreeV4DirectAnalysis | null;
  readonly copy: Copy;
}) {
  if (status === "incomplete" || !analysis) {
    return <div className="semantic-outcome" data-direct-analysis-status="incomplete">
      <strong>{copy.analysisUnavailable}</strong><p>{copy.analysisUnavailableBody}</p>
    </div>;
  }
  return <div className="semantic-outcome" data-direct-analysis-status="completed">
    <strong>{copy.analysisComplete}</strong>
    <p>{analysis.summary}</p>
    {analysis.observations.length > 0 && <ul data-direct-observation-count={analysis.observations.length}>
      {analysis.observations.map((observation, index) => <li key={index}>{observation}</li>)}
    </ul>}
    {analysis.recommendations.length > 0 && <ol data-direct-recommendation-count={analysis.recommendations.length}>
      {analysis.recommendations.map((recommendation, index) => <li key={index}>{recommendation}</li>)}
    </ol>}
  </div>;
}

type DirectQ1Core = Omit<Extract<OpenGeoAnswerCardV3, { readonly answerMode: "generative_search_v1" }>, "geoDiagnosis" | "diagnosis">;

function TeaserQ1Card({ card, question, locale, copy }: { card: OpenGeoAnswerCardV3 | DirectQ1Core; question: string; locale: "en" | "zh"; copy: Copy }) {
  return <article className="answer-card teaser-q1-card" data-open-geo-answer-card="true" data-question-order="1">
    <header className="answer-card-heading">
      <div><p className="eyebrow">{copy.question} 1</p><h3>{question}</h3></div>
      <p className={`answer-status answer-status-${card.status}`}>{statusLabel(card.status, locale === "zh")}</p>
    </header>
    {card.answerMode === "generative_search_v1"
      ? <>
          <FormattedAnswer text={card.answerText} questionId={card.questionId}/>
          {card.refusal && <p className="business-question-answer" data-generative-refusal={card.refusal.code}>{card.refusal.reason}</p>}
          {card.sources.length > 0 && <TeaserSources card={card} locale={locale} copy={copy}/>
          }
        </>
      : <div className="answer-prose">{card.sentences.filter((sentence) => sentence.kind !== "scope_note").map((sentence) => <p className="business-question-answer" key={sentence.sentenceId}>{sentence.text}</p>)}</div>}
    {"diagnosis" in card && card.diagnosis && <section className="teaser-diagnosis" data-question-diagnosis="true">
      <p className="diagnosis-kicker">{copy.questionDiagnosis}</p>
      <h4>{copy.diagnosisSummary}</h4>
      <p className="teaser-diagnosis-summary">{card.diagnosis.selectionSummary}</p>
      <div className="diagnosis-factor-grid" data-observable-factor-count={card.diagnosis.observableFactors.length}>
        {card.diagnosis.observableFactors.map((factor, index) => <article className="diagnosis-factor" key={index}><span>0{index + 1}</span><p>{factor.observation}</p></article>)}
      </div>
      <div className="diagnosis-gap"><strong>{copy.targetGap}</strong><p>{card.diagnosis.targetGap}</p></div>
      <div className="diagnosis-actions" data-prioritized-action-count={card.diagnosis.recommendedActions.length}>
        {card.diagnosis.recommendedActions.map((action) => <article className="diagnosis-action" key={action.priority}><span className="action-priority">{action.priority}</span><p>{action.action}</p></article>)}
      </div>
    </section>}
  </article>;
}

type GenerativeCard = Extract<OpenGeoAnswerCardV3, { readonly answerMode: "generative_search_v1" }> | DirectQ1Core;
type TeaserSource = GenerativeCard["sources"][number];
const FEATURED_SOURCE_COUNT = 5;

function TeaserSources({ card, locale, copy }: { card: GenerativeCard; locale: "en" | "zh"; copy: Copy }) {
  const featured = card.sources.slice(0, FEATURED_SOURCE_COUNT);
  const remaining = card.sources.slice(FEATURED_SOURCE_COUNT);
  return <section className="teaser-sources generative-answer-sources" data-generative-sources={card.questionId}>
    <header className="teaser-sources-heading"><h4>{copy.sources}</h4><p>{copy.sourceCount(card.sources.length)}</p></header>
    <div className="teaser-source-grid">{featured.map((source, index) => <TeaserSourceCard key={source.sourceId} source={source} order={index + 1} locale={locale}/>)}</div>
    {remaining.length > 0 && <details className="teaser-more-sources" data-collapsed-source-count={remaining.length}>
      <summary>{copy.moreSources(remaining.length)}</summary>
      <div className="teaser-source-grid">{remaining.map((source, index) => <TeaserSourceCard key={source.sourceId} source={source} order={index + FEATURED_SOURCE_COUNT + 1} locale={locale}/>)}</div>
    </details>}
  </section>;
}

function TeaserSourceCard({ source, order, locale }: { source: TeaserSource; order: number; locale: "en" | "zh" }) {
  return <article className="teaser-source-card" data-answer-source={source.sourceId} data-source-audit={source.retrievalStatus}>
    <div className="teaser-source-meta"><span className="teaser-source-index">{String(order).padStart(2, "0")}</span><p className={`source-audit-badge source-audit-${source.retrievalStatus}`}>{sourceStatusLabel(source.retrievalStatus, locale === "zh")}</p></div>
    <h5><a href={source.canonicalUrl}>{source.title}</a></h5>
    <p className="source-url"><a href={source.canonicalUrl}>{source.canonicalUrl}</a></p>
    {source.citedText && <blockquote>{source.citedText}</blockquote>}
  </article>;
}

function FormattedAnswer({ text, questionId }: { text: string; questionId: string }) {
  const blocks = text.trim().split(/\n\s*\n/u).filter(Boolean);
  return <div className="business-question-answer generated-answer formatted-answer" data-generative-answer={questionId}>
    {blocks.map((block, index) => <AnswerBlock block={block} key={`${index}-${block.slice(0, 24)}`}/>)}
  </div>;
}

function AnswerBlock({ block }: { block: string }) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length > 0 && lines.every((line) => /^[-*]\s+/u.test(line))) {
    return <ul>{lines.map((line, index) => <li key={index}>{inlineAnswerText(line.replace(/^[-*]\s+/u, ""))}</li>)}</ul>;
  }
  if (lines.length > 0 && lines.every((line) => /^\d+[.)]\s+/u.test(line))) {
    return <ol>{lines.map((line, index) => <li key={index}>{inlineAnswerText(line.replace(/^\d+[.)]\s+/u, ""))}</li>)}</ol>;
  }
  const heading = lines.length === 1 ? /^(#{1,3})\s+(.+)$/u.exec(lines[0]!) : null;
  if (heading) return <h4>{inlineAnswerText(heading[2]!)}</h4>;
  return <p>{lines.map((line, index) => <React.Fragment key={index}>{index > 0 && <br/>}{inlineAnswerText(line)}</React.Fragment>)}</p>;
}

function inlineAnswerText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/u).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={index}>{part}</React.Fragment>
  );
}
function TeaserLockedCard({ question, questionOrder, copy, showCta }: { question: string; questionOrder: number; copy: Copy; showCta: boolean }) {
  return <article className="answer-card teaser-locked-card" data-locked-question="true" data-question-order={questionOrder}>
    <header className="answer-card-heading">
      <div><p className="eyebrow">{copy.question} {questionOrder}</p><h3>{question}</h3></div>
      <p className="answer-status locked">{copy.locked}</p>
    </header>
    <div className="locked-content-placeholder">
      <span className="lock-icon" aria-hidden="true">&#x1F512;</span>
      <p>{copy.lockedBody}</p>
      {showCta ? <a className="cta-inline" href="#checkout">{copy.ctaInline}</a> : null}
    </div>
  </article>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function formatGeneratedAt(value: string, locale: "en" | "zh"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function humanizeDimension(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

interface Copy {
  kicker: string; title: string; introduction: string; target: string; generated: string;
  techScore: string; aiAbsence: string; absenceSummary: (brand: number, competitor: number) => string;
  brandMentions: string; competitorMentions: string;
  q1SemanticOutcome: string; analysisComplete: string; analysisUnavailable: string; analysisUnavailableBody: string;
  issuePreview: string; remediationLocked: string; customerQuestions: string; question: string; locked: string; lockedBody: string; ctaInline: string;
  ctaTitle: string; ctaBody: string; ctaButton: string; ctaAssurance: string;
  sources: string; sourceCount: (count: number) => string; moreSources: (count: number) => string;
  questionDiagnosis: string; diagnosisSummary: string; targetGap: string;
}

const EN: Copy = {
  kicker: "Free preview", title: "Your website's AI visibility snapshot", introduction: "See how your website appears to AI-generated answers — and what to fix.",
  target: "Audited website", generated: "Generated",
  techScore: "Technical score", aiAbsence: "AI answer presence",
  absenceSummary: (brand, competitor) => `Across 3 buyer questions, your brand appeared ${brand} time(s) while competitors appeared ${competitor} time(s).`,
  brandMentions: "Your brand", competitorMentions: "Competitors",
  q1SemanticOutcome: "Q1 analysis", analysisComplete: "Analysis complete", analysisUnavailable: "Analysis unavailable",
  analysisUnavailableBody: "The Q1 answer and its sources completed successfully, but the separate analysis did not complete for this run.",
  issuePreview: "Issue preview", remediationLocked: "Remediation is included in the full report.",
  customerQuestions: "Buyer questions", question: "Question", locked: "Locked", lockedBody: "Unlock the full answer with sources and diagnosis.", ctaInline: "Unlock full report",
  ctaTitle: "Get the complete analysis", ctaBody: "Unlock all 3 answers with sources, per-question diagnosis, and prioritized GEO actions.", ctaButton: "Unlock full report", ctaAssurance: "One-time payment · report-specific access",
  sources: "Sources", sourceCount: (count) => `${count} sources checked`, moreSources: (count) => `View ${count} more sources`,
  questionDiagnosis: "Question diagnosis", diagnosisSummary: "What the evidence means", targetGap: "Target website gap"
};

const ZH: Copy = {
  q1SemanticOutcome: "Q1 分析", analysisComplete: "分析已完成", analysisUnavailable: "分析未完成",
  analysisUnavailableBody: "Q1 答案和来源已完成，但本次运行的独立分析未完成。",
  kicker: "免费预览", title: "你的官网 AI 可见性快照", introduction: "了解你的官网在 AI 生成答案中的表现，以及需要修复的问题。",
  target: "检测网站", generated: "生成时间",
  techScore: "技术评分", aiAbsence: "AI 答案存在感",
  absenceSummary: (brand, competitor) => `在 3 个买家问题中，你的品牌出现了 ${brand} 次，竞品出现了 ${competitor} 次。`,
  brandMentions: "你的品牌", competitorMentions: "竞品",
  issuePreview: "问题清单预览", remediationLocked: "修复建议包含在完整报告中。",
  customerQuestions: "买家问题", question: "问题", locked: "已锁定", lockedBody: "解锁完整答案、来源和诊断。", ctaInline: "解锁完整报告",
  ctaTitle: "获取完整分析", ctaBody: "解锁全部 3 个问题的答案、来源、逐题诊断和优先 GEO 行动。", ctaButton: "解锁完整报告", ctaAssurance: "一次性付款 · 报告专属访问",
  sources: "本题来源", sourceCount: (count) => `已核对 ${count} 个来源`, moreSources: (count) => `查看其余 ${count} 个来源`,
  questionDiagnosis: "本题诊断", diagnosisSummary: "这些证据说明什么", targetGap: "目标官网差距"
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
