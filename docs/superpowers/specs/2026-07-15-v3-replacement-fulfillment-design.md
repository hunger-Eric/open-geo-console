# V3 Replacement Fulfillment Design

**Date:** 2026-07-15

**Status:** Approved in conversation; written specification awaiting review

## Outcome

Deliver one real, authorized `combined_geo_report_v3` report for paid Sandbox order `98974ea3-369e-43bc-b84b-602d96382b02` without another payment, a zero-price surrogate order, or mutation of the terminal failed job. The replacement fulfillment is a separately audited, non-billable lineage that links to the original order and failed job, reuses the locked business-question set, and activates a new artifact revision only after complete readiness.

The work has two mandatory stages:

1. deterministically fix and test the `public_source_snapshot_snapshot_materialization` failure;
2. create and run one protected-staging replacement fulfillment through artifact activation and browser acceptance.

Neither stage may be bypassed by deleting shared snapshots, editing terminal rows, weakening evidence validation, or fabricating provider outcomes.

## Existing Facts

- The original order is paid and terminal fulfillment-failed.
- Its signed Webhook created exactly one credit and deep job.
- The credit is internally refunded; the Airwallex cash refund failed with `airwallex_authentication_invalid_configuration`.
- Job `9f3221a2-1a3b-47c8-9c3e-eda2b8be52dd` is terminal and cannot be reopened.
- Artifact revision `cf76433c-c1de-43b6-ba75-cf3fc98500d5` is pending, never ready, and never active.
- The three confirmed business questions are immutable and remain bound to the original order.
- Production and historical orders are outside this operation.

## Chosen Approach

Add a dedicated replacement-fulfillment lineage. Do not reuse `paid_report_correction`: correction assumes an existing usable customer artifact and a correction-specific question flow, while this order never received an active V3 artifact. Do not create a zero-price order because it would distort payment authority and exactly-once order semantics.

The replacement is an operator-authorized fulfillment of an already paid obligation. It is non-billable even if the existing provider refund later succeeds; report delivery and refund assistance remain separate facts.

## Data Model

Add `report_replacement_fulfillments` with:

- stable ID;
- original order, report, failed job, and failed artifact revision IDs;
- replacement job and replacement artifact revision IDs;
- immutable reason code `paid_report_not_delivered`;
- state: `prepared`, `queued`, `running`, `repair_wait`, `completed`, or `failed`;
- operator authorization reference and timestamps.

Enforce one replacement fulfillment per original order and one replacement job per replacement record. The original order must remain the artifact's order authority.

Extend job and artifact contracts with:

- `scan_jobs.reason = replacement_fulfillment`;
- `scan_jobs.replacement_fulfillment_id`;
- `report_artifact_revisions.replacement_fulfillment_id`;
- `report_artifact_revisions.revision_kind = replacement`.

A replacement job must be deep-tier, `combined_geo_report_v3`, bound to the original report, order, locale, and locked question set, and have no credit reservation. A replacement artifact must have no source-artifact pointer because it is a fresh generation, not a presentation refresh.

## Eligibility and Preparation

The protected-staging preparation transaction must fail closed unless all conditions hold:

- deployment profile and database marker are staging;
- the order is provider-verified paid and fulfillment-failed;
- the original job is terminal failed and belongs to the order/report;
- no active artifact exists for the report;
- the failed V3 revision is non-active;
- the locked question set belongs to the same order/report;
- the credit is not reserved;
- no competing correction, refresh, or replacement exists;
- the operator supplies an explicit confirmation flag and authorization reference;
- snapshot/materialization readiness probes pass against the deployed Worker revision.

Preparation atomically creates the unique replacement record, job, pending revision, transition event, and dispatch hint. It does not create an order, entitlement, credit ledger entry, refund, or payment event.

## Snapshot Materialization Repair

The repair must reproduce the live boundary with persisted completed snapshots and the exact current fanouts. Tests must cover:

- completed cached snapshot reuse with attempts stored in a different order from query order;
- exact query matching by stored `query_id` and `query_order` rather than array position assumptions;
- cached snapshots whose request statuses include timeout or malformed terminal attempts alongside successful attempts;
- concurrent three-question resolution where one cached snapshot fails materialization;
- preservation or deterministic refresh of the unaffected questions;
- a typed, evidence-rich failure when persisted query/attempt identities are actually inconsistent.

The resolver must not convert a deterministic persisted-ledger mismatch into three identical generic transient retries. A true integrity mismatch is operator-repairable and must retain the snapshot ID and mismatch category in privacy-safe internal evidence. Ordinary provider or retrieval failures keep their existing bounded transient behavior.

The implementation decision must follow the failing regression evidence. No production data cleanup is part of the fix.

## Replacement Execution

The Worker runs the normal deep V3 pipeline under the replacement reason:

- recrawl or reuse technical evidence only through existing identity and retention checks;
- resolve all three public-source questions with the repaired snapshot boundary;
- run provider discovery, candidate verification, passage selection, claim extraction, deterministic confidence downgrade, and three-card validation;
- build customer HTML and the private readiness PDF from the same component;
- run locale, evidence, hash, storage, and page-count gates;
- atomically activate the new revision and mark the replacement completed.

Replacement transient or operator-repairable failures use normal checkpoint recovery. A failed replacement never modifies the original job, restores a credit, submits another refund, or creates another replacement.

## Commercial and Customer State

The original order remains historically `paid / fulfillment failed / refund failed` unless a real provider event changes the refund state. Successful replacement delivery records a separate courtesy fulfillment result and sets `courtesy_non_billable = true`; it does not rewrite the original fulfillment failure as if the first job succeeded.

After activation:

- issue a report access token scoped to the active V3 revision;
- queue one replacement-report-ready email with a unique business idempotency key;
- show both truths on the report page: the courtesy report is ready, and the provider refund still requires assistance unless it later succeeds;
- never claim cash refund success without a provider refund ID and verified reconciliation.

## Operator Surface

Provide protected-staging-only prepare, inspect, and dispatch commands. Each command must verify the staging database fingerprint and print the original and replacement lineage IDs. There is no production flag, request-controlled bypass, customer route, or generic terminal-job retry command.

The inspect command is read-only and reports eligibility, replacement state, job/checkpoint state, artifact readiness, active revision, credit status, refund status, and email state.

## Tests

Required deterministic and PostgreSQL coverage:

- snapshot-materialization regression first, then implementation;
- eligibility rejection for unpaid, non-terminal, active-artifact, reserved-credit, wrong-question-set, competing-correction, duplicate-replacement, and production cases;
- atomic creation and rollback of the replacement lineage;
- no order, payment event, refund, entitlement, or credit creation;
- replacement job has no credit reservation and cannot enter ordinary paid terminalization;
- artifact readiness and one-active-revision invariants;
- idempotent success and failure handling;
- truthful order-status projection and replacement-ready email idempotency;
- anonymous, expired, wrong-report, and wrong-scope HTML access returns application-level `404`.

Run the focused suites, full `npm test`, lint, build, isolated PostgreSQL tests, CodeGraph sync, staging preflights, staging deployment, Worker alignment, and final `db:audit`.

## Live Acceptance

No replacement record may be created until the fixed revision is deployed, staging Workers match it, and every preflight passes.

Acceptance is complete only when:

- exactly one replacement lineage and job exist;
- all three V3 answer cards are present and contract-valid;
- confidence/status/limitation copy matches actual independent-domain evidence;
- the new revision is ready and active with HTML and private-PDF readiness metadata;
- an authorized browser can open the complete report;
- anonymous and wrong-scope access return `404`;
- desktop and mobile browser checks pass;
- no new payment, order, credit, or cash-refund claim was created;
- the customer page truthfully exposes both report delivery and unresolved refund assistance;
- production remains untouched.

The task is not complete at deployment, job creation, or another failure explanation. It is complete only at an accessible, activated report or at a genuinely external blocker that cannot be repaired within the authorized repository and staging boundaries.
