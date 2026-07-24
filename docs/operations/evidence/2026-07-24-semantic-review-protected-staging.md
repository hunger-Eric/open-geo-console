# 2026-07-24 protected-Staging semantic-review Phase 3 evidence

## Result

Final status: `DEVIATION_REVIEW_REQUIRED`.

The exact activation candidate was deployed to protected Staging and one fresh
test-site report was submitted. The normal Free job completed and created the
expected marker-bearing V4 pre-admission job. That job stopped fail-closed in
`snapshot_resolution` before the unified Free semantic review because two
resolved public-search cache authorities did not satisfy the current snapshot
verifier. No retry, replay, second report, checkout, payment, Paid continuation,
refund, email action, production mutation, push, merge, PR, or tag occurred.

## Candidate and local verification

- Branch: `codex/v4-answer-optimization-scope-reset`.
- Baseline: `38ab4d78a7bc46b7a77eee3921b1a099be9677ab`.
- Candidate: `11927beb4f8fafd5eaddde5d0491dbcf4a44b849`.
- Candidate commit message: `feat: activate semantic review for new reports`.
- Candidate source/test paths:
  `apps/web/src/db/jobs.ts` and
  `apps/web/src/db/staging-security.postgres.test.ts`.
- The candidate was committed locally only and was not pushed.
- Focused unit verification: 15 tests passed.
- Disposable PostgreSQL verification: 7 tests passed after the fresh database
  received its required `staging` environment marker; the disposable container
  was removed.
- Full verification: 302 test files and 2,810 tests passed; 46 files and 188
  tests were skipped.
- `npm run lint`, `npm run build`, and `git diff --check` passed.

## Protected-Staging deployment

- Vercel Preview deployment:
  `dpl_DxnJQU23awMcPH6NbQHWiAbjJ8tD`.
- Preview URL:
  `https://open-geo-console-ffj9cztph-itheheda-6857s-projects.vercel.app`.
- Fixed protected-Staging alias moved:
  `https://open-geo-console-staging-itheheda.vercel.app`.
- Deployment state was `READY`; revision metadata was the exact candidate SHA.
- Authenticated `/api/commerce/catalog` returned HTTP 200 with test commerce
  enabled.
- Candidate Worker image:
  `open-geo-console:staging-11927beb4f8fafd5eaddde5d0491dbcf4a44b849`,
  image ID
  `sha256:7d5f873f46ebfe173c6595c519e0979b63456021b7745970b745d1ecc367827e`,
  size 1,237,526,128 bytes, revision label equal to the candidate SHA.
- Retained rollback image:
  `open-geo-console:staging-df013fc63ae36c3c55214e9478dd2ee2bbaf1fd7`,
  image ID
  `sha256:ed721dacbbc02e4b7973b9d1fce555d8697a986a371f7d5513f0cb986af96761`,
  size 1,235,864,668 bytes.
- Staging Free container:
  `cc650afd286a1a4d0cd65cd295f023fa61ad5aa7366ed7f9e75e977b7be01c77`.
- Staging Deep container:
  `50bd0804d6682d6b570b87a5b0327bb67d601b26ccfe521b8cc9ae9c63c998b6`.
- Both Staging Workers were running on the exact candidate image with zero
  restarts and the `staging` / `preview` database and deployment markers.
- Production Worker container and image identities were not changed. The
  pre-existing production Free/Deep restart loop remained outside this scope.

## Docker and disk record

- Before cleanup/build, E drive free space was 3,921,473,536 bytes and Docker
  reported 92.39 GB of images.
- The thin overlay copied only `apps/` and `packages/`; no dependency, browser,
  system-package, or full Worker build ran. Build context was 8.17 MB.
- The exact twelve zero-reference Staging images named in the approved scope
  were removed. Docker reported 1,102,430,208 unique bytes freed. The deleted
  image IDs are:
  `sha256:5f366092624a4ab57472cb8cd024a9776dfbc4f2ad104ba517df7723d3371f5d`,
  `sha256:4089deb19828a0473a55b4930f37729212477414fccd4941eb5086ae79f4ddab`,
  `sha256:8c95a716d0f67fd35c5988e509547b442dee1b0d4d3726372f17ae72cc487890`,
  `sha256:96abf96c63e162683f2050c788bac9aa15e2354233724852713db185cf5ca8af`,
  `sha256:c30b30bc32a7049e93a493d88b9e3bffd6c72a9570c98458fe2be727da44ce6c`,
  `sha256:9943d450435fdea586fa382ecb513cfb0c2f7e2112f2f9d7a23fda8e2794f0b1`,
  `sha256:b2aa28892250578a776b519958027c4098b6aea73709281a9761b1da35f4c908`,
  `sha256:1d704cdeb6f29566aeb65a940b8706d3ff0812a3716c4992b6f7265867c0e453`,
  `sha256:cb05a38db6682bb6bc938f714cb698697b9236d1fe1151cc095d3a0f548afbd4`,
  `sha256:c61306696232facf908f29311a9542e85d589c367c2f28f0e2c237726aec160c`,
  `sha256:7db1c3e3fdd0ef800c5913da1f47a98dc7fe6f3a5d1a349503b67226705c787f`,
  and
  `sha256:76c603238eb8602f12b82ef2f869aba90a4332606fc722ba1ea940e39a22984a`.
