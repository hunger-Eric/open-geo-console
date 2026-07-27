# Free-Teaser V4 + Paid V3 Report Product Line — Design

Date: 2026-07-21
Status: approved by user

## Background and problem statement

The current product generates a narrow V4 report (3 questions + website
synthesis) as the paid deliverable, while the older V3 pipeline produced the
comprehensive report customers expect (technical analysis, per-page evidence,
public-source forensics, provider discovery, vendor task package, 90-day
roadmap). The V3 report's question chapter was also considered visually
cluttered: sources and diagnosis were scattered across sections instead of
being grouped with their question.

Approved product decisions:

1. The free report becomes a teaser built on the V4 contract: enough real
   content to prove value and create urgency, with the rest locked.
2. The paid deep report returns to the V3 comprehensive contract, keeping its
   chapter structure, with the question chapter reorganized so each answer is
   followed by only its own sources and its own per-question model diagnosis.
3. The per-question diagnosis uses the V4 diagnosis capability (3 observable
   factors + target gap + 3 prioritized actions), grafted into V3 fulfillment.

## 1. Product line

### Free report (V4 contract, teaser)

- Homepage technical score: total score and per-area ratings visible;
  detailed findings locked.
- AI-absence data: across the 3 generated buyer questions, how often the
  customer's brand appears in AI answers vs competitors (e.g. "your brand
  appears 0 times, competitors 5 times").
- Question 1 answered in full (proof of quality).
- Questions 2 and 3: titles visible, answers locked.
- Issue-list preview: titles of the N discovered issues visible, remediation
  locked.
- Paid CTA.

Locking is server-side: locked answers/diagnoses are never emitted into the
free HTML (no blur-over-content that leaks via source).

### Paid deep report (V3 contract)

- Full V3 chapter structure unchanged: technical analysis, per-page evidence,
  public-source forensics, provider discovery, vendor task package, 90-day
  roadmap, methodology.
- Question chapter reorganized per question: answer → sources belonging to
  that question (with verification badges) → that question's diagnosis card
  (3 observable factors + target gap + 3 prioritized actions).
- The paid report uses the SAME question set generated during the free flow;
  question 1's answer carries over consistently.

## 2. Interaction flow and free-tier generation

User-visible flow has exactly three steps: submit URL → view free teaser
report → decide to pay. Questions are auto-generated from the crawl; no
question-submission or confirmation step is required from the user, and no
"regenerate questions" option is offered in the free flow.

Automation order (changed from the current flow):

- Current: submit → free homepage audit → (only after payment) question
  generation.
- New: submit → admission crawl (existing, ~15-60 s after the frontier
  fixes) → auto-generate 3 buyer questions (1 model call) → auto-answer
  question 1 only (1 model call) → public-search observation fanout for the
  3 questions (powers the AI-absence data) → free teaser report.

Cost: roughly 2 model calls plus one search-observation round per free
report, bounded by the existing 2-sites-per-24h free limit. The AI-absence
data requires public-search observation in the free tier; this is new
free-tier cost, comparable to one paid report's search round.

## 3. Free-tier anti-abuse model

The threat is repeatedly regenerating free reports to harvest different
question sets and answers. The defense is idempotent binding, not content
determinism:

- Question sets are generated at most once per (site_key, locale): the free
  flow first looks up the persisted set and reuses it; a second generation
  call does not exist in the code path, so no alternate question set can
  ever be obtained for the same site and language.
- Question 1's answer is likewise generated once and reused; zero marginal
  model cost for repeat visits.
- Submitting a different site is bounded by the existing hard limit of 2
  distinct sites per rolling 24 hours; forced regeneration remains
  staging-only and is forbidden in production.
- After the 30-day free-trial expiry a site may produce one fresh free
  report (new question set allowed): a deliberate, bounded marketing cost of
  about 2 model calls + 1 search round per site per month.
- A different locale (zh/en) is a different question set, still covered by
  the per-site limits.

In short: for a given site and language the question set and the first
answer are generated exactly once; new free content requires a new site, and
site count is hard-capped.

## 4. Paid fulfillment (V3 + grafted diagnosis)

- Checkout creates V3 orders again (`recommendation_forensics_v1` /
  `public_search_source_forensics_v1`); the V4 order path remains for the
  free flow.
- V3 fulfillment reuses the existing, fully tested pipeline in
  `apps/web/src/worker/processor.ts` (`finalizeProviderDiscoveryCombinedJob`
  branch for `combined_geo_report_v3`).
- Per-question diagnosis is produced by the V4 diagnosis enhancer
  (`apps/web/src/worker/report-v4-diagnosis-enhancer.ts`) invoked once per
  question during V3 fulfillment (3 model calls), checkpointed for resumable
  recovery like the V4 path.
- The V3 contract gains an optional per-question `diagnosis` field, bound by
  hash to the question identity so the existing artifact-completeness and
  provenance checks (`assertCombinedV3HtmlCompleteness`, `engineProvenance`
  hash binding) keep passing fail-closed.

## 5. Presentation

- Free report page: new locked-block component (blur + lock icon + CTA) that
  renders only non-sensitive placeholder content; locked data absent from
  HTML.
- Paid report page: V3 renderer's question chapter becomes per-question unit
  cards (answer → own sources → own diagnosis). Other chapters untouched.
- report.html dispatch already supports V3; no route changes beyond the
  renderer.

## 6. Key engineering points

- Checkout route: restore V3 order creation alongside the V4 free path
  (`apps/web/src/app/api/reports/[id]/checkout/route.ts`,
  `apps/web/src/db/commercial-orders.ts`).
- Contract: optional per-question `diagnosis` in
  `packages/ai-report-engine/src/combined-geo-report-v3.ts` with parser +
  completeness updates in `apps/web/src/report/combined-artifact-readiness.tsx`.
- Diagnosis lineage: V3 fulfillment needs identity adaptation (V4 diagnosis
  checkpoints are keyed to V4 lineage); store diagnosis keyed to the V3
  question-set identity.
- Free-tier eligibility: AI-absence data reuses public-search-observer V2
  fanout; no V1 answer-engine-observer imports (frozen).
- Question-set continuity: the free flow's question set id is persisted on
  the report and reused by the paid V3 fulfillment instead of regenerating.

## 7. Verification

- Unit: diagnosis enhancer output contract inside V3 fulfillment; locked
  rendering emits no hidden content; question-set continuity (free question
  set id flows into paid job unchanged); contract parse/hash binding for the
  new diagnosis field.
- End-to-end on protected staging with https://shun-express.com/:
  free page shows all four teaser elements with Q2/Q3 locked → sandbox
  checkout and payment → V3 full report with per-question diagnosis →
  commercial outcome `completed` (no auto-refund) → report visible via
  staging-access.

## Out of scope

- No changes to production deployment or production data in this design
  (staging validation first; production rollout is a separate approval).
- No V4 contract expansion; V4 stays the free teaser contract.
- No changes to the 24-hour SLA/refund policy itself.
