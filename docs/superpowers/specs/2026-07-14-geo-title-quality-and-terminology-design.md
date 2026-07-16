# GEO Page-Title Quality and Report Terminology Design

**Date:** 2026-07-14  
**Status:** Approved in conversation; awaiting written-spec review

## Goal

Make newly generated customer reports explain highly repetitive page titles as a GEO technical-quality problem and use GEO, never SEO, in customer-facing report copy.

The change must preserve source evidence, internal compatibility, and all previously materialized reports.

## Observed Problem

The audited site returned separate successful documents with different body lengths, but five page titles shared the same 99-character suffix. Each page had only a short page-specific prefix. The report correctly preserved the source titles, yet the page table looked as if the same content had been analyzed repeatedly.

The current deterministic auditor detects only a missing or very short title. It does not detect:

- exact title reuse across pages;
- a long shared title prefix or suffix that dominates page identity;
- excessive title length when that length is caused by a repeated template.

The combined customer artifact also maps the internal vendor identifier `seo` directly to the visible label `SEO`, and generated prose is currently permitted to use that term. This conflicts with the product's GEO terminology.

## Product Language Decision

All application-owned and model-generated customer copy in a new report must use GEO terminology. The report should explain title repetition in terms of generative-engine understanding:

- distinguishing the purpose of one page from another;
- selecting the correct evidence page;
- associating claims with the correct URL;
- producing precise citations and answers.

The report must not describe this work as SEO, search-ranking optimization, or an older search-engine practice.

Source-original evidence is immutable. If a captured quotation, source page title, URL, company-provided question, or other source-original field contains `SEO`, the report keeps it verbatim and labels it as source-original where appropriate.

## Scope

### In scope

1. Deterministic detection of exact duplicate and highly templated page titles.
2. One grouped, localized GEO finding with affected-page evidence and actionable guidance.
3. A more readable page-title cell for new reports that separates page-unique text from the shared template while retaining expandable source-original text.
4. GEO terminology in customer-visible vendor labels and generated report prose.
5. A prospective terminology gate for newly materialized combined artifacts.
6. Tests for Chinese and English reports, source-original exceptions, and historical compatibility.

### Out of scope

- Rewriting any source page title or customer website content.
- Migrating or rematerializing existing reports.
- Renaming persisted database values or the stable internal `seo` vendor enum.
- Adding customer PDF delivery or changing private HTML-to-PDF readiness.
- Broad scoring or crawler redesign unrelated to page-title identity.

## Chosen Approach

Use deterministic audit rules plus presentation-aware rendering. A display-only change would hide the repeated text without reporting the GEO problem. A model-only classification would be less reproducible and could not safely drive scoring. The deterministic result therefore remains authoritative, while the model may explain already-established evidence in localized prose.

## Deterministic Title-Pattern Analysis

`packages/geo-auditor` will own a pure title-pattern analyzer used by both finding construction and new-report presentation.

Only successful pages with non-empty titles participate. Titles are normalized for comparison by decoding the already-extracted text, collapsing whitespace, trimming surrounding whitespace, and comparing case-insensitively where case exists. The stored source title is never replaced.

### Exact duplicate rule

Emit a grouped duplicate-title result when at least two distinct normalized page URLs have the same normalized title. This URL normalization is only an identity comparison and does not depend on the page exposing a canonical link.

### Dominant template rule

Emit a grouped template-title result when all of the following hold:

1. At least three distinct successful pages have titles.
2. A common prefix or suffix contains at least 20 Unicode code points after surrounding separators and whitespace are ignored.
3. The shared segment accounts for at least 60% of the normalized title on at least 60% of participating pages.
4. At least two affected pages retain different non-empty page-unique segments, so the rule identifies a repeated template rather than an exact-duplicate group.

If both a qualifying prefix and suffix exist, select the candidate affecting more pages, then the candidate with the greater total shared ratio, then the longer candidate. This makes selection deterministic.

A short brand suffix such as `| Company Name` does not qualify because it fails the minimum shared-segment length or dominance requirement.

### Excessive template length

The finding records weighted title length as supporting evidence, using two display units for CJK/full-width characters and one for other characters. A title over 120 display units may strengthen the explanation, but it does not create a separate finding when the dominant-template rule already accounts for the problem. This avoids duplicate warnings and double penalties.

