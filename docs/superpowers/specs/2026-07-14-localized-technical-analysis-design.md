# Localized Technical Analysis Design

## Goal

Ensure the complete technical-analysis section of every newly materialized combined report uses the report's immutable generation locale. Existing report payloads, active revisions, historical HTML, and stored internal PDF bytes remain unchanged.

## Root Cause

`@open-geo-console/geo-auditor` persists deterministic findings with stable `messageKey` and `params`, but also carries English fallback `title`, `description`, and `recommendation` strings. The combined-report artifact currently renders those fallback strings directly. Model-language instructions and validation cannot correct them because they are application-owned audit output, not model output.

## Chosen Boundary

Localization happens while building a new combined artifact revision in `apps/web`, before final language validation and before HTML/internal-PDF readiness.

The builder creates a localized projection of `GeoAuditReport` for the new combined payload:

- Findings with a known `messageKey` are rendered from the report-locale dictionary using their persisted `params`.
- Machine-readable asset summaries are rendered deterministically from the asset key and `present` state.
- English reports receive the English dictionary projection; Chinese reports receive Simplified Chinese.
- The source technical-foundation row is not mutated.
- Existing combined revisions are not parsed, rewritten, migrated, or re-rendered.

The reusable localization helper belongs in the report presentation layer, not `geo-auditor`. The auditor remains locale-independent and deterministic.

## Customer-Visible Field Policy

The following technical-analysis fields must match the report locale in every newly materialized combined artifact:

- finding title;
- finding description;
- finding recommendation;
- machine-readable asset availability summary;
- application-owned section labels, counts, and status text.

The following remain source-original or stable technical identifiers:

- audited URL and canonical URL;
- HTTP status;
- H1 and page title captured from the customer site;
- JSON-LD, H1, H2, canonical, URL, HTTP, robots.txt, sitemap.xml, and llms.txt identifiers.

The Chinese artifact adds a short note that page titles, H1 values, and URLs are source-original, so unavoidable foreign-language source content is not mistaken for untranslated report prose.

## Final Language Gate

`assertCombinedGeoReportLanguage` must include the localized technical finding prose and machine-readable asset summaries.

For a normal new artifact, the existing full-report gate checks both AI and deterministic technical prose. For `presentation_refresh`, historical AI-foundation prose may retain its existing scoped exception, but the newly projected deterministic technical fields must still be checked because they are localized during the new revision build.

A technical-language failure remains `operator_repairable` with code `report_language_validation_failed`, enters `repair_wait`, and must not activate the new revision or send completion email.

## Rendering

`CombinedGeoReportArtifact` renders only the localized technical projection stored in the new combined payload. It does not translate at read time. This preserves immutable historical presentation and makes HTML and internal PDF consume identical localized content.

## Verification

Tests must prove:

1. A new Chinese combined artifact renders the H1 and canonical findings in Chinese while preserving `H1`, `H2`, `canonical`, and URLs.
2. A new English artifact renders the same finding in English.
3. Machine-readable asset summaries follow the persisted locale.
4. Page title/H1/URL source-original values are unchanged and the Chinese explanatory label is present.
5. The final gate rejects English deterministic technical prose in a new Chinese artifact.
6. `presentation_refresh` still validates newly localized technical fields without revalidating exempt historical AI-foundation prose.
7. Historical parsers and artifact loaders do not invoke localization or mutate stored reports.
8. Internal HTML-to-PDF readiness still renders the localized HTML and produces a substantive private PDF.

## Non-Goals

- No migration or repair of existing report revisions.
- No locale parameter in `geo-auditor`.
- No model call for deterministic technical localization.
- No customer PDF route or delivery change.
