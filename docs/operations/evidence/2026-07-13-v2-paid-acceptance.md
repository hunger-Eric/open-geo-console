# Protected Staging V2 Paid Acceptance — 2026-07-13

This record contains non-secret evidence only. Timestamps are UTC. Provider identifiers are represented by truncated SHA-256 tags rather than raw values.

## Gate 1 — Latest failed Sandbox order settlement

The first evidence pass found that older order `558098d6-4fc2-4da0-b2c0-c7083bb76555` was already fully settled. A report-wide order query then identified the actual active blocker: the later order below. The gate is based on the latest order, not the older settled example.

Verified directly against the protected staging PostgreSQL authority at `2026-07-13T14:37:27.631Z`.

- Order: `de7ad78b-78b9-446d-a8f5-a5af207fd346`
- Report: `c3a97bce-6bfc-43a9-916b-d8ddd26b0ec1`
- Job: `738f4499-ae3d-4a97-a54f-a057753d3a46`
- Amount: `USD 29.00`
- Commercial state: `payment_status=paid`, `fulfillment_status=failed`, `refund_status=refunded`, `delivery_status=delivered`
- Refunded at: `2026-07-13T14:36:36.846249Z`
- Refund row: `018d9812-2faa-4c3e-99ce-c98c2215804a`, `reason=report_failed`, `state=succeeded`, `attempts=1`
- Provider refund tag: `5510803f52ddcf47`

Delivered email evidence:

| Template | Delivery ID | Provider tag | Delivered at | Provider event |
| --- | --- | --- | --- | --- |
| `payment_confirmed` | `04bff507-360c-4e66-83a8-7adfbbcc3e08` | `4c030e737f9dbb1b` | `2026-07-13T14:36:37.175082Z` | `email.delivered`, processed |
| `report_failed_refund` | `5c84f842-ef22-438e-aca8-e13b3848f4c8` | `42565b95a38806fc` | `2026-07-13T14:36:38.015851Z` | `email.delivered`, processed |
| `refund_succeeded` | `4cee08bf-41e5-4a29-9303-88a437b153de` | `9376eea7c8d2501b` | `2026-07-13T14:37:09.227494Z` | `email.delivered`, processed |

Gate result: **PASS**.

## Gate 2 — Snapshot query identity PostgreSQL regression

Added a real PostgreSQL regression to `apps/web/src/db/market-snapshots.postgres.test.ts`. It executes the resolver twice with the same canonical fanout: refresh version 1 persists its queries and fails, refresh version 2 must then persist all queries, attempts, observations, and source rows without a global query-primary-key collision.

Verification command:

```powershell
$env:OGC_TEST_DATABASE_ADMIN_URL='postgres://open_geo:open_geo@127.0.0.1:55432/open_geo_console'
$env:OGC_DEPLOYMENT_PROFILE='staging'
$env:VERCEL_ENV='preview'
node node_modules/vitest/vitest.mjs run --no-file-parallelism apps/web/src/db/market-snapshots.postgres.test.ts
```

Result after the lease-recovery regression was added to the same isolated suite: `1 passed`, `4 tests passed`, using a created-and-dropped PostgreSQL database. The snapshot-specific assertion still proves two snapshot versions, 12 distinct snapshot-scoped query IDs, and a complete second bundle.

Gate result: **PASS**.

## Gate 3 — Controlled staging Worker image identity

- Git HEAD: `f74cd53ffb8499df2810464ef8399f264d058a8e`
- Worker image: `sha256:6dbff0f15b482950141ef8d6fd68954bf25585954258c933ec4fbb6c76d08dfd`
- OCI image revision label: `f74cd53ffb8499df2810464ef8399f264d058a8e`
- Replaced exited free container: `6d66772c5cc8`
- Replaced exited deep container: `b86c1b82fc7d`
- Current free container: `b5ed0fc7c1e7`, running on the expected image
- Current deep container: `50ec0a14bfd5`, running on the expected image
- Protected staging PostgreSQL `worker_presence` records both free and deep as `docker-desktop-staging-f74cd53ffb8499df2810464ef8399f264d058a8e`.
- Exactly two running containers carried `OGC_DEPLOYMENT_PROFILE=staging`; no older staging container remained able to claim work.

