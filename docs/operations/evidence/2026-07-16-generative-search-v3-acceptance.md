# Generative-search V3 acceptance - 2026-07-16

## Accepted customer outcome

- Report: `f764a24d-2bd8-4714-99fc-c7ad754753ff` for `https://shun-express.com/`.
- CNY 199 Airwallex Sandbox order: `92eaa1f9-5033-4184-8667-bd4a64fef55a`. Its signed payment Webhook created original deep job `bd55fb27-8f29-4f72-81c6-bd69d60eba89` and locked question set `business-question-set-109376f4c5c88364b7eee20bc4b096b487a222601533a2e3b591a85765de5726`.
- The original job generated all three ordinary answers and 58 same-response sources, but terminalized after a persisted-source hash mismatch. The job remained immutable. After the Sandbox refund attempt failed, audited non-billable replacement `4af9920a-45e7-441a-9b44-90cdc0501266` completed through job `6b8ec37e-fb6f-4e1b-ba43-a53739cc43f0`.
- Active replacement artifact: `5d0a1d39-0b75-403f-a59f-b32e2d9bb77c`, revision 2, `combined_geo_report_v3`, status `active`.
- The canonical customer HTML renders exactly three `generative_search_v1` cards. All three are `answered`, with nonblank answer lengths 863, 1,487 and 1,567 characters and 20, 19 and 20 same-response sources. Browser acceptance proved one answer precedes its source block for each question.
- Internal readiness is private: canonical HTML SHA-256 `0630d03716a7d5ffa5a7e56989c621353adcd323ea1b3b5883dbcf42ada9236a`; private PDF SHA-256 `6feac6d0cb55c5fc29ed0c6c2f0370d32cb0e04507eace6b32bb199b3522ee1d`; 46 pages; one private storage key. No customer PDF route or claim was added.
- The order remains truthfully `paid / fulfillment_failed / refund_failed` with `courtesy_non_billable=true`; the replacement is `completed`, the active report revision points to the replacement artifact, and reserved credits are zero.
- The protected Preview commerce runner sent all queued mail in its final pass (`11` succeeded, `0` retried, `0` failed). This order's `payment_confirmed`, `report_failed_refund`, `refund_assistance`, and `replacement_report_ready` deliveries are all `delivered`.
- Staging database audit passed: no terminal commercial job has reserved credit.

## Root-cause repairs

- `d296af7` permits bounded ordinary industry acronyms in predominantly Chinese generative answers while continuing to reject English prose.
- `1641d12` canonicalizes generative source fields before hashing. PostgreSQL `jsonb` key reordering can no longer change a persisted checkpoint's source identity. A regression first reproduced the mismatch with equal objects in different key order.
- `56eb6cb` applies the same dominant-Chinese rule at the final generative answer-card contract. Legacy report prose and diagnosis fields retain the stricter language gate.
- AI-report-engine tests: 12 files, 192 tests passed. Focused answer-first/card tests passed. Lint and the full production build passed.

## Deployment identity

- Protected Preview: `https://open-geo-console-g9lhvb6s6-itheheda-6857s-projects.vercel.app`; the fixed staging alias points to it. No production deployment was made.
- Staging free/deep Workers run `open-geo-console:staging-56eb6cb`, image ID `sha256:6c3f2a3b518d1f4200979d492972a813e5f8658cf97743a614bf2498a6f004c0`, OCI revision `56eb6cb946f06848fe7612ad6da79387fce29de9`.
- Production free/deep Workers remained on `open-geo-console:prod-v25-11befe9`.

## Remaining operational note

The Airwallex Sandbox refund path still failed, so the system correctly did not claim a cash refund. The delivered report is an audited courtesy replacement and created no second charge, order, entitlement, or credit reservation.
