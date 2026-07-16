# Report Language Consistency And Internal-Only PDF Design

## Summary

Future Open GEO Console reports must use the report's immutable generation locale consistently. A Chinese report uses Simplified Chinese for customer-facing prose, except for source material and unavoidable proper nouns such as brands, product names, URLs, code, and identifiers. An English report follows the equivalent English-only rule. Prompt instructions are the first control, but deterministic presentation mappings and a pre-delivery language gate prevent occasional model or application-field leakage from reaching a customer.

HTML remains the sole customer report. HTML-to-PDF rendering, private storage, and readiness verification remain available as internal artifact controls, but customers are no longer shown, linked to, emailed, or otherwise delivered a PDF.

This change applies prospectively. Existing generated report payloads and active artifact revisions are not regenerated or rewritten.

## Goals

- Make every newly generated report readable in its persisted generation locale.
- Tell every report-producing model call explicitly which language to use.
- Detect obvious mixed-language model prose before a new artifact becomes customer-ready.
- Localize deterministic application labels and enum values instead of relying on the model.
- Preserve source fidelity without presenting unexplained foreign-language passages as report prose.
- Keep the existing HTML-to-PDF capability for internal rendering and readiness checks.
- Remove PDF from every customer delivery and discovery surface.

## Non-Goals

- Do not regenerate, translate, mutate, or replace existing report payloads or artifact revisions.
- Do not use route locale changes to alter a report's persisted generation locale.
- Do not machine-translate quoted evidence, URLs, legal names, brands, product names, code, or identifiers.
- Do not create a second PDF-specific report composition or spend this phase redesigning print layout.
- Do not change payment, entitlement, report-token, correction, settlement, refund, or email-authority state machines.

## Selected Approach

Use three mutually reinforcing controls:

1. Locale-bound generation prompts make the intended language explicit at the source.
2. A report-language validator checks designated customer-facing generated fields before artifact readiness and terminalization.
3. Deterministic presentation mappings localize application-owned labels, enum values, and fallbacks.

A prompt-only approach is insufficient because models can occasionally ignore it and because application-owned fields do not come from the model. Translating the final report wholesale is rejected because it can distort evidence and identifiers.

## Locale Contract

The report locale is established at admission and remains immutable. Every downstream model request that creates customer-visible report prose must receive the same normalized language contract.

For `zh` reports:

- use Simplified Chinese for headings, explanations, findings, impacts, recommendations, summaries, roadmap items, business-question answers, and vendor tasks;
- do not add an English duplicate of Chinese prose;
- allow Latin text only when required for a brand, organization, product, protocol, URL, email address, code token, identifier, or similarly unavoidable proper noun.

For `en` reports:

- use English for the same customer-visible fields;
- do not add a Chinese duplicate of English prose;
- allow Chinese text only inside preserved source material or an unavoidable official proper name.

The prompt contract must be shared by the report-generation and business-question synthesis paths rather than copied as unrelated ad hoc sentences. Structured output schemas remain unchanged unless a field is needed to distinguish source text from report explanation.

## Language Validation Boundary

Language validation runs on new customer-facing report prose after structured model validation and evidence verification, but before HTML/PDF readiness and atomic terminalization. It traverses an explicit allowlist of human-facing generated fields so internal metadata cannot accidentally become a policy input.

The validator excludes:

- URLs, domains, email addresses, hashes, IDs, code, and machine-readable values;
- organization, brand, and product names when used as proper nouns;
- verbatim source excerpts and source titles retained as evidence.

The validator reports field paths and bounded, sanitized reasons. It must detect sentence-scale foreign-language leakage without rejecting a Chinese paragraph merely because it contains an English brand or technical term.

On failure, the Worker may make one bounded corrective synthesis attempt using the original locale and the validator's safe field-level feedback. If the corrected result still violates the contract, the job follows the existing recoverable validation/repair boundary and must not activate or deliver the artifact. A mixed-language report is therefore never treated as successfully complete.

## Source Evidence Presentation

Evidence fidelity takes precedence over translation. A quote or source title may remain in its original language, but the UI must label it as source-original content. When the source language differs from the report locale, the surrounding finding, interpretation, and recommendation must still use the report locale so the customer can understand why the evidence matters.

This phase does not require an automatic full translation of source excerpts. It requires a locale-consistent explanation around them and prevents raw source passages from being mistaken for the product's own narrative.

## Deterministic Presentation Localization

Application-owned text must not be emitted as raw internal values. Report components use locale maps for:

- severity and status labels;
- page-type and coverage labels;
- evidence and freshness labels;
- section headings, fallbacks, and empty states;
- roadmap, vendor-task, and business-question presentation labels.

Unknown enum values fail visibly in development and tests. Production fallbacks use safe localized wording and must not expose raw snake-case identifiers to customers.

## PDF Boundary

HTML is the only customer-delivered artifact. The implementation removes PDF from:

- report navigation and action buttons;
- report workspace, share, print, and locked-feature copy;
- completion and correction email copy;
- customer-facing artifact download routes and links;
- customer acceptance tests and product claims.

The existing HTML-to-PDF renderer remains an internal capability. The Worker may continue to render the canonical HTML into a real PDF, verify its signature and substantive output, hash it, and store it in private evidence storage as part of readiness. No internal storage key or PDF endpoint is exposed to the customer.

Existing stored PDF bytes do not need a migration or deletion. Existing report payloads and revisions remain immutable, but customer-facing application code no longer advertises or delivers PDF.

## Data Flow

1. Admission persists the immutable report locale.
2. Worker generation normalizes that locale and applies the shared locale prompt contract to every customer-prose model call.
3. Existing schema, structured-output, and evidence verification run.
4. The language validator checks designated generated prose.
5. A failed check receives at most one corrective synthesis attempt, then enters the existing recoverable failure boundary if still invalid.
6. Application-owned values are localized deterministically when the canonical HTML is rendered.
7. Internal readiness renders that HTML and may materialize and privately store a PDF.
8. Atomic terminalization activates the HTML artifact.
9. Email delivers only the secure HTML report link and does not mention PDF.

## Compatibility And Rollout

- Language enforcement is prospective and applies to reports generated after deployment.
- No historical payload backfill, artifact revision switch, or correction entitlement is created.
- Historical data remains readable under its existing locale and content.
- The customer PDF surface is removed as a delivery-policy change; private PDF storage columns and internal readiness contracts remain intact.
- Deployment must not claim completion until both Chinese and English new-report fixtures pass the language gate and customer-facing PDF discovery tests.

## Testing And Acceptance

Automated acceptance must cover:

- Chinese generation prompts explicitly require Simplified Chinese and English prompts explicitly require English.
- A Chinese report containing ordinary English sentences in generated prose fails validation, while brands, URLs, code, and IDs are allowed.
- The equivalent English report rejects ordinary Chinese prose outside source material and unavoidable official names.
- Source-original excerpts are preserved and labeled without causing the surrounding report narrative to switch language.
- One bounded correction can recover a violating payload; a second violation cannot reach artifact terminalization.
- Every application-owned report label and fallback renders in the selected locale.
- New Chinese and English combined-report fixtures contain no unexplained cross-language customer prose.
- Report HTML, customer emails, localized product copy, and customer routes expose no PDF action, claim, attachment, or download.
- Internal HTML-to-PDF materialization still produces a real PDF and remains part of readiness verification.
- Existing report rows and artifact revisions are untouched by rollout code.

Manual acceptance should generate one new Chinese report and one new English report, read every customer-visible section, inspect source-original labeling, confirm the email opens only HTML, and verify that no customer navigation or known customer artifact route offers PDF.