### Findings and scoring

Add localized finding message keys for exact duplicate titles and dominant template titles. Findings include:

- affected-page count;
- up to three representative URLs;
- shared-segment position and length when applicable;
- a description of the lost page-unique GEO signal;
- a recommendation to keep the page purpose specific and move only a concise brand identifier into the reusable portion.

The findings use the existing per-rule scoring cap. A single page group cannot create an unbounded deduction as site size grows, and one root cause is not emitted twice for the same affected pages.

## New-Report Page Table

Source titles remain stored unchanged. The page table changes only when the persisted technical report contains one of the new title-pattern finding keys.

For an affected row, the title cell shows:

1. the page-unique segment as the primary value;
2. a compact label such as `共享模板后缀（99 字）` or its English equivalent;
3. an HTML-native expandable section containing the complete source-original title.

Unaffected rows remain unchanged. Existing report payloads do not contain the new finding keys, so rendering them continues to use the legacy full-title cell and does not alter their presentation.

The HTML remains the only customer artifact. The expandable source text must degrade safely in private Chromium PDF readiness without introducing a customer PDF surface.

## GEO Terminology Policy

New combined artifacts carry an explicit presentation terminology policy, for example `geo_v1`.

When that policy is present:

- the internal vendor value `seo` renders as `GEO` in both Chinese and English artifacts;
- model prompts instruct the model to use GEO terminology and prohibit SEO terminology in report-authored prose;
- the final combined-artifact gate rejects standalone `SEO` or `search engine optimization` in customer-visible application/model prose;
- the existing one-correction language path may correct model-authored terminology once;
- deterministic application copy must already pass and cannot rely on a model retry.

The terminology gate excludes source-original fields and stable identifiers. It must not rewrite evidence quotations, URLs, source titles, user-provided text, or the persisted internal enum `seo`.

Artifacts without the policy retain their existing payload and rendering. No historical report is changed or regenerated.

## Data Flow

1. The crawler fetches each page independently and preserves its source title, headings, canonical link, structured-data presence, and readable-text length.
2. `geo-auditor` analyzes the complete page set for duplicate or dominant title templates.
3. New finding keys enter the technical report and are localized through the existing technical-report projection.
4. Combined artifact materialization records the `geo_v1` terminology policy.
5. Model prompts and deterministic copy use GEO terminology.
6. The prospective final gate checks both report language and prohibited legacy terminology, while respecting source-original exceptions.
7. The renderer uses the new finding evidence to clarify affected title cells and maps the internal `seo` identifier to the visible GEO label only for the new policy.

## Failure and Compatibility Behavior

- Missing or insufficient page-title evidence produces no template finding.
- Ambiguous common text below the deterministic thresholds remains unclassified rather than guessed by the model.
- A model terminology violation receives at most the already-sanctioned single corrective generation; exhaustion follows the existing report-language failure boundary.
- Application-owned SEO wording is a test/build defect and must be fixed in code, not sent through model correction.
- Existing payloads, active revisions, stored HTML, and private PDF bytes are not migrated or rewritten.

## Verification

Add deterministic tests for:

- exact duplicate titles across distinct URLs;
- the observed long shared-suffix pattern;
- a shared-prefix pattern;
- normal short brand suffixes that must not trigger;
- two-page samples that must not trigger the dominant-template rule;
- aggregation, representative URLs, and capped scoring;
- Chinese and English finding localization;
- new-report compact title rendering with expandable full source text;
- legacy report rendering without the new finding keys;
- `seo` internal enum compatibility with visible `GEO` under `geo_v1`;
- rejection of SEO terminology in application/model prose;
- allowance of SEO only inside explicitly source-original evidence or stable identifiers.

Run focused tests first, followed by:

```powershell
npm test
npm run lint
npm run build
codegraph status
```

## Acceptance Criteria

1. A newly generated report for the observed pattern clearly states that the pages are distinct but their titles share a dominant template.
2. The table highlights page-unique title text and retains the full source-original title.
3. Customer-visible new-report prose and labels contain GEO rather than SEO, except immutable source evidence.
4. Existing reports remain byte-for-byte unmodified in storage and retain legacy rendering behavior.
5. Customer delivery remains HTML-only and private PDF readiness still passes.
