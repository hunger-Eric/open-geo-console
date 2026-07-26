# Active Change Scope Lock

## Status

`APPROVED` — explicitly approved by the user on 2026-07-26 (Asia/Shanghai). This document remains the sole executable authority. Approved boundary: one local candidate commit with no push; one Preview and one alias switch; one thin overlay; one candidate replacement each for Staging Free and Deep; only the pre-POST Gate 2 rollback counts defined below; locale `zh`, target `https://shun-express.com/`, exactly one fresh `forceFresh` Free submission. Resume, retry, second report, checkout, payment, Paid, and production actions remain 0.

## Objective

Form the currently locally fully-accepted 15-path dirty source into one exact candidate commit SHA (at most one commit, no push), deploy one Web Preview and switch the fixed alias, build one thin source-overlay from the current Worker image, replace Staging Free once and Deep once, then submit exactly one `forceFresh` Free report for `https://shun-express.com/`. Acceptance must reach Foundation, Free V4, Q1 answer and diagnosis, semantic receipt, and reviewed UI ready. Checkout/order/payment/Paid are **0** in this scope and are user-only later under a new scope.

## Baseline (must remeasure before mutation)

- cwd: `E:\project\open-geo-console-supersession`
- branch: `codex/staging-regeneration-supersession`
- HEAD: `adc08a95c4c61a5bec2ce3e4bbc836757447280d`
- Current dirty source: 15 paths; remeasure exact `git status --porcelain` and `git diff --numstat` before staging. It is the already locally accepted baseline; do not invent or widen files.
- `package.json`, `package-lock.json`, `Dockerfile.worker`, dependency inputs and base image are unchanged. Full image build is forbidden; E: free space is approximately 15.99 GiB, below the 20 GiB minimum. Thin overlay only.

## Runtime roles and identity

- Current: tag `staging-adc08...`, image `sha256:27d7d69a077e5aac4024294fe7337b82794c3e954766cafcf24c8a8cfebf7bb3`.
- Planned candidate: `open-geo-console:staging-<candidate-commit-sha>-thin-overlay`; after the single commit, record the exact candidate commit SHA and image SHA before mutation. Every Preview, image revision label, alias, and Gate 2 identity must bind to that exact candidate commit SHA, never the baseline SHA.
- Conditional rollback: tag `staging-a35674b...`, image `sha256:91d8c2ebfc2f4c9cd6f56852630e999a9d294b2c4d582f46ce8b25e451c686d7`. This is nominated only as rollback, not product-acceptance evidence. Before deployment verify it exists and matches revision, entrypoint, platform, and Free+Deep restore compatibility; otherwise stop.
- Fixed alias: `https://open-geo-console-staging-itheheda.vercel.app`.
- Target: `https://shun-express.com/`.
- Locale: `zh` (Chinese submitted locale), established by `docs/superpowers/specs/2026-07-10-core-report-experience-rework-design.md:346-348`; preserve this historical value and do not infer a different locale.

## Allowlist and behavior

Allowed local/Git/deploy/runtime/evidence surfaces are only: the measured 15 dirty paths, one candidate commit containing only those independently accepted source/test/scope changes, the Preview and fixed alias identity records, thin-overlay build metadata, named Staging Free/Deep service replacement records, and read-only/bounded report evidence for the one new lineage. No new production-code changes, dependencies, schema meaning, historical data, or adjacent subsystem work. Before commit, a complete diff allowlist/budget check and independent reviewer check are mandatory. No push.

## External-action budget (hard)

| Action | Budget |
|---|---:|
| Local commit | 1 |
| Web Preview | 1 |
| Fixed-alias switch | 1 |
| Thin overlay build | 1 |
| Preview / alias candidate switch | 1 / 1 |
| Candidate Staging Free replace / Deep replace | ≤1 / ≤1 |
| Gate 2 pre-POST alias restore to current / Free restore to current / Deep restore to current | ≤1 / ≤1 / ≤1 |
| Gate 2 conditional rollback after current restore fails (Free / Deep) | ≤1 / ≤1 |
| DB/queue preflight and same-lineage polling | read-only; bounded, max 30 polls at 20s |
| Fresh `POST /api/scan` | exactly 1, unique 16–128 character idempotency key |
| Resume / retry / second report | 0 / 0 / 0 |
| Model/crawl | only normal calls for this report |
| Checkout/order/payment/Paid/refund/email/production | 0 |

Secrets remain process-local and must never be printed or persisted. Gate 2 recovery must not loop: per service, candidate replacement plus current restore plus conditional fallback is at most three mutations, with the latter two only conditionally triggered. Exceeding any count stops and requires new approval.

## Gates (fail closed)

### Gate 1 — preflight

Verify current, candidate, and rollback roles; `docker system df`, E: free space, exact image IDs and container references; staging PostgreSQL deployment marker; no claimed/inflight/live lease/reservation/reuse; container restart state and current image; exact commit and Preview identity. Any mismatch stops before mutation.

### Gate 2 — deployment

Web Preview must report the exact candidate commit SHA and `READY`; fixed alias must resolve to that exact Preview. Free and Deep Staging containers must run the exact candidate with zero restart/identity mismatch, staging marker, and security checks. If Gate 2 deployment/identity fails before report submission, pre-defined recovery is: restore alias to current at most once, restore Staging Free to current at most once, and restore Deep to current at most once; if current restoration fails and conditional rollback preflight passed, use conditional rollback for Free and Deep at most once each. Do not loop both restore sets. Exceeding these targets/counts stops and requires new authorization. Prefer current image `27d7...`; use conditional `91d8...` only under that rule. No image cleanup unless exact IDs are separately authorized. Record before/after disk, image, and container evidence.

### Gate 3 — one fresh Free lineage

POST `/api/scan` with `forceFresh: true` and the unique key; require HTTP 202, `status: "queued"`, and new `reportId`/`jobId`. Reused, regenerating, `active_regeneration`, or old IDs stop immediately. Poll only this lineage (max 30 × 20s). Require Foundation, Free V4 marker, Q1 answer and diagnosis, semantic receipt, and reviewed UI/status ready. Commercial side effects must all remain zero. Any failure preserves evidence and stops: no resume, retry, substitute, or repeat. Business failure after submission does not trigger automatic rollback unless deployment safety regresses.

## Acceptance, evidence, and routing

Acceptance requires exact commit/allowlist and budget evidence, Preview/alias identity, candidate image and container identities, staging marker and clean lease/reservation preflight, one fresh queued lineage, and the Gate 3 artifacts above. Role routing is mandatory: `git_operator` commit; `release_operator` Preview/alias/overlay/service replacement; `runtime_operator` submission and bounded polling; independent `reviewer` technical evidence; `browser_qa` fixed-alias UI and user payment handoff. Payment is explicitly user-only later under a new approved scope.

## Stop conditions

Stop and report on any evidence conflict, dirty-path expansion, dependency/base-image change, insufficient disk, missing/mismatched role image, deployment identity or staging-marker failure, claimed lease/reservation/reuse, non-fresh response, old lineage ID, missing Foundation/diagnosis/receipt/UI readiness, any commercial side effect, budget exceedance, or need for cleanup, retry, or scope outside this allowlist. Gate 2 recovery uses only the pre-defined rollback targets/counts above; business failure after report submission has no automatic rollback except deployment-level safety regression. Do not mark `APPROVED` without explicit user approval.
