# Core Report Experience Rework Design

Date: 2026-07-10

## Goal

Make the core journey feel like a report product instead of a job-control console:

1. The user enters a website.
2. The system performs all recoverable work automatically.
3. The user receives a report in the language they selected.
4. Every deep-report credit reaches a final settled or refunded state without user intervention.

The user must not need to understand workers, leases, checkpoints, retries, model batches, or billing reservations.

## Scope

This phase includes:

- automatic page-level and AI-stage recovery;
- permanent-failure exclusion and valid-page backfill;
- truthful public task states;
- deterministic report-language persistence;
- automatic credit settlement or refund;
- homepage simplification;
- explicit technical and AI score contracts;
- correction of legacy reports generated in the wrong language.

This phase does not include accounts, payments, email delivery, subscriptions, a report center, teams, or external domain-ownership verification.

## Product Principles

- System failures are recovered by the system, not delegated to the user.
- A usable limited-coverage report is a completed deliverable, not a failed task.
- Permanent page failures are evidence about the site, not reasons to repeat the same crawl.
- Each generated report artifact has one immutable generation language. Interface language is independent.
- Technical scores and AI dimension scores remain separate.
- A terminal commercial job cannot leave its credit reservation pending.
- The unauthenticated homepage cannot expose a shared database-wide report history.

## User Journey

### Homepage

The homepage has one primary task: submit a company website for analysis.

Header navigation contains:

- Website analysis;
- Advanced log tool;
- Chinese and English interface switches.

The following are removed:

- the First case navigation item;
- every personal-site link and default personal-site URL;
- the public Recent reports section;
- first-case wording in the scanner and log-tool copy.

The URL input is empty by default and uses `https://company.com` as its placeholder. Supporting copy states that the free preview analyzes the homepage and a deep report analyzes valid site pages.

The current capability row is rewritten around user value:

1. Free homepage check;
2. Evidence-backed AI analysis;
3. Private deep report.

PostgreSQL, workers, and self-hosting remain in deployment documentation rather than the primary conversion surface.

The advanced log tool becomes a secondary link below the main website-analysis content:

> Already have server access logs? Verify whether identifiable AI crawlers visited the site.

### Report Entry And Return

After submission, the user is taken directly to the report.

Because this phase has no account model, the homepage does not claim to provide personal report history. Users return through a copied public preview link or an authorized private deep-report link. A future account phase may add My reports.

## Task State Model

### Internal Stages

Active stages remain:

`queued -> discovering -> planning -> fetching -> analyzing -> synthesizing`

Terminal stages become:

- `completed`: a qualified report was produced and a commercial credit may be settled;
- `completed_limited`: a usable report was produced below the billing coverage threshold and the credit is refunded;
- `failed`: no usable report was produced and the credit is refunded.

The ambiguous `partial` stage is deprecated. Existing `partial` rows are migrated to `completed_limited` when an AI report exists and to `failed` when no AI report exists.

### Public States

The API and UI expose product states rather than worker stages:

| Internal state | Public state | User message |
| --- | --- | --- |
| queued or active stage | generating | The report is being generated. |
| completed | completed | Report completed. |
| completed_limited | completed_limited | Report completed with limited coverage. |
| failed | unavailable | The report could not be completed and the credit was returned. |

Queue position and waiting reason may remain visible while queued. Internal stage names, checkpoint terminology, and retry controls are not shown as required user actions.

### Status UI

While active, the status component shows progress and a concise current activity. After a terminal state, it collapses to a compact outcome notice.

Completed:

> Report completed - 10 pages analyzed.

Completed with limited coverage:

> Report completed - 6 valid pages analyzed. Five inaccessible pages were excluded and are listed in coverage limitations.

Failed:

> This analysis could not be completed. The report credit has been returned. You can start a new analysis later.

`completed_limited` uses neutral informational styling. It does not use an error treatment or show Retry from last checkpoint.

A final failed report may offer a secondary Start a new analysis action after the refund is confirmed. It is not described as fault recovery the user must perform.

## Failure Classification And Automatic Recovery

### Permanent Page Failures

Permanent failures include:

- HTTP 404 and 410;
- robots.txt denial;
- unsupported public content type;
- a redirect to a permanently disallowed target;
- a page confirmed to be outside the requested site boundary.

Permanent failures are not retried. They remain available to the technical audit as dead-link or access evidence, but they are excluded from the AI-analysis success denominator.

