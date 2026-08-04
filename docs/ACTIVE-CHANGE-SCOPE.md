# Active Change Scope Lock

Status: `APPROVED` (user approved 2026-08-04)

Product decision by the user (2026-08-04): the emailed report access link
becomes REUSABLE for its token lifetime (option B). Rationale recorded by the
user: the customer paid; letting them keep opening the report is acceptable
product design.

## Current behavior (verified)

`apps/web/src/app/api/reports/[id]/access/route.ts`: GET inspects and POST
redeems via `inspectReportAccessToken`/`redeemReportAccessToken`, both of
which require `last_used_at IS NULL` (`apps/web/src/db/report-tokens.ts:65,92`),
so the emailed link dies after one redemption. Access then lives only in the
browser cookie, and a second click (or another device) hits a bare 403 JSON.

## Change

- `access/route.ts`: GET and POST both verify via the existing
  `verifyReportAccessToken` (revoked/expiry check only — the same function
  the cookie path already trusts). Effect: the emailed link works repeatedly
  until the token's own 30-day expiry; each POST re-sets the device cookie.
- Confirm-page copy loses the "one-time link will be redeemed" sentence and
  states the link stays valid until the report access expires (zh + en,
  inline copy in the same file). POST error copy drops "or already used".
- No change to `db/report-tokens.ts` (inspect/redeem remain for the postgres
  contract test), token issuance, cookie attributes, revocation, or the
  `link_reissue` flow (still the remedy after 30-day expiry).
- Tests: update `access/route.test.ts` mocks to `verifyReportAccessToken`,
  keep the scope-redirect matrix, and add one case proving a SECOND open of
  the same link still confirms/redeems (no 403).

## Forbidden

- No change to token TTLs, cookie flags, email templates, delivery queue,
  worker/commerce/Docker/database state, or any other route.
- No deployment beyond ONE manual Vercel Preview + fixed-alias move
  (rollback: re-alias `dpl_EiRKJGKAy2TSMYExcYVQ3iBKhYNP`); no tag, no
  production.

## Diff budget

- Production: ≤ 25 lines. Tests: ≤ 45 lines. Docs: this file + closeout entry.

## Acceptance checks

1. Access route tests pass; `npm run build --workspace apps/web` passes.
2. Preview READY with correct `ogcGitSha`; alias moved; SSO intact.
3. User confirms the emailed link opens the report on a SECOND click/device.

## Expensive external actions authorized

- Git commit(s) on `main` and push to origin.
- ONE Vercel Preview deploy + fixed-alias move.
