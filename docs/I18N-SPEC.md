# I18n Specification

## Supported Locales

- `en` is the default locale.
- `zh` is the Chinese locale.
- `/` redirects to `/en`.
- Public UI routes must include a locale prefix, such as `/en`, `/zh`, `/en/reports/[id]`, and `/zh/reports/[id]`.
- API routes remain language-neutral under `/api/*`.

## Engineering Rules

- User-visible UI strings must live in typed locale dictionaries, not in React components.
- Navigation, report sections, severity labels, delivery actions, scanner capability blocks, and empty states must be driven by typed registries/configuration.
- Components receive a `Dictionary` and `Locale` or derive them from route params.
- Locale switching must preserve the current route shape and report id.
- `scan_reports.report_locale` is the immutable generation language once established. Switching the interface route changes controls, dates and labels but never translates or regenerates stored report prose.
- Generated prose must use `lang="zh-CN"` or `lang="en"` according to the artifact provenance. A legacy mismatch is corrected only through the authorized one-time locale-correction flow.
- Date and number formatting must use locale-aware helpers.

## Fallback Rules

- Unsupported locale segments route to `notFound()`.
- Old persisted reports may contain literal English finding text; render that text only as a backwards-compatible fallback when a stable message key is missing.
- New audit output should include stable message keys and interpolation params.

## Verification

- Dictionary parity tests must fail if `en` and `zh` diverge.
- Locale helper tests must cover validation, path localization, route switching, and date formatting.
- Browser QA must cover `/en`, `/zh`, report pages, language switching, and mobile overflow.
