# Combined GEO Report, Business Questions, and One-Time Correction Design

**Date:** 2026-07-14

**Status:** Design approved in conversation; written specification awaiting user review

**Scope:** The paid V2 report contract, pre-payment business-question confirmation, private/shared evidence separation, and one free correction of the existing incomplete staging order.

## Outcome

A paid order produces one formal, private report rather than a public-source report with a shortened website appendix. The canonical HTML contains the complete multi-page technical analysis and the public-source investigation for the customer's three confirmed business questions. The PDF is exported from that same HTML. All authorized report tabs read the same deep report data.

The existing staging order that completed commercially but delivered an incomplete customer artifact receives one free correction. The customer first confirms a replacement set of exactly three questions; the system then rebuilds the report without another payment or credit charge. No new paid order may be created until the safe-retrieval unwind gate, reviewed Worker revision gate, and corrected-report acceptance gate all pass.

## Current Boundary and Why the Report Is Incomplete

The current V2 Worker did collect more than the homepage: it persisted multi-page technical evidence and a deep AI report. The customer artifact nevertheless reduces that work to a website-foundation appendix. The standalone technical routes authorize and load the legacy deep contract by default, so a customer holding only V2 access can be shown the public homepage projection instead of the paid technical data.

The current question generator also does not use the discovered business profile as a three-dimensional decision model. It can select the lexically first service name and repeat it across all questions while ignoring target audiences, served regions, business model, and broader capability evidence. The problem is therefore both a report-contract defect and a question-input defect; changing only the renderer or only the wording does not complete the customer journey.

## Contract Strategy

Use a new report artifact contract named `combined_geo_report_v1`. Do not silently change the meaning of historical `recommendation_forensics_v1` artifacts.

- The existing commercial catalog item and one-time payment contract remain `recommendation_forensics_v1` so historical billing and Webhook bindings remain stable.
- New successful paid generations and the authorized correction use report contract `combined_geo_report_v1` and a versioned `CombinedGeoReportV1` payload.
- Historical legacy and V2 artifacts remain readable under their original contract and access scope.
- A report revision points to one active artifact contract and revision. An atomic active-artifact switch makes a corrected combined report the default only after HTML and PDF readiness pass.
- Report, job, order, locale, target site, evidence cutoff, technical input identity, question-set identity, and artifact revision remain explicitly bound.

The combined contract is the single source for customer report composition. It contains three bounded submodels:

1. `technicalFoundation`: the complete paid multi-page technical audit, deep AI analysis, verified findings, evidence assets, dimension scores, coverage, and 90-day roadmap;
2. `businessQuestionSet`: the customer's three private locked questions, their business dimensions, provenance, confirmation metadata, and identity-neutral public variants;
3. `publicSourceForensics`: persisted observations, retrieved public evidence, source families, coverage, limitations, and evidence-linked actions for those exact question identities.

Each submodel has its own validator, but the combined report is valid only when all three pass and their identities agree.

## Exactly Three Questions Before Payment

The checkout always shows exactly three system-generated candidate questions. The customer may edit every question but may not add or delete a question. The three positions have fixed, distinct purposes:

1. `core_service_discovery`: what providers or approaches exist for the customer's core service need;
2. `customer_region_fit`: how providers fit the target customer type and service region;
3. `purchase_delivery_risk`: how a buyer should compare service capability, delivery conditions, and material risk.

Candidate generation uses the persisted website-derived organization profile, including business model, products and services, capabilities, target audiences, markets and regions, summary, and the evidence/confidence behind each field. It must not select a service by lexical ordering. A deterministic selection policy chooses the strongest supported core service, audience, and region, then generates one question for each fixed purpose.

The pre-payment API and UI enforce all of the following:

- exactly three non-empty strings;
- each string maps to its fixed question purpose and cannot be reordered into another purpose silently;
- bounded length and allowed-character validation for the immutable report locale;
- semantic distinctness across the three questions;
- no secrets, access tokens, contact details, or prohibited instructions;
- an explicit confirmation event before checkout creation.

When profile confidence is low, the system still produces three candidates. The UI clearly warns the customer to review them, keeps all three editable, and refuses checkout until the customer explicitly confirms the final set. Low confidence never authorizes an unreviewed automatic payment.

The order binds:

- original generated candidate text;
- final customer-confirmed text;
- fixed purpose for each question;
- whether each question was edited;
- generation-rule version and profile evidence identity;
- confirmation timestamp and immutable generation locale;
- question-set revision and content hash.

