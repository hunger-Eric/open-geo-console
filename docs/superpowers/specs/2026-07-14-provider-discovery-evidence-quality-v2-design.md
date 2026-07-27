# Provider Discovery and Evidence Quality V2 Design

**Date:** 2026-07-14

**Status:** Approved design

**Scope:** Prospective paid reports and protected-staging evidence refreshes

**Commercial SKU:** `recommendation_forensics_v1`

**New customer artifact contract:** `combined_geo_report_v2`

## 1. Problem

The current combined report answers each locked business question with one short
paragraph and two or three source links. That contract is too narrow for a
supplier-discovery question and its evidence rules are not strong enough to
prove that a source supports the displayed claim.

The protected-staging logistics report exposed four concrete defects:

1. A safely retrieved non-empty page can receive Grade B evidence even when it
   does not answer the question.
2. Retrieval keeps the beginning of the readable page instead of selecting the
   passage that contains the relevant entity, service and operating claim.
3. Eligible domains are sorted lexically before the synthesis input is reduced
   to three domains, so domain spelling can affect which evidence reaches the
   model.
4. The report can conflate a logistics software vendor with a logistics
   operator because it has no deterministic entity-role or capability model.

The correction must not turn the product into an unconstrained market-research
chatbot. The report must remain reproducible, private, recoverable, evidence
bound and honest when public evidence is incomplete.

## 2. Product decision

Business question 1, `core_service_discovery`, becomes a structured supplier
discovery result with two customer-visible layers:

- a strictly verified list, split into the highest applicable qualification
  tiers; and
- a candidate list whose evidence is insufficient for strict qualification.

The strict list has no minimum count. The system must never lower the evidence
threshold to reach five suppliers. If strict qualification produces fewer than
five suppliers, the report shows the actual count and expands only the
candidate list within the fixed search budget.

Business questions 2 and 3 remain concise answers. Their contract changes from
paragraph-level source attachment to claim-level evidence binding.

## 3. Chosen architecture

The implementation uses a structured evidence chain:

```text
neutral discovery search
-> candidate entity resolution
-> candidate verification search
-> safe source retrieval
-> relevant passage selection
-> structured claim extraction
-> deterministic claim validation
-> evidence graph V2
-> deterministic provider qualification
-> strict list / candidate list / internal rejection
-> claim-grounded customer report
```

The model may extract structured claims from already retrieved passages and may
write customer prose from already qualified evidence. It may not choose the
qualification policy, decide a provider tier, upgrade candidate evidence, or
invent a missing capability.

## 4. General provider-discovery core

Open GEO Console is not a logistics-only product. Logistics concepts such as a
fleet, customs operation and last-mile delivery must not become global report
fields.

The generic domain owns:

- candidate identities and aliases;
- provider roles;
- service and route scope;
- capability claims;
- operating-control relationships;
- evidence and contradictions;
- strict, candidate and rejected outcomes; and
- versioned qualification-policy identity.

Industry-specific dimensions are supplied by compile-time policies:

```ts
interface ProviderQualificationPolicy {
  policyId: string;
  version: string;
  matches(input: {
    question: string;
    locale: string;
    websiteCategories: string[];
  }): boolean;
  queryFacets: QualificationQueryFacet[];
  capabilityDimensions: CapabilityDimensionDefinition[];
  classifyEntityRole(claims: ProviderClaim[]): ProviderRole;
  qualify(input: ProviderQualificationInput): ProviderQualificationResult;
}
```

Policy selection is deterministic and comes from a reviewed compile-time
registry. The selected policy ID and version are included in fanout, snapshot,
checkpoint and report identity. A model cannot generate or select a policy.

The first two policies are:

- `logistics_self_operated_v1`, for questions about self-operated dedicated
  logistics; and
- `generic_provider_discovery_v1`, for provider discovery that does not match a
  reviewed industry policy.

The generic policy shows verified service capabilities and evidence gaps. It
does not render logistics-specific columns.

