# AI Recommendation Forensic Report Design

Date: 2026-07-12  
Status: Approved product direction; implementation has not started.

## Goal

Reposition the paid Open GEO Console report from a technical GEO audit into a zero-configuration AI recommendation forensic report for Chinese companies selling internationally.

The product must answer, in business language:

1. How do answer engines understand this company?
2. Which competitors do they recommend for high-intent category questions?
3. Which owned and third-party sources appear in those recommendation chains?
4. What evidence or authority does the customer lack?
5. What should the customer's existing website, content, and communications vendors do next?

The one-line product promise is:

> Enter one website. Learn why AI recommends someone else, then hand your vendors a task package they can execute.

## Target Customer

The primary buyer is a Chinese export or international-growth company whose owner or marketing lead:

- does not have an internal GEO specialist;
- outsources most website, content, SEO, and communications work;
- needs a decision-ready explanation rather than another analytics dashboard;
- can authorize work but should not be expected to read code or understand GEO terminology.

Open GEO Console does not initially compete for enterprise AI-visibility teams that already operate large prompt sets, daily dashboards, and ongoing optimization programs.

## Competitive Position

Mention monitoring, citation tracking, source categorization, competitor gaps, earned-media opportunities, and technical crawlability audits are market-standard capabilities. They are necessary, but none is a defensible product claim by itself.

The product wedge is the combination of:

1. **Zero configuration:** one URL, no required prompt import, competitor list, project setup, account, or subscription.
2. **Completed judgment:** a private, board-readable report rather than a dashboard the customer must learn to interpret.
3. **Two-audience delivery:** an executive decision report for the buyer and a vendor-ready task package for implementers.
4. **Auditable evidence:** immutable answer snapshots, exact source metadata, evidence grades, and explicit uncertainty.
5. **Open and self-hostable foundations:** adapters, evidence contracts, and analysis can remain inspectable and privately operated.
6. **Future cross-market specialization:** compare how certified Chinese and international answer-engine surfaces portray the same export company, only after those provider surfaces pass capability, compliance, and reproducibility review.

This design does not claim that API snapshots are identical to consumer applications. Every report names the actual provider product, model, region, locale, and collection surface.

## Product Principles

- Start with an observable recommendation outcome, not a synthetic GEO score.
- Treat website quality as a controllable foundation, not the sole cause of recommendation visibility.
- Treat third-party citations and mentions as first-class evidence.
- Never turn correlation into a claim about an answer engine's private ranking algorithm.
- Do not require the buyer to supply a ground-truth company profile before seeing value.
- Do not ask the buyer to copy code or manage implementation.
- Keep provider failures, inaccessible sources, ambiguous entities, and unknown causes visible.
- Preserve the existing one-time order, private report, refund, and self-hostable boundaries.

## Non-Goals

This phase does not include:

- accounts, teams, projects, subscriptions, or daily monitoring dashboards;
- website development, code deployment, CMS administration, or implementation support;
- PR outreach, journalist contact, directory submission, community posting, or media buying;
- promises that a recommended action will produce an AI mention, citation, or ranking;
- browser scraping of consumer answer products without an approved, compliant collection contract;
- claiming that a model API response is the same as its related consumer application;
- external domain-ownership verification;
- automated publication of generated content or structured data.

## Core Concepts

### Answer Snapshot

An immutable observation of one question executed against one certified answer-engine surface. It records:

- the exact question and question category;
- the basis used to infer that question;
- provider, API product, model, locale, region, and execution time;
- returned answer text;
- mentioned organizations and products;
- order and context of recommendation language;
- provider-returned citations and sources;
- response and normalized-content hashes;
- provider request identifier and sanitized usage/cost metadata when available.

A later run creates a new snapshot. It never overwrites the old observation.

### Source Evidence

A normalized public source returned by an answer engine. It records URL, registrable domain, source category, retrieval time, status, title, short supporting excerpt, and content hash.

Source categories include:

- `owned_customer`;
- `owned_competitor`;
- `earned_editorial`;
- `directory_or_reference`;
- `community_or_ugc`;
- `institution`;
- `social`;
- `unknown`.

The source fetcher obeys robots policy, URL safety, redirect validation, content limits, and public-page boundaries. It does not bypass paywalls, login, bot challenges, or access controls.

### Recommendation Object

An organization, product, or service that the answer presents as a candidate, preferred choice, example, or direct recommendation. Mention alone does not imply recommendation. Entity resolution must preserve ambiguity instead of merging same-name entities without sufficient domain or context evidence.

### Citation Opportunity

A source, source category, topic, or evidence pattern that repeatedly supports relevant competitors while the customer is absent or weakly represented. It is an opportunity hypothesis, not a placement promise.

## Zero-Input Question Generation

The system generates three to five high-intent market questions from the customer's own public site evidence.