After payment, the final set is immutable. Worker retry, lease replacement, checkpoint resume, artifact repair, and email retry reuse the same locked question-set identity; they never regenerate or rewrite the questions.

## Private Questions and Shared Public Evidence

The private customer question may include the customer's company or brand name. It stays inside the protected order/report boundary. Shared market evidence must not contain customer identity.

For each private question, the system derives a market-neutral public-search variant that removes customer names and other order-specific identity while preserving the core service, audience, region, purchasing condition, and risk semantics. The neutralization result is validated before any shared search starts.

- Private order storage contains the original question, neutral variant, derivation version, mapping, and validation result.
- Shared question, snapshot, query, attempt, observation, and `market_source_evidence` rows use only the neutral variant and its neutral content hash.
- Shared snapshot identity includes the normalized neutral question, locale, region, public-search surface, fanout version, and evidence cutoff. It excludes report ID, order ID, customer name, and private question text.
- The report displays the customer's original private question. Its methodology/provenance view may also show the corresponding neutral public-search wording so the evidence chain is understandable.
- Logs, metrics, checkpoint summaries, skip reasons, and customer-safe errors must not expose the private question when a neutral identity is sufficient.

If neutralization cannot reliably remove customer identity, the question set enters a correctable preflight state and no shared search occurs. It must not be downgraded into a generic unrelated query or written into shared evidence.

## Canonical Combined Report

The canonical HTML includes, in one composition:

1. executive summary and business context;
2. scope, discovered URLs, planned pages, analyzed pages, failed pages, and coverage limitations;
3. complete multi-page technical analysis with all verified high-impact findings;
4. page-type analysis and per-page citations, quotes, URLs, and available screenshot evidence;
5. deterministic technical score and deep AI dimension scores;
6. the three private business questions and their public-source evidence graphs;
7. source eligibility, evidence grades, competing explanations, and explicit limitations;
8. prioritized actions and a 90-day roadmap linked to technical and public evidence;
9. a vendor task package with acceptance criteria;
10. methodology, collection surface, freshness, coverage, and non-causality statements.

The technical section must reach content parity with the previously delivered full legacy deep report: it cannot collapse the technical payload into a score card or homepage summary. V2-specific public-source sections add to that depth; they do not replace it.

`/reports/:id/report.html` is the canonical reading artifact. The PDF route renders the same combined component with print CSS. Authorized `/technical`, `/analysis`, and `/issues` routes project sections from the same `CombinedGeoReportV1` payload and technical evidence assets. They must not independently select the legacy contract or fall back to the public homepage preview after combined access has been granted.

Authorization remains report- and contract-scoped:

- a combined-report token or cookie grants only the bound combined artifact and its private evidence;
- route loaders resolve the active artifact revision before selecting the access scope and payload;
- anonymous, expired, wrong-report, and wrong-contract access returns `404`;
- changing the interface locale changes chrome only and never changes persisted report prose or question text.

## One Free Correction for the Existing Order

The authorized correction target is order `5f999610-17d5-4df9-9aa0-a6cce5e5b741`, report `a71d7481-c5dc-4e2a-a042-b9be878feab8`, and its completed paid job `dd2cff0b-ba16-43b0-aded-55fdc767e656`. It is eligible for exactly one non-billable correction revision because its commercial lifecycle completed but its customer-facing report contract is incomplete. This is not a new order, refund-and-repurchase flow, or general customer retry feature.

1. Present three replacement candidates under the new fixed-purpose rules.
2. Require explicit confirmation of the final three questions.
3. Create one correction entitlement and one question-set revision under a database uniqueness boundary for the original order.
4. Create or resume a correction generation bound to the original paid order, report, locale, site, and confirmed question set without reserving another credit.
5. Reuse the existing technical foundation only when its target, locale, content/evidence identity, completeness, and retention checks pass. Otherwise recrawl the required paid multi-page technical scope.
6. Always rerun public-source forensics for the newly confirmed neutral question variants unless an eligible snapshot with the exact new neutral identity and cutoff exists.
7. Build and verify the complete combined HTML and same-HTML PDF.
8. Atomically switch the report's active artifact revision only after both artifacts and all private evidence references pass readiness.
9. Queue one corrected-report-ready email only after the switch.

The previous artifact remains available for audit and stays active while correction is incomplete. A correction failure does not charge, refund, duplicate the settled credit, overwrite the working artifact, or send a completion email. Retry resumes the same correction job and checkpoint. The uniqueness boundary prevents a second free correction or concurrent correction generations.

## Failure and Recovery Rules

The corrected flow preserves the existing phase-ledger and atomic commercial boundaries.

