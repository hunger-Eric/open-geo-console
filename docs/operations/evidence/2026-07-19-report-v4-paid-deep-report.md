# Report V4 paid deep report - 2026-07-19

## Executive outcome

The protected-staging V4 paid journey produced a real, authorized customer HTML report for `https://mimo.xiaomi.com/zh`. The report is an active `combined_geo_report_v4` core artifact and is deliverable as `completed_limited`: two of the three ordinary buyer questions have substantive answers and linked public sources; the remaining question is explicitly unavailable rather than fabricated.

This is a successful paid core-report delivery, not full V4 conformance acceptance. The registry's 20 requirements remain `implemented`, not `verified`, because the exact diagnosis-failure and question-failure scenario authorities and their requirement-bound evidence have not yet been collected.

Production was not deployed, mutated, queried for acceptance, or used for commerce.

## Immutable run identity

| Authority | Identity / outcome |
|---|---|
| Target | `https://mimo.xiaomi.com/zh` |
| Report | `43dbe8f5-49e6-48f5-a902-cc8c3965c199` |
| Free job | `2eebae16-e649-4011-ad1d-ccd635c0fb10` / `completed` |
| V4 pre-admission job | `6d9ebea9-0ce7-401b-ab62-dbb16ed554be` / `completed` |
| Site snapshot | `report-v4-site-a45e43140613f4f980fa98c9fca7d62012ae97c46c15389ad6eb94a10a90c158` / `completed_limited` |
| Locked question set | `business-question-set-7acc7a43e72e76c2c6943d5d585a4a2c66558490a02a9816f90ed7b94914867d` |
| Airwallex Sandbox order | `c2071a58-5ba3-4ff6-8576-5bfec30569e3` / CNY 199.00 / `paid` |
| Core deep job | `da19f154-acee-4c23-8c9e-5ccea9365992` / `completed_limited` / 100% |
| Active artifact | `report-v4-core-e3ffa435bdbb7996762aa87c8c0127d062c6cd0d493f5b7856b6a06f84980c9e` / revision 1 |
| Internal report credit | `c060773f-f237-4552-a464-4d54ecfa7d19` / `refunded` |

The signed payment state became authoritative at `2026-07-19T00:22:46.300Z`. Fulfillment terminalized at `2026-07-19T00:37:58.271Z`.

## Customer artifact evidence

Protected Preview route:

`https://open-geo-console-m77155ry1-itheheda-6857s-projects.vercel.app/reports/43dbe8f5-49e6-48f5-a902-cc8c3965c199/report.html`

Authenticated exact-route inspection returned HTTP 200 and a 96,079-byte HTML document with:

- `data-report-version="4"`;
- exactly three customer question cards;
- two cards marked `已回答` and one marked `暂不可用`;
- ten public-source links across the answered questions;
- the expected answer-first sections: `Open GEO 报告`, `官网结论`, `支持结论的优势`, `可观察缺口`, `GEO 行动`, and `客户问题`;
- no observed duplicated `市场市场` wording and no freight-specific `货型` leakage.

The kept Chrome tab received a one-day protected-staging report-access cookie scoped to this report during validation. The cookie value is not logged or stored in this document.

## What the report says

### Website foundation

The immutable pre-admission crawl saw seven candidates, admitted three analyzable same-site pages, and excluded two candidates. The limited crawl outcome is carried into the report rather than hidden. The paid core reused this exact snapshot; it did not silently recollect a different site foundation.

### Question results

1. The first buyer question is `暂不可用`. The product preserves the explicit unavailable state instead of constructing unsupported prose.
2. The global-market question is answered with routes for AI researchers to evaluate and access the MiMo-V2.5-Pro family. Its source set includes public conference, model ecosystem, industry-analysis, and institutional pages.
3. The procurement question is answered with service-scope, delivery-condition, limitation, and risk checks. It presents a practical verification frame instead of a generic marketing conclusion.

Observed source URLs include ICML 2026 Expo, Tech Buzz China, Ollama, Clarivate, and a Chinese economy article. Source links remain attributable to their own question cards; source retrieval is an audit sidecar and does not erase an already generated answer.

### Quality judgment

The report is useful as a constrained research starting point, but not a complete purchasing dossier. Its strongest qualities are explicit uncertainty, question-owned sources, and practical procurement framing. Its principal limitations are the three-page analyzable foundation, the unavailable first question, and the absence of a completed enhancement/diagnosis stage after the limited core outcome.

## Commercial truth

The order is `payment_status=paid` and `fulfillment_status=completed_limited`. The internal report credit is refunded because the result is limited. This internal accounting outcome is distinct from the provider cash-refund outcome.

The final protected-staging commerce pass reported:

- refunds: one claimed, zero succeeded, one failed;
- email: 21 claimed, zero succeeded, 21 retried;
- order refund state: `failed`;
- order delivery state: `queued`.

Therefore:

- the paid report exists and is accessible;
- the Airwallex Sandbox cash refund did not succeed;
- queued redirected test email was not delivered in that pass;
- neither provider operation may be represented as complete.

No enhancement job was enqueued because `completed_limited` correctly terminates the core lane without pretending the optional diagnosis layer succeeded.

## Root-cause repairs made during the live run

1. Page-analysis model contract failures receive one bounded retry, with provider-call counts preserved.
2. Deterministic and legacy page-location identifiers are namespaced, preventing duplicate `location-1-1` persistence.
3. The three question calls are serialized so the model's token-plan lane cannot fail all questions concurrently.
4. The second business question uses industry-neutral wording and no longer introduces duplicated market wording or logistics-only terminology.
5. V4 pre-admission accepts the protected-staging `staging_regeneration` lineage.
6. The standalone TSX report renderer imports the React runtime explicitly.
7. Recovery can reuse only an exact pending V4 generation artifact matching report, order, job, and runtime configuration.
8. Operator access uses an explicit any-active combined-artifact lookup while the legacy default loader remains narrow.
9. Protected-staging access recognizes active V4 artifacts and resolves directly to the authorized HTML-only `/report.html` surface.

The implementation is pushed on `codex/report-v4-implementation` through `7c3efab`.

## Deployment and verification

- Ready deployment: `dpl_7XWvdMcJups3EjSeMQYe8y1oScHt`.
- Deployment URL: `https://open-geo-console-m77155ry1-itheheda-6857s-projects.vercel.app`.
- Fixed protected-staging alias: `https://open-geo-console-staging-itheheda.vercel.app`.
- Vercel build: passed.
- Final local production build: passed.
- Final lint: passed.
- Focused access/renderer/report suite: 30 tests passed.
- CodeGraph: current after the source changes.
- Prior full deterministic run: 2,565 tests passed; five PostgreSQL V4 acceptance phase-snapshot tests failed because their expected schema is stale. Those failures are not represented as green.

The Preview token-hash secret was rotated to a fresh high-entropy sensitive value before the final deployment. Its value was never printed or committed.

## Remaining actions

1. Repair or reconcile the staging Airwallex Sandbox refund path and prove the cash-refund provider outcome.
2. Restore redirected test-email delivery and drain the queued messages.
3. Run the exact diagnosis-failure and question-failure V4 scenarios.
4. Resolve the five PostgreSQL phase-snapshot schema-drift tests.
5. Bind all three scenario authorities to the 20 requirements, review promotion to `verified`, and run the fail-closed final acceptance command.

Until items 3-5 are complete, this document is paid-report evidence only and must not be cited as full Report V4 acceptance.