- After candidate verification, the superseded initial rollback
  `sha256:0721a4b4698a8131e9d341e44207dabdbcdd5445441eacd3a9babcbd1ba2af39`
  was removed after its zero-reference check.
- At final inspection, E drive free space was 19,787,206,656 bytes and Docker
  reported 52.74 GB of images, 23.31 GB of volumes, and 1.258 GB of build
  cache. The drive-level increase includes host accounting outside the exact
  Docker deletion delta and is not represented as bytes freed solely by this
  operation.
- The pre-deletion per-image virtual sizes are no longer available from the
  current daemon after removal; exact IDs, zero-reference checks, and the
  aggregate unique-byte deletion result are retained above. This is an evidence
  limitation and no individual deleted-image size is reconstructed.

## One-shot canary lineage

- Submitted target: exactly `https://shun-express.com/`.
- New report ID: `d5b85b92-2731-47da-ab9d-52793de179e5`.
- Free job ID: `42f5ed0c-3309-4834-97a7-ed3d443736de`.
- Free job result: `completed`, one job attempt.
- V4 pre-admission job ID:
  `fa49626f-9c3a-478b-852c-b459443e9e1a`.
- Root marker: `report-semantic-review-v1`.
- Stop state: `repair_wait`.
- Stop phase: `snapshot_resolution`.
- Error code: `unexpected_internal_error`.
- Classification: `operator_repairable`; no `retryable_at`.
- Normalized error:
  `Marked Free teaser snapshot authority is unavailable.`
- Free teaser checkpoint stage: `observations_ready`.
- No semantic-review projection or receipt was persisted.
- Commercial effects for this report: zero orders, zero payment events, zero
  refunds, zero credit-ledger rows, and zero Paid artifact revisions.

## Read-only root-cause evidence

All three referenced snapshot rows existed. Each had three queries, three
successful attempts, and nine `returned` observations. Missing data, pending
attempts, failed searches, duplicate observation IDs, and non-returned results
were excluded.

The verifier recomputed current fanout identity and found:

- Snapshot
  `snapshot-b4629cb6868ff6af907cfcba69ea3922ce40d4b811440ce7431265e7723e352f`
  was created on 2026-07-24 and matched all current snapshot and query fields.
- Snapshot
  `snapshot-0628f2bd9af6b30775f10b28d2b7c52a8f8db94965a11a7e3c419d0171046b33`
  was created on 2026-07-22. Its query text, hashes, order, derivation rules,
  authority, and observations matched, but its persisted
  `query_fanout_hash`
  `b4f67fcf0726dcf05ac60a394d2cee11e641f867e88b30460fb3ab8500da7007`
  differed from the current expected
  `4afc5c1c73157a6e3ede70fe1c1cb9aac52aed1c37e3baef255e35fd0d917244`;
  all three deterministic query IDs also differed.
- Snapshot
  `snapshot-2bda4cfafe20ae89409242370cd8ad1ccc423bcf07ea1fa2251e9ddca7e26bda`
  was created on 2026-07-22. Its query text, hashes, order, derivation rules,
  authority, and observations matched, but its persisted
  `query_fanout_hash`
  `82d3b9460fcc54da17856d73dec5cf134f2c880df02e93db23732558218aafcd`
  differed from the current expected
  `b0ee7e208e4250c543210ede541b48008e867f4acd74ac5a74bb7c7116349836`;
  all three deterministic query IDs also differed.

The normal resolver therefore reused two completed shared cache authorities
whose cache identity remained selectable even though their older query
fanout/query-ID lineage was no longer exact under the current verifier. The
verifier rejected those authorities before any semantic-review call. Repairing
cache identity, snapshot selection, verifier semantics, or historical data is
outside the approved production allowlist and requires a new scope.

## Stop boundary

The one authorized canary has been consumed and cannot be retried or replaced
under Phase 3. Protected Staging remains on the candidate revision to preserve
the exact failure evidence and rollback image. Production remains untouched.
Phase 3 is not accepted, and Phase 4 production activation is not authorized.
