# Public-Web Recommendation Source Forensics Design

Date: 2026-07-12
Status: Approved product correction; V2 implementation has not started, and V1 remains the current runtime.

## Supersession and retained boundaries

This document supersedes the per-order answer-engine observation strategy in
`2026-07-12-ai-recommendation-forensic-report-design.md`. In particular, it
removes these requirements from the base paid product:

- execution against at least two answer-engine providers per order;
- OpenAI Web Search and Perplexity Sonar as production fulfillment providers;
- a two-provider certification authority as the condition for qualified
  settlement;
- any promise to observe what a named model, consumer application, or developer
  API actually recommended or cited.

It does not weaken the product guarantees already introduced by
`RecommendationForensicReportV1`:

- the buyer receives an executive decision report and a separate vendor task
  package;
- evidence is immutable, attributable, hash-bound, and explicit about
  uncertainty;
- the paid artifact remains private HTML with a PDF exported from the same
  composition;
- limited, failed, late, and refunded outcomes retain the atomic commercial
  boundary;
- PostgreSQL remains production authority, Workers perform collection, and the
  engine remains self-hostable;
- the legacy website audit remains a supporting technical appendix rather than
  the paid product itself.

The existing product code and artifact scope `recommendation_forensics_v1` may
remain stable through the migration so paid-order, access-token, and route
compatibility do not break. The new payload must use a distinct report contract,
`RecommendationForensicReportV2`, with methodology
`public_search_source_forensics_v1`. Historical V1 payloads remain immutable and
continue to render through the V1 parser. A V1 record must never be silently
rewritten or relabeled as V2.

## Product decision

The base product is **public-web recommendation simulation plus citable-source
forensics**.

Its one-line promise is:

> Enter one website. See which public sources appear in a recorded, transparent buyer-research retrieval path, which companies those sources repeatedly support, and what evidence your vendors should build next.

The product observes a transparent retrieval process that Open GEO Console
controls. It does not claim to reproduce a proprietary model's hidden training
data, query rewriting, index, personalization, ranking, or answer composition.
It therefore cannot claim that Doubao, ChatGPT, Perplexity, Qianfan, or any other
named model actually recommended or cited an organization.

The customer is buying a defensible answer to a controllable business question:

> When a buyer or an AI research workflow searches the public web for this
> purchase need, which sources and supplier facts are retrievable, repeated,
> corroborated, and ready to support a recommendation—and where is the customer
> absent or weak?

## Why this is the scalable product

Different answer products may use different indexes, training priors, retrieval
tools, query fanout, regions, personalization, and ranking policies. Calling a
few APIs per customer cannot establish universal AI visibility, while calling
every model is operationally expensive and still incomplete.

The shared public-web method instead separates two things:

1. **Observable public evidence:** queries, search results, retrieved pages,
   entities, repeated facts, source categories, and retrieval failures.
2. **Unobservable proprietary decisions:** a named model's internal candidate
   selection, ranking, synthesis, and consumer-specific response.

Only the first layer is part of base-product fulfillment. The second may be
sampled separately for calibration, but it is never inferred from the first.

## Target customer and job to be done

The primary buyer remains a Chinese export company without an internal GEO
team. Its owner or marketing lead needs to know:

1. Which public pages dominate realistic non-brand purchase research?
2. Which suppliers and capabilities recur across independent sources and query
   variants?
3. Which source types make those supplier claims easier to retrieve and
   corroborate?
4. Is the customer's company absent, present but weakly evidenced, or strongly
   supported?
5. Which three investments should the customer authorize first?
6. What exactly should the customer's website, content, SEO, or communications
   vendors deliver?

The buyer should not need a cloud-provider account, a prompt list, an API key,
a competitor list, or a subscription.

## Product claims and prohibited claims

### Allowed claims

The report may say:

- a URL appeared on the named public search surface for the exact recorded
  query at the recorded time;
- a retrievable page contained a verified fact about an identified company;
- a company or capability recurred across recorded query variants or
  independently owned domains;
- a source has specific, explainable retrieval-readiness or
  source-eligibility signals;
- the customer is absent from, weakly represented in, or well represented in
  the observed public candidate-source pool;