When a selected page permanently fails, the worker selects the next untried valid candidate until it reaches the requested page count or exhausts the candidate pool.

### Transient Page Failures

Transient failures include:

- connection timeout or reset;
- HTTP 429;
- HTTP 5xx;
- temporary DNS or TLS failure;
- headless-browser launch or navigation failure.

The worker retries only the failed page, up to three attempts with bounded backoff. Successful pages are not fetched again.

After the retry limit, the worker attempts a replacement candidate. If none exists, the failure remains in coverage limitations.

### AI Failures

Model rate limits, transport failures, invalid JSON, and schema-invalid batch output are retried at the smallest failed AI unit:

- planning failure retries planning or uses the deterministic fallback;
- analysis failure retries the failed batch only;
- synthesis failure reuses stored page analyses and retries synthesis only.

Completed crawl evidence and page analyses are not discarded.

### Checkpoint Contract

The persistent checkpoint records:

- target page count;
- ranked candidate URLs;
- effective planned URLs;
- permanent failures;
- transient attempt counts;
- completed crawl URLs;
- completed page analyses;
- current synthesis input hash.

Worker recovery determines the earliest incomplete stage from the checkpoint. It must not restart discovery, planning, crawling, or model analysis that has already completed with matching content hashes.

## Coverage And Billing

### Effective Coverage

Coverage distinguishes:

- discovered candidate URLs;
- permanently invalid URLs;
- effective planned pages;
- successfully analyzed pages;
- transient failures that exhausted retries.

Permanent failures are reported but do not remain in the effective planned-page denominator after replacement is exhausted. A small site with fewer than 50 valid pages may legitimately complete with every valid page it has.

### Billing Qualification

A deep report qualifies for settlement only when:

- the submitted homepage succeeds;
- report evidence validation succeeds;
- at least one effective planned page exists;
- successfully analyzed pages are at least 70% of effective planned pages.

### Atomic Terminalization

Job terminalization and credit finalization occur in one database transaction:

- qualified report: `completed + settled`;
- usable report below threshold: `completed_limited + refunded`;
- no usable report: `failed + refunded`.

The transaction also clears the lease and writes final coverage counts. An operator audit command must detect terminal jobs whose ledger remains `reserved`; the normal code path must make that state impossible.

The generated limited report remains visible after refund. Viewing delivered evidence does not re-charge the key.

## Report Language Contract

### Persistence

`scan_reports` gains a validated `report_locale` with supported values `en` and `zh`.

- `POST /api/scan` validates and persists the submitted locale.
- `POST /api/reports/:id/upgrade` accepts `{ accessKey, locale }`, validates the locale, and requires it to match the persisted report locale before creating the deep job.
- A deep job never infers its language from the latest job or silently defaults to English.
- `scan_jobs.locale` and `ai_reports.locale` must match the report language used for that generation.
- The private access redirect uses the persisted report language.

The report component submits the persisted report locale, not the current interface-route locale. Switching the interface before upgrade therefore cannot silently change the report language.

The migration first adds `report_locale` as nullable, backfills it from existing AI reports or scan jobs, and requires it for every new scan. For a legacy report that still has no stored language, the first authorized upgrade writes the current route locale. This is the only fallback.

### Interface Language Versus Report Language

Switching the interface language changes navigation, controls, dates, and labels. It does not call the model or translate stored report prose.

The report header displays its generation language, for example:

> Report language: Chinese

Generated prose is wrapped with the correct HTML language attribute (`zh-CN` or `en`) for assistive technology.

### Legacy Wrong-Language Correction

An authorized deep report whose stored AI locale conflicts with its intended persisted report locale offers a one-time Regenerate in Chinese or Regenerate in English action.

The correction:

- requires the existing report-access cookie;
- creates a `locale_correction` deep job;
- reuses retained crawl evidence when content hashes still match;
- does not reserve or consume another credit;
- can be used once per report language mismatch.

`scan_reports.locale_correction_used_at` records this one-time correction and prevents repeated free regeneration.

## Score Contract

Scores are never merged into one commercial total.

### Homepage Technical Score

Used by the free preview. It is based on the submitted homepage and the standard robots.txt, sitemap.xml, and llms.txt checks.

Label:

> Homepage technical score: 82 / 100

### Site Technical Score

