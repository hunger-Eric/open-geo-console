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

## Approved remediation runtime

The approved crawler/admission remediation was committed as
`5a6ac0d24574581342d7bc45ca4867e44094a366`. Deterministic gates passed, and
the independent U3 checker returned `CONFORMANT`.

- Staging image: `open-geo-console:staging-5a6ac0d24574581342d7bc45ca4867e44094a366` /
  `sha256:9943d450435fdea586fa382ecb513cfb0c2f7e2112f2f9d7a23fda8e2794f0b1`.
- Preview: `dpl_FbWc3HYAFLJyqqDwewdViPwq3JMP`, `READY`; Vercel
  `gitCommitSha`, `githubCommitSha`, and `ogcGitSha` all matched the full SHA.
- Fixed alias: `open-geo-console-staging-itheheda.vercel.app`; authenticated
  direct checks returned `/zh` HTTP 308 to `/`, then `/` HTTP 200.
- Staging runtime-env SHA-256 changed from `7e18b5f4ec4a33c37c962351cf6e52b21a1a890523bbb0a99e51bed7f473c4b6`
  to `ee1d66f6cb987cdcf37cc45be3ee8e7e1abf624fd6348e2b0481f93b20b63346`
  by replacing only the one deployment-version SHA.
- Persistent free/deep containers became `133245956c8e7c676fbbe4e12765b14d667a6736e1f04e39b29679bd438ab334`
  and `56b581bca176838b2d0ad7c1c7b50597de29bd435ed1ca4a16d9850672b7176f`.
  Both used the exact image, reported ready, and produced fresh exact-SHA
  presence. Claimable/recoverable/exhausted-maintenance counts remained zero.
- Only the superseded unreferenced image `sha256:e46c14a2b4b743d4ac3fa422ce74fcbd126c2f7552e1fa171fbcffb2dd4a30fb`
  was removed. Production deployment `dpl_3cx4ntaHcXquqJgRyj9E3tBX96BW` and
  all three production container/image identities remained unchanged.

The independent U4 checker returned `CONFORMANT` before the replacement scan.

## Final authorized replacement lineage

The browser submitted Chinese `https://shun-express.com/` with
`forceFresh=true` exactly once after U4 acceptance.

- Report: `77d7577d-fbe7-4dec-b70b-912982394ff8`.
- Free job: `4bd9f940-6da7-44dc-8fc0-d7a8e7f83548`; automatically claimed in
  `4.444` seconds and completed in `116.308` seconds on attempt 1.
- V4 admission job: `a80205fb-4794-48e8-b045-606e759a7c29`; automatically
  claimed in `5.384` seconds and completed on attempt 1.
- Snapshot: `report-v4-site-33de08ce1642b15b6dc82b65f30ebb923571ac1a199eb7b73d6f363e119bcc46`.

The snapshot completed as `completed_limited`, not `completed`. It took
`604.213` seconds from capture to terminal snapshot and persisted
`116 / 23 / 93` candidates/analyzable/excluded pages. All 23 analyzable rows
were well formed and had 23 distinct content hashes. Exclusions were:

- `duplicate_content=78`
- `policy_excluded=8`
- `deadline_exceeded=5`
- `raw_fetch_failed=1`
- `robots_denied=1`

The retained identity was correct: `深圳市凌顺国际物流有限公司`, with the
`凌顺国际物流` brand; it was not SF Express. The remediation reduced the old
frontier and reclassified benign exclusions, but unresolved deadline and raw
fetch residue correctly kept the final snapshot fail-closed.

Final replacement commerce counts were all zero: orders, payment events,
credits, artifacts, and tokens. No locked questions, Airwallex checkout,
payment, signed Webhook, Core job, diagnosis job, customer artifact, email, or
access token was created. No lineage job remained active, and there was no
manual/exact Worker, replay, repair, second report, or second payment.

This final authorized replacement therefore reached the explicit permanent
stop boundary. The requested paid deep report was not produced, and the scope
is frozen without push, merge, or production deployment.

The final browser refresh showed only the completed free homepage report and
the unsubmitted Sandbox checkout form; no authorized deep HTML existed to
inspect. The independent U5 checker returned `DEVIATION_REVIEW_REQUIRED`
because the snapshot was `completed_limited` at `604.213 > 600` seconds and
the admission job elapsed `704.555 > 600` seconds. It confirmed that stopping
with all commercial tables empty was conformant to the approved safety rule.