- an action would improve public discoverability, evidence clarity, or
  corroboration if implemented correctly.

### Prohibited claims

The report must not say or imply:

- a named model actually recommended, ranked, cited, or preferred a company;
- public search rank is an AI-answer rank or a probability of model selection;
- a source caused any model output;
- the simulation reproduces a consumer application's private behavior;
- crawler traffic proves that a page was used in an answer;
- referral traffic reveals the prompt, ranking process, or cited source chain;
- a technical fix guarantees future mention, citation, revenue, or rank;
- the observed public web is complete.

Automated language checks must reject phrases such as "Doubao recommends",
"ranked first by AI", "all models agree", and equivalent Chinese copy unless
the text is clearly identifying a prohibited interpretation in methodology or
limitations.

## Non-goals

The base product does not provide:

- per-order calls to named answer engines;
- multi-model share-of-voice monitoring;
- consumer-app browser automation;
- prompt-volume or actual AI-audience measurement;
- website deployment, CMS administration, PR outreach, directory submission,
  media buying, or guaranteed placement;
- accounts, teams, subscriptions, or a continuous monitoring dashboard;
- private, paywalled, login-gated, or access-controlled source extraction;
- a general-purpose web search engine or a search-rank reporting product.

## Worked example: Shenzhen-to-Taiwan logistics

The customer's site indicates that it provides cross-border freight services.
The canonical buyer question is:

> 深圳到台湾的运输公司有哪些？

The system does not submit this question to multiple chatbots. It creates a
versioned, deterministic query family, for example:

- 深圳到台湾运输公司
- 深圳台湾专线物流公司
- 深圳到台湾海运物流
- 深圳到台湾空运物流
- 深圳到台湾物流时效 清关
- 深圳到台湾物流供应商 案例

Every query variant records its derivation rule and relationship to the
canonical buyer question. The public search adapter returns ranked result
metadata from its accurately labeled search surface. The crawler then safely
retrieves eligible result pages and verifies facts such as:

- explicit Shenzhen-to-Taiwan route coverage;
- sea, air, express, consolidation, customs, or last-mile capability;
- stated transit-time methodology and qualification conditions;
- service examples, case studies, facilities, licenses, and contact identity;
- corroborating mentions on independent directories, media, institutions, or
  community sources.

The report can conclude that several companies recur across multiple query
variants and independent sources, while the customer's company is absent from
the candidate-source pool or lacks a dedicated route page and third-party
corroboration. It cannot conclude that Doubao would select the same companies or
preserve the public search order.

The executive priority may be "create one evidence-complete Shenzhen–Taiwan
route hub and secure two independently verifiable industry references." The
vendor package then defines the route-page facts, case-study evidence, entity
consistency, structured data, third-party-source categories, and rerun
acceptance criteria.

## Deterministic buyer questions and query fanout

### Canonical buyer questions

The system produces three non-brand, purchase-intent questions by default. It
may produce four or five only when the customer's public site provides enough
unambiguous product, use-case, and market evidence. Every question must be:

- non-brand and free of the customer or competitor name;
- answerable from public commercial evidence;
- tied to a detected category, route, use case, qualification, or buyer risk;
- normalized into the persisted report locale and region;
- generated by a versioned deterministic rule set;
- rejected when it contains private customer data or a fabricated market
  assumption.

Low-confidence category inference broadens the category and records the
limitation. It does not invent a niche. Brand-defense questions may appear in a
private appendix, but they do not enter the shared market snapshot pool.

### Query fanout

Each canonical question expands into a bounded family of retrieval queries. The
fanout is deterministic for the same normalized question, locale, region, and
fanout version. It may cover:

- direct category or supplier discovery;
- capability or route variants;
- use-case and qualification terms;
- comparison and decision-risk terms;
- evidence-oriented variants such as cases, standards, prices, or delivery
  conditions when those concepts are applicable.

The fanout must not use customer identity to bias public-market results. A
default question has at most six query variants, and each variant has a fixed
result-depth and retrieval budget. Query-generation changes create a new
fanout version rather than altering an old snapshot.

Question popularity or observed search demand may influence which canonical
questions are monitored in future, but popularity is a separately sourced
signal. It must not be fabricated from the result set or described as actual AI
prompt volume.

