# Combined Question Answer Presentation Acceptance — 2026-07-14

This record contains non-secret protected-staging evidence. Production configuration, database, aliases and containers were not modified.

## Delivered scope

- `combined_geo_report_v1` section 05 renders exactly three customer cards. Each card contains its locked business question, one short evidence-constrained answer, and only the source domain, clickable URL and freshness.
- Public-source excerpts, long summaries, `verifiedExcerpt`, query/snapshot/evidence IDs, grades, matching details and debug data remain persisted for verification but are absent from customer HTML/PDF.
- Technical URLs, quotes and ten private screenshot references remain in the active payload and customer report.
- Historical non-combined contracts are unchanged. Canonical HTML and PDF use `CombinedGeoReportArtifact`; the PDF is materialized from that HTML before activation.

## Protected staging artifact

- Report: `a71d7481-c5dc-4e2a-a042-b9be878feab8`.
- Refresh job: `5890da0f-d74a-4943-a00b-3c1438cbe869`, completed in one Worker attempt with no credit reservation.
- Active artifact: `bc5a0b3d-44fb-4978-a5fb-0aba329bd2e9`, revision `10`, kind `presentation_refresh`, source revision `7ab7f57f-bbc1-4eaa-886b-629b5c4cb7a4`.
- Atomic activation: `2026-07-14T09:45:25.644Z`; the source revision remained active until readiness completed.
- HTML SHA-256: `7e165ea501a82eefc094a6dfe1ff7dbeb1d8dc1df277118e7340369cf9891a6f`.
- PDF SHA-256: `32999619403760d6e1279b89eccf6b3976e44546cabdf8384e108434e9510f83`; 118,423 bytes returned by the protected route; `%PDF-` signature; readiness records 18 pages, canonical HTML, private evidence and presentation refresh.
- Ten retained screenshot references still bind to the original paid technical job and retain URL/content hashes.
- The refresh created zero credit rows, corrections, refunds or email deliveries. Its single dispatch-outbox row is the expected notification for the authorized staging job.

## Deployment and customer links

- Preview deployment: `dpl_2Cg22jV97R816HbPECWazrGCkRsN` (`https://open-geo-console-zrj4uaj8u-itheheda-6857s-projects.vercel.app`), status Ready, target Preview.
- Fixed protected alias: `https://open-geo-console-staging-itheheda.vercel.app`.
- HTML: `https://open-geo-console-staging-itheheda.vercel.app/reports/a71d7481-c5dc-4e2a-a042-b9be878feab8/report.html`.
- PDF: `https://open-geo-console-staging-itheheda.vercel.app/api/reports/a71d7481-c5dc-4e2a-a042-b9be878feab8/artifacts/report.pdf`.
- Staging Workers: free `65b48caafb620d21ece564afbee254d3a74f1a7cf59ec1a3f06c58eb75a6f876`, deep `4aea5712794c1c27ac1c62ad86dbca0a7ea7ff89578d8d0353712b122703558d`; both use image `sha256:38c5007dc6d97616f1ec232e68b3cca1c580037f51a4571b333d193856575885`.

## Real Chromium acceptance

- Authorized `/report.html`: `200`, active artifact identity matched revision 10.
- Three cards were found in locked order with purposes `core_service_discovery`, `customer_region_fit`, and `purchase_delivery_risk`; answer/source counts were `1 + 3`, `1 + 2`, and `1 + 3`.
- Every source anchor had its expected external URL. The section contained no verified-excerpt label, internal ID, Grade A-D label, identity hash, matching process or debug text.
- Technical report inspection found 19 technical links and ten rendered screenshots.
- Authorized PDF: `200`; returned SHA-256 matched the active database revision exactly.
- A fresh Chromium context containing only the Vercel bypass cookie received application-level `404` for both HTML and PDF. A fully anonymous request remained outside the application at Vercel Authentication (`302`).
- Screenshots: ignored runtime files `output/playwright/combined-question-answer-report.png`, `output/playwright/combined-question-answer-section.png`, and `output/playwright/combined-question-answer-anonymous-404.png`.

## Verification

- `npm test`: 151 files passed, 15 skipped; 868 tests passed, 36 skipped.
- `npm run lint`: passed.
- `npm run build`: all workspaces and the Next.js production build passed locally; the Preview build also passed.
- `npm run test:postgres:staging-security`: 5 files passed, 10 conditionally skipped; 22 tests passed, 14 skipped.
- Staging `db:audit`: passed; no terminal commercial job retained reserved credit.
- `git diff --check`: passed.
- CodeGraph: 472 indexed files, 5,166 nodes, 13,402 edges; index up to date.

## Production non-interference

Production identities remained unchanged: free `00eba2f6afe2da3c21b8a149a885c66447a126bc501736c9dfffd979a2052684`, deep `e15346b3f18fb5e3a5819ec40fcfbe4bc78c6a831dd9a0bfaeae38e6b6c1836c`, commerce `be94b86e9febd2621793d800f528ceb5253f8e3aa144dbb38e8abc5456e54663`; all retain image `sha256:028901e0e5e3f9287524573d62f10cdccc22fb9109bd21875a35e5c0709e1d3a`. Their pre-existing runtime states were not changed. No production deploy, database command, alias, domain, configuration or service operation was performed.
