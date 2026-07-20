# Shun Express V4 complete-report attempt — terminal stop evidence

Date: 2026-07-20 (Asia/Shanghai)

## Baseline

- Branch/HEAD: `codex/v4-answer-optimization-scope-reset` /
  `bd403f77b30b01c6c5a8378d0fc05b63ee56ee71`.
- Staging image ID:
  `sha256:e46c14a2b4b743d4ac3fa422ce74fcbd126c2f7552e1fa171fbcffb2dd4a30fb`.
- Preview: `dpl_FHYqhkYMejCbZs5hgbbuU51c5Du5`; fixed alias and both persistent Staging
  Workers matched the same full SHA. Production deployment/containers matched
  the frozen before snapshot.

## Unique submitted lineage

- Report: `010afe2d-231e-4488-a8b3-eeb281595a88`.
- Free job: `58bad9b0-0b6f-4554-81f0-ebc5f0f200e6`.
- V4 pre-admission job: `7bfb1ddd-5ae1-4fb3-9218-197a1def08dd`.
- Site snapshot:
  `report-v4-site-7e524098baf744a6123f6dbd49fa86a4acf7a86982673b8f7cb1ee3df8fab253`.

The browser submitted `https://shun-express.com/`, Chinese locale,
`forceFresh=true` exactly once. `/api/scan` returned HTTP 202 and the report
page returned HTTP 200.

## Free result

The persistent free Worker automatically claimed the job in 0.395 seconds and
completed it on attempt 1 in about 2m22s. It analyzed the homepage, produced
score 76, and had no error, retry, repair, or failed page.

## Admission terminal failure

- Created: `2026-07-20T10:22:09.602Z`; hard deadline:
  `2026-07-20T10:32:09.602Z`.
- The state machine entered one automatic retry after
  `unexpected_internal_error`; there was no manual claim or replay.
- Snapshot completed at `10:32:14.666Z`, already outside the ten-minute
  boundary. The job terminalized at `10:34:14.619Z`.
- Final snapshot status: `completed_limited`.
- Candidate/analyzable/excluded: `138 / 23 / 115`.
- The 23 analyzable bodies had 23 distinct content hashes.
- Exclusions: `robots_denied=68`, `duplicate_content=26`,
  `raw_fetch_failed=14`, `deadline_exceeded=7`.

The readable evidence contains the correct organization and its Taiwan,
Philippines, UAE, and Saudi service routes. The failure was not absence of site
content. Candidate growth included apex/`www` equivalents, site-provided
`/?route/` links denied by the site's own `Disallow: /?*`, stale optional
`.html` links, and recursively growing news query variants.

The decisive code boundary in `report-v4-admission-runtime.ts` maps any
nonzero excluded-page count to `completed_limited`. That conflicts with the
approved design's requirement to retain duplicate-body exclusions while still
allowing a complete representative crawl.

## Checkout and commerce

The customer surface displayed `Unable to create secure checkout. Please try
again later.` while admission was incomplete. The route intentionally hides
the database conflict. `createReportV4PaymentOrder` rejects a collecting or
otherwise ineligible snapshot before creating an order.

Final database counts for this report were:

- payment orders: `0`
- payment events: `0`
- Core/diagnosis/artifact/token/credit/email lineage: not created

No Airwallex checkout or payment occurred.

## Stop verdict

Both the unit executor and the independent checker returned
`DEVIATION_REVIEW_REQUIRED`. The approved scope required exact `completed`
admission within ten minutes and permanently forbade payment, a second report,
replay, or repair after timeout/`completed_limited`. Work therefore stopped
before the locked questions, payment, Core, diagnosis, or customer HTML.

The failed report and snapshot remain immutable. Any replacement attempt now
requires explicit approval of the separately frozen admission-remediation
scope.
