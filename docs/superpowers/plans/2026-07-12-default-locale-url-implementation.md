# Default-Locale URL Implementation Plan

## Objective

Ship the approved canonical URL contract: unprefixed Chinese pages, explicit
`/en` English pages, and permanent compatibility redirects from `/zh`.

## Task 1: Lock the route contract with unit tests

Files:

- Modify `apps/web/src/i18n/i18n.test.ts`
- Add `apps/web/src/proxy.test.ts`

Coverage:

- Chinese is the default locale.
- Chinese link generation omits `/zh`.
- English link generation retains `/en`.
- Locale switching adds or removes `/en` without changing the logical path.
- Unprefixed localizable paths request an internal Chinese rewrite.
- Legacy `/zh` paths request a permanent unprefixed redirect.
- API, Next.js assets, public files, and report HTML artifacts bypass locale routing.
- Redirects and rewrites preserve query strings.

Run the focused tests first and confirm that the new assertions fail against
the current behavior.

## Task 2: Implement the shared URL contract

Files:

- Modify `apps/web/src/i18n/locales.ts`
- Modify `apps/web/src/i18n/index.ts`
- Modify `apps/web/src/i18n/routes.ts`

Changes:

- Set `zh` as the default locale in both shared normalization surfaces.
- Generate unprefixed paths for Chinese and `/en` paths for English.
- Classify `/zh` as a redirect, `/en` as an explicit localized route, and
  unprefixed UI paths as internal Chinese rewrites.
- Keep nonlocalized infrastructure paths unchanged.

## Task 3: Apply the contract at the Next.js request boundary

Files:

- Add `apps/web/src/proxy.ts`
- Modify `apps/web/src/components/app-header.tsx`

Changes:

- Use the Next.js 16 `proxy.ts` convention beside `src/app`.
- Redirect legacy Chinese prefixes with status 308.
- Rewrite canonical unprefixed UI paths to the existing `/zh` route tree.
- Pass the resolved interface locale through an internal request header for
  document-language metadata without trusting client input.
- Normalize header navigation state so rewritten Chinese paths remain active
  and language switching produces canonical URLs.

## Task 4: Complete canonical metadata

Files:

- Modify `apps/web/src/app/layout.tsx`
- Modify `apps/web/src/app/[locale]/layout.tsx`

Changes:

- Set the document language from the proxy-resolved interface locale.
- Generate canonical and alternate-language metadata with unprefixed Chinese
  and `/en` English URLs.
- Use the configured report base URL as the production metadata base without
  making local builds depend on a production-only environment variable.

## Task 5: Verify and synchronize durable state

Files:

- Modify `docs/PROJECT-STATE.md`
- Modify `docs/DECISIONS.md` only if implementation changes an architectural
  boundary beyond the approved design.

Commands:

```bash
npm test -- --run apps/web/src/i18n/i18n.test.ts apps/web/src/proxy.test.ts
npm run lint
npm test
npm run build
```

Acceptance:

- `/` renders Chinese without a visible redirect.
- `/en` remains English.
- `/zh` redirects to `/` and `/zh/reports/<id>?x=1` redirects to
  `/reports/<id>?x=1`.
- `/reports/<id>` reaches the Chinese report interface without changing stored
  report prose or authorization.
- `/reports/<id>/report.html`, `/api/*`, `/_next/*`, and public files retain
  their current behavior.
