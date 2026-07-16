# V2 Report Completion Recovery Design

**Date:** 2026-07-14  
**Status:** Approved design; implementation not yet started  
**Scope:** Protected-staging V2 paid-report execution from the persisted website foundation through public-source evidence, customer HTML/PDF, delivery, and commercial settlement.

## Outcome

The acceptance artifact is one real, readable paid V2 report. Tests, retries, refunds, error records, and healthy Workers are supporting evidence only. Completion requires one protected-staging order to reach all of the following:

- PostgreSQL order state `paid / completed / settled`;
- non-empty persisted `market_source_evidence` linked through completed snapshot references to the V2 report;
- an authorized recommendation HTML report containing real public-source evidence;
- a PDF materialized from that same HTML;
- anonymous access returning `404`;
- the report-delivery email reaching `delivered`;
- no failure refund, duplicate evidence, duplicate artifact, or duplicate delivery side effect.

Customer admission remains closed until this artifact exists and the evidence is recorded in the protected-staging acceptance log.

## Existing Failure Boundary

The 2026-07-13 paid run completed discovery, crawl, page analysis, and website synthesis, then failed in public-source execution. Three separate defects contributed:

1. an aborted Undici request waited on graceful dispatcher shutdown;
2. already-aborted signals and deadline errors were not guaranteed to stop later source requests;
3. source retrieval was sequential and evidence was written only after the complete loop, so successful early work could be lost when the job deadline arrived.

The dispatcher destroy change fixes only the first defect. This design closes the complete execution boundary.

## Execution Budget

`OGC_JOB_HARD_DEADLINE_MS` remains the absolute Worker-attempt boundary. No phase may assume that all 15 minutes remain.

The execution lease must expose elapsed and remaining time. Before public-source work begins, the Worker evaluates the remaining budget:

- if the website foundation is complete but insufficient time remains for public-source work plus artifact/terminalization reserve, persist the checkpoint and enter the existing phase-local retry path;
- the next attempt resumes from `public_source_preflight` with the persisted website foundation instead of repeating discovery, crawl, analysis, or synthesis;
- reserve at least three minutes for report construction, HTML/PDF verification, terminalization, and bounded cleanup;
- bound public search to three minutes wall time and source retrieval to three minutes wall time per resumed attempt;
- retain at least one minute as deadline/cleanup margin.

These are wall-time budgets, not the sum of individual request timeouts. When a phase budget expires, its shared signal aborts all in-flight work and prevents new work from starting.

## Search Collection

Keep the three canonical buyer questions and six deterministic query variants per question. The three question fanouts run concurrently, with at most two active queries inside each fanout. Provider request and daily-cost limits remain authoritative.

For report execution:

- cap structured results at three per query;
- preserve every completed, partial, timed-out, rate-limited, malformed, or unavailable attempt in the attempt ledger;
- do not discard successful observations because a sibling query failed;
- a timed-out query is terminal for that query in the current snapshot attempt and is not immediately replayed inside the same Worker attempt;
- snapshot recovery resumes missing work from the existing snapshot identity rather than creating repeated full generations.

Generated model prose is never evidence. Only structured result annotations can enter source selection.

## Deterministic Source Plan

Before network retrieval, build a deterministic plan from persisted successful observations:

1. canonicalize and deduplicate URLs;
2. preserve query and surface-result provenance;
3. prefer source-eligible domains and earlier structured result order;
4. cap one question at twelve unique URLs and one registrable domain at two URLs;
5. stop scheduling new URLs for a question after three independently retrievable sources satisfy its evidence minimum;
6. record every skipped result with a bounded reason such as duplicate, domain cap, question cap, or evidence target reached.

This bounds a report to at most 36 scheduled source URLs while retaining three canonical questions and domain diversity.

## Abort and Retrieval Contract

Every network boundary must implement the same contract:

- call `signal.throwIfAborted()` before DNS resolution, robots lookup, redirect validation, body reading, and each new scheduled source;
- compose caller, per-source, phase, and Worker-deadline signals without losing the original abort reason;
- use one 15-second combined per-source wall-time limit for robots plus document retrieval;
- destroy an in-flight pinned dispatcher on abort and close it gracefully only after normal completion;
- treat Worker deadline and phase cancellation as control flow that must propagate to the Worker; never normalize them to `inaccessible`;
- normalize only publisher-specific failures such as HTTP barriers, robots denial, unsupported content, and ordinary source timeouts into evidence availability states;
- stop dequeuing new sources immediately after phase or Worker abort.