## 5. Provider identities and roles

Every candidate has a deterministic public identity containing:

- canonical name;
- public aliases;
- official registrable domain when resolved;
- generic role;
- policy-specific role;
- service scopes;
- route or region scopes; and
- evidence IDs supporting the mapping.

The logistics policy recognizes these roles:

- `carrier`;
- `freight_forwarder`;
- `integrated_logistics`;
- `warehouse_operator`;
- `platform`;
- `software_vendor`;
- `directory_or_media`; and
- `unknown`.

Software vendors, directories and media pages can contribute candidate leads.
They cannot themselves enter the verified logistics-provider list unless
independent evidence proves that the same legal entity also operates the
relevant logistics service. A customer's capability must never be transferred
to its software vendor, and a software vendor's capability must never be
transferred to a customer.

## 6. Logistics self-operated capability matrix

The logistics policy records each operating dimension independently.

| Dimension | Allowed states |
| --- | --- |
| Line-haul fleet | `self_operated`, `dedicated_controlled`, `partner`, `mixed`, `unknown` |
| Air capacity | `owned`, `dedicated_charter`, `purchased_capacity`, `partner`, `unknown` |
| Origin consolidation warehouse | `self_operated`, `partner`, `unknown` |
| Overseas warehouse | `self_operated`, `partner`, `unknown` |
| Customs operation | `in_house_licensed`, `managed_partner`, `partner`, `unknown` |
| Last mile | `self_operated`, `partner`, `mixed`, `unknown` |
| Fixed dedicated route | `verified`, `unverified` |
| Outsourcing or cargo mixing | `no_outsourcing_verified`, `outsourcing_present`, `mixed`, `unknown` |

A fixed charter is not an owned aircraft. Purchased capacity is not a
self-operated route. A managed customs partner is not in-house licensed
customs. Unknown does not mean absent, self-operated or outsourced.

## 7. Qualification outcomes

### 7.1 Tier A: verified full-chain self-operation

Tier A requires all of the following:

- the entity is a real logistics service provider;
- the target service or route has direct support;
- every mandatory transport, consolidation, customs and last-mile dimension
  has direct evidence under the policy;
- no unresolved partner, outsourcing or mixed-network contradiction exists;
- `no_outsourcing_verified` is shown only when a direct statement supports it;
- at least one official, regulatory, registry or other first-party asset source
  supports the capability matrix; and
- at least one independent registrable domain corroborates the provider or a
  material operating fact.

### 7.2 Tier B: verified core self-operated segments

Tier B requires all of the following:

- the entity is a real logistics service provider;
- the fixed route or target service is verified;
- at least one material transport-control dimension is verified;
- at least one warehouse, customs or last-mile dimension is verified;
- unknown dimensions remain explicitly unknown;
- no text labels the provider as full-chain self-operated; and
- the evidence includes two relevant domains, or one high-authority first-party
  source plus another independently verifiable asset fact.

### 7.3 Tier C: candidate with insufficient evidence

Tier C includes a provider when relevant public material suggests the service
but one or more of these conditions remains unresolved:

- only one indirect source exists;
- service availability is shown but asset ownership is not;
- a route is shown but operating control is not;
- the provider identity is incomplete; or
- one or more required dimensions lacks public evidence.

Every Tier C item lists its known lead and exact missing proof. Candidate text
must not imply verified self-operation.

### 7.4 Internal rejection

Rejected items remain available to operator audits but do not appear in the
customer supplier list. Reasons include irrelevance, inaccessible evidence,
ambiguous identity, software-only role, directory-only role, unsupported model
claim and unresolved contradiction.

## 8. Claim contract

Every accepted provider capability claim binds:

```ts
interface ExtractedProviderClaim {
  subjectName: string;
  subjectEntityId: string;
  genericRole: ProviderRole;
  policyRole: string;
  capability: string;
  operatingMode: string;
  serviceScope: string[];
  routeScope: string[];
  exactExcerpt: string;
  sourceEvidenceId: string;
  sourceAuthority: string;
  directness: "direct" | "associated" | "lead_only";
  contradictionGroupId?: string;
}
```