## Public search-index adapter

### Provider-neutral contract

The collection boundary is a `PublicSearchSurfaceAdapter`, not an answer-engine
adapter. It accepts:

- exact normalized query;
- locale and region;
- bounded result depth;
- search-surface identity and contract version;
- timeout, request, and cost budget;
- abort signal.

It returns immutable result observations containing:

- search-surface provider and product identifiers;
- API, index, or licensed-data surface name;
- locale, region, request time, and adapter version;
- exact submitted query;
- result order as returned by that surface;
- URL, title, snippet, displayed host, and allowed metadata;
- sanitized usage and cost when available;
- explicit complete, partial, rate-limited, timed-out, unavailable, or malformed
  status.

The architecture does not select or promise a concrete search API vendor in
this design. Every implementation candidate must pass protected-staging review
for commercial use, storage/display rights, provenance, locale/region behavior,
result stability, budget control, and error semantics. Each actual surface is
accurately labeled and separately certified. Switching vendors or materially
changing an index creates a new search-surface version; cached observations do
not cross that boundary.

### Compliance and retrieval boundary

Adapters may use a documented API, a licensed index, or a self-hosted index for
which collection and commercial use are authorized. They must not scrape
consumer search or chatbot interfaces in violation of access controls or terms.
The system never bypasses login, CAPTCHA, paywall, geographic restriction, or
anti-bot controls.

The adapter's returned rank remains `surface_result_order`. It is not renamed
to recommendation rank, AI rank, visibility probability, or citation
probability.

## Immutable market snapshot pool

### Cache identity

A shared market snapshot is reusable only when all of these fields match
exactly:

- normalized canonical buyer question;
- report locale;
- region;
- search-surface identity;
- search-surface version;
- deterministic fanout version.

The snapshot identity is a deterministic hash of those fields. Query variants,
result observations, retrieval decisions, and hashes are immutable children of
that identity and capture time. Similar questions are not merged. Semantic or
fuzzy cache hits are forbidden in the base product.

### Freshness

- **0–7 days:** fresh and eligible for qualified fulfillment.
- **More than 7 through 30 days:** stale. The Worker must first attempt a
  refresh. If refresh fails, the old snapshot may support only an explicitly
  historical `completed_limited` report and the order is refunded.
- **More than 30 days:** expired. If refresh fails, the report fails and the
  order is refunded.

Age is calculated from the immutable snapshot completion timestamp to the
report's evidence cutoff. It is never reset by rereading the same row.

Old reports keep their original snapshot references even after newer snapshots
exist. A refresh always inserts a new snapshot version; it never mutates the
old evidence.

### Single-flight and leases

For each exact cache identity, PostgreSQL grants one bounded refresh lease. The
lease owner alone may incur a search request. Concurrent jobs wait for the
same refresh result and then reference it. A lease includes owner, acquired
time, expiry, heartbeat, attempt number, and terminal result reference.

After an expired lease, one claimant may resume or restart according to the
adapter's idempotency contract. The system must not assume that a timed-out
request incurred no cost. Attempt and usage ledgers remain visible so duplicate
charges can be detected. The database uniqueness and compare-and-swap boundary,
not in-process locking, is authoritative.

## Source retrieval and evidence graph

### Safe retrieval

`packages/site-crawler` remains responsible for URL parsing, DNS pinning, SSRF
protection, redirect revalidation, robots policy, response limits, extraction,
and JavaScript fallback. Public-source retrieval does not weaken the submitted
site's normal crawl boundary and does not bypass inaccessible content.

For each returned source the evidence record captures:

- canonical URL and registrable domain;
- search-result observation IDs and returned order;
- retrieval time and terminal status;
- title, bounded verified excerpt, content hash, and text hash;
- source ownership category;
- detected organization, product, route, capability, and supporting-fact
  claims;
- ambiguity and contradiction state;
- excerpt-retention expiry while durable hashes remain.

### Entity resolution

Entity resolution uses verified page identity, organization names, domains,
addresses, legal names, and contextual service evidence. Same-name companies
remain separate unless deterministic evidence supports a merge. A text model
may suggest candidates but cannot override deterministic ambiguity or create a
formal entity without supporting source IDs.

