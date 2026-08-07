# Active Change Scope Lock

Status: `APPROVED`

Prepared on 2026-08-07 after manual testing of fresh Protected Staging report
`45f09dbf-d293-4edc-9158-83acf9f70b6d` exposed two prospective-flow defects:

1. a model-authored question was tailored to the submitted business but read
   like internal implementation discovery rather than a question a real buyer
   would independently ask; and
2. both "Unlock full report" links targeted `#checkout`, while the checkout
   component rendered no content when its catalog was unavailable.

The user approved preparation of this exact local repair scope, then explicitly
approved this written allowlist and model/code boundary on 2026-08-08. Local
implementation and tests may proceed within this file surface only.

## Objective

Repair only the prospective Free/V4 path so that:

1. the model remains the sole semantic author and reviewer of three buyer
   questions, and emits explicit buyer-intent review evidence before code may
   confirm the question set; and
2. `#checkout` always contains a visible loading, unavailable, or ready state,
   while the existing checkout POST remains reachable only from the ready
   purchase form.

The repair is prospective only. It must not change, replace, replay, reopen, or
clone the observed report or any other persisted report/question set.

## Confirmed baseline

| Item | Value |
|---|---|
| Repository | `E:\project\open-geo-console` |
| Branch / HEAD | `main` / `45ff1696b559e11b9523f1f973f8e70e0eaca87e` |
| Remote identity | `main...origin/main` at the same SHA |
| Existing dirty state | Scope receipt only in `docs/ACTIVE-CHANGE-SCOPE.md`; archived in history while preparing this scope |
| Question symptom | Q1 asks which concrete data sources or external platform APIs are integrated into the freight-lead system |
| Question mechanism | One model output is automatically confirmed after shape, lane, distinctness, and neutralization checks; there is no persisted buyer-intent review evidence |
| Checkout symptom | Two `href="#checkout"` links; current `#checkout` exists but has empty HTML and no input/button |
| Checkout mechanism | `CommercialCheckoutContent` returns `null` when the catalog is absent, failed, or disabled |
| Current report authority | Confirmed question set is immutable and out of scope |

CodeGraph was current at scope preparation. Recheck it before implementation
and sync it after source changes.

## Approved model/code boundary

| Critical node | Observable outcome | Executor | Code may do | Failure behavior | Required evidence |
|---|---|---|---|---|---|
| Read website foundation | Stable evidence-bound input | Code | Load and serialize persisted foundation | Stop on missing foundation | Foundation identity already used by the run |
| Generate three buyer questions | Three locale-correct questions covering the persisted lanes | Model | Supply foundation, locale, region, and output schema | Stop on provider/schema failure | Model operation plus prompt-contract version |
| Review buyer intent | For every question: buyer role, purchase decision, and why a real buyer would ask it | Model, in the same bounded structured generation response | Require the review fields and accepted decision; never judge meaning with keywords/templates | Typed rejection before confirmation; no code-authored fallback or retry | Persisted review identity/hash bound to the question-set checkpoint |
| Confirm question identity | Exactly three reviewed, distinct, safe questions | Code | Shape, length, lane, distinctness, neutralization, hashes, persistence | Stop on any mismatch | Confirmed question-set and review identities |
| Render checkout state | Loading, unavailable, or ready panel at `#checkout` | Code | Fetch catalog/questions and render deterministic state | Visible unavailable state; no POST | Component state and focused UI tests |
| Create checkout | Existing secure hosted-checkout path | Code/provider | Preserve email, Turnstile, idempotency, server price, safe redirect | Existing typed error; no alternate provider | Existing checkout contract tests |

The single buyer-question model request may contain two model-owned stages
(draft and buyer-intent review) in one structured response. This scope does not
authorize an extra provider request, retry, correction request, model-profile
operation, or deterministic semantic fallback. If implementation proves that a
separate model call or new model-profile operation is necessary, stop and
request a revised scope.

## Allowed files

### Production

- `apps/web/src/worker/report-v4-free-teaser.ts`
- `apps/web/src/components/commercial-checkout.tsx`

### Tests

- `apps/web/src/worker/report-v4-free-teaser.test.ts`
- `apps/web/src/components/commercial-checkout.test.ts`
- `apps/web/src/components/commercial-checkout.test.tsx` (new only if the
  existing test file cannot exercise client rendering without weakening the
  acceptance gate)

### Scope records

- `docs/ACTIVE-CHANGE-SCOPE.md`
- `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`

No other source, test, fixture, configuration, dependency, schema, migration,
script, or documentation file is allowlisted.

## Required behavior

### Buyer-question contract

1. The structured model response must contain exactly the three existing lane
   identities and, for each final question, nonblank model-authored buyer role,
   purchase decision, and buyer-reason fields.
2. The model contract must reject internal implementation inventory, bespoke
   solution-discovery questions, and target-company interrogation unless the
   model judges the detail to be a genuine buyer-facing purchase criterion
   supported by the foundation.
3. Code validates only structure, bounded text, lane coverage, distinctness,
   identity, and safety. It must not decide buyer plausibility through keywords,
   templates, industry maps, scores, or local prose.