The capability and operating-mode values are validated by the selected policy.
The excerpt must be an exact substring of the persisted normalized source text.
The subject, capability, operating relationship and route must be supported by
the same passage or by explicitly adjacent passages from the same source. The
system must not assemble a direct claim from unrelated parts of a page.

## 9. Two-stage search plan

### 9.1 Stage A: neutral discovery

Question 1 runs six reviewed query facets:

1. canonical question;
2. providers or suppliers;
3. transport ownership or dedicated control;
4. warehouse operations;
5. customs and last-mile operations; and
6. fixed routes, customer cases and qualifications.

Each query retains at most five public-search results. Entity resolution keeps
at most twelve logistics-provider candidates. Software, directory and media
entities do not consume the twelve-provider limit, although their content may
produce independent provider leads.

### 9.2 Stage B: candidate verification

Each of the at most twelve candidates receives one reviewed verification query
derived from its canonical public name and the policy facets. For the logistics
policy, the query targets self-operation, owned or dedicated transport,
warehouses, customs, last mile and fixed routes. An identified official domain
is preferred during retrieval and evidence ranking.

The candidate names are public-market output. Neither stage may include the
customer brand, customer domain, order ID, private question wording or a
private competitor list.

### 9.3 Fixed execution budget

| Scope | Maximum requests | Results per request | Maximum safe page retrievals |
| --- | ---: | ---: | ---: |
| Question 1 discovery | 6 | 5 | 20 |
| Question 1 verification | 12 | 5 | 24 |
| Question 2 | 6 | 3 | 8 |
| Question 3 | 6 | 3 | 8 |
| Total | 30 | - | 60 |

The system does not exceed these limits to reach a target supplier count.
Partial search coverage degrades the report's coverage label but does not by
itself fail the commercial job.

## 10. Relevant passage selection

The first 1,000 characters of a page are no longer treated as verified
evidence. Safe retrieval still produces at most 20,000 normalized characters.
That text is split on headings, paragraphs and list boundaries into passages of
approximately 200 to 1,200 characters.

The deterministic logistics relevance score is:

- exact candidate identity: 25;
- target service or route: 25;
- operating-control term such as owned, self-operated, direct or dedicated: 25;
- capability object such as fleet, warehouse, customs or last mile: 15; and
- same-passage or adjacent-sentence proximity: 10.

Each source retains at most three passages. A score below 45 is rejected as
irrelevant. A score from 45 through 69 can support a candidate lead. A score of
70 or greater is required for strict qualification.

The generic policy uses the same 0-100 contract with policy-specific facets and
thresholds. The selector version and matched facets are persisted.

## 11. Model-assisted claim extraction

The extraction model receives only the locked public question, candidate
identity, URL, page title and selected passages. It returns strict JSON under a
versioned extraction contract.

After the model returns, deterministic code revalidates:

- exact excerpt containment;
- entity identity;
- policy role;
- capability and operating-mode enum;
- service and route scope;
- passage relevance threshold;
- source provenance; and
- contradiction identity.

An invalid claim is persisted as rejected for operator audit and cannot enter
the evidence graph. The system does not repair an unsupported claim into a
fact.

## 12. Evidence grade V2

Grade A requires safe available retrieval, relevance of at least 70, precise
entity mapping, an exact direct capability claim, a traceable excerpt and an
official, regulatory, registry or comparable first-party asset source.

Grade B requires the same retrieval, relevance, entity, excerpt and direct
claim conditions from a relevant independent industry source, customer case or
credible partner source.

Grade C requires relevance of at least 45 and supports discovery of the entity
or service, but does not establish operating control or asset ownership.

Grade D includes irrelevant, inaccessible, ambiguous, metadata-only,
contradictory and unsupported evidence.

