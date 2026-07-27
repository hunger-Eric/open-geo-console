# Instant Report Journey and Responsive Interaction Design

**Status:** Product direction approved on 2026-07-11; awaiting written-spec confirmation before implementation.

## Goal

Make Open GEO Console feel immediate even when crawling and AI generation are slow. A primary action must acknowledge the user at once, persist a durable request quickly, and move the user to the destination surface while slow work continues in the background.

The first implementation covers the complete `homepage -> report progress -> progressively available report` journey, on-demand Turnstile for scan and checkout forms, and shared loading/feedback conventions for report navigation and existing asynchronous actions.

## Current Product Failure

The production audit confirmed two coupled problems:

- after the visitor enters a URL, the primary button remains disabled until a separately embedded Turnstile checkbox is completed;
- `/api/scan` then waits for URL preflight, safe homepage fetching, deterministic technical audit, report persistence, quota handling, AI-budget handling, and job creation before returning a report ID.

The homepage therefore owns both interaction gating and long-running backend work. A progress message on the homepage can make the wait more legible, but it cannot make the flow responsive because navigation still depends on crawling.

## Product Response Contract

Open GEO Console adopts one response model across the product:

1. **Acknowledge immediately:** every primary action changes visible state within 100 ms.
2. **Admit durably:** commands perform only security validation, policy checks, idempotent database admission, and queue/outbox writes before returning.
3. **Navigate early:** once admission succeeds, the browser enters the durable destination instead of waiting for the work result.
4. **Render a useful shell:** destination routes show identity, current stage, expected next outcome, and recovery guidance before result data exists.
5. **Load progressively:** technical and AI sections appear when their own persisted artifacts become available.
6. **Keep authority server-side:** optimistic UI never grants payment, quota, report access, or job completion authority.

Normal low-risk targets are:

- visible action acknowledgement: under 100 ms;
- Turnstile Siteverify plus database admission: p95 under 1 second, excluding time spent on a user-required challenge;
- report shell first useful paint: p95 under 1.5 seconds after admission;
- persisted stage changes reflected in the browser: within 3 seconds.

These are operational targets, not promises that unsafe URLs, provider outages, or interactive challenges can complete instantly.

## Chosen Architecture: Durable Asynchronous Report Shell

### Admission API

`POST /api/scan` becomes a fast command boundary. It will:

1. validate locale, URL syntax, idempotency input, deployment policy, and on-demand Turnstile proof;
2. derive the submitted registrable site identity without making a network request;
3. resolve existing-report reuse, staging regeneration, rolling quota, and free-AI budget inside the existing policy boundaries;
4. atomically create a report shell, a free job, and the associated trial/regeneration/budget records;
5. publish or persist the existing notification outbox hint;
6. return `202 Accepted` with the durable report ID and initial public status.

The command does not resolve DNS, crawl a page, run the technical auditor, or call a model. Repeated requests with the same idempotency key return the same admission result.

### Report Persistence

`scan_reports` gains an explicit technical lifecycle and supports a report whose technical payload is not available yet:

- `technical_status`: `pending | processing | completed | failed`;
- nullable `score` and nullable `payload` while work is pending;
- submitted URL, site key, immutable report locale, and creation time are present from admission.

The report shell is a real durable report, not a client-only placeholder. Existing completed rows migrate to `technical_status = completed`. Report reads distinguish a missing row from a valid pending row.

### Worker Boundary

The free Worker becomes the only process that performs network preflight, safe fetching, homepage technical audit, and optional AI preview generation. This restores the documented boundary that Web admits work and Worker performs crawling/model work.

The job moves through persisted stages that the UI can translate into user language:

`queued -> safety check -> reading homepage -> technical analysis -> AI analysis -> finalizing -> completed / completed-limited / unavailable`.

Technical payload persistence is independent from AI completion. As soon as the deterministic homepage audit completes, the report page may show technical score and findings while the AI preview continues.

The submitted registrable site remains the quota and safety identity. Same-site canonical redirects may update the displayed final URL; redirects outside the submitted registrable site fail closed rather than moving a free claim to another site.

## Report Page Experience

The localized report route treats a pending report as a first-class state:

- header: submitted site, report language, submission time;
- prominent status card: current stage, concise explanation, bounded progress, and queue context;
- technical and AI sections: skeleton or `not ready yet` state until their persisted artifact exists;
- terminal failure: specific safe public cause and a clear new-analysis action;
- completion: refresh the relevant server-rendered sections without replacing the route or losing the user's context.

The existing status endpoint and polling component remain the transport. The status response is extended with technical lifecycle/artifact availability so the page can refresh when technical evidence arrives, not only after AI completion. Polling remains visibility-aware and bounded; Server-Sent Events are not required for this iteration.

