# Active Change Scope Lock

Status: `NONE`

No executable change authority is active. The 2026-08-04 A1 unified
output-cap fix (commit `0dd82061c8d1e7ec556006a9f20e707c4d96e271`) is
accepted and archived in `docs/ACTIVE-CHANGE-SCOPE-HISTORY.md`. Both Staging
Workers run image `sha256:ab4f795c...` at commit `0dd8206` with rollback
image `sha256:ab9df490...` retained; the fixed Protected Staging site serves
the `ac3fe3c` Preview `dpl_EetcWT3cUjcwa9yqr2fCuKR3RX9j` with the AnySearch
authority active.

Open items, each requiring its own new FROZEN scope:

- Two pending Sandbox refunds (`6eaff177-ca91-46b4-b7fb-2324acb87e72`,
  `c0a1df43-25bf-4ff8-8e6b-06f7d6097698`) — submission via commerce
  reconciliation is an external action needing explicit authorization.
- User-owned uncommitted files (payment-return UI task components,
  `apps/web/next-env.d.ts`, `docs/PROTECTED-STAGING-OPERATIONS.md`) remain
  dirty in the canonical worktree; commit/deploy decisions belong to the
  user.
- Any Vercel redeploy of the fixed Staging site (e.g. to carry the web-side
  UI changes or move off `ac3fe3c`) is a new deployment scope.
