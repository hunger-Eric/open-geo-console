# Reader-first GEO article deliverable design

Date: 2026-08-06  
Design status: approved in conversation; implementation not yet authorized

## Problem

The Paid V3 report currently labels both successful model output and a
deterministic fallback as a GEO article example. The observed fallback is a
website-fact summary followed by a copied buyer answer and repeated FAQ. It can
also retain provider-facing references such as `来源0`. Although the output is
structurally valid, it does not function as a clear article that a customer can
review and publish.

The product must deliver readable content first. Only after the reader-facing
content is complete should the report explain its GEO structure.

## Approved product decisions

1. The article's primary reader is a prospective buyer searching for a
   solution, not a site owner learning GEO.
2. One article answers one primary buyer question. The other locked questions
   do not become additional body sections.
3. The article or outline appears first. Its GEO explanation appears afterward
   and never interrupts the reader-facing content.
4. The existing article stage remains limited to one bounded model call. There
   is no retry and no second model-based critique.
5. A failed or rejected model draft becomes an explicitly labelled,
   deterministic content outline. It is never presented as a complete article.
6. Historical reports remain immutable and readable.

## Deliverable contract

New reports use a versioned discriminated union with one primary locked buyer
question and exactly one content branch:

```text
GeoArticleDeliverableV2
├── kind: article
│   ├── primaryQuestionId
│   ├── article
│   │   ├── title
│   │   ├── introduction { text, evidenceRefs }
│   │   ├── sections[]
│   │   │   └── paragraphs[] { text, evidenceRefs }
│   │   └── faq[] { question, answer, evidenceRefs }
│   └── explanation[]
└── kind: outline
    ├── primaryQuestionId
    ├── outline
    │   ├── workingTitle
    │   ├── readerQuestion
    │   ├── directAnswer
    │   ├── plannedSections[]
    │   ├── evidenceToAdd[]
    │   └── faqAngles[]
    ├── explanation[]
    └── fallbackReason
```

`article` and `outline` are mutually exclusive. `explanation` is always a
separate sibling, not prose embedded in either content branch.

The report parser accepts both the existing `geo_article_example_v1` and the
new deliverable version. It normalizes legacy model output as an article and
legacy `deterministic_fallback` output as an outline for presentation. This is
read compatibility only; no historical row or artifact is rewritten.

## Primary question

The first confirmed buyer question is the deterministic primary intent. This
preserves the customer's confirmed ordering and avoids introducing a new
opaque relevance score.

The model input may include the other two questions as context, but their full
answers must not be copied into the article. At most, a genuinely adjacent
intent may inspire a short FAQ angle after duplication checks.

## Reader-facing article standard

### Title

The title states the buyer's problem or decision scenario. It must not be a
domain or organization name followed by generic wording such as “服务选择与采购
核验指南”.

### Introduction

The introduction gives the direct answer in ordinary customer language and
states who the article helps. It must not begin with search, report, input,
prompt or generation narration.

### Body

The article contains three to five substantive, progressive sections. The
content should normally establish:

1. the reader's concrete business situation;
2. the dimensions that determine a suitable choice;
3. how to evaluate those dimensions;
4. what current public evidence confirms and does not confirm; and
5. an actionable selection or verification checklist.

The target organization appears only where supplied evidence supports its
role. The article solves the reader's problem before promoting the target and
must not become a service catalogue or unsupported advertisement.

### Sources

Evidence bindings remain structured outside prose. The renderer turns them
into stable customer-visible ordinals and links. Provider ordinals such as
`来源0` and internal evidence IDs never appear in article or outline prose.

### FAQ

The article contains two or three related questions not already answered in
the body. FAQ answers must not copy a body paragraph or a complete locked buyer
answer. The FAQ is not a container for the other two articles.

## GEO explanation

The explanation follows the uninterrupted article or outline and covers:

- the selected primary question and search intent;
- why the title states a reader problem;
- where the direct answer appears;
- the distinct job of each section;
- how public evidence and limitations are placed;
- which adjacent intents the FAQ covers; and
- the boundary that clear structure can aid understanding, extraction and
  citation without guaranteeing ranking, recommendation or future citation.

Each explanation entry references a stable article or outline element and
known evidence handles. The customer sees source names and links rather than
internal handles.

## One-call generation flow

```text
confirmed Q1-Q3 plus bounded evidence
                 |
       choose confirmed Q1 intent
                 |
       one bounded JSON model call
                 |
       contract and quality checks
          /                 \
 valid article          rejected/error
 article + explanation  outline + explanation
```

The model call requests only the article branch plus its explanation. The
outline is deterministic and is never requested from a second call.

## Deterministic quality checks

In addition to schema, evidence and language checks, a model article is
rejected when any of the following is true:

- the primary question is not the first confirmed question;
- the title is only the target identity plus generic guide wording;
- customer prose contains provider ordinals, internal evidence handles, raw
  HTML/Markdown, or report/prompt/input/generation narration;
- any normalized paragraph is duplicated;
- an FAQ answer duplicates a normalized body paragraph;
- a body or FAQ paragraph exactly reuses a complete buyer answer;
- the article has fewer than three or more than five substantive sections;
- the FAQ has fewer than two or more than three entries;
- an evidence binding is unknown or belongs outside the supplied authority;
- the configured language is not satisfied; or
- required title, introduction, decision guidance, evidence boundary or
  actionable conclusion content is absent.

The checks should remain deterministic and explain rejection through a safe
typed reason. They must not introduce another model judgment stage.

## Fallback outline

Provider error, timeout, invalid JSON, contract failure or content-quality
rejection produces an outline with a safe typed reason such as:

- `provider_error`
- `timeout`
- `invalid_output`
- `contract_rejected`
- `quality_rejected`

The technical exception text is not shown to the customer. The report states
that no qualified complete article was formed and presents an evidence-based
working title, reader question, direct answer, planned sections, missing
evidence and FAQ angles.

This outcome does not retry the model and does not fail the surrounding Paid
report. It also must not claim that a publish-ready article was delivered.

## Presentation

Article mode is labelled `可发布文章示例`. Outline mode is labelled
`GEO 内容提纲` and begins with a plain-language qualification notice.

The fixed reading order is:

```text
publish-ready article or evidence-based outline
                    ↓
why this content is organized this way
                    ↓
sources, generation mode and applicability boundaries
```

Desktop and mobile layouts preserve the existing report visual system. This
change clarifies hierarchy and labels; it is not a report-wide redesign.

## Error and trace behavior

The current silent catch must be replaced by safe classification. The article
stage returns either a valid article or a deterministic outline and records the
typed fallback reason in the deliverable/trace without storing credentials,
raw provider responses or sensitive exception data.

The single-call limit, timeout, surrounding fulfillment state and atomic Paid
report terminalization remain unchanged.

## Verification

Focused automated checks cover:

- a valid one-call article and separate explanation;
- provider error, timeout, invalid JSON, contract rejection and quality
  rejection, each producing an outline without a retry;
- rejection of provider ordinals, internal process narration, exact buyer
  answer reuse and article/FAQ duplication;
- structured citation rendering with customer ordinals and links;
- article/outline content preceding its explanation;
- legacy model output rendered as an article;
- legacy deterministic fallback rendered as an outline;
- readiness and Paid linear-flow preservation; and
- no selected-test skips.

Local acceptance also includes scoped lint, a full workspace build,
`git diff --check`, and zero-external-call desktop/mobile fixture inspection.
No real model, search, crawl, report, payment, email, deployment, Preview,
Staging or Production action is part of this local implementation scope.

## Non-goals

- No new buyer-question generation or prioritization model.
- No second article or critique call.
- No crawler, public-search or provider-profile change.
- No report replay, historical artifact migration or data rewrite.
- No payment, refund, email, access, PDF, deployment or infrastructure change.
- No broad report visual redesign.