Used by an authorized deep report. It is based on the effective pages audited by the deep job.

Label:

> Site technical score: 43 / 100 - based on 6 valid pages

The coverage note lists inaccessible pages separately.

### AI Dimension Scores

Organization expression, information architecture, citability, trust evidence, entity consistency, and GEO understandability remain a separate section. They are not averaged with the technical score.

The removed Recent reports list no longer exposes unlabeled or stale scores. Report pages are the only public place where a score is interpreted.

## API And Data Changes

### Database

- Add `scan_reports.report_locale`.
- Add `scan_reports.locale_correction_used_at`.
- Add `completed_limited` to the job-stage constraint.
- Add a job reason constrained to `standard`, `system_recovery`, and `locale_correction`.
- Extend checkpoint validation for effective plans, page attempts, and content hashes.
- Migrate legacy `partial` jobs according to report existence.
- Add an operator command, `npm run db:audit`, that fails when a terminal commercial job still has a reserved ledger entry.

### Public Interfaces

- `POST /api/scan`: continues to accept `{ url, locale }`; the locale is now persisted on the report.
- `POST /api/reports/:id/upgrade`: accepts `{ accessKey, locale }`.
- `GET /api/reports/:id/status`: returns product state, coverage summary, queue information while active, refund state when applicable, and no checkpoint wording.
- `POST /api/reports/:id/retry`: removed from the report UI and deprecated for normal users.
- Add an authorized one-time locale-correction endpoint for legacy wrong-language deep reports.

## Component Changes

- Remove `caseStudy` from product navigation and both dictionaries.
- Remove the personal URL from scanner defaults and log-tool copy.
- Remove the homepage Recent reports query and component.
- Move the log-tool callout below the main analysis content.
- Rewrite the capability row around user outcomes.
- Refactor `AiReportStatus` around public product states.
- Remove the checkpoint retry button from terminal limited reports.
- Add compact completed, completed-limited, and refunded notices.
- Add report-language metadata to the report header.
- Label homepage technical, site technical, and AI dimension scores independently.

## Accessibility Requirements

- Status changes use one polite live region with atomic, non-contradictory text.
- A 100% process indicator cannot be paired with a failed-state label.
- Completed-limited state cannot rely on color alone.
- Generated prose has the correct language attribute.
- Every score includes its name, denominator, and coverage context in text.
- External navigation is either removed or clearly identified; the personal external case link is removed.
- Keyboard and screen-reader testing covers URL submission, status changes, report navigation, and locale correction.

## Verification

### Unit Tests

- locale validation and persistence;
- public-state mapping;
- permanent versus transient failure classification;
- replacement-page selection;
- page-level retry limits;
- checkpoint resume boundary;
- effective coverage calculation;
- atomic settlement and refund decision;
- score-label selection.

### Integration Tests

Create a deterministic `shun-express.com`-shaped fixture with:

- a Chinese submitted locale;
- 11 discovered candidates;
- four permanent 404 pages;
- one transient page failure;
- six initially successful pages;
- replacement candidates where applicable;
- model analysis and synthesis mocks.

Assert that:

- the formal report is Chinese;
- 404 pages are not retried;
- the transient page is retried automatically;
- replacement pages are selected automatically;
- successful evidence and analysis are not repeated;
- the report remains readable with limited coverage;
- the UI does not require checkpoint retry;
- the ledger terminates as settled or refunded;
- no terminal ledger remains reserved.

### Browser Acceptance

- Homepage has no personal website, First case, or public report history.
- URL input is empty and the free/deep boundary is explicit.
- Chinese submission and upgrade produce Chinese model prose.
- A completed-limited report shows coverage limitations without an error presentation or retry button.
- Homepage technical score, site technical score, and AI dimensions are visibly distinct.
- Status and language metadata are announced correctly to assistive technology.

### Regression Commands

```bash
npm run lint
npm test
npm run build
```

## Rollout

1. Apply the schema migration and deploy backward-compatible readers.
2. Deploy worker recovery, failure classification, effective coverage, and atomic ledger finalization.
3. Deploy locale persistence and upgrade request changes.
4. Deploy the simplified homepage and report-state UI.
5. Run legacy partial-job and wrong-language report corrections.
6. Verify the fixed fixture and one authorized live sample before public operation.

The rollout must not expose a state where a new UI writes a locale or terminal stage that an old worker cannot understand.
