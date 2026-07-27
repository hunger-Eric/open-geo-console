# Combined GEO Report Correction Acceptance — 2026-07-14

This record contains non-secret protected-staging evidence. Timestamps are UTC. Production configuration, database, Workers, aliases and domains were not modified.

## Scope and reviewed revisions

- Approved design: `docs/superpowers/specs/2026-07-14-combined-geo-report-business-question-correction-design.md` (`72242e4`).
- Implementation plan: `docs/superpowers/plans/2026-07-14-combined-geo-report-business-question-correction.md` (`b17f342`).
- Reviewed staging runtime revision: `3bd8ed2c9d9130d42418c07fc311529877862779`.
- Commercial SKU remains `recommendation_forensics_v1`; the active artifact contract is `combined_geo_report_v1`.

## Fixed paid order and confirmed questions

- Order: `5f999610-17d5-4df9-9aa0-a6cce5e5b741`.
- Report: `a71d7481-c5dc-4e2a-a042-b9be878feab8`.
- Original paid job: `dd2cff0b-ba16-43b0-aded-55fdc767e656`.
- Locked question set: `business-question-set-dc8919cefb5cd54ea6ac5e1f4da5a6ffdba428d73355364de8e6377b2da75677`; low confidence was explicitly acknowledged.

| Purpose | Locked private question | Neutral public-search variant |
| --- | --- | --- |
| `core_service_discovery` | 哪些供应商或方案能够提供自营专线物流？ | 哪些供应商或方案能够提供自营专线物流? |
| `customer_region_fit` | 哪些自营专线物流供应商适合中国大陆至台湾的跨境电商卖家（亚马逊、Shopee等平台）？ | 哪些自营专线物流供应商适合中国大陆至台湾的跨境电商卖家(亚马逊、Shopee等平台)? |
| `purchase_delivery_risk` | 采购自营专线物流时，应如何比较B2B跨境物流与供应链服务、交付条件与风险？ | 采购自营专线物流时,应如何比较B2B跨境物流与供应链服务、交付条件与风险? |

## Correction and artifact state

- Correction entitlement: `6e00d089-5f23-4e78-a65e-61728c6a2167`, completed and unique for the order.
- Correction job: `534a49e2-522e-463c-a1e0-8a1bfa9c0c9c`, `reason=paid_report_correction`, `stage/execution_state=completed`, `credit_reservation_id=NULL`.
- Resume generation is `3`. Three runtime defects exposed by the real correction were fixed and the same job resumed: Worker React runtime import, completed-snapshot recovery, and terminal cutoff binding. Recovery did not create another correction, question set, snapshot ref, artifact revision, charge, credit or email.
- Active artifact revision: `7ab7f57f-bbc1-4eaa-886b-629b5c4cb7a4`, revision `1`, activated `2026-07-14T06:03:11.571Z`.
- Combined payload size: 118,028 bytes.
- HTML SHA-256: `20984d1094bf7168e31ca20c197e805c3944c15c9e1939db68349c29b442dd08`.
- PDF SHA-256: `e82ec60583def8d1ad9c1c62fad456107bd391d17fdcc55872096a254e52abb4`; readiness recorded 19 pages, canonical HTML and private evidence ready.
- Private PDF key: `reports/a71d7481-c5dc-4e2a-a042-b9be878feab8/evidence/7ab7f57f-bbc1-4eaa-886b-629b5c4cb7a4.pdf`.

## Public-source and screenshot evidence

- Snapshot refs: 3, unique for the correction job.
- Queries: 18; search attempts: 18; observations: 33; `market_source_evidence`: 22.
- Snapshot IDs:
  - `snapshot-fa8ff61daf9d03dd592aaddf24d174438fa6facd833756f10734f8cede11618d`
  - `snapshot-2e50ecc3a11b71607fc121ebbfd7ca1310de560c4a6016428a31fce6833f20d1`
  - `snapshot-3d0f2dbb1c754c1647b7e74f762a6fc1851aad8f7892880976dea7eea8ca3cf7`
- Retained private screenshots: 10, totaling 1,731,956 bytes; all ten authorized evidence routes returned the expected image bytes.
- A scoped database pollution scan searched snapshot, query, attempt, observation and `market_source_evidence` rows for the customer organization/brand/domain, order/report IDs and private question text. Every table returned zero contaminated rows.

## Protected staging deployment

- Vercel Preview deployment: `dpl_ArNBV4g5fDKmKhweKkuw27AgoaBK`.
- Preview URL: `https://open-geo-console-2qfduaver-itheheda-6857s-projects.vercel.app`.
- Fixed protected alias: `https://open-geo-console-staging-itheheda.vercel.app`.
- Worker image: `open-geo-console:staging-3bd8ed2c9d91`, image ID `sha256:984742fa681102e3c10333379596aed582f88465b4d3764b729d148baa840184`, OCI revision `3bd8ed2c9d9130d42418c07fc311529877862779`.
- Free Worker container `a5ba45e6d675e8d34037d8d3ddef204747b02fd718f878858119a8d5d77001fc`; presence `ogc-worker-free-4915f5f7-aff8-453f-81fb-9407919d71d0`.
- Deep Worker container `08bc2e224d9f8b14d0fddd2076f080ee7d98b728a974c450fa14d5d8ad3a4809`; presence `ogc-worker-deep-0a299faf-5529-4a8e-9986-f8ebc77bb32a`.
- Both containers used `OGC_DEPLOYMENT_PROFILE=staging`, the exact reviewed revision, the same image ID, zero restarts, ready logs and second-level database heartbeats.