It uses:

- company and product category;
- target customer and use case;
- geography and language;
- pricing or purchase model when available;
- problems the site claims to solve.

Questions must be non-branded and resemble buyer decisions, such as category selection, solution comparison, supplier selection, or use-case suitability. Brand-defense and factual company questions may appear as a separate diagnostic set but do not count as market-recommendation questions.

When category inference is low confidence, the system uses broader category language and labels the limitation. It does not stop the first scan with a mandatory industry form. The private report may offer optional question editing for a future paid rerun, but this is not part of initial admission.

## Blind-Spot Comparison

The blind-spot feature is automatic and has two evidence layers:

1. **AI first impression:** infer the company from the submitted homepage and standard machine-readable assets.
2. **Full-site expression:** infer the company from eligible product, service, pricing, about, case-study, documentation, and contact evidence in the private deep crawl.

The report compares omissions, contradictions, confidence changes, hidden products, buried pricing, audience ambiguity, and entity inconsistency.

It must describe the result as a difference between first-impression evidence and fuller site evidence. It must not claim to know the company's real business beyond the public evidence. The buyer decides whether the generated profile is accurate.

## Evidence Grades

Every recommendation-attribution statement has one grade:

### Grade A — Direct evidence

The answer engine returns a source URL, the source is retrievable, and a verified excerpt directly supports a fact used in the recommendation context.

### Grade B — Strong association

The returned source clearly discusses the recommended object and relevant capability, but the provider does not expose a precise answer-to-source sentence mapping.

### Grade C — Repeated pattern

The same organization, evidence type, source category, or source repeatedly appears across questions, engines, or snapshots. This supports prioritization, not causal attribution.

### Grade D — Unknown

The source is inaccessible, the entity is ambiguous, the answer has no inspectable source, or the recommendation may rely on undisclosed model knowledge or signals.

The report may say that a source appeared in the observed recommendation chain. It may not say that a specific source caused a model to rank a company first.

## Provider Certification

An answer-engine adapter is certified only when it can pass a live protected-staging contract test for:

- explicit provider and model identity;
- current web-grounded answering;
- source or citation metadata;
- stable normalization into the snapshot contract;
- acceptable storage, display, and commercial-use terms;
- deterministic error classification;
- budget and timeout controls;
- no need to misrepresent a developer API as a consumer application.

As of the design review on 2026-07-12, Perplexity Sonar and OpenAI Web Search are the first certification candidates because their official developer documentation exposes web-grounded answers and source/citation metadata. DeepSeek and Doubao remain candidate adapters until the exact commercial surface, returned evidence, consumer/API distinction, and applicable service terms pass review.

Provider support is a runtime registry, not hard-coded marketing copy. A report lists only adapters that actually executed.

## User Journey

### Free Public Preview

The existing free boundary remains homepage-only for site content. The public preview contains:

- the AI first-impression company profile;
- homepage machine-readability findings;
- one verified AI finding from the existing report engine while capacity remains;
- optionally, one market question against one certified low-cost answer adapter while the separate answer-snapshot budget remains;
- only customer mention/citation outcome and broad gap type from that sample;
- a paid preview that may state the number of discovered competitor/source categories but does not disclose private names, excerpts, or actions.

The free sample uses only the provider-returned answer and source metadata. It does not crawl third-party source pages, persist private competitor excerpts, or weaken the existing rule that free site analysis fetches only the submitted homepage and standard assets. The sample is a budgeted conversion aid, not a guaranteed free entitlement. Technical-only and first-impression fallback remain truthful when its budget is exhausted.

### Paid Private Report

The paid report executes three to five questions against at least two certified answer-engine surfaces, then produces:

1. executive verdict;
2. answer snapshot matrix;
3. recommended organizations and products;
4. cited-source and source-category graph;
5. evidence-graded recommendation attribution;
6. third-party citation gap and opportunity map;
7. homepage-first-impression versus full-site blind-spot comparison;
8. website foundation findings;
9. executive priorities;
10. vendor-ready task package.

The canonical artifact remains private HTML with PDF exported from the same composition. Existing email, access-token, screenshot-evidence, and report-credit boundaries remain in force.

## Two-Audience Delivery

### Executive Decision Report

The main report leads with outcomes and avoids code. It answers:

- How does AI describe the company?
- Was the company mentioned or cited?
- Who was recommended instead?
- Which source types support those recommendations?
- What is the most important controllable gap?
- Which three actions deserve budget first?

Technical scores appear only as supporting evidence. The report does not require the buyer to understand Schema, robots directives, prompt tracking, model APIs, or crawler infrastructure.

### Vendor Task Package

The implementation appendix is written for the customer's existing website, content, SEO, or communications vendors. It may include:

- official-fact and entity-consistency tasks;
- Schema, FAQ, and page-rewrite examples;
- citation-worthy data, case-study, comparison, and expert-commentary briefs;
- prioritized media, directory, institution, and community opportunity categories;
- source-specific evidence requirements;
- acceptance criteria;
- a fixed rerun question set and observation protocol.

Code is optional appendix material. It is not shown as an action the buyer must perform. Generated code and copy remain drafts requiring the customer's vendor and legal/content review.

## Report Information Hierarchy

The private artifact reads in this order:

1. **Verdict:** one plain-language statement of understanding, recommendation presence, and primary gap.
2. **Market outcome:** mention/citation counts with exact coverage context, never a universal rank.
3. **Answer snapshots:** question, engine, time, answer, recommendations, and sources.
4. **Attribution:** Grade A-D source evidence split into owned, earned, and unknown.
5. **Blind spots:** first impression versus full-site expression.
6. **Priority actions:** three decision-level investments.
7. **Vendor package:** implementation tasks and acceptance checks.
8. **Methodology appendix:** provider surface, model, region, limitations, source retention, and provenance.

## Architecture

### New `packages/answer-engine-observer`

Owns:

- the provider adapter interface;
- provider certification metadata;
- question execution and bounded concurrency;
- provider-specific retry and error classification;
- immutable normalized snapshot contracts;
- response/source provenance and sanitized cost metadata.

It does not perform source crawling or business attribution.

### New `packages/citation-intelligence`

Owns:

- source normalization and classification;
- customer/competitor entity resolution;
- recommendation-object extraction;
- evidence Grade A-D assignment;
- source-pattern and citation-gap calculation;
- opportunity hypotheses and attribution contracts.

Formal evidence claims must retain exact source links and verified excerpts. Unsupported claims are removed or downgraded.

### Existing `packages/site-crawler`

Continues to own safe URL resolution, DNS pinning, redirect validation, robots enforcement, response limits, extraction, and Playwright fallback. Citation Intelligence reuses these safety primitives through a cross-domain public-source fetch contract; it must not weaken the submitted-site boundary used by normal site discovery.

### Existing `packages/geo-auditor`

Continues to own deterministic homepage and deep-site technical evidence. Its score does not become an AI recommendation score.

### Existing `packages/ai-report-engine`

Continues to own evidence-grounded model synthesis. A versioned report successor composes site evidence, answer snapshots, citation intelligence, blind-spot comparison, executive priorities, and vendor tasks. Evidence verification remains mandatory.

### Existing `apps/web`

Continues to own PostgreSQL authority, admission, jobs, payment, access control, report routes, email, refund, and UI. Answer observation and citation analysis run only in Workers.

## Data Model

The implementation plan should introduce report-scoped records equivalent to:

- `answer_snapshot_runs`: report/job, locale, region, question-set version, start/end, coverage and terminal status;
- `answer_snapshot_cells`: immutable provider/question observation, model, answer, response hash, timestamps, usage and error class;
- `answer_snapshot_sources`: provider-returned source URL, title, rank/order and provider metadata;
- `citation_source_evidence`: normalized source, category, resolved entities, verified excerpt, content hash, retrieval status and evidence grade;
- `recommendation_entities`: normalized organization/product identity with ambiguity state and supporting snapshot cells;
- `citation_opportunities`: evidence-backed gap, affected questions, source pattern, priority and confidence;
- `vendor_task_packages`: versioned structured tasks rendered into the private report.

All tables are report/job scoped. Public reads expose no private competitor evidence. Raw provider keys and provider request secrets are never persisted.

Full third-party pages are not durable report payloads. Retain bounded crawl evidence under the existing evidence lifecycle, then persist only the minimal verified excerpts and metadata required for the private report and audit trail.

## Worker Flow

The deep Worker performs:

1. full-site crawl and semantic analysis;
2. first-impression/full-site blind-spot construction;
3. high-intent question generation;
4. bounded answer-engine snapshot execution;
5. source normalization and safe retrieval;
6. recommendation entity resolution;
7. evidence grading and citation-gap analysis;
8. executive and vendor-package synthesis;
9. evidence verification;
10. private HTML/PDF readiness and atomic commercial terminalization.

Successful snapshot cells and source evidence are checkpointed. A retry resumes only missing provider/question cells or missing source evidence with matching hashes.

## Failure and Commercial Outcomes

### Qualified completion

A paid recommendation report qualifies for settlement when:

- at least two certified answer-engine surfaces succeed;
- each successful surface completes at least three market questions;
- snapshot identity and source metadata validate;
- at least one usable recommendation or truthful no-recommendation outcome is present per successful question;
- the private report and vendor task package pass structured validation.

### Completed limited and refunded

If at least one certified engine completes at least three questions and a usable evidence-backed report exists, but paid coverage is below the qualified threshold, the report is delivered as `completed_limited` and the order is refunded through the existing atomic boundary.

