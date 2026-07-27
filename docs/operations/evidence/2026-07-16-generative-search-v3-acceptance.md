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

## Source-selection diagnosis follow-up acceptance

- Paid report `4b4e71b8-c130-4c83-8d4a-e3787ded7009` for `https://shun-express.com/` locked question set `business-question-set-ba934fe710d804f389bf16c240f3fa23c7127e64f7f50d368e17f02c888baa6e` under CNY order `c631f80e-4f6e-44a4-b0de-42aee8559c51`.
- Original deep job `146da7a2-b28b-4925-af89-0a30c9af0c23` remains terminal and immutable. Audited replacement `0d800aca-029d-4bb5-9820-54ca5dd072c7` completed as job `f77914f3-a40b-445f-9b9c-ddb72ca96e2f`; artifact `7a891ad9-687f-4ee6-a344-dbb9c8fca157`, revision 2, is active.
- All three `generative_search_v1` cards are answered and nonblank with 19, 16 and 19 same-response sources. The prospective `source_selection_diagnosis_v1` sidecar is `partial` and contains 41 source profiles, repeated-domain patterns, traceable question contributions, independently evaluated observable factors, target gaps, prioritized actions and explicit non-causal limitations.
- The top action is to build independently citable service-fact pages. The target domain did not enter the returned source set for any of the three questions; repeated source domains include `sf-international.com`, `ups.com`, `freightamigo.com`, `dhl.com`, `sf-express.com` and `mofcom.gov.cn`. Inaccessible UPS and DHL pages remain visible as limitations rather than inferred evidence.
- Internal readiness is private: canonical HTML SHA-256 `7c33c3556d6e1134175683e1ae54fdd9e6f09300cba917c6c58d2bdf091ab3d3`, private PDF SHA-256 `991c854509d2c9de341b47f17664b47c027b71688eed277ec9ae63fad1996ee9`, 93 pages, and one private storage key.
- Canonical Playwright QA loaded the active database payload, reproduced the exact persisted HTML hash, and rendered desktop 1440x1100 plus mobile 390x844. Both views contained 3 answer cards and 41 source profiles with no horizontal overflow; screenshots are stored under `C:/Users/fengc/.codex/visualizations/2026/07/16/019f6a3e-563f-7610-b08c-8ee301cea457/`. The in-app browser runtime failed before navigation because its kernel asset path was unavailable, and the protected-route CLI probe timed out; neither is represented as authenticated live-route visual proof.
- All four order emails (`payment_confirmed`, `report_failed_refund`, `refund_assistance`, `replacement_report_ready`) are delivered. Delivery is complete, the internal credit is refunded, and the Airwallex Sandbox cash refund remains truthfully failed because provider authentication is invalid; no provider refund success is claimed.
- Repairs `607c8ad`, `328911e`, `4388219` and `aee3690` isolate PostgreSQL recovery fixtures, restore provider-claim resume state, safely downgrade invalid provider claims, and keep replacement delivery independent from refund status. The full deterministic suite passed 1,141 tests with 42 skipped; lint, production build and staging `db:audit` passed.
- Staging free/deep Workers run `open-geo-console:staging-aee3690`, image ID `sha256:76c603238eb8602f12b82ef2f869aba90a4332606fc722ba1ea940e39a22984a`. Production free/deep Workers remain on `open-geo-console:prod-v25-11befe9`, image ID `sha256:ed17c0fe9e159834df2dc72a5f8a5d70314e2dcb3f6fd5b2b4a4f3174229e234`; production commerce was not changed.
