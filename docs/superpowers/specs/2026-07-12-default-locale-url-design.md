# Default-Locale URL Design

## Goal

Make Chinese the default public interface for Open GEO Console and remove the
`/zh` prefix from canonical Chinese URLs. Preserve explicit `/en` URLs for the
English interface and keep all existing `/zh` links working through permanent
redirects.

## URL Contract

| Purpose | Canonical URL |
| --- | --- |
| Chinese homepage | `/` |
| Chinese page | `/<path>` |
| Chinese report workspace | `/reports/<id>` |
| English homepage | `/en` |
| English page | `/en/<path>` |
| English report workspace | `/en/reports/<id>` |

The following compatibility redirects are permanent and preserve the remaining
path, query string, and fragment where the client controls it:

| Legacy URL | Destination |
| --- | --- |
| `/zh` | `/` |
| `/zh/<path>` | `/<path>` |

API routes, Next.js assets, public files, and nonlocalized artifact routes do
not participate in locale-prefix routing.

## Routing Architecture

The application keeps the existing `[locale]` route tree as the rendering
boundary. A request-routing layer maps canonical unprefixed Chinese paths to
the internal `zh` route and maps explicit `/en` paths to the internal `en`
route. This preserves one localized component tree without duplicating pages.

The root route renders Chinese through the same routing contract instead of
redirecting to a language-prefixed URL. Requests carrying the legacy `/zh`
prefix receive a permanent redirect before rendering. Unknown first path
segments are treated as unprefixed Chinese paths rather than as locale codes.

## Link Generation and Language Switching

All internal link helpers generate canonical URLs:

- Chinese links omit the locale prefix.
- English links include `/en`.
- Switching from Chinese to English adds `/en` while preserving the logical
  path and query string.
- Switching from English to Chinese removes `/en` while preserving the logical
  path and query string.

No customer-facing component should construct locale prefixes independently of
the shared route helpers.

## Report-Locale Boundary

This change affects interface routing only. A report's persisted generation
locale remains immutable. Opening a report through another interface locale
may change navigation and UI chrome only; it must not regenerate, translate, or
mutate stored report prose.

Existing access, checkout-return, staging-access, email, and PDF routes must
continue to preserve the report's authorized destination and locale rules.

## SEO and Migration

Chinese pages declare their unprefixed URL as canonical. English pages declare
their `/en` URL as canonical. Alternate-language metadata pairs the two
canonical forms. Legacy `/zh` URLs are redirects, not separately indexable
pages, preventing duplicate Chinese results.

The public sitemap and any generated share links must emit canonical URLs only.
The Vercel default hostname is outside this routing change and remains an
operational domain-management concern.

## Error Handling

- Unsupported locale-looking prefixes are handled as ordinary Chinese paths
  and may resolve to the normal application 404.
- Redirects preserve query strings.
- Localized route resolution must never rewrite `/api`, `/_next`, or public
  files.
- Redirect loops between unprefixed Chinese paths and `/zh` are prohibited by
  construction and covered by tests.

## Verification

Automated coverage must prove:

1. `/` resolves to the Chinese homepage without a client-visible redirect.
2. `/reports/<id>` resolves through the Chinese interface.
3. `/en` and `/en/reports/<id>` continue to resolve through English.
4. `/zh` and `/zh/reports/<id>` permanently redirect to their unprefixed
   equivalents while preserving query strings.
5. Locale switching adds or removes only the explicit English prefix.
6. API, asset, public-file, access, checkout-return, and report-artifact paths
   retain their existing behavior.
7. Persisted report generation locale remains unchanged.

Acceptance uses the repository commands:

```bash
npm run lint
npm test
npm run build
```

## Out of Scope

- Translating stored report prose.
- Browser-language or geolocation-based redirects.
- Changing the Vercel or Cloudflare domain configuration.
- Adding another language.
- Restructuring report authorization, commerce, or persistence.