### Repetition and corroboration

The analysis counts distinct dimensions separately:

- number of canonical buyer questions;
- number of deterministic query variants;
- number of result observations;
- number of independently controlled registrable domains;
- number and category of safely retrieved sources;
- number of verified, repeated capability facts;
- number of contradictions or inaccessible sources.

Repeated pages on one domain do not masquerade as independent corroboration.
Syndicated copies with the same normalized content hash are one evidence family.
The report always names the denominator and observation window.

## Retrieval readiness and source eligibility

The product uses explainable signals, not a synthetic prediction of a model's
private ranking.

### Retrieval readiness

Retrieval readiness describes whether a public page can be discovered and
understood by the product's recorded retrieval path. Signals may include:

- stable public URL and successful HTTP retrieval;
- robots eligibility for the observing crawler;
- index-surface appearance for exact recorded queries;
- descriptive title, headings, and coherent main content;
- explicit organization and service identity;
- machine-readable facts that agree with visible content;
- content freshness indicators when verifiable;
- absence of login, script-only failure, redirect loop, or soft-404 behavior.

### Source eligibility

Source eligibility describes whether a retrieved page contains usable evidence
for a buyer question. Signals may include:

- direct topical relevance to the question;
- explicit, verifiable supplier or capability facts;
- identifiable publisher and ownership category;
- supporting detail such as conditions, dates, methods, examples, or standards;
- entity consistency across the page and referenced official sources;
- independent corroboration and contradiction checks;
- bounded excerpt support for every formal claim.

### Presentation

Signals are shown individually with evidence and limitations. If an aggregate
is needed for prioritization, it is labeled an Open GEO Console
`retrieval_readiness_score` or `source_eligibility_score`, with a versioned
deterministic formula. It is never labeled an AI score, answer probability, or
model rank. Search-result order may be displayed only as observed raw context,
not converted into a claim that the first result is the most likely citation.

## Evidence grades under the new methodology

- **Grade A — verified direct source evidence:** a safely retrieved excerpt
  directly supports the specific company/capability fact.
- **Grade B — strong source association:** the page clearly concerns the entity
  and topic, but the exact fact or entity mapping is less precise.
- **Grade C — repeated public pattern:** an entity, capability, source category,
  or evidence family recurs across query variants or independent domains. This
  supports prioritization, not model attribution.
- **Grade D — unknown or inaccessible:** retrieval failed, the entity is
  ambiguous, the source is contradictory, or only unverified result metadata
  remains.

The phrase "recommendation chain" in old V1 copy is replaced by "observed
public candidate-source pool" for V2. Grades never represent model confidence.

## Constrained text-model role

One low-cost text model may be configured for evidence-constrained synthesis.
It is not a search surface or answer engine and does not determine which URLs
enter the snapshot.

Its allowed inputs are structured questions, observed result metadata, verified
excerpts, deterministic entity candidates, site evidence, and calculated
signals. Its allowed outputs are summaries, plain-language comparisons, draft
priorities, and vendor-task wording.

Every formal claim must retain source IDs or website-finding IDs and pass
deterministic verification. Unsupported claims are removed or downgraded.
Provider/model identity and bounded usage/cost are recorded as synthesis
provenance. If the model is unavailable, deterministic templates may complete a
report whose evidence coverage otherwise qualifies. Model failure alone must
not force a paid search refresh or corrupt cached evidence.

## Independent crawler and referral evidence

Customer-supplied server/CDN logs remain an optional, independent evidence
layer:

- recognized AI crawler visits can prove that a crawler requested a page at a
  time;
- recognized AI-service referrers can prove that a visit arrived through a
  recorded referrer when the logging surface preserves it;
- neither proves that a page was indexed, cited, recommended, ranked, or used to
  generate a particular answer;
- absence of traffic does not prove invisibility when logging is incomplete.

Crawler/referral observations may strengthen an operational recommendation, but
they do not change public-source evidence grades or the qualified commercial
threshold. This preserves the existing rule that log evidence never changes the
technical GEO score.

## Data separation and privacy

Shared market snapshots contain only public, non-brand market research:

- normalized canonical question and deterministic query variants;
- locale, region, search-surface identity/version, and fanout version;
- public result metadata, public retrieval evidence, immutable hashes, usage,
  and bounded cost;
- no report ID, job ID, order ID, email, access token, customer URL, customer
  name, client IP, or trigger identity.

The database may maintain a private join from a customer report to a shared
snapshot, but the shared row and artifact cannot reveal which customer caused
its creation. The public question must pass a customer-identity exclusion check
before admission to the shared pool.

Customer-specific data remains report scoped:

- submitted-site evidence and blind-spot comparison;
- customer-versus-market entity matching;
- gaps, priorities, and vendor task package;
- payment, access, email, screenshot, and artifact records.

Private report access never exposes the existence, identity, or order state of
another customer that references the same market snapshot.

## Data model and schema-v9 migration

Schema v9 is the current authority and contains answer runs, cells, sources,
certification authorities, report-scoped citation evidence, scoped artifacts,
and commercial state. The migration must be additive before old runtime paths
are retired.

New authority should include records equivalent to:

- `public_search_surface_authorities`: separately certified search-surface
  identity, version, locale/region capabilities, terms review, evidence
  reference, activation state, and environment;
- `market_snapshot_questions`: exact normalized question, locale, region,
  surface/version, fanout version, deterministic cache identity, and immutable
  completion time;
- `market_snapshot_queries`: exact fanout queries and derivation rules;
- `market_search_observations`: attempt, result metadata, returned order,
  status, sanitized cost, and content hash;
- `market_source_evidence`: normalized public source, retrieval state, verified
  excerpt, hashes, source category, entities, claims, and evidence family;
- `market_snapshot_leases`: cache identity, owner, heartbeat, expiry, attempt,
  and terminal snapshot reference;
- `report_market_snapshot_refs`: private report/job-to-snapshot binding,
  evidence cutoff, freshness state, and immutable cost attribution;
- `report_source_forensics`: private V2 payload and its authority/provenance
  hashes.

The implementation may reuse safe, semantics-neutral utilities from existing
answer tables, but it must not store V2 search observations as if they were
answer-engine cells. Names, constraints, and types must preserve the distinction.

Database migration increments the schema version only after all additive DDL is
present under the existing advisory lock. Older deployments must fail closed on
the newer version. A fresh empty-database bootstrap and upgrade from schema v9
must produce the same constraints and indexes.

## Historical and route compatibility

- Existing `RecommendationForensicReportV1` reports remain readable, private,
  and hash-verifiable with their original answer-engine provenance.
- V1 artifacts keep their original language and must not receive V2 claims or
  methodology copy.
- New jobs under the stable product scope write V2 only after the V2 runtime is
  enabled. Parser and renderer dispatch use the persisted report version and
  methodology, never inference from missing fields.
- Existing report access tokens and recommendation HTML/PDF routes remain valid
  for both versions. Authorization stays product scoped; version dispatch occurs
  only after authorization.
- In-flight V1 jobs are not converted. Before cutover they must be completed
  under the old contract without new sales, or terminalized/refunded according
  to the existing state machine.
- No shared snapshot is backfilled from historical provider answers. Provider
  citations are observations of a different surface and cannot seed public
  search evidence.
- Historical answer/certification tables remain until retention and audit
  obligations expire. Removal requires a separate reviewed migration.

## Retiring current provider runtime

The implementation must remove or disable from the production V2 path:

- OpenAI Responses Web Search and Perplexity Sonar adapters;
- their production environment variables and readiness requirements;
- certification CLI/runbook steps that require two answer providers;
- runtime registry and PostgreSQL authority checks that require two distinct
  providers;
- per-provider answer execution, resume, and commercial coverage logic;
- public and private copy that promises multiple answer engines, engine
  agreement, provider recommendations, or provider citations.

The old adapters may remain temporarily in history-compatible modules and tests
needed to parse or audit V1 records, but they must be unreachable from new paid
orders. They are deleted after V1 retention requirements are understood; no
new credential should be required merely to read an old report.

AI crawler identities for OpenAI, Perplexity, and other operators remain in
`crawler-rules` and `log-parser`. Those are factual log-detection capabilities,
not fulfillment adapters, and should not be removed as part of provider-runtime
retirement.

