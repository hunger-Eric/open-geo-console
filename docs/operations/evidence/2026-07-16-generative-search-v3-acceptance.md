# Generative-search V3 acceptance - 2026-07-16

## Accepted evidence

- Source revision: `31475182d942271ccf05a07d75e8a913c488ac0f`.
- Protected Preview: `dpl_8fzuv1RQSJCta4LUwAK8sQrYPypQ`; the fixed staging alias was repointed. No production deployment was made.
- Staging free/deep Workers both run image `open-geo-console:staging-3147518`, image ID `sha256:843bac1307968dbeeff6d351d98b3ff7febe83a9fb76de2e4ef57eb246ef3746`, with the exact source revision label. Production free/deep Workers remained running on `open-geo-console:prod-v25-11befe9`.
- Deterministic gates: 184 test files passed and 20 skipped; 1,121 tests passed and 42 skipped. Lint and production build passed. Staging database audit passed.
- The real `generative-answer:staging:probe` returned a nonblank Chinese answer and 20 normalized same-response sources without printing answer prose or secrets.
- A new forced staging free report, `c3bbc553-79f0-46d2-b456-85c9f9d27031`, completed once through the new free Worker with no job error.

## Not accepted

The Preview commerce catalog remained fail-closed, so no new Sandbox order or paid deep report was created. The guarded non-billable refresh for historical report `0631932e-72b8-4c6f-b492-820e2533e23e` also refused because its persisted original commercial outcome was not refreshable. These guards were not bypassed. Therefore this record proves the generative provider operation, deterministic integration, deployment identity, and Worker alignment, but not a completed customer HTML artifact containing all three new generative cards.

## Remaining gate

Restore an approved protected-Preview commerce-ready state, then create one new three-question Sandbox order and verify three nonblank `generative_search_v1` cards, answer-before-sources rendering, application-level unauthorized `404`, private PDF readiness, and atomic order/job/credit/email settlement.