4. A rejected, missing, or malformed buyer-intent review stops before question
   confirmation, search, Q1 answering, or checkpoint promotion. There is no
   fallback or second model request.
5. The accepted review identity is bound to the prospective checkpoint so a
   ready checkpoint cannot substitute another review or question set.

### Checkout presentation

1. The checkout component must not return an empty render while catalog state
   is loading, failed, or disabled.
2. Loading renders visible non-purchase status at `#checkout`.
3. Catalog failure or `enabled=false` renders the existing localized
   `dictionary.commerce.unavailable` message and no form/POST control.
4. An enabled catalog with a valid price preserves the existing three-question,
   email, Turnstile, idempotency, hosted-checkout, and redirect behavior.
5. No unavailable/loading interaction may call the checkout POST endpoint.

## Explicitly forbidden

- Editing or regenerating report `45f09dbf-d293-4edc-9158-83acf9f70b6d`.
- Any historical report, job, question-set, order, payment, entitlement,
  artifact, credit, refund, email, or database mutation.
- Code-authored buyer questions, buyer-intent keyword rules, templates, industry
  maps, heuristic scores, cached prose, or silent fallback.
- A second model request, correction request, retry, or new model-profile
  operation.
- Changes to catalog API behavior, commerce readiness, payment providers,
  prices, Turnstile, schemas, migrations, dependencies, model profiles, or
  provider adapters.
- Vercel environment writes, secret changes, Preview deployment, Worker image
  build/recreate, alias movement, Production action, real report/model/search/
  crawl, checkout/order/payment/refund/email action.
- Commit, push, merge, tag, branch, or worktree changes.



### Deployment amendment — user approved 2026-08-08

The user explicitly approved Protected Staging Gates 0–3 deployment of this
already-implemented dirty tree and git push origin main (cap 1). This
amendment authorizes:

- one candidate commit of the allowlisted dirty files only;
- one Staging Preview with ogcGitSha;
- one thin source-overlay Worker image (FROM current Staging Worker image,
  COPY apps + packages only; package-lock/Dockerfile.worker unchanged);
- recreate only staging-worker-free/deep; set OGC_DEPLOYMENT_VERSION only;
- one fixed-alias move to the candidate Preview;
- one git push origin main.

Still forbidden: Production, Gate 4 / agent model-report-payment-refund-email,
historical mutation, second Preview/overlay/alias after failure without a new
scope, secret changes.

## Diff budget

Measured as additions across the complete working-tree diff against `HEAD`:

| Surface | Maximum additions |
|---|---:|
| Production files | 180 lines |
| Test files | 260 lines |
| Scope/history records | Tracking only |

Deletion is allowed only when directly replacing the defective behavior. Any
production-source overrun or newly required file is a stop-and-report condition.

## Acceptance checks

1. A valid fixture proves one structured model response owns both question
   generation and explicit buyer-intent review, then preserves the same three
   final texts through confirmation.
2. Rejected/malformed review fixtures fail before downstream question
   confirmation, Q1 answer, analysis, or retry; structured invocation count
   remains exactly one.
3. Tests prove no deterministic semantic question or buyer-likelihood fallback
   exists.
4. Checkout component tests cover loading, unavailable/failed catalog, and
   enabled catalog states. The first two are visible and have no purchase form;
   the ready state preserves the existing purchase form.
5. Existing checkout response/idempotency/redirect tests remain green.
6. Run the focused affected tests, `npm run lint`, `npm run build`,
   `git diff --check`, and `codegraph sync` / `codegraph status`.
7. Automated acceptance is local only. No real model-call or protected-Staging
   availability claim may be made under this scope.

## Stop conditions

- Buyer-intent acceptance cannot be represented in the existing single model
  response without a second provider call or model-profile/config change.
- Correct checkout behavior requires catalog-route, readiness, provider,
  environment, or payment changes rather than the allowlisted presentation fix.
- A required dependency or test harness is absent.
- Any acceptance check requires a real report, model/search/crawl, order,
  payment, deployment, database mutation, or historical repair.
- The baseline HEAD/branch changes or a non-scope dirty file appears.

## Approval receipt

On 2026-08-08 the user explicitly replied: "批准这个 FROZEN Scope，执行本地代码修改和测试。"
This authorizes the local implementation and tests only. It does not authorize
Vercel configuration, deployment, a new report, a model call, checkout,
payment, or Git operation.

## Local implementation receipt

Completed on 2026-08-08 within the approved allowlist:

- focused Vitest: 3 files / 23 tests passed;
- lint: passed with 9 pre-existing warnings and no errors;
- build: passed after one local TypeScript narrowing correction;
- `git diff --check`: passed (line-ending conversion warnings only);
- production additions: 148 / 180; test additions: 107 / 260;
- CodeGraph synced 3 changed source files and reports the index up to date.

No real model/search/crawl, report mutation, checkout/payment, deployment,
Vercel configuration, database mutation, commit, push, branch, or worktree
operation was performed.