- Question validation or identity-neutralization failures occur before shared retrieval and remain correctable without payment effects.
- Caller, phase, or Worker-deadline abort must propagate through safe retrieval and destroy the in-flight dispatcher. It must not be normalized into ordinary source unavailability.
- Incrementally persisted public evidence and source checkpoints survive retry; already completed neutral snapshot work is not repeated.
- Artifact failure resumes from the pending combined payload and does not repeat technical analysis or public retrieval.
- The old active artifact is replaced only in the same transaction that records the ready corrected revision.
- Email delivery is downstream of artifact activation and is idempotent by corrected artifact revision.
- Customer-facing status distinguishes review required, queued, collecting public evidence, building report, temporarily repairing, completed, and failed/refunded without exposing secrets or another customer's snapshot reuse.

## Admission and Deployment Gates

The following order is mandatory:

1. deterministic tests prove `safe-fetch` caller/deadline abort and dispatcher unwind, including pre-aborted and body-stream cases;
2. PostgreSQL integration tests prove checkpoint resume, immutable question binding, correction uniqueness, atomic artifact activation, and no duplicate credit/email side effects;
3. both protected-staging Worker lanes are rebuilt and recreated from the same reviewed revision, and expose that revision in presence/heartbeat evidence;
4. the existing order's free correction runs through the real staging Worker and commerce path;
5. the authorized combined HTML, same-HTML PDF, technical tabs, evidence assets, database invariants, and corrected email are inspected;
6. anonymous access is verified as `404`, and the old artifact/audit history remains intact;
7. only after the acceptance record is complete may checkout admission create the next new paid order.

The corrected existing order is the acceptance vehicle. Creating another paid order to bypass a correction failure is prohibited. Production configuration, Workers, data, and aliases remain untouched.

## Verification Matrix

### Unit and contract tests

- rich profiles produce three distinct fixed-purpose questions using service, audience, and region evidence;
- lexical service order cannot determine the chosen core service;
- low-confidence profiles produce three editable candidates and require explicit confirmation;
- add, delete, empty, overlong, duplicate-purpose, and semantically duplicate question sets are rejected;
- private brand-bearing questions produce identity-free neutral variants without losing material business dimensions;
- failed neutralization performs no public search and writes no shared evidence;
- combined payload validation rejects mismatched report, job, locale, target, question-set, cutoff, or technical identities;
- every combined technical section renders multi-page findings and evidence rather than a homepage projection;
- HTML and PDF select the same active combined artifact revision.

### Database and Worker integration

- payment entitlement binds exactly one confirmed three-question set;
- retries and lease replacement reuse the locked private and neutral question identities;
- shared evidence contains no customer identity or private question text;
- correction entitlement, question-set revision, generation, credit outcome, artifact activation, and email intent are idempotent;
- only one free correction can exist for the original order;
- failed correction leaves the prior active artifact unchanged;
- successful correction switches the active artifact once and does not create a new charge, settlement, or refund;
- safe-retrieval abort unwinds within its bound while heartbeat and lease behavior remain observable;
- source and artifact checkpoint recovery does not duplicate network calls, evidence rows, HTML/PDF, or delivery intent.

### Protected-staging browser and artifact acceptance

- the customer confirms exactly three meaningful questions tied to the actual business;
- the corrected report contains the full multi-page technical analysis, all findings, citations and screenshots available under the retained evidence contract;
- the report contains all three question investigations and clearly ties each source to the appropriate question;
- scores, 90-day roadmap, vendor tasks, methods, coverage, and limitations are present;
- `/report.html`, `/technical`, `/analysis`, `/issues`, and PDF agree on the active deep data;
- protected access succeeds and anonymous access returns `404`;
- the original order remains paid and settled with zero new credit reservation, charge, or refund;
- exactly one corrected delivery email is queued and delivered after artifact activation;
- both staging Workers report the reviewed revision throughout acceptance.

## Out of Scope

- user accounts, subscriptions, or a reusable customer dashboard;
- allowing more or fewer than three paid-order questions;
- customer-triggered post-payment edits outside the one authorized correction;
- placing private customer identity into reusable market snapshots;
- guaranteeing public-search placement, mentions, rankings, or causal effects;
- production rollout or activation;
- redesigning historical legacy and V2 artifact schemas in place.

## Acceptance Definition

This design is complete only when the existing paid staging order has one user-confirmed three-question correction and its active artifact is a real `combined_geo_report_v1` report satisfying the browser, database, Worker, HTML, PDF, evidence, access, and email checks above. Passing tests or generating a technical diagnostic without that customer-readable artifact is not completion.