Report routes add localized `loading.tsx` shells so Overview, Analysis, Issues, Bots, and Technical navigation acknowledges immediately even when server data is still resolving. Navigation continues to use the existing design system and report workspace structure.

## On-Demand Turnstile

The shared `TurnstileWidget` renders with:

- `appearance: "interaction-only"`;
- `execution: "execute"`.

No checkbox or reserved 65-pixel blank area appears on initial render. The primary action remains available when ordinary local fields are valid.

On the first click:

1. the button immediately enters a localized `Verifying…` state and suppresses duplicate clicks;
2. the shared widget calls `execute()`, queueing execution if the Cloudflare script is not ready;
3. a low-risk token continues admission automatically without a second user action;
4. when Cloudflare requires interaction, its Managed widget appears inline near the action;
5. expiry, consumption, or errors clear the token and reset the widget for a fresh attempt.

The widget exposes only `execute()` and `reset()` to forms. Forms never call `window.turnstile` directly. Scanner, commercial checkout, and link-reissue surfaces reuse this adapter. Server-side Siteverify, hostname validation, single-use tokens, and production requirements remain mandatory.

## System-Wide Interaction Rules

- Buttons never remain inert: verifying, submitting, opening checkout, saving, or refreshing states appear immediately.
- Duplicate actions are disabled only while the corresponding command is actually pending.
- Route transitions use a useful loading shell rather than leaving the old page visually frozen.
- Expensive crawler, model, refund, email, and fulfillment work never blocks navigation.
- External-provider setup that must finish before redirect, such as creating an HPP session, shows immediate progress on the current report while preserving provider and Webhook authority.
- Errors keep the user on a stable surface with a retry action; they do not discard a durable accepted job.
- Motion respects reduced-motion preferences, status text uses `aria-live`, and focus moves only when an interactive Turnstile challenge or actionable error appears.

## Failure and Race Handling

- Admission is atomic: a report shell cannot exist without its intended trial/regeneration and job relationship.
- Client retries reuse an idempotency key and cannot create duplicate jobs.
- A Worker failure terminalizes the report and releases/refunds any applicable reservation through existing atomic boundaries.
- A token consumed by Siteverify is reset before retry; expired tokens never enable submission.
- A page reload after admission recovers entirely from PostgreSQL; no required state lives only in memory or session storage.
- A page reload before admission simply returns to the filled/unfilled form; no false report is shown.
- Cross-site report, order, token, and private-access boundaries do not change.

## Alternatives Rejected

### Client-only temporary progress route

Navigating before durable server admission looks fastest but can lose work on refresh, navigation, or connection failure and creates a second transient identity before the real report ID exists.

### Loading overlay around the existing synchronous scan

This improves perceived acknowledgement but leaves crawling in the Web request, preserves timeout risk, and does not meet the requested frontend/backend separation.

## Verification

### Automated

- admission returns before any crawler or auditor call;
- report shell, job, quota/budget, and outbox writes are atomic and idempotent;
- existing-report reuse and staging forced regeneration preserve their current safety rules;
- pending reports render instead of returning not found;
- Worker persists technical evidence before optional AI completion;
- status projection exposes safe technical lifecycle without leaking job IDs or other sites;
- Turnstile queues execution before script readiness, continues exactly once, and recovers from expiry/error;
- missing, forged, expired, or replayed Turnstile tokens remain rejected server-side;
- lint, unit/integration tests, PostgreSQL security tests, build, and commercial invariant audit pass.

### Rendered acceptance

Desktop and mobile acceptance will prove:

1. no initial visible Turnstile checkbox or blank widget space;
2. entering a URL enables the primary action;
3. clicking produces visible feedback immediately;
4. low-risk verification continues without a second click;
5. admission moves to the exact localized report route before crawl completion;
6. the report shell shows changing persisted stages and progressively reveals technical/AI data;
7. report-section navigation shows an immediate loading shell;
8. checkout uses the same on-demand verification behavior;
9. no relevant console error or framework overlay appears.

Staging deployment is accepted before production. Production rollout keeps `COMMERCE_MODE=live` disabled and verifies the public catalog remains disabled.

## Non-Goals

- Replacing Turnstile with a traditional CAPTCHA or building a custom modal.
- Adding accounts, subscriptions, a personal dashboard, or browser-owned report history.
- Replacing polling with WebSockets or Server-Sent Events in this iteration.
- Weakening URL safety, quota, payment Webhook, report access, or refund authority.
- Making slow generation itself synchronous or pretending it has completed before persisted evidence exists.
