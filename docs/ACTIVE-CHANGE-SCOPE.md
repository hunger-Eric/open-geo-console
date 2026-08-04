# Active Change Scope Lock

Status: `APPROVED` (amendment D1 approved 2026-08-04)

## Amendment D1: commercial-checkout null-guard fix

The first Preview build of `2bcf3ec` failed TypeScript:
`commercial-checkout.tsx:99` dereferences possibly-null `returnResult`
(`returnResult?.orderId === returnContext?.orderId` is true when both are
null, i.e. an ordinary report view without payment-return params — a real
render-time crash path, inherited from the never-type-checked parallel UI
task). Authorized fix, ≤3 lines in
`apps/web/src/components/commercial-checkout.tsx` only:

`const returnStatus = returnResult && returnContext && returnResult.orderId === returnContext.orderId ? returnResult.status : null;`

Plus: focused component tests rerun, local production build type-check must
pass, one fix commit on `main` (pushed), then ONE replacement Preview
deployment with the new HEAD SHA as `ogcGitSha` (the failed deployment moved
no alias). The version tag, if the user accepts, is created on the post-fix
HEAD.

## Objective

Redeploy the fixed Protected Staging site from the merged `main`
(`2bcf3ec4742b1d13828084e06b7286516f2ae784`, tree byte-identical to the
accepted `codex/delivery-root-fix`) so the user can verify the merge —
especially the never-browser-verified payment-return UI change — BEFORE any
version tag is created. The `v0.3.0` tag was retracted (local + remote) at
the user's direction and will only be re-created after user acceptance.

## Baseline

- Canonical worktree on `main` @ `2bcf3ec`, clean, local == origin.
  The two `.data` worktrees and `apps/web/.tmp-preview` must not be used or
  modified.
- Both Staging Workers already run image `sha256:ab4f795c...` (commit
  `0dd8206`), whose content is contained in the merged `main` tree — NO
  Worker rebuild or recreate is needed or authorized.
- Vercel manual-Preview mode: `vercel deploy --yes --meta ogcGitSha=<SHA>`;
  project `prj_WVpdlJfsEp0YyWM2W54w8oBy985S`, team
  `team_PbYYV2K2zBjTeThfavXStTOI`. Preview-scope env vars
  (`OGC_PROVIDER_PROFILE=sensenova_anysearch`, AnySearch base URL + API key)
  were written earlier and apply to every Preview deployment — verify them
  read-only, do not rewrite.
- Current fixed site serves Preview `dpl_EetcWT3cUjcwa9yqr2fCuKR3RX9j`
  (`ac3fe3c`); that deployment remains the instant rollback target.
- Two Sandbox refunds (`6eaff177-...`, `c0a1df43-...`) stay `pending`;
  refund submission is NOT authorized here.

## Allowed actions and files

- One manual Vercel Preview deployment of `main@2bcf3ec` with
  `--meta ogcGitSha=2bcf3ec4742b1d13828084e06b7286516f2ae784`.
- Read-only verification of the new Preview: `READY` state, deployment meta
  (`ogcGitSha` and `githubCommitSha` equal to `2bcf3ec`), env presence check
  via the project env API (no values rewritten).
- One alias move of the fixed Protected Staging hostname to the verified
  Preview, following the gates in `docs/PROTECTED-STAGING-OPERATIONS.md`.
- After the user's explicit acceptance: create annotated tag `v0.3.0` on
  `2bcf3ec` and push it (one tag, one push).
- `.tmp/` scratch; `docs/ACTIVE-CHANGE-SCOPE.md` and
  `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md` for status flips and closeout.

## Forbidden

- No production code edits, no commits other than none (deployment only;
  the tag is the only Git mutation, and only after user acceptance).
- No Worker image build/recreate/restart, no Docker cleanup, no env writes,
  no database writes, no refund submission, no new paid orders, no
  historical-data mutation.
- No GitHub-automatic deployment assumptions; Preview identity must be
  verified via meta, not inferred.

## Acceptance checks

1. New Preview deployment reaches `READY` with both meta SHAs equal to
   `2bcf3ec`; record the deployment id here.
2. Alias moved; fixed Protected Staging URL serves the new Preview
   (anonymous 302 SSO protection remains normal).
3. User performs the browser-side verification on the fixed site (report
   pages render, payment-return page hides purchase controls when paid,
   checkout flow intact) and explicitly accepts or rejects.
4. Only on explicit acceptance: tag `v0.3.0` on `2bcf3ec` and push. On
   rejection: move the alias back to `dpl_EetcWT3cUjcwa9yqr2fCuKR3RX9j` and
   report; no tag.

## Expensive external actions authorized

- One Vercel Preview deployment, one alias move (and one rollback alias
  move only if rejected), one tag push after acceptance.
