# HTML-First Visual Evidence Report Design

## Summary

Open GEO Console should deliver the paid private report as an HTML-first customer artifact, with a PDF generated from the same HTML report. The HTML report is the canonical reading experience because it can preserve the existing report design quality, support rich evidence cards, and let customers inspect screenshots in context. The PDF is a faithful export for forwarding, archiving, and customer-internal circulation.

This design also adds screenshot evidence captured during the same audit pass that produces quotes and URLs. Verified Webhooks remain the only authority for payment, entitlement, private report access, and deep-job creation.

## Goals

- Make the generated HTML report the best-looking and most complete customer-facing artifact.
- Generate a PDF from the same HTML artifact instead of maintaining a separate weaker report composition.
- Include visual evidence beside quoted evidence so non-technical customers can see the actual page issue.
- Capture screenshots during analysis, not when the customer later opens the report.
- Keep HTML and PDF content aligned by using one report data model and one evidence-card semantic model.
- Store screenshots as private report evidence for as long as the private report is accessible.

## Non-Goals

- Do not make browser return parameters, checkout state, or provider retrieval a payment authority.
- Do not change the paid Webhook, entitlement, refund, or report-access state machines.
- Do not add public asset URLs for private screenshots.
- Do not attempt login-only page screenshots, form submission, image aesthetics auditing, or video evidence in this phase.
- Do not replace deterministic technical evidence or citation verification with screenshot-only claims.

## Customer Delivery Model

After a verified payment Webhook creates the paid entitlement and the deep job completes, the customer should have access to two report files or views:

- `report.html`: the primary artifact. It uses the polished report layout, evidence screenshots, readable cards, table of contents, and customer-friendly navigation.
- `report.pdf`: an export produced from the same HTML report. It is optimized for sharing and archival, but it should not become a separate product surface with different content.

Both artifacts use the same private report authorization boundary. If email delivery sends links rather than attachments, the links must point to protected report-specific access routes. If a later implementation supports downloadable files, those files must still be generated from and bound to the same authorized report state.

## Screenshot Evidence Policy

Screenshot capture belongs to the Worker audit pipeline. It runs when a page is fetched, rendered, extracted, and selected as evidence for a finding. A screenshot is therefore part of the same evidence bundle as:

- source URL;
- extracted quote;
- optional page element;
- captured timestamp;
- content hash or normalized evidence hash;
- viewport and capture metadata;
- screenshot asset hash and storage key.

The selected screenshot treatment is graded evidence:

- Critical and high-priority findings show an expanded issue crop with a small page-context thumbnail.
- Medium and low-priority findings show compact screenshots or link to an evidence appendix.
- If a crop cannot be located reliably, the report falls back to a viewport screenshot plus the verified quote.
- If screenshot capture fails, the textual evidence remains valid and the report marks the screenshot as unavailable.

Screenshots follow the private report lifecycle. A private report that remains accessible must retain its screenshot evidence. Deleting or expiring the private report must delete or make unreachable the corresponding screenshot assets.

## Data And Storage

PostgreSQL remains the report authority. Binary screenshots should not be stored directly in regular report JSON. The implementation should introduce an evidence-asset record or equivalent metadata shape that binds each screenshot to:

- report ID;
- job ID;
- evidence citation or finding ID;
- URL;
- capture timestamp;
- viewport dimensions;
- content or evidence hash;
- storage provider key;
- asset hash;
- status.

The storage layer should be adapter-based so local development can use the filesystem while staging and production can use an object store such as S3-compatible storage or another configured private bucket. PostgreSQL stores metadata and access decisions; the object store holds bytes.

Private screenshot access must use the existing report authorization model. The web app can serve images through an authorized proxy route or short-lived signed object URLs. It must not expose stable public object URLs for private deep-report evidence.

## HTML Report Experience

The HTML report should become a stable artifact-oriented view, not just the existing interactive workspace screen. It should use the current visual baseline: restrained editorial hierarchy, warm neutral surfaces, forest text, teal primary actions, red/amber severity, Lucide icons, system CJK fonts, 8px radii, and no decorative noise.

Recommended structure:

1. Cover and audit summary.
2. Key scores and product-level status.
3. Priority findings with visual evidence cards.
4. Page-by-page evidence and recommendations.
5. Ninety-day action roadmap.
6. Technical appendix and source list.

Evidence cards should pair the issue statement with:

- verified quote;
- source URL;
- issue crop;
- page-context thumbnail;
- capture timestamp;
- direct recommendation.

The HTML version may support progressive disclosure, anchors, image enlargement, and section navigation. These interactions improve reading, but the underlying content must remain printable and exportable without relying on client-only state.

## PDF Export Experience

The PDF should be generated from the HTML artifact with print-specific CSS and a controlled export route. It must not be a separate React composition that drifts away from the HTML content.

PDF-specific rules:

- Use A4-oriented print CSS with stable margins, page headers, footers, and page numbers where supported.
- Control page breaks around finding cards and screenshot groups.
- Avoid wide desktop layouts, empty whitespace, split screenshots, and orphaned captions.
- Expand only high-impact evidence in the main flow; push lower-priority details into an appendix.
- Include source URLs and capture timestamps near screenshots for audit credibility.

The PDF can hide purely interactive controls from the HTML artifact, but it must not omit material findings, recommendations, or evidence.

## Security And Privacy

The commercial trust boundary does not change:

- verified Airwallex Webhooks remain the only way to mark orders paid;
- only paid entitlement creates the private deep job;
- only existing report access tokens/cookies can read private report artifacts;
- screenshots inherit the private report authorization boundary;
- logs must not include raw access tokens, API keys, raw client IPs, or private asset URLs.

Screenshot metadata may be logged only in sanitized operational form, such as report ID, asset status, and high-level failure reason.

## Error Handling

The report generation pipeline should be resilient:

- Textual evidence verification remains mandatory for model findings.
- Screenshot failure should not fail the paid report if the quote and URL evidence are valid.
- Export failure should mark PDF generation as retryable while keeping the HTML report available.
- If object storage is unavailable, the deep job should record an explicit screenshot-unavailable state and continue when possible.
- If the HTML artifact is ready but the PDF export is delayed, the customer should be able to open the HTML report first.

## Testing And Acceptance

Implementation acceptance should cover:

- unit tests for evidence-asset metadata and private authorization checks;
- deterministic tests for screenshot-unavailable fallback rendering;
- integration tests proving the Worker can attach screenshot metadata to verified evidence;
- browser verification of the HTML report with expanded evidence cards;
- PDF export verification using a representative report with screenshots;
- access tests proving unauthenticated users cannot fetch private screenshots or exported files;
- regression tests proving Webhook-only payment authority is unchanged.

Manual design QA should compare:

- current HTML report;
- new HTML artifact view;
- exported PDF;
- at least one source-page screenshot used as evidence.

## Open Implementation Notes

- The exact object storage provider can be chosen during implementation planning, but the code should preserve a self-hostable adapter boundary.
- The first implementation can support viewport screenshot plus deterministic crop fallback before adding more advanced DOM coordinate mapping.
- Existing staging acceptance should use an authenticated protected Preview report and a known source page so HTML and PDF can be checked against the same evidence.