Strict qualification requires all of these conditions:

```text
grade in A/B
AND sourceEligibility.eligible
AND relevanceScore >= 70
AND exact entity binding
AND exact capability binding
AND no unresolved contradiction
```

A non-empty excerpt alone can never produce Grade B.

## 13. Customer report contract

New reports use:

```text
artifactContract: combined_geo_report_v2
businessQuestionAnswers.version: combined-business-question-answers-v2
providerDiscovery.version: provider-discovery-v1
```

Historical `combined_geo_report_v1` artifacts remain immutable and readable by
their current parser and renderer.

### 13.1 Question 1

Question 1 renders:

1. an execution summary with discovered, qualified, candidate and rejected
   counts;
2. a Tier A full-chain table when Tier A providers exist;
3. a Tier B core-segment table when Tier B providers exist;
4. a Tier C candidate table with known leads and missing proof; and
5. the fixed methodology limitation.

Tier A and B tables show service scope and every policy capability dimension as
verified self-operated, dedicated controlled, partner, mixed or unknown.

Tier C shows candidate name, discovered lead, missing proof, current role and
reference source. Internal rejected entities do not appear.

### 13.2 Customer-visible evidence

Each verified capability can expand to show:

- source domain and title;
- source authority type;
- observation time;
- a source-original excerpt of at most 300 visible characters; and
- the exact capability the excerpt supports.

The customer artifact does not expose query IDs, evidence IDs, hashes, internal
scores or model prompts.

### 13.3 Questions 2 and 3

Concise answers use claim-level binding:

```ts
interface GroundedAnswerClaim {
  text: string;
  evidenceIds: string[];
  confidence: "verified" | "limited";
}
```

Every factual sentence binds only evidence that supports that sentence. A
strong claim requires two independent domains. One first-party source can
produce only a limited claim with an explicit lack-of-independent-verification
qualification. No evidence means unknown, not a negative or positive fact.

## 14. Honest coverage metrics

The customer report separately displays:

- three business questions;
- planned and completed queries;
- returned search-result observations;
- successfully and safely retrieved pages;
- relevant passages;
- strict providers;
- candidate providers;
- evidence cutoff; and
- complete, partial or insufficient coverage.

The UI must not collapse these values into phrases such as "searched three
keywords" or "referenced sixteen articles." Search results, retrieved pages,
eligible evidence and final citations are different measurements.

## 15. Required customer limitations

Question 1 displays this meaning in the report locale:

> Self-operation is assessed separately for each operating stage from public
> evidence. Missing public evidence does not prove that a provider lacks a
> capability. Buyers must confirm operating entities, licences, subcontracting,
> service levels and route terms before purchase.

Questions 2 and 3 state that conclusions reflect only safely accessible and
relevance-validated public evidence at the cutoff. They are not real-time
pricing, capacity commitments or procurement endorsements.

## 16. Package ownership

`packages/public-search-observer` owns query-plan contracts, query kinds,
budgets, deterministic fanout identity, candidate-set hash inputs and privacy
exclusions. It does not qualify providers.

`packages/citation-intelligence` owns passage selection, provider identities,
roles, claims, source eligibility, evidence grades, contradictions, capability
matrices, policy registry and deterministic qualification.

`packages/ai-report-engine` owns the extraction-model contract, claim-grounded
answer contract, `combined_geo_report_v2`, strict parsing and report-language
validation.

`apps/web` owns PostgreSQL persistence, Worker orchestration, checkpoints,
recovery, artifact rendering, access control and atomic commercial activation.

## 17. PostgreSQL schema v20

### 17.1 Market snapshots

Add to `market_snapshots`:

- `snapshot_kind`, constrained to `standard_question`, `provider_discovery` or
  `candidate_verification`;
- nullable `parent_snapshot_id`;
- nullable `candidate_set_hash`; and
- `query_plan_version`.