## Worker flow

The deep Worker performs:

1. full-site crawl and first-impression/full-site comparison;
2. deterministic buyer-question generation and identity exclusion;
3. exact fresh-snapshot lookup for each canonical question;
4. single-flight acquisition for each missing or stale snapshot;
5. deterministic query fanout and bounded certified-search execution;
6. safe source retrieval, entity resolution, evidence-family deduplication, and
   explainable signal calculation;
7. immutable shared-snapshot completion and private report binding;
8. customer-versus-market gaps, three executive priorities, and vendor tasks;
9. evidence-constrained synthesis and formal-claim verification;
10. private HTML/PDF readiness and atomic commercial terminalization.

Checkpoint identity includes the V2 methodology, question-set version,
fanout version, search-surface authority, snapshot IDs, and website foundation
hash. Resume may reuse only exact matching completed work. It cannot mix V1
provider cells, different search surfaces, different fanout versions, or
customer-specific questions into a shared snapshot.

## Report experience

### Executive decision report

The main artifact answers:

- What buyer questions were simulated?
- Which source types and domains recur in the observed candidate-source pool?
- Which companies and capabilities receive repeat, independently corroborated
  public evidence?
- Where is the customer absent, weak, contradictory, or strong?
- Which evidence gaps are controllable?
- Which three investments deserve budget first?

Every metric names the exact search surface, locale, region, snapshot age,
question count, query count, result depth, retrieved-source count, independent
domain count, and limitations. Search order remains raw methodology context.

### Vendor task package

The second delivery layer converts gaps into work for existing vendors. Tasks
may include:

- route, category, comparison, case-study, qualification, or evidence-hub pages;
- consistent organization/service facts and visible structured data;
- citation-worthy first-party data, methods, conditions, and expert material;
- eligible directory, institution, media, and community source categories;
- contradiction repair and entity disambiguation;
- exact acceptance checks using the fixed buyer questions and retrieval method.

Tasks include rationale, evidence IDs, owner type, draft inputs, acceptance
criteria, and prohibited overclaims. Open GEO Console does not publish or place
the work.

### Technical appendix

The legacy website audit remains a supporting appendix covering crawlability,
machine readability, site identity, and technical findings. Technical scores do
not become a public-source or AI recommendation score.

## Commercial outcomes

### Qualified and settled

A report qualifies only when all three default canonical buyer questions have:

- an exact 0–7-day snapshot from the active certified search surface;
- complete immutable query and result provenance;
- source retrieval attempted under the safe crawler boundary;
- enough verified evidence to produce a truthful market comparison, including a
  valid truthful-absence outcome when the customer or suppliers are not found;
- a validated executive report and vendor task package.

A cache hit and a newly purchased search observation are equally valid when
freshness and authority match. Settlement does not require a text-model call if
deterministic rendering passes.

### Completed limited and refunded

A report is delivered as `completed_limited` and atomically refunded when:

- refresh fails but at least two canonical questions have usable snapshots more
  than 7 and no more than 30 days old; or
- only two of three questions have usable fresh evidence and the resulting
  report remains honest and actionable.

The artifact prominently identifies historical or incomplete coverage and the
refund. Stale evidence cannot be presented as current.

### Failed and refunded

The job fails and is atomically refunded when:

- fewer than two canonical questions have usable evidence;
- any required snapshot is more than 30 days old and cannot refresh;
- the search authority is absent, mismatched, or inactive;
- evidence isolation, structured validation, private artifact, or commercial
  invariants fail.

The runtime does not substitute fixtures, a chatbot, another uncertified search
surface, or fabricated results. Daily request or cost-limit exhaustion is a
system failure, never a reason to charge for an unqualified report.

## Cost accounting and margin control

Every report records separately:

- fresh snapshot cache hits;
- stale snapshots inspected;
- new search requests and retry attempts;
- provider-reported or configured search cost;
- retrieval, browser, synthesis-model, storage, email, and PDF costs where
  measurable;
- allocated shared-snapshot cost and the amount avoided through reuse;
- report price, refund state, direct incremental cost, and contribution margin.

