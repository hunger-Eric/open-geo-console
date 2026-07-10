# Protected Staging and Production Security Implementation Plan

## Objective

Implement the approved protected Preview staging topology and preserve production security invariants. The code must fail closed when deployment identity, database identity, commerce mode, or required staging-only configuration disagree. Repository changes must contain no credentials.

## Workstream 1: Deployment identity and policy

1. Add a pure deployment-policy module under `apps/web/src/security` that derives identity only from trusted process environment.
2. Recognize staging only when `VERCEL_ENV=preview`, `OGC_DEPLOYMENT_PROFILE=staging`, and `COMMERCE_MODE!=live` all hold.
3. Treat `VERCEL_ENV=production` as production regardless of staging variables; reject contradictory or invalid identities for protected operations.
4. Parse `OGC_STAGING_FREE_SITE_LIMIT` as an integer from 1 through 100 only in valid staging, defaulting to 100. Production always returns 2.
5. Add policy tests proving headers, cookies, query values, missing values, decimals, non-positive values, and values above 100 cannot enable or enlarge production policy.

## Workstream 2: Database environment identity

1. Add a singleton database environment marker to the PostgreSQL bootstrap schema and Drizzle schema.
2. Add local-only initialization and inspection commands that accept `staging` or `production`, never expose the connection string, and refuse to replace a conflicting initialized marker.
3. Make Web request paths and Worker/commercial entry points verify the marker against `OGC_DEPLOYMENT_PROFILE` before handling stateful work.
4. Emit only a non-sensitive database fingerprint derived from the database identity plus deployment profile for operator confirmation.
5. Add unit and real-PostgreSQL tests for matching, missing, and mismatched markers.

## Workstream 3: Free-scan quota and staging regeneration

1. Replace the route-level literal limit with deployment policy while keeping PostgreSQL as the rolling-window authority.
2. Add a staging-regeneration record or equivalent transactional state that serializes one active forced refresh per site without changing the existing active reuse mapping.
3. Extend the free-scan request contract with `forceFresh`; reject it outside valid staging before crawling or writing.
4. For forced refresh, create a distinct report and job, return the active refresh on duplicate clicks, and do not replace `free_site_trials` while work is non-terminal.
5. On a usable terminal result, atomically switch the site's active reuse mapping to the new report; on failure preserve the old mapping and report.
6. Cover normal reuse, distinct IDs, duplicate-click idempotency, successful switch, failed refresh, rolling-window accuracy, and concurrency with route/unit/PostgreSQL tests.

## Workstream 4: Staging-only interface

1. Expose a server-derived staging capability flag to the homepage scanner component; never infer it from browser inputs.
2. Render an unchecked localized “force regenerate” control only for valid staging.
3. Include `forceFresh` only when the visible control is selected and handle reused/in-progress/queued responses without losing the old report URL.
4. Add component/contract tests for staging visibility and production absence.

## Workstream 5: Worker and commercial isolation

1. Add explicit staging Worker commands using a Git-ignored staging environment file, with no fallback to `.env.local`.
2. Add staging commercial batch commands that use the same identity guard and reject `COMMERCE_MODE=live`.
3. Require the database marker guard before Worker presence, job claim, queue dispatch, SLA, refund, or email processing.
4. Print only profile, fulfillment mode, tier, and non-sensitive database fingerprint at startup.
5. Add command/guard tests proving a staging Worker cannot attach to a production-marked database.

## Workstream 6: Sandbox payment, Webhooks, and test email

1. Keep `COMMERCE_MODE=test` on the Airwallex demo API and reject an explicit live Airwallex base URL in staging/test policy.
2. Preserve application-layer Airwallex and Resend signature verification; do not add a route-level bypass.
3. In `COMMERCE_MODE=test`, force every Resend envelope recipient to `OGC_TEST_EMAIL_RECIPIENT`; fail before network I/O when missing or invalid.
4. In production, ignore `OGC_TEST_EMAIL_RECIPIENT` and always use the encrypted order recipient.
5. Add tests for Sandbox selection, wrong signatures, duplicate events, amount/catalog validation, recipient redirection, production non-redirection, and missing-recipient fail-closed behavior.

## Workstream 7: Operator configuration and external controls

1. Document exact secret names and environment scoping for separate Preview and Production databases, HMACs, model, payment, email, Queue, Turnstile, and Vercel protection credentials without recording values.
2. Configure a fixed protected Vercel Preview, separate Neon staging resources, Preview environment variables, and Vercel Authentication when account access permits.
3. Rotate the automation protection bypass through a non-echoing provider workflow; verify the old credential fails and never place either value in repository, chat, logs, or command output.
4. Configure or document Cloudflare Bot Fight Mode, WAF/short-burst rate limiting, and production Turnstile. Do not enable AI crawler blocking.
5. Treat unavailable account permissions or provider resources as explicit external blockers rather than simulated acceptance.

## Workstream 8: Verification, release, and documentation

1. Sync CodeGraph after implementation changes and use current files for precise review.
2. Run targeted deployment-policy, scan, trial, Worker, payment, Webhook, email, SSRF, Turnstile, token, and terminal commercial invariant tests.
3. Run real PostgreSQL integration tests against a disposable or explicitly staging-marked database.
4. Run `npm run lint`, `npm test`, `npm run build`, and `npm run db:audit`.
5. Deploy the Preview and production target when credentials permit, then browser-verify Vercel Authentication, staging quota, normal reuse, forced refresh, database separation, email redirection, production 429 behavior, and production immunity to staging variables.
6. Perform scoped `neat-freak` synchronization for `PROJECT-STATE`, `TASKS`, `DECISIONS`, and operations documentation.
7. Review the final diff for secrets and unrelated edits, commit, push the current branch, and update the existing pull request if present.

## Acceptance Criteria

- Only trusted Preview plus staging identity can use a configurable limit, capped at 100; production is always two distinct sites per rolling 24 hours.
- A normal same-site staging request reuses the active report. Forced refresh creates one distinct in-flight report per site and switches reuse only after a usable terminal result.
- Failed forced refresh leaves the old report and mapping usable.
- Web, Worker, and commercial commands refuse missing or mismatched database environment markers.
- Staging commands cannot silently load production configuration or run live commerce.
- Airwallex test mode uses Sandbox and all Webhooks retain signature verification and idempotency.
- Test-mode email has one configured envelope recipient and performs no network send when it is missing; production cannot be redirected by the staging variable.
- Production retains Turnstile server verification, PostgreSQL limits, SSRF defenses, Webhook verification, and commercial invariant auditing.
- No secret or connection string appears in tracked files, commit output, deployment logs quoted in chat, or documentation.
- Automated suites, real PostgreSQL checks, deployment checks available under current account access, and browser acceptance are truthfully recorded.