### Failed and refunded

If no engine produces a usable three-question evidence set, or report evidence validation fails, the job is unavailable and refunded.

An engine outage is never hidden by relabeling another provider. An inaccessible source preserves provider-returned metadata and receives Grade D. An ambiguous entity remains separate. A no-recommendation answer remains a valid observation.

## Security, Privacy, and Content Boundaries

- Use existing SSRF, DNS-pinning, redirect, robots, content-size, and browser safety boundaries for third-party sources.
- Never bypass login, paywall, anti-bot, or geographic access restrictions.
- Keep answer and competitor evidence private to the authorized paid report.
- Persist only minimal third-party excerpts necessary to support analysis.
- Sanitize provider errors and request identifiers before customer display.
- Apply independent per-provider cost and request budgets.
- Do not send customer secrets, private business facts, or access tokens to answer providers.
- Separate provider capability claims from marketing copy through the certified adapter registry.

## Accessibility and Localization

- Executive conclusions and vendor tasks are generated in the persisted report locale.
- Provider answer language is recorded separately and may be shown untranslated with an attributed translation.
- Every metric names its denominator, engine count, question count, region, and time window.
- Evidence grades do not rely on color alone.
- Tables and source graphs have equivalent text summaries.
- PDF preserves all material evidence, limitations, and vendor tasks.

## Verification

### Unit tests

- provider adapter normalization and error classes;
- immutable snapshot identity and hashing;
- question generation constraints and low-confidence fallback;
- mention versus recommendation classification;
- entity resolution and ambiguity preservation;
- source category classification;
- Grade A-D evidence assignment;
- citation-gap and opportunity calculation;
- executive/vendor visibility boundaries;
- qualified, limited, and failed commercial decisions;
- prohibited causal-language checks.

### Integration tests

Use deterministic provider fixtures for two engines, four questions, customer absence, competitor recommendations, owned citations, third-party citations, one inaccessible source, one ambiguous entity, and one no-recommendation answer.

Assert that:

- every cell retains provider/model/question/time provenance;
- source evidence is safely fetched and minimally retained;
- inaccessible evidence is Grade D;
- ambiguous entities are not merged;
- free output does not expose private competitor/source detail;
- the executive report contains no required code action;
- the vendor package contains actionable tasks and acceptance criteria;
- retries do not repeat successful snapshot cells;
- commercial terminalization remains atomic.

### Protected staging acceptance

1. Certify one provider adapter with a live source-bearing answer.
2. Certify a second independent provider adapter.
3. Run a paid report with three to five questions against both providers.
4. Verify source retrieval, evidence grades, blind-spot comparison, executive report, vendor package, private HTML, PDF, and anonymous denial.
5. Force one provider failure and prove `completed_limited + refunded`.
6. Force total provider failure and prove `failed + refunded`.
7. Verify no report copy claims a consumer-app rank or private algorithm cause.

### Regression commands

```bash
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
```

## Rollout Slices

This document is the umbrella product contract, not one implementation batch. Each slice receives its own implementation plan, scoped acceptance criteria, and review gate before code begins:

1. **Contracts and fixtures:** new package boundaries, snapshot/evidence contracts, database design, deterministic provider fixtures, and no UI claims.
2. **First certified adapter:** protected-staging live proof, source normalization, immutable persistence, and cost controls.
3. **Second certified adapter and commercial coverage:** multi-engine orchestration, checkpoints, limited/refund behavior, and invariant tests.
4. **Citation intelligence:** entity resolution, Grade A-D evidence, source categories, gaps, and opportunity hypotheses.
5. **Report experience:** executive verdict, snapshot matrix, attribution, blind spots, vendor task package, private HTML/PDF, and localization.
6. **Budgeted free sample:** one question/one adapter conversion sample with technical-only fallback and abuse controls.
7. **Future certified Chinese surfaces:** add only after compliance, reproducibility, commercial terms, and consumer/API labeling pass review.

Every slice must preserve the existing production boundaries and pass its own staging acceptance before the next product claim is enabled.

## Design-Time References

These links supported the provider and competitive review on 2026-07-12. They are not permanent capability guarantees; adapter certification must re-check current terms and responses.

- [Perplexity Sonar API](https://docs.perplexity.ai/docs/sonar/quickstart)
- [OpenAI Web Search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [DeepSeek web-search integration](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code)
- [Volcengine connected-search documentation](https://www.volcengine.com/docs/85637/1588465?lang=zh)
- [Profound citation analysis](https://www.tryprofound.com/features/answer-engine-insights/citations)
- [Peec source analysis](https://docs.peec.ai/understanding-sources)
- [Scrunch AI search monitoring](https://scrunchai.com/platform/monitoring/)
- [Otterly GEO audit](https://otterly.ai/blog/geo-audit-crawlability-content-checker/)