## Customer links and real-browser acceptance

Vercel Authentication remains the outer Preview boundary. An authorized operator first opens the staging access route for the fixed paid order, then the customer artifact routes:

- Access bootstrap: `https://open-geo-console-staging-itheheda.vercel.app/zh/reports/a71d7481-c5dc-4e2a-a042-b9be878feab8/staging-access?order=5f999610-17d5-4df9-9aa0-a6cce5e5b741`.
- Canonical HTML: `https://open-geo-console-staging-itheheda.vercel.app/reports/a71d7481-c5dc-4e2a-a042-b9be878feab8/report.html`.
- Same-HTML PDF: `https://open-geo-console-staging-itheheda.vercel.app/api/reports/a71d7481-c5dc-4e2a-a042-b9be878feab8/artifacts/report.pdf`.

Real headed Chromium acceptance used a Vercel-protection-bypassed staging context plus the application report cookie:

| Route | Result |
| --- | --- |
| `/report.html` | `200`; exact artifact revision, 8 report sections, 5 technical table rows, 44 article cards, 15,709 text characters |
| `/technical` | `200`; 5 technical rows, 727 text characters, same active revision/deep data |
| `/analysis` | `200`; 20 article cards, 5,547 text characters, same active revision/deep data |
| `/issues` | `200`; 11 article cards, 1,945 text characters, same active revision/deep data |
| PDF | `200`; 155,966 bytes, hash matched the active revision and rendered in Chromium |
| Private screenshots | all 10 routes returned `200` images |
| Fresh anonymous app context | HTML `404`, PDF `404`, and private evidence `404` |

The HTML inspection covered full technical analysis, all verified findings, page URLs/quotes/screenshots, deterministic technical score, six AI dimensions, page-type analysis, three-question public forensics, 90-day roadmap, vendor tasks/acceptance criteria, method, coverage, freshness and limitations. Browser screenshots and trace are retained under ignored `output/playwright/`; no cookies or browser storage are committed.

## Email and commercial side-effect audit

- `corrected_report_ready` delivery: `47f9131a-e2ac-4d24-9260-ca8a8c1a7944`.
- Business idempotency key: `corrected_report_ready/7ab7f57f-bbc1-4eaa-886b-629b5c4cb7a4/v1`.
- Provider message: `969e35c7-b114-4398-a9c4-6459cfe76de7`; sent `2026-07-14T06:11:02.480Z`, delivered `2026-07-14T06:11:04.687Z`; one processed `email.delivered` event.
- The delivery row recorded three transport attempts because the first local Worker-side attempts had intentionally unavailable email transport values. The protected Preview commerce runner subsequently sent one provider message; artifact-key idempotency prevented duplicates.
- Order remained `payment_status=paid`, `fulfillment_status=completed`, `refund_status=not_required`, `delivery_status=delivered`.
- The original single credit remained `settled`; correction job had no reservation. New charge/reservation/settlement/refund counts were zero; refund rows were zero.
- Uniqueness audit: one correction, one locked question set, three questions, one active artifact, three snapshot refs and one correction email.

## Verification results

- `npm test`: 148 passed files, 14 skipped; 765 passed tests, 35 skipped.
- `npm run lint`: passed.
- `npm run build`: all packages and Next.js production build passed.
- `npm run db:audit` against staging: passed; no terminal commercial job retained reserved credit.
- `npm run test:postgres:staging-security`: 5 passed files, 9 conditionally skipped; 22 passed tests, 13 skipped, zero failures.
- Targeted correction/runtime tests after live fixes: 3 files, 11 tests passed.
- `git diff --check`: passed.

## Production non-interference

Production container identities remained unchanged throughout acceptance: free `00eba2f6afe2da3c21b8a149a885c66447a126bc501736c9dfffd979a2052684`, deep `e15346b3f18fb5e3a5819ec40fcfbe4bc78c6a831dd9a0bfaeae38e6b6c1836c`, commerce `be94b86e9febd2621793d800f528ceb5253f8e3aa144dbb38e8abc5456e54663`; all retained image `sha256:028901e0e5e3f9287524573d62f10cdccc22fb9109bd21875a35e5c0709e1d3a`. No production deploy, database command, Worker rebuild, configuration edit, alias change or domain change was performed.

Result: the fixed staging order has a readable, complete `combined_geo_report_v1` HTML report and same-source PDF. The combined-report lane may release the next paid staging order; this acceptance did not create that order and does not authorize a production mutation. Separate production/security gates remain independently closed where listed in `PROJECT-STATE.md`.
