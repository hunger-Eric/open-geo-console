# Audit Aggregation and Worker Lanes Design

## Goal

Make technical reports truthful and actionable when many pages share the same root problem, and prevent long deep-report jobs from blocking free previews. The implementation must preserve existing report JSON compatibility, PostgreSQL lease semantics, evidence validation and credit settlement/refund behavior.

## Technical Finding Contract

`GeoFinding` gains one optional field:

```ts
aggregation?: {
  affectedCount: number;
  representativeUrls: string[];
  pageType?: PageType;
  templateKey?: string;
}
```

Existing `id`, `messageKey`, `params`, rendered fallback copy and `url` remain. `url` is the first representative URL, so older UI and persisted reports continue to work. `representativeUrls` contains at most three distinct URLs.

For every audited page:

1. Treat any status outside 200-299 as a root failure.
2. Emit only `page.badStatus` for that page and skip title, description, H1, canonical, JSON-LD, thin-content and homepage OpenGraph checks.
3. For 2xx pages, classify page type and template with the shared `site-crawler` authority.
4. Group findings by `messageKey + pageType + templateKey` and render one finding per group.

The shared classifier must recognize query-routed CMS URLs such as `/?tw/112.html` and infer a template such as `/tw/:id.html`, rather than treating every query route as the homepage.

## Scoring

Weights remain compatible with the current score:

- critical: 18
- warning: 8
- info: 3

Affected page counts still matter, but the total penalty is grouped globally by `messageKey` and capped:

- critical rule: 30 points maximum
- warning rule: 16 points maximum
- info rule: 6 points maximum

The score remains `clamp(88 + coverageBonus - totalCappedPenalty, 0, 100)`. Template grouping controls presentation; the cap is per rule across all templates so one repeated rule cannot independently wipe out the score through several template groups.

## Report UI

Overview priority cards use the already aggregated findings, so repeated generic cards disappear. The issues page shows:

- affected page count;
- page type/template context when available;
- up to three representative URLs;
- an additional-pages count when more URLs are affected.

Legacy findings without `aggregation` render exactly as before. English and Chinese copy stay in typed dictionaries.

## Worker Lanes

Run free and deep jobs in separate single-concurrency Worker processes:

- `OGC_WORKER_TIER=free`
- `OGC_WORKER_TIER=deep`

`claimScanJob` requires a tier and filters the atomic `FOR UPDATE SKIP LOCKED` subquery by that tier. Ordering becomes `created_at, id` for deterministic queue position. Lease cleanup and commercial refunds remain global and transactional; processor checkpoints, heartbeats and settlement logic do not change.

Deployment exposes `worker:free` and `worker:deep` commands and defines both services/processes. Each lane can be scaled independently later. Mixed unfiltered Workers are not used because they would make per-tier fairness and queue positions inaccurate.

Queue indexes cover queued ordering and active leases by tier. No new table or column is required.

## Queue Status Contract

The existing status response adds these public fields to `job`:

```ts
queuePosition: number | null;
waitReason: "jobs_ahead" | "active_jobs_in_pool" | "awaiting_claim" | null;
activeTier: "preview" | "deep" | "mixed" | null;
```

For queued jobs, `queuePosition` is 1-based among eligible jobs in the same tier, using the exact claim ordering. Active jobs with a non-expired lease do not count as queued positions.

Waiting reasons are factual:

- `jobs_ahead`: one or more same-tier eligible jobs precede the target;
- `active_jobs_in_pool`: the target is next but a same-tier job has an active lease;
- `awaiting_claim`: the target is next and no active same-tier lease exists.

The system does not claim a Worker is offline because there is no durable Worker registry. `activeTier` summarizes current non-expired leases without exposing worker IDs, report IDs, URLs or commercial state.

The status endpoint remains the only polling request and returns `Cache-Control: private, no-store`.

## Client Polling and Accessibility

`AiReportStatus` uses request-completion-driven `setTimeout`, not overlapping `setInterval` calls. Queued jobs poll every five seconds; active jobs poll every 2.5 seconds. A completed response with a persisted AI report triggers one router refresh so server-rendered report content appears.

Only the human-readable status sentence uses `role=status`, `aria-live=polite` and `aria-atomic=true`. The progress bar exposes standard ARIA values. Errors use `role=alert`; the whole card is not a live region.

## Verification

Deterministic tests cover:

- non-2xx short-circuiting and homepage OpenGraph suppression;
- query-route template classification;
- same-template aggregation, representative URL limit and distinct-template groups;
- global per-rule penalty caps;
- legacy report rendering;
- tier-filtered claims, deterministic ordering and concurrent `SKIP LOCKED` behavior;
- expired lease recovery and one-time credit refund;
- queue positions and all waiting reasons;
- free/deep authorization boundary in the status API;
- typed bilingual copy and pure UI status selection;
- progress accessibility and completed-report refresh behavior.

Acceptance requires `npm run lint`, `npm test`, `npm run build`, PostgreSQL integration checks with both Worker lanes, and browser verification of one aggregated technical report plus a queued free job while a deep job is active.

## Boundaries

- No Worker registry, ETA prediction or offline detection.
- No changes to model prompts, AI report evidence rules, access Key billing or payment/email scope.
- Existing stored reports are not rewritten; new scans use the new aggregation and scoring behavior.
