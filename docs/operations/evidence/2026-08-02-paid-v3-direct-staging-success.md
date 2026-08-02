# Paid V3 Direct Protected Staging success

Date: 2026-08-02  
Evidence version: `paid-v3-staging-acceptance-v1.0.0`  
Environment: fixed Protected Staging  
Status: accepted for the bounded path below

## Accepted outcome

The Paid V3 Direct path completed from a verified paid order through one deep
job and one active `combined_geo_report_v3` artifact. The user personally
opened the private HTML report on the fixed Protected Staging host.

This record proves the following bounded path:

`paid -> deep job attempt 1/1 -> progress 100 -> active V3 artifact -> private HTML opened`

It does not claim Production readiness, email delivery, or live acceptance of
later source revisions.

## Authoritative identities

- Report: `646a6d93-ed3c-4d66-847f-93535f0075be`
- Site: `shun-express.com`
- Locale: `zh`
- Paid order: `c4d890f4-9691-4eb7-b8db-262e78451c35`
- Deep job: `5452db0a-e95d-4981-b2d8-a15e5ed6d703`
- Active artifact revision: `4a3ef7f3-baa5-44b8-a89a-bdb53faa3417`
- Product contract: `combined_geo_report_v3`
- Executed source: `c5f4ae5791e35eb7b47833ef15131bb635ac91ec`
- Worker image label: `open-geo-console:staging-c5f4ae5-overlay-v1`

No raw access token, customer email, provider identifier, model content,
private report prose, or other credential is recorded here.

## Persisted terminal evidence

- Payment: `paid`
- Fulfillment: `completed`
- Refund: `not_required`
- Delivery email: `queued`
- Deep job: `completed`, progress `100`, attempt `1/1`
- Planned pages: `6`
- Successful pages: `6`
- Checkpoint revision: `43`
- Artifact revision/generation: `1/1`
- Artifact state: `active`
- Canonical HTML: ready
- Private evidence: ready
- Internal readiness page count: `95`
- Active scoped access-token count: `1`; the token value was not read
- Combined report row: present and bound to the same order, job, and artifact
- Artifact ready and activated: `2026-08-02T12:14:08.716Z`

The job retained the expected discovery, plan, crawl, page-analysis, website
foundation, public-source, and artifact-verification checkpoint carriers. It
ended without an active lease or need for redispatch.

## Runtime timeline

All timestamps are UTC on 2026-08-02.

| Boundary | Time |
| --- | --- |
| Payment and deep-job creation | `11:59:56.893` |
| Worker claim | `12:00:01.511` |
| Discovery, planning, and fetching | `12:00:02` to `12:01:02` |
| Page analysis completed | `12:03:35` |
| Website foundation completed; public-source work entered | `12:06:33` |
| Provider discovery through qualification | `12:07:42` to `12:07:49` |
| Grounded answers through artifact verification | `12:11:03` to `12:13:35` |
| Atomic paid terminalization and activation | `12:14:08.716` |

Worker claim to terminalization was approximately 14 minutes 7 seconds;
payment to artifact activation was approximately 14 minutes 12 seconds.

## Source and version boundary

The release ledger time-correlates this run to source `c5f4ae5` and its named
Worker image. That commit is an ancestor of current `main`.

At evidence capture time, local `main`, `origin/main`, and a later Staging
Worker had advanced to `91ef797dc7509060187b6db90ffaa7f1c49249e3`.
This successful run must not be presented as live acceptance of `91ef797` or
any change after `c5f4ae5`.

The annotated Git tag `paid-v3-staging-acceptance-v1.0.0` versions this
evidence record. It is not a package version, GitHub release, deployment tag,
or Production-readiness claim.

## Explicit limitations

- The single `report_ready` email row remained `queued`, attempts `0`, with no
  provider event. Email delivery did not pass and is excluded from acceptance.
- The user's successful private-HTML opening is direct user-observed evidence.
  The independent browser session was blocked by Vercel SSO before the app
  route and produced no screenshot.
- No report was replayed, no email/link was reissued, and no payment, refund,
  database, deployment, model, crawl, or browser mutation was performed while
  preparing this record.
- Later optimization and later-revision acceptance belong to separate scopes.