The report that first creates a shared snapshot records the actual incremental
cost, but internal profitability views may amortize that cost across later uses.
Customer-facing copy may state cache age and whether a new observation was
collected, but does not reveal another customer's usage or internal margin.

Controls include daily request and amount caps, per-question result and token
limits, one bounded retry for transient search failure, source-fetch caps, and
PostgreSQL single-flight. Exceeding a cap stops new paid admission or produces a
refundable system outcome; it never silently reduces promised coverage.

## Optional real-model calibration

Named answer platforms may be used only in a separate, optional calibration
program:

- periodic manual or contract-compliant sampling of a fixed public question set;
- explicit recording of platform, surface, account context, locale, region,
  time, answer, citations, and reviewer;
- aggregate comparison of overlap and divergence with the public candidate
  pool;
- no dependency from an individual paid order to a calibration run;
- no use of calibration output to relabel search evidence as actual model
  behavior;
- no customer-facing platform claim unless its independent methodology,
  commercial terms, and limitations are approved.

Calibration can inform fanout research and limitations. It cannot change a
historical customer report or its commercial outcome.

## Public and free experience

The free homepage scan remains homepage-only. It may show a deterministic
first-impression profile and technical evidence. It must not expose private
market sources, competitor evidence, or a cached snapshot from another paid
customer.

A future free market teaser requires a separate budget and privacy design. It is
not part of this correction. Until then, public copy may describe the paid
methodology but must not promise named-model monitoring or live multi-engine
coverage.

## Security and self-hosting boundaries

- PostgreSQL is the only production authority for snapshots, leases, reports,
  jobs, certification, and commercial outcomes.
- Web processes admit and serve; Workers alone search, crawl, and synthesize.
- Search credentials, synthesis-model keys, report-credit keys, access tokens,
  raw customer email, and unhashed client IPs are never persisted or logged.
- Search-surface authority must match deployment environment and PostgreSQL
  before a paid V2 job is accepted.
- Public URLs still pass DNS pinning, redirect validation, robots, content-size,
  and browser controls.
- Shared snapshots contain no customer identity and private joins are never
  publicly enumerable.
- Cloudflare Queue remains notification-only. PostgreSQL leases remain work and
  single-flight authority.
- Local filesystem evidence is development-only; staging/production use the
  existing private evidence-storage boundary.

## Testing contract

### Unit tests

- deterministic canonical questions and bounded query fanout;
- customer/competitor brand exclusion from shared questions;
- exact cache identity and rejection of fuzzy reuse;
- search-adapter normalization, labeling, cost, timeout, and error classes;
- search-result order never mapped to recommendation probability or AI rank;
- safe URL normalization and source retrieval states;
- entity ambiguity, syndicated-content deduplication, and independent-domain
  counting;
- retrieval-readiness and source-eligibility signal formulas;
- Grade A–D evidence under public-search semantics;
- constrained synthesis rejects unsupported and prohibited model claims;
- V1/V2 parser and renderer dispatch;
- qualified, limited/refunded, and failed/refunded decisions;
- report cost, cache saving, and margin calculation.

### Deterministic integration tests

Fixtures cover three logistics questions, six query variants each, multiple
search results, duplicate domains, syndicated content, one inaccessible source,
one ambiguous company, one contradiction, and customer absence.

They must prove:

1. a first report creates three immutable market snapshots;
2. a second identical-market report creates zero search requests;
3. concurrent reports purchase each exact question snapshot once;
4. locale, region, surface, surface version, or fanout version changes prevent
   reuse;
5. a 7-day snapshot qualifies;
6. an 8–30-day snapshot is used only after refresh failure and yields
   `completed_limited + refunded`;
7. a snapshot older than 30 days plus refresh failure yields `failed + refunded`;
8. a shared snapshot contains no customer, report, job, order, email, token, or
   client identity;
9. customer-specific gaps remain private and distinct across reports sharing a
   snapshot;
10. every formal claim resolves to stored source or website evidence;
11. actual incremental cost, cache savings, and margin reconcile;
12. no report claims that a named model recommended or cited an entity.

### PostgreSQL and migration tests