SSRF validation, public DNS resolution, IP pinning, redirect validation, robots enforcement, content-type checks, and byte limits remain fail-closed.

## Bounded Concurrency

Use one shared source-retrieval scheduler with a default concurrency of four. It owns the phase signal, remaining-time check, per-domain fairness, and evidence-target early stop. Nested unbounded `Promise.all` is prohibited.

The scheduler returns only after all started tasks have settled or the bounded abort cleanup completes. A Worker heartbeat must continue while the scheduler is active. Cleanup time is part of the phase budget.

## Incremental Persistence and Resume

Persist each normalized source outcome immediately after retrieval through deterministic, idempotent source identities. Do not hold the entire source batch in memory until the final URL finishes.

The snapshot checkpoint records:

- completed search query IDs;
- planned source identities and bounded skip reasons;
- persisted source identities and retrieval states;
- per-question evidence counts;
- remaining source identities;
- exact authority, adapter, locale, region, evidence cutoff, snapshot, and checkpoint revision.

On retry or Worker replacement, validate this identity and continue only the remaining sources. Already persisted sources are neither fetched nor charged again. Snapshot completion occurs only after its attempt/observation ledger is closed and its planned source work has reached a terminal persisted state.

If the Worker deadline arrives after some sources succeed, those source rows and the checkpoint survive. The snapshot remains resumable rather than being released as an empty failed generation.

## Coverage and Report Construction

A completed report must contain at least one independently retrieved available source for each of the three canonical questions. The target is three per question; inaccessible sources may explain limitations but cannot satisfy the minimum.

When the minimum is met, build the evidence graph and report from persisted observations and persisted source evidence only. If the target of three is not met but the minimum of one is met for every question, the report may be `completed_limited` only under the existing commercial refund contract; this does not satisfy the paid `completed / settled` acceptance required by this design.

If any question has zero available evidence when the phase budget ends, checkpoint and retry missing source work while attempts remain. Exhaustion follows the existing atomic failure/refund boundary and is evidence of a failed acceptance run, not completion.

## Artifact and Commercial Boundary

After evidence coverage passes:

1. persist the complete pending V2 report and snapshot references in the existing artifact-verification checkpoint;
2. render the canonical private HTML;
3. materialize and validate the PDF from the same HTML;
4. atomically persist the V2 report, snapshot references, job completion, credit settlement, order fulfillment, and delivery intent;
5. deliver the private report email and process its provider delivery event.

Artifact repair resumes from the pending report checkpoint and must not repeat search or retrieval.

## Verification

### Deterministic tests

- pre-aborted signal performs no DNS or network work;
- abort during DNS, robots, redirect, headers, body streaming, and dispatcher cleanup unwinds within a bounded interval;
- Worker deadline is never converted to `inaccessible`;
- no source starts after phase abort;
- source concurrency and per-domain caps are enforced;
- successful early source rows survive a later timeout;
- retry resumes only missing sources and does not duplicate provider calls or evidence rows;
- mixed search success/timeouts preserve successful observations and do not recreate a full snapshot generation;
- remaining-time preflight checkpoints the website foundation and resumes public-source work on the next attempt;
- artifact failure resumes without search or source re-fetching.

### PostgreSQL integration

Use an isolated disposable database to prove incremental idempotent evidence writes, checkpoint revision/CAS behavior, expired-lease replacement, snapshot completion, and atomic commercial terminalization.

### Protected-staging acceptance

Rebuild both staging Worker lanes from the reviewed revision and create exactly one new Sandbox order. Monitor it through payment, Worker phases, evidence counts, artifact creation, settlement, and email delivery. Inspect the authorized HTML and PDF and verify anonymous `404`. Record identifiers and non-secret evidence in the operations acceptance document.

Do not create another order merely to bypass a failure. Diagnose and repair the same failed boundary first; create a replacement order only when the prior commercial outcome is fully settled and the corrected revision has passed deterministic and PostgreSQL verification.

## Out of Scope

- production public-search activation;
- weakening SSRF, robots, access, payment, or artifact authorization boundaries;
- replacing PostgreSQL job authority with another queue;
- adding user accounts, subscriptions, or manual customer retry controls;
- redesigning the customer report presentation.