Historical rows receive `standard_question`. A candidate-verification snapshot
must reference a completed provider-discovery snapshot and include the exact
candidate-set hash. A normal V2 report uses four snapshots: discovery,
verification, question 2 and question 3.

### 17.2 Market source passages

Create immutable `market_source_passages` with:

- source-evidence foreign key;
- passage order;
- exact excerpt and hash;
- relevance score;
- matched identity, service, control and capability facets;
- selector version; and
- creation time.

A source has at most three passages. Excerpts are bounded to 1,200 characters,
scores to 0-100 and metadata to the existing public JSON privacy policy.

### 17.3 Market provider claims

Create immutable `market_provider_claims` with:

- passage foreign key;
- deterministic provider-entity ID;
- canonical name;
- generic and policy roles;
- capability and operating mode;
- service and route scope;
- exact excerpt;
- claim hash;
- extraction model and contract identity;
- accepted or rejected validation status; and
- a bounded rejection reason.

Qualification results are deterministic projections persisted in the immutable
report payload rather than a mutable provider-rating table.

All new shared tables use the existing private-identity guard and immutable-row
pattern.

## 18. Recovery identity and state machine

The V2 checkpoint includes:

- methodology and artifact contract;
- discovery and verification snapshot IDs;
- the two standard question snapshot IDs;
- candidate-set hash;
- query-plan version;
- passage-selector version;
- claim-extraction contract and model identity;
- claim-set hash;
- qualification-policy identity;
- evidence cutoff;
- adapter identity hash;
- website-foundation hash; and
- locked question-set identity.

The Worker phases are:

```text
question_generation
provider_discovery_search
provider_candidate_resolution
candidate_verification_search
source_retrieval
passage_selection
provider_claim_extraction
evidence_graph
provider_qualification
question_answer_synthesis
report_build
artifact_verification
terminalization
```

The candidate set, passages, accepted claim set and qualification output each
receive a checkpoint hash. Recovery resumes from the last complete phase and
does not repeat completed search, retrieval or model work. A mismatch in any
identity field fails closed.

## 19. Failure semantics

These conditions lower coverage but allow a successful report:

- an individual query times out;
- a page is unavailable, robots denied or protected by a barrier;
- a candidate lacks self-operation proof;
- the strict list is empty;
- verification completes for only part of the candidate set; or
- one candidate identity cannot be resolved.

Search and transient fetch retries remain phase-local and bounded. Claim
extraction permits at most three attempts including format correction. Answer
synthesis permits at most three attempts, with at most one language-correction
call.

Authority, configuration, database, private storage, checkpoint identity,
stable extraction-contract, artifact-readiness and exhausted language failures
enter `repair_wait`. They do not automatically refund, send failure email or
regenerate the report.

## 20. Commercial and artifact boundaries

The report can persist search, evidence and qualification work incrementally.
The customer revision becomes active only after customer HTML, internal PDF,
page-count, private evidence, language and hash checks pass.

Artifact activation, job completion, credit settlement and completion-email
intent remain one PostgreSQL transaction. Resume cannot duplicate a charge,
settlement, refund or email. Strict-provider count is not a commercial success
condition.

Customers continue to receive HTML only. Internal PDF remains a readiness
artifact from the same V2 payload and is not customer served.

## 21. V1 compatibility and rollout

New paid work uses V2 only after protected-staging acceptance. Historical V1
reports are not reparsed, translated, migrated or regenerated. The existing
free correction entitlement does not create a V2 entitlement.

Protected staging may create a non-billable `evidence_refresh` revision for a
fixed acceptance order. Failure cannot replace the active V1 revision.

Deployment selection uses:

```text
OGC_COMBINED_REPORT_CONTRACT=combined_geo_report_v1|combined_geo_report_v2
```

The setting is deployment scoped, persisted in job and artifact identity and
cannot be controlled by a request, header, cookie or administrator shortcut.
Staging enables V2 first; production remains V1 until separately authorized.