Gate result: **PASS**.

During Gate 4, a newly exposed expired-running lease defect required one further controlled deep-Worker rebuild. The replacement image is `sha256:23ef9199d8b84bb30b0bcb66be4701c08b9eaddd2453696d1132a65336d93417`, its OCI revision label remains the same HEAD, and it contains the uncommitted lease-recovery change documented below. This incident rebuild does not retroactively turn Gate 4 into a pass.

## Gate 4 — Fresh paid V2 end-to-end acceptance

- Fresh order: `b1b9b382-962a-48f5-acf0-ba2f9b377c9e`
- Report: `c3a97bce-6bfc-43a9-916b-d8ddd26b0ec1`
- Deep job: `b15c66eb-c605-4b41-9a6c-5a056b42caba`
- Created at: `2026-07-13T14:38:03.388130Z`; verified paid Webhook persisted at `2026-07-13T14:39:30.869Z`.
- Initial claim owner: `ogc-worker-deep-bc949589-ffde-43a9-a847-30bcdd85faa6`, proving the freshly controlled Worker, not an older container, claimed the order.

The job completed discovery, planning, safe website fetches, page analysis, and website synthesis. It then failed in `public_source_preflight`:

- Four snapshot generations were created for the same three canonical fanouts. Every generation persisted six snapshot-scoped query rows per snapshot without a unique-key conflict. The real retry path therefore corroborates the Gate 2 PK regression.
- Search attempts produced persisted observations (`120`, `120`, `110`, and `160` across the four generations), but repeated individual search timeouts kept at least one snapshot incomplete in every generation.
- Public-source safe retrieval persisted zero `market_source_evidence` rows and zero report snapshot refs. No V2 `report_source_forensics` row, customer V2 HTML, or V2 PDF was produced.
- The 15-minute Worker hard deadline aborted the job signal, but safe retrieval did not unwind. Heartbeats stopped, the `running` lease expired, and the original claimant remained blocked.
- The existing claim query could not recover an unexhausted expired `running` row. `claimScanJob` was repaired to atomically record `running -> retry_wait (lease_expired)` before replacement claim. A real isolated PostgreSQL regression proves this transition and claim.
- The replacement Worker resumed the same job. Its final attempt repeated the safe-retrieval deadline failure. After lease expiry, the next claim preflight terminalized the exhausted job as `failed / lease_exhausted`; its reserved credit became `refunded`.

Final commercial state verified at `2026-07-13T15:41:11.341Z`:

- Order: `payment_status=paid`, `fulfillment_status=failed`, `refund_status=refunded`, `delivery_status=delivered`.
- Refund: `e970830c-ffb2-4457-b1fd-c6c93db52ae8`, `state=succeeded`, `attempts=2`, provider tag `a57cd32024ef4f7e`, succeeded at `2026-07-13T15:40:16.653Z`.

| Template | Delivery ID | Provider tag | Delivered at | Provider event |
| --- | --- | --- | --- | --- |
| `payment_confirmed` | `8c8c5b83-0ba7-43da-838d-802222af54ee` | `ca57ddfd410d5a66` | `2026-07-13T15:21:36.169Z` | `email.delivered`, processed |
| `report_failed_refund` | `c539d054-17cb-4042-9133-a2e2a22ed50d` | `025cad1d4e7bd63b` | `2026-07-13T15:40:16.610Z` | `email.delivered`, processed |
| `refund_succeeded` | `43f81202-533d-4489-83a8-b89896c6c8ed` | `bfe0affd0975c497` | `2026-07-13T15:40:55.188Z` | `email.delivered`, processed |

Gate result: **FAIL — public-source safe retrieval exceeded the Worker hard deadline and did not unwind cleanly.** Payment, refund, credit, and all three email outcomes are settled, but the V2 customer artifact chain did not reach evidence persistence, HTML/PDF, or successful atomic settlement. V2 paid acceptance remains blocked.
