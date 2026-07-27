# Provider Discovery V2 Protected-Staging Acceptance

This checklist is the production gate for prospective `combined_geo_report_v2`. It authorizes only protected staging. Existing V1 artifacts remain immutable, and production must remain on V1 until a separately recorded operator approval.

## Preconditions

- Deploy one reviewed revision containing schema v20 plus matching Web and both Worker lanes.
- Confirm the database marker is `staging`, Preview authentication is enabled, public-search authority identity is exact and active, and private evidence storage is shared by Web and deep Worker.
- Configure an isolated disposable `OGC_TEST_DATABASE_ADMIN_URL`; never point it at staging or production application data.
- Run `npm run test:postgres:staging-security`, the staging `db:audit`, `npm test`, `npm run lint`, and `npm run build`. Record exact pass/skip counts and do not convert timeout or skip into a pass.

## Required reports

1. Create a paid Chinese logistics report whose first confirmed buyer question asks for self-operated dedicated-line logistics providers. Verify exactly four refs: provider discovery, candidate verification, Q2 and Q3.
2. Create or refresh a case where no candidate satisfies strict qualification. The report must still render an empty strict list, a separate candidate pool with evidence gaps/rejection reasons, and no invented provider.
3. Keep one historical `combined_geo_report_v1` report readable with its original cookie scope, HTML and active revision.

## Evidence audit

- Every strict supplier row traces to an accepted claim, exact selected passage and safely retrieved source from the candidate-verification snapshot.
- Tier A/B, policy role, capability and operating mode are deterministic. Search result order, title or snippet alone never qualifies a supplier.
- Company-owned sources have a plausible supplier-name/domain identity match. Directory, media and marketplace domains are not relabeled as company-owned.
- Q2/Q3 sentences have directly relevant claim-bound evidence. When none exists, the report says evidence is insufficient and emits zero claims.
- Customer metrics equal persisted planned/completed queries, returned observations and safely retrieved pages. Planned queries are at most 30 and page-retrieval attempts at most 60.
- Shared snapshots, queries, observations, passages and claims contain no private customer identity or private question wording.

## Recovery and side effects

Inject one failure after each of discovery, verification, passage persistence, claim extraction, HTML readiness and private PDF readiness. Resume from the stored checkpoint and prove no duplicate passages, claims, snapshot refs, credit settlement, refund or email.

For a paid successful report, require `paid / completed / settled`, zero refund, one active V2 revision and one completion-email intent. For an `evidence_refresh`, require zero charge, credit, refund and completion-email effects; the old revision stays active until atomic activation.

## Browser and artifact checks

- Anonymous canonical HTML and evidence requests fail closed; exact V2 token redemption sets only the V2 cookie scope; V1 and V2 cookies are not interchangeable.
- Authorized desktop and mobile HTML render strict suppliers, candidates, Q2/Q3 evidence and source-original excerpts without internal IDs or customer PDF claims.
- The exact canonical HTML passes private Chromium PDF signature, page-count, hash, storage and readback checks. No customer PDF route exists.
- Record report/order/job/revision IDs, four snapshot IDs, HTML hash, private PDF hash/storage key/page count, screenshots, audit output and the reviewed commit without recording secrets.

## Gate result

The gate passes only when every item above has current protected-staging evidence. Any missing database suite, timeout, skipped live assertion, source-ownership mismatch, fabricated claim, access leak, readiness failure or commercial invariant violation keeps production V2 admission disabled.