## 22. Deterministic test matrix

Tests cover query identity, privacy, fixed budgets, policy selection, passage
selection, exact excerpt containment, entity roles, non-transfer of claims,
capability semantics, evidence grades, qualification tiers, candidate gaps,
claim-level answer citations, honest metrics and V1/V2 dispatch.

The logistics golden fixtures include:

1. an official full-chain provider;
2. a provider with fleet and warehouse evidence but unknown last mile;
3. a mixed network;
4. a pure freight forwarder;
5. a TMS software vendor;
6. an industry directory;
7. an irrelevant page;
8. an ambiguous same-name entity;
9. one official source without independent corroboration; and
10. contradictory first-party and independent evidence.

The fixture acceptance gates are:

- zero irrelevant pages in strict results;
- zero software-only entities in strict carrier results;
- every strict capability has an exact supporting excerpt;
- 100% correct full-chain versus core-segment classification in the fixtures;
- at least 80% candidate recall in the fixtures; and
- identical qualification and ordering for repeated identical inputs.

Live search is protected-staging integration evidence and does not replace
deterministic tests.

## 23. PostgreSQL, recovery and browser acceptance

Real PostgreSQL tests prove schema-v20 migration, immutable passage and claim
rows, discovery-to-verification ancestry, checkpoint mismatch rejection,
phase-local resume, privacy triggers, partial-coverage completion and no
duplicate commercial effects.

Artifact tests prove the Tier A/B/C sections, explicit unknown states,
customer-visible source-original excerpts, claim-level citations, exact
coverage counters, absence of internal identifiers and V1 readability.

Protected staging must produce:

- one Chinese logistics V2 report;
- one English generic-provider V2 report;
- one V2 report with zero strict providers;
- one report interrupted after candidate verification and successfully
  resumed; and
- one artifact-readiness fault injection.

The logistics acceptance report must exclude an irrelevant Huawei publication,
classify Eccang as a software vendor, prevent customer capabilities from being
assigned to Eccang, avoid unsupported full-chain claims and show exact evidence
gaps for candidates.

## 24. Verification commands

The final implementation must pass:

```powershell
npm test
npm run lint
npm run build
npm run db:audit
npm run test:postgres:staging-security
npx vitest run packages/citation-intelligence/src/provider-discovery
npx vitest run packages/public-search-observer/src/provider-query-plan.test.ts
npx vitest run packages/ai-report-engine/src/combined-geo-report-v2.test.ts
npx vitest run apps/web/src/worker/provider-discovery-pipeline.test.ts
npx vitest run apps/web/src/components/combined-geo-report-v2-artifact.test.tsx
codegraph sync
codegraph status
```

The exact test file grouping may be refined in the implementation plan, but the
acceptance behaviors and package ownership in this design are fixed.

## 25. Non-goals

This work does not:

- contact suppliers;
- retrieve real-time prices or capacity;
- endorse a procurement decision;
- guarantee that a provider never uses partners;
- bypass login, paywall, robots or safe-fetch rules;
- permit a model to add an industry policy;
- migrate historical V1 artifacts;
- lower evidence standards to reach five providers;
- add a second search provider;
- change payment, refund or HTML-only customer-delivery boundaries; or
- enable production V2 without explicit authorization.

## 26. Implementation order

Implementation proceeds in these independently reviewable stages:

1. generic policy contracts and deterministic logistics fixtures;
2. passage selection, entity resolution, claims, evidence V2 and qualification;
3. two-stage query plans and snapshot identity;
4. schema v20 and immutable persistence;
5. Worker phases, checkpoint recovery and partial-coverage semantics;
6. model extraction and claim-grounded answers;
7. `combined_geo_report_v2` parsing, HTML and internal PDF;
8. PostgreSQL, security and artifact integration tests;
9. protected-staging acceptance; and
10. documentation and production-gate review.

No implementation stage may weaken the approved evidence or commercial
boundaries to make a live report pass.
