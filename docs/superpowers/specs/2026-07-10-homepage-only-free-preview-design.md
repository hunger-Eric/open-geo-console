# Homepage-Only Free Preview Design

## Goal

Make the free experience prove that Open GEO Console understands the submitted website without giving away a near-complete audit. A free scan analyzes only the submitted homepage. A deep report performs site discovery and analyzes every eligible page on small sites or at most 50 representative pages on larger sites.

The paid value proposition is not merely a larger page count. It is the complete issue inventory, affected URLs, cross-page consistency analysis, evidence, rewrites, implementation roadmap, and private export.

## Approaches Considered

1. **Homepage-only free preview (selected).** Lowest model cost and the clearest commercial boundary. It still proves the product with evidence from the customer's real homepage.
2. **Three-page free sample.** Gives broader proof but often covers most of a small company website and weakens the upgrade case.
3. **Keep eight analyzed pages but hide most output.** Preserves current coverage but pays the full crawling/model cost and risks leaking hidden data through server payloads.

## Tier Contract

### Free preview

The free scan may request only:

- the submitted URL and its safe redirects;
- `/robots.txt`;
- `/sitemap.xml`;
- `/llms.txt`.

`robots.txt`, `sitemap.xml`, and `llms.txt` are standard asset checks, not content pages. The free scanner may count URLs declared directly in the fetched sitemap and count internal links found in the homepage HTML to produce a clearly labelled site-size estimate. It must not follow sitemap indexes, fetch sitemap-listed pages, or fetch homepage link targets.

The deterministic report therefore contains exactly one audited content page: the final homepage URL. It must be labelled a **homepage score**, never a site-wide score.

The free AI pipeline bypasses page planning and analyzes only the normalized homepage evidence. The persisted public free payload contains:

- a concise organization/homepage summary;
- one complete, evidence-backed AI finding;
- at most two additional issue-category titles and severities, without affected URLs, quotations, explanations, recommendations, or rewrite examples;
- coverage stating that one homepage was analyzed;
- an estimated detected-page count when it can be derived without fetching another content page.

The server must project the free payload before serialization. Hidden deep findings or evidence must never be sent to the browser, embedded in page source, or included in print output.

Free reports do not expose:

- cross-page or site-wide claims;
- technical findings, affected-page counts, or URL lists beyond the homepage;
- six-dimension explanations;
- page-type analysis;
- rewrite examples;
- the 90-day roadmap;
- full print/PDF export.

### Deep report

After report-Key authorization, the deep Worker performs full discovery, clustering, planning, fetching, technical auditing, AI batch analysis, and synthesis. It analyzes all eligible unique pages when the site contains fewer than 50 and selects at most 50 representative pages otherwise. The homepage is always included.

The private deep result contains:

- the full technical report and affected URLs;
- all validated AI findings and evidence;
- all six dimensions with explanations;
- page-type analyses;
- rewrite examples;
- the 90-day roadmap;
- private print/PDF output.

For a one-page website, the upgrade copy must not promise more pages. It should promise the complete homepage findings, detailed fixes, rewrites, roadmap, and private export. For multi-page sites, it may additionally state the detected-page estimate and the maximum 50-page coverage.

## Persistence and Authorization

`scan_reports.report` remains the public homepage-only technical authority. A deep scan must not overwrite it with private multi-page evidence.

The private deep record stores a versioned bundle:

```ts
interface DeepReportBundleV1 {
  version: 1;
  technicalReport: GeoAuditReport;
  aiReport: AiWebsiteReportV1;
}
```

The bundle may be stored in a new JSONB column on `ai_reports` or an equivalent private table, but it must be read only after the existing report-cookie authorization succeeds. Authorized overview, issues, technical, analysis, and print routes use the deep bundle. Unauthorized routes always use the public homepage projection.

Existing pre-change free reports are also rendered through the homepage-only public projection so the commercial boundary is consistent. Existing authorized deep reports remain fully visible.

## User Experience

The free overview must state:

> This preview analyzed the homepage only.

When a page estimate is available, the upgrade panel may state:

> We detected approximately 20 site pages without analyzing their content. Unlock the deep report to inspect all eligible pages, up to 50.

The free workspace behaves as follows:

- **Overview:** homepage score, standard asset status, organization summary, up to three homepage technical priorities, and the upgrade panel.
- **AI analysis:** one complete finding plus up to two locked category teasers. Detailed dimensions and roadmap appear as locked feature summaries, not serialized report data.
- **Issues:** all deterministic findings produced by the homepage and standard-asset checks. No site-wide counts or non-homepage URLs.
- **Technical:** the three standard assets and one homepage row only.
- **Print/PDF:** disabled for free reports with a direct upgrade explanation.

After authorized upgrade, the same routes switch to the complete private deep bundle. The URL remains clean because authorization continues to use the report cookie.

## Data Flow

### Free

1. Validate the submitted URL and safe redirect chain.
2. Fetch the homepage and the three standard assets.
3. Build a one-page deterministic homepage report.
4. Create a free job in the free Worker lane.
5. Extract homepage evidence without discovering or fetching other content pages.
6. Run one-page AI analysis and persist only the public preview contract.
7. Render the homepage-only workspace and upgrade message.

### Deep

1. Validate the access Key and idempotency key, then reserve one credit.
2. Create a deep job in the deep Worker lane.
3. Discover and compress site URLs, then plan `min(eligible pages, 50)` pages.
4. Fetch and audit the planned pages, analyze batches, and validate citations.
5. Persist the private deep bundle.
6. Settle the credit only when the existing homepage and 70% coverage rules pass.
7. Render the deep bundle only for an authorized report cookie.

## Failure Handling

- If the homepage is non-2xx or unreadable, return the deterministic root-cause preview and do not call the model.
- If a standard asset is missing, report only its missing status; this does not authorize additional page requests.
- If the sitemap is an index or cannot be counted safely, show the page estimate as unknown rather than following it during the free scan.
- If the free model call fails, preserve the homepage technical preview and expose retry state.
- Deep retries, leases, coverage checks, settlement, and refunds keep their current semantics.
- A one-page site is valid and must not be described as incomplete merely because only one eligible page exists.

## Verification

Automated tests must prove:

- a free scan fetches no content URL other than the submitted homepage;
- standard asset requests remain allowed;
- free sitemap indexes and sitemap URL entries are never followed;
- the free AI planner is not called and exactly one evidence page reaches analysis;
- free coverage says one analyzed page and distinguishes estimates from analyzed pages;
- free server responses and rendered HTML contain no hidden deep evidence, recommendations, rewrites, or non-homepage URLs;
- all deterministic homepage and standard-asset findings remain visible in the free technical workspace;
- free print/PDF is unavailable;
- deep scans analyze all eligible pages below 50 and cap larger sites at 50;
- deep technical data is stored separately and requires report-cookie authorization;
- one-page, missing-sitemap, non-2xx homepage, model failure, legacy free report, and existing deep report cases remain truthful;
- English and Chinese copy use “homepage” rather than “site-wide” for free scores and findings.

Acceptance requires `npm run lint`, `npm test`, `npm run build`, mocked request-count assertions, PostgreSQL authorization tests, and browser verification of one free homepage preview plus one authorized deep report.

## Boundaries

- The 30-day free site deduplication remains. The later commercial-delivery design supersedes the original IP quota with two distinct sites per rolling 24 hours and adds a global daily AI budget.
- Payment, account, subscription, and email delivery remain outside this change.
- The deep maximum remains 50 pages.
- Standard asset checks remain available in the free preview.
- The free tier does not perform background full-site crawling merely to prepare an upsell.