- schema-v9 upgrade and fresh bootstrap converge on the same new schema;
- lease uniqueness and compare-and-swap prevent duplicate purchases;
- expired lease recovery preserves attempt and cost ledgers;
- snapshot evidence and private report references terminalize atomically;
- commercial settlement/refund remains atomic with job state;
- V1 authority and reports remain readable after migration;
- artifact-scope tokens cannot cross reports or product scopes;
- deployment/search authority mismatch fails closed.

### Protected-staging acceptance

1. Certify one accurately labeled public search surface under current terms and
   storage/display rules; do not certify an answer engine.
2. Run the Shenzhen-to-Taiwan example and inspect exact queries, returned result
   metadata, retrieved evidence, entity resolution, signals, and limitations.
3. Run a first paid test that creates three snapshots and a second equivalent
   test that produces zero search requests.
4. Race two paid tests for an uncached question and prove one external request
   through provider usage and the PostgreSQL ledger.
5. Advance snapshot ages through 7-day, 8–30-day, and more-than-30-day scenarios
   and verify commercial outcomes and email/refund state.
6. Verify private HTML, same-HTML PDF, mobile layout, anonymous `404`, scoped
   evidence reads, and bilingual methodology.
7. Inspect that shared snapshot rows and artifacts contain no customer identity.
8. Force timeout, rate limit, malformed response, inaccessible sources,
   synthesis failure, cost-cap exhaustion, and total search outage.
9. Prove new paid admission remains closed until the V2 search surface,
   migrations, commercial drills, and copy audit all pass.
10. Verify historical V1 reports still render with original provider provenance.

## Rollout slices

Implementation is divided into reviewable slices. New public sales remain
disabled until all slices and protected-staging acceptance pass.

1. **Contract and language correction:** introduce V2 methodology and fixtures;
   delete dual-provider/named-model claims from active product copy; keep V1
   rendering intact.
2. **Public-search contracts:** add provider-neutral search-surface identity,
   adapter interface, authority, deterministic query fanout, and no live vendor.
3. **Shared snapshot persistence:** additive post-v9 schema, immutable evidence,
   exact cache identity, private references, leases, and cost ledger.
4. **Source forensics:** safe retrieval, entity resolution, evidence-family
   deduplication, source categories, readiness/eligibility signals, and Grade
   A–D rules.
5. **Commercial worker migration:** V2 checkpoints, cache lookup, single-flight,
   freshness rules, limited/refund and failed/refund outcomes, and V1 in-flight
   handling.
6. **Report experience:** executive decision report, vendor task package,
   methodology, costs/coverage, legacy technical appendix, private HTML/PDF,
   localization, and prohibited-claim checks.
7. **Provider-runtime retirement:** remove OpenAI/Perplexity from new-order
   runtime, configuration, certification, readiness, runbooks, and active tests;
   retain only V1 history compatibility and independent crawler-log identities.
8. **First search-surface certification:** select a vendor only after a separate
   review, certify protected staging, and install exact environment/database
   authority.
9. **Full staging and rollout:** run cache, race, age, outage, privacy, artifact,
   refund, email, cost, bootstrap, and historical-compatibility drills before
   enabling public checkout.

Each slice receives its own implementation plan, focused tests, independent
review, and acceptance gate. No slice may substitute fixtures for a live claim
or enable checkout early.

## Regression commands

```bash
npm run lint
npm test
npm run build
npm run db:audit
npm run test:postgres:staging-security
```

## Design-time references

These references inform the distinction between public retrieval, large shared
question corpora, and observed crawler/referral evidence. They do not select a
production vendor or guarantee future capabilities.

- [Volcengine Responses API tool calling and Web Search documentation](https://www.volcengine.com/docs/82379/1958524?lang=zh) — demonstrates that web search is an explicit tool surface used by a model, supporting the architectural separation between retrieval and synthesis.
- [Ahrefs Brand Radar methodology](https://ahrefs.com/blog/brand-radar-methodology/) — describes anchoring questions in search demand, semantic fanout, storing shared observations, and treating visibility metrics as modeled directional signals rather than actual audience measurement.
- [Cloudflare AI Crawl Control traffic analysis](https://developers.cloudflare.com/ai-crawl-control/features/analyze-ai-traffic/) — documents crawler and referral traffic analysis, which this design keeps as independent operational evidence rather than proof of citation or recommendation.
