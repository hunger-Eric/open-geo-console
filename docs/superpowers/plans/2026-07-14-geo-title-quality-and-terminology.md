# GEO Page-Title Quality and Report Terminology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new combined GEO reports detect highly repetitive page-title templates, explain the GEO impact in the persisted locale, present affected titles clearly, and prohibit customer-visible SEO terminology without changing historical reports.

**Architecture:** Add a pure title-pattern analyzer to `geo-auditor`, then use its deterministic result to create localized findings and drive new-report-only title presentation. Add an optional `geo_v1` presentation policy to the combined artifact contract; new materialization sets it, the final gate enforces GEO terminology for report-authored prose, and the renderer uses it to map the stable internal `seo` enum to the customer-visible label `GEO`.

**Tech Stack:** TypeScript, React server rendering, Vitest, npm workspaces, CodeGraph, PostgreSQL-backed persisted combined-report artifacts.

## Global Constraints

- Apply only to newly generated/materialized reports; do not migrate, regenerate, or rewrite existing reports, active revisions, stored HTML, or stored private PDF bytes.
- Preserve source-original titles, quotations, URLs, user-provided text, and stable identifiers verbatim.
- Keep the internal vendor enum value `seo` for backward compatibility; expose `GEO` only when the new `geo_v1` presentation policy is present.
- Customer delivery remains HTML-only; private Chromium HTML-to-PDF readiness, hashes, storage, and page-count validation remain mandatory.
- Deterministic rules, not model judgment, own title-pattern classification and scoring.
- Customer-facing application and model prose must use GEO terminology and must not describe the work as SEO or search-engine optimization.
- Use TDD for every behavior change and commit each independently reviewable task.

---

## File Structure

- Create `packages/geo-auditor/src/title-patterns.ts`: pure normalization, weighted-length, exact-duplicate, dominant-prefix, and dominant-suffix analysis.
- Create `packages/geo-auditor/src/title-patterns.test.ts`: isolated threshold, tie-break, and false-positive tests.
- Modify `packages/geo-auditor/src/index.ts`: export title-pattern interfaces, add finding message keys/catalog copy, create grouped findings, and preserve capped scoring.
- Modify `packages/geo-auditor/src/index.test.ts`: integration tests for findings, aggregation, representative URLs, and scoring.
- Modify `apps/web/src/i18n/en.ts` and `apps/web/src/i18n/zh.ts`: localized GEO finding copy.
- Modify `apps/web/src/report/technical-report-localization.test.ts`: artifact-projection localization coverage.
- Modify `packages/ai-report-engine/src/report-language.ts`: GEO terminology instruction, terminology validation, and source-original exception.
- Modify `packages/ai-report-engine/src/report-language.test.ts`: English/Chinese rejection and source-original allowance.
- Modify `packages/ai-report-engine/src/analysis.ts`, `packages/ai-report-engine/src/synthesis.ts`, and `packages/ai-report-engine/src/combined-business-question-answers.ts`: invoke the GEO terminology check inside existing one-correction model loops.
- Modify `packages/ai-report-engine/src/index.test.ts` and `packages/ai-report-engine/src/combined-business-question-answers.test.ts`: prove a single correction and fail-closed exhaustion.
- Modify `packages/ai-report-engine/src/combined-geo-report.ts`: optional historical-compatible `presentationTerminologyPolicy`, parser validation, field collection, and prospective terminology gate.
- Modify `packages/ai-report-engine/src/combined-geo-report.test.ts`: policy parsing and final-gate tests.
- Modify `apps/web/src/report/combined-artifact-readiness.tsx`: set `geo_v1` only on newly materialized combined artifacts.
- Modify `apps/web/src/report/combined-artifact-readiness.test.tsx`: new-policy canonical rendering assertion.
- Modify `apps/web/src/components/combined-geo-report-artifact.tsx`: policy-aware GEO vendor label and affected-title cell.
- Modify `apps/web/src/components/combined-geo-report-artifact.test.tsx`: new/legacy rendering and source-title preservation.
- Modify `docs/PROJECT-STATE.md` and `docs/TASKS.md`: record the stable prospective behavior and validation commands after implementation passes.

---

### Task 1: Pure title-pattern analyzer

**Files:**
- Create: `packages/geo-auditor/src/title-patterns.ts`
- Create: `packages/geo-auditor/src/title-patterns.test.ts`
- Modify: `packages/geo-auditor/src/index.ts`

**Interfaces:**
- Consumes: `{ url: string; status: number; title?: string }[]` from audited pages.
- Produces:

```ts
export type TitlePatternKind = "exact_duplicate" | "dominant_prefix" | "dominant_suffix";

export interface TitlePatternPage {
  url: string;
  status: number;
  title?: string;
}

export interface TitlePatternMatch {
  kind: TitlePatternKind;
  sharedSegment: string;
  sharedLength: number;
  affectedUrls: string[];
  uniqueSegments: Record<string, string>;
  weightedLengths: Record<string, number>;
}

export function weightedTitleLength(value: string): number;
export function analyzeTitlePatterns(pages: readonly TitlePatternPage[]): TitlePatternMatch[];
```

- [ ] **Step 1: Write failing exact-duplicate and dominant-suffix tests**

Create `title-patterns.test.ts` with concrete observed-pattern coverage:

```ts
import { describe, expect, it } from "vitest";
import { analyzeTitlePatterns, weightedTitleLength } from "./title-patterns";

const suffix = "凌顺国际物流-16年老牌货代，专业提供台湾海快专线、台湾海运专线、菲律宾海运专线及跨境物流实时追踪";

describe("title pattern analysis", () => {
  it("finds exact duplicate titles on distinct successful URLs", () => {
    expect(analyzeTitlePatterns([
      { url: "https://example.com/a", status: 200, title: "Same page title" },
      { url: "https://example.com/b", status: 200, title: " same   page title " }
    ])).toEqual([expect.objectContaining({
      kind: "exact_duplicate",
      affectedUrls: ["https://example.com/a", "https://example.com/b"]
    })]);
  });

  it("finds a dominant shared suffix while retaining page-unique text", () => {
    const result = analyzeTitlePatterns([
      { url: "https://example.com/", status: 200, title: suffix },
      { url: "https://example.com/service", status: 200, title: `国际转运流程-${suffix}` },
      { url: "https://example.com/about", status: 200, title: `集团简介-${suffix}` },
      { url: "https://example.com/news", status: 200, title: `新闻动态-${suffix}` },
      { url: "https://example.com/shipping", status: 200, title: `国际集运-${suffix}` }
    ]);
    expect(result).toContainEqual(expect.objectContaining({
      kind: "dominant_suffix",
      sharedSegment: suffix,
      affectedUrls: expect.arrayContaining(["https://example.com/service", "https://example.com/about"]),
      uniqueSegments: expect.objectContaining({
        "https://example.com/service": "国际转运流程",
        "https://example.com/about": "集团简介"
      })
    }));
  });

  it("uses two display units for CJK and one for ASCII", () => {
    expect(weightedTitleLength("GEO 报告")).toBe(8);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

```powershell
npx vitest run packages/geo-auditor/src/title-patterns.test.ts
```

Expected: FAIL because `./title-patterns` does not exist.

- [ ] **Step 3: Implement normalization and candidate generation**

Create `title-patterns.ts` with these constants and deterministic helpers:

```ts
const MIN_SHARED_CODE_POINTS = 20;
const MIN_SHARED_RATIO = 0.6;
const MIN_AFFECTED_RATIO = 0.6;
const SEPARATOR = /^[\s|｜:：·•—–_-]+|[\s|｜:：·•—–_-]+$/gu;

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function codePoints(value: string): string[] {
  return [...value];
}

function trimSeparators(value: string): string {
  return value.replace(SEPARATOR, "").trim();
}

export function weightedTitleLength(value: string): number {
  return codePoints(normalize(value)).reduce(
    (sum, character) => sum + (/[^\u0000-\u00ff]/u.test(character) ? 2 : 1),
    0
  );
}
```

Generate common-prefix and common-suffix candidates from every pair of eligible titles. Deduplicate candidates by `kind + normalized shared segment`, discard candidates below 20 code points, and evaluate each candidate against every eligible page.

For each candidate, retain pages where `sharedSegment.length / normalizedTitle.length >= 0.6`. Require `affectedUrls.length >= max(3, ceil(eligiblePages.length * 0.6))` and at least two different non-empty unique segments. Sort qualifying candidates by affected-page count descending, summed shared ratio descending, shared length descending, then `dominant_prefix` before `dominant_suffix` for a stable final tie-break.

Group exact duplicates first by lower-cased normalized title. Do not include an exact-duplicate URL in a dominant-template result when that would emit the same root cause twice.

- [ ] **Step 4: Add false-positive, prefix, status, and tie-break tests**

Add tests proving:

```ts
it("does not flag a short reusable brand suffix", () => {
  const result = analyzeTitlePatterns([
    { url: "https://example.com/a", status: 200, title: "Air freight | Acme" },
    { url: "https://example.com/b", status: 200, title: "Sea freight | Acme" },
    { url: "https://example.com/c", status: 200, title: "Warehousing | Acme" }
  ]);
  expect(result).toEqual([]);
});

it("requires three pages for a dominant template", () => {
  expect(analyzeTitlePatterns([
    { url: "https://example.com/a", status: 200, title: `A-${suffix}` },
    { url: "https://example.com/b", status: 200, title: `B-${suffix}` }
  ])).toEqual([]);
});

it("ignores unsuccessful and untitled pages", () => {
  const result = analyzeTitlePatterns([
    { url: "https://example.com/a", status: 404, title: `A-${suffix}` },
    { url: "https://example.com/b", status: 200 },
    { url: "https://example.com/c", status: 200, title: "Distinct useful title" }
  ]);
  expect(result).toEqual([]);
});
```

Add a mirrored long-prefix fixture and assert `dominant_prefix`. Add a fixture where prefix and suffix candidates tie, and assert the documented stable choice.

- [ ] **Step 5: Export the analyzer and run its complete test file**

At the top level of `packages/geo-auditor/src/index.ts`, export:

```ts
export {
  analyzeTitlePatterns,
  weightedTitleLength,
  type TitlePatternKind,
  type TitlePatternMatch,
  type TitlePatternPage
} from "./title-patterns";
```

Run:

```powershell
npx vitest run packages/geo-auditor/src/title-patterns.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the pure analyzer**

```powershell
git add packages/geo-auditor/src/title-patterns.ts packages/geo-auditor/src/title-patterns.test.ts packages/geo-auditor/src/index.ts
git commit -m "feat: analyze GEO page title patterns"
```

---

### Task 2: Deterministic GEO findings, localization, and scoring

**Files:**
- Modify: `packages/geo-auditor/src/index.ts`
- Modify: `packages/geo-auditor/src/index.test.ts`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/zh.ts`
- Modify: `apps/web/src/report/technical-report-localization.test.ts`

**Interfaces:**
- Consumes: `analyzeTitlePatterns(pages)` from Task 1.
- Produces: new `FindingMessageKey` values `page.duplicateTitles` and `page.dominantTitleTemplate`, with primitive interpolation params and existing `FindingAggregation` evidence.

- [ ] **Step 1: Write failing finding integration tests**

In `packages/geo-auditor/src/index.test.ts`, add one exact-duplicate case and the observed five-page suffix case:

```ts
it("emits one grouped GEO finding for a dominant title suffix", () => {
  const shared = "凌顺国际物流-16年老牌货代，专业提供台湾海快专线、台湾海运专线、菲律宾海运专线及跨境物流实时追踪";
  const pages = ["首页", "国际转运流程", "集团简介", "新闻动态", "国际集运"].map((name, index) =>
    page(`https://example.com/${index || ""}`, { title: index === 0 ? shared : `${name}-${shared}` })
  );
  const findings = buildFindings("https://example.com/", pages, availableAssets());
  const finding = findings.find(({ messageKey }) => messageKey === "page.dominantTitleTemplate");
  expect(finding).toMatchObject({
    severity: "warning",
    params: { patternPosition: "suffix", sharedLength: [...shared].length, affectedCount: 5 },
    aggregation: { affectedCount: 5 }
  });
  expect(finding?.aggregation?.representativeUrls).toHaveLength(3);
});
```

Also assert that the group contributes only one capped warning rule and does not add a second overlong-title penalty for the same pages.

- [ ] **Step 2: Run the auditor tests and verify the missing message-key failure**

Run:

```powershell
npx vitest run packages/geo-auditor/src/index.test.ts
```

Expected: FAIL because the new finding keys and grouped finding construction do not exist.

- [ ] **Step 3: Add catalog definitions and grouped finding construction**

Extend `FindingMessageKey`:

```ts
  | "page.duplicateTitles"
  | "page.dominantTitleTemplate"
```

Add English fallback catalog definitions:

```ts
"page.duplicateTitles": {
  severity: "warning",
  title: "Multiple pages reuse the same title",
  description: ({ affectedCount }) => `${affectedCount} pages expose the same title, reducing page-specific GEO identity.`,
  recommendation: "Give each page a concise title that states its distinct purpose and keep only a short reusable brand identifier."
},
"page.dominantTitleTemplate": {
  severity: "warning",
  title: "Page titles are dominated by a shared template",
  description: ({ affectedCount, sharedLength }) =>
    `${affectedCount} pages share a ${sharedLength}-character title segment that outweighs their page-specific meaning.`,
  recommendation: "Lead with the page's distinct purpose and reduce the repeated portion to a concise brand identifier."
}
```

Call `analyzeTitlePatterns(pages)` once inside `buildFindings`. Convert each result to one `createFinding(...)` result and attach:

```ts
aggregation: {
  affectedCount: match.affectedUrls.length,
  representativeUrls: match.affectedUrls.slice(0, 3),
  templateKey: `title-pattern:${match.kind}`
}
```

Use `patternPosition: "prefix" | "suffix" | "full"`, `sharedLength`, and `affectedCount` as message params. Set `url` to the first representative URL. Do not send the full shared title through params because source-original title text already remains in `pages`.

- [ ] **Step 4: Add Chinese and English dictionary copy**

Add matching entries to `apps/web/src/i18n/zh.ts` and `apps/web/src/i18n/en.ts`.

Chinese copy:

```ts
"page.duplicateTitles": {
  title: "多个页面重复使用同一标题",
  description: "{affectedCount} 个页面使用相同标题，削弱了生成式引擎对页面独立用途的识别。",
  recommendation: "为每个页面使用简洁、用途明确的独立标题，仅保留短小的通用品牌标识。"
},
"page.dominantTitleTemplate": {
  title: "页面标题被共享模板主导",
  description: "{affectedCount} 个页面共享长度为 {sharedLength} 个字符的标题片段，页面独有语义占比过低。",
  recommendation: "优先表达当前页面的独特用途，并将重复部分缩减为简洁的品牌标识，以便生成式引擎准确选择和引用页面。"
}
```

English copy must use GEO framing and must not use SEO terminology.

- [ ] **Step 5: Prove localized artifact projection**

In `technical-report-localization.test.ts`, create a report containing `page.dominantTitleTemplate`, localize it to `zh-CN`, and assert:

```ts
expect(localized.findings[0]).toMatchObject({
  title: "页面标题被共享模板主导",
  recommendation: expect.stringContaining("生成式引擎")
});
expect(source.findings[0]!.title).toBe("Page titles are dominated by a shared template");
```

Run:

```powershell
npx vitest run packages/geo-auditor/src/title-patterns.test.ts packages/geo-auditor/src/index.test.ts apps/web/src/report/technical-report-localization.test.ts apps/web/src/i18n/i18n.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit deterministic findings and localization**

```powershell
git add packages/geo-auditor/src/index.ts packages/geo-auditor/src/index.test.ts apps/web/src/i18n/en.ts apps/web/src/i18n/zh.ts apps/web/src/report/technical-report-localization.test.ts
git commit -m "feat: report repetitive titles as GEO findings"
```

---

### Task 3: Prospective GEO terminology policy and model/final gates

**Files:**
- Modify: `packages/ai-report-engine/src/report-language.ts`
- Modify: `packages/ai-report-engine/src/report-language.test.ts`
- Modify: `packages/ai-report-engine/src/analysis.ts`
- Modify: `packages/ai-report-engine/src/synthesis.ts`
- Modify: `packages/ai-report-engine/src/combined-business-question-answers.ts`
- Modify: `packages/ai-report-engine/src/index.test.ts`
- Modify: `packages/ai-report-engine/src/combined-business-question-answers.test.ts`
- Modify: `packages/ai-report-engine/src/combined-geo-report.ts`
- Modify: `packages/ai-report-engine/src/combined-geo-report.test.ts`

**Interfaces:**
- Produces `GEO_TERMINOLOGY_POLICY = "geo_v1"`.
- Adds optional `presentationTerminologyPolicy?: "geo_v1"` to `CombinedGeoReportV1`; absence means historical behavior.
- Produces `assertGeoTerminology(fields, policy)` that throws `ReportLanguageValidationError` with reason `legacy_seo_terminology`, allowing existing one-correction loops to remain authoritative.

- [ ] **Step 1: Write failing terminology contract tests**

In `report-language.test.ts`, add:

```ts
it.each(["SEO", "seo", "Search Engine Optimization", "search-engine optimisation", "搜索引擎优化"])(
  "rejects legacy terminology in GEO report prose: %s",
  (term) => {
    expect(() => assertGeoTerminology(
      [{ path: "finding.title", text: `Improve ${term} visibility.` }],
      "geo_v1"
    )).toThrow(ReportLanguageValidationError);
  }
);

it("allows legacy terminology only in source-original fields and identifiers", () => {
  expect(() => assertGeoTerminology([
    { path: "evidence.quote", text: "Our SEO service", kind: "source_original" },
    { path: "task.vendor", text: "seo", kind: "identifier" }
  ], "geo_v1")).not.toThrow();
});
```

Update the prompt test to require `Use GEO terminology` and `Do not use SEO`.

- [ ] **Step 2: Run the language tests and verify missing exports**

```powershell
npx vitest run packages/ai-report-engine/src/report-language.test.ts
```

Expected: FAIL because `assertGeoTerminology` and `GEO_TERMINOLOGY_POLICY` do not exist.

- [ ] **Step 3: Implement the terminology contract**

In `report-language.ts`, add:

```ts
export const GEO_TERMINOLOGY_POLICY = "geo_v1" as const;
export type ReportTerminologyPolicy = typeof GEO_TERMINOLOGY_POLICY;

const LEGACY_SEO_TERM = /\bSEO\b|\bsearch[ -]engine optimi[sz]ation\b|搜索引擎优化/iu;

export function assertGeoTerminology(
  fields: readonly ReportLanguageField[],
  policy: ReportTerminologyPolicy
): void {
  if (policy !== GEO_TERMINOLOGY_POLICY) return;
  const violations = fields
    .filter((field) => (field.kind ?? "prose") === "prose" && LEGACY_SEO_TERM.test(field.text))
    .map(({ path }) => ({ path, reason: "legacy_seo_terminology" as const }));
  if (violations.length) throw new ReportLanguageValidationError(violations);
}
```

Extend `ReportLanguageViolation["reason"]` with `legacy_seo_terminology`. Append this exact sentence to both locale branches of `reportLanguageInstruction`:

```text
Use GEO terminology. Do not use SEO, Search Engine Optimization, or equivalent legacy terminology in report prose.
```

Keep the regular expression non-global so repeated field checks cannot inherit `lastIndex` state.

- [ ] **Step 4: Integrate terminology into existing correction loops**

In `analysis.ts`, `synthesis.ts`, and `combined-business-question-answers.ts`, call:

```ts
assertReportLanguage(fields, locale, allowedTerms);
assertGeoTerminology(fields, GEO_TERMINOLOGY_POLICY);
```

Keep both calls inside the existing `try` block that catches `ReportLanguageValidationError`. Do not create a second retry counter. Update `languageViolationFeedback` handling only as needed so `legacy_seo_terminology` reaches `correctionRequired` and the model still receives at most one corrective call.

Add tests in `index.test.ts` and `combined-business-question-answers.test.ts` where the first completion contains SEO prose and the second contains GEO prose. Assert two calls and success. Add an always-invalid fixture and assert two calls followed by `ReportLanguageValidationError`.

- [ ] **Step 5: Add the optional combined-artifact policy and prospective final gate**

Extend `CombinedGeoReportV1`:

```ts
presentationTerminologyPolicy?: typeof GEO_TERMINOLOGY_POLICY;
```

In `parseCombinedGeoReportV1`, accept only `undefined` or `geo_v1` using the existing `exact` helper:

```ts
if (report.presentationTerminologyPolicy !== undefined) {
  exact(report.presentationTerminologyPolicy, GEO_TERMINOLOGY_POLICY, "presentationTerminologyPolicy");
}
const presentationTerminologyPolicy = report.presentationTerminologyPolicy as
  | typeof GEO_TERMINOLOGY_POLICY
  | undefined;
```

Return it only when present so historical parsed payload shape is unchanged. Extract the existing field-building body in `assertCombinedGeoReportLanguage` into a private `combinedReportProseFields(report, scope)` helper, then run:

```ts
assertReportLanguage(scopedFields, report.locale, [...new Set(allowedTerms)]);
if (report.presentationTerminologyPolicy) {
  assertGeoTerminology(scopedFields, report.presentationTerminologyPolicy);
}
```

Do not add source titles, H1 values, evidence quotations, URLs, business-question source text, or `task.vendor` to prose fields.

- [ ] **Step 6: Test policy compatibility and final rejection**

In `combined-geo-report.test.ts`, assert:

```ts
it("rejects SEO prose only for new geo_v1 artifacts", () => {
  const current = fixture("en");
  current.presentationTerminologyPolicy = "geo_v1";
  current.vendorTaskPackage.tasks[0]!.text = "Improve SEO visibility.";
  expect(() => assertCombinedGeoReportLanguage(current)).toThrow(ReportLanguageValidationError);

  const historical = fixture("en");
  historical.vendorTaskPackage.tasks[0]!.text = "Improve SEO visibility.";
  expect(() => assertCombinedGeoReportLanguage(historical)).not.toThrow();
});
```

Also test parser rejection of any policy other than `geo_v1`, and test that a source evidence quote containing SEO remains allowed.

Run:

```powershell
npx vitest run packages/ai-report-engine/src/report-language.test.ts packages/ai-report-engine/src/index.test.ts packages/ai-report-engine/src/combined-business-question-answers.test.ts packages/ai-report-engine/src/combined-geo-report.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the terminology policy and gates**

```powershell
git add packages/ai-report-engine/src/report-language.ts packages/ai-report-engine/src/report-language.test.ts packages/ai-report-engine/src/analysis.ts packages/ai-report-engine/src/synthesis.ts packages/ai-report-engine/src/combined-business-question-answers.ts packages/ai-report-engine/src/index.test.ts packages/ai-report-engine/src/combined-business-question-answers.test.ts packages/ai-report-engine/src/combined-geo-report.ts packages/ai-report-engine/src/combined-geo-report.test.ts
git commit -m "feat: enforce GEO report terminology"
```

---

### Task 4: New-report policy materialization and readable title cells

**Files:**
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: `apps/web/src/report/combined-artifact-readiness.test.tsx`
- Modify: `apps/web/src/components/combined-geo-report-artifact.tsx`
- Modify: `apps/web/src/components/combined-geo-report-artifact.test.tsx`

**Interfaces:**
- Consumes: `GEO_TERMINOLOGY_POLICY`, `analyzeTitlePatterns`, new finding keys, and `presentationTerminologyPolicy` from Tasks 1–3.
- Produces: policy-aware `artifactValueLabel(...)` and a `SourceTitleCell` that never mutates the source title.

- [ ] **Step 1: Write failing new/legacy vendor-label tests**

In `combined-geo-report-artifact.test.tsx`, add:

```ts
it("shows GEO for the stable seo vendor identifier only on geo_v1 artifacts", () => {
  const current = combinedArtifactFixture();
  current.combinedReport.presentationTerminologyPolicy = "geo_v1";
  current.combinedReport.vendorTaskPackage.tasks = [{
    id: "task", vendor: "seo", title: "Improve evidence", text: "Improve public evidence.",
    actions: ["Edit the page."], acceptanceCriteria: ["Evidence is clear."]
  }] as never;
  const currentText = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model: current })).replace(/<[^>]+>/g, " ");
  expect(currentText).toContain("GEO");
  expect(currentText).not.toMatch(/\bSEO\b/);

  const historical = combinedArtifactFixture();
  historical.combinedReport.vendorTaskPackage.tasks = current.combinedReport.vendorTaskPackage.tasks;
  const historicalText = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model: historical })).replace(/<[^>]+>/g, " ");
  expect(historicalText).toContain("SEO");
});
```

- [ ] **Step 2: Write the failing title-cell test**

Build the five-page observed suffix fixture, add a `page.dominantTitleTemplate` finding, set `geo_v1`, and assert:

```ts
expect(html).toContain("国际转运流程");
expect(html).toContain("共享模板后缀");
expect(html).toContain("<details");
expect(html).toContain(`国际转运流程-${shared}`);
expect(html).toContain("来源原文");
```

Create the same pages without the new finding key and assert the old full-title cell is rendered without the compact template label.

- [ ] **Step 3: Set the policy during new artifact materialization**

Import `GEO_TERMINOLOGY_POLICY` into `combined-artifact-readiness.tsx` and add this property to the object passed to `requireReadyCombinedGeoReport`:

```ts
presentationTerminologyPolicy: GEO_TERMINOLOGY_POLICY,
```

In `combined-artifact-readiness.test.tsx`, set the fixture policy and assert canonical HTML contains the GEO vendor label and no standalone customer-visible SEO label.

- [ ] **Step 4: Make artifact label mapping policy-aware**

Change the label closure and helper signature:

```ts
const geoTerminology = report.presentationTerminologyPolicy === "geo_v1";
const label = (kind: ArtifactLabelKind, value: string) =>
  artifactValueLabel(kind, value, zh, geoTerminology);

function artifactValueLabel(
  kind: ArtifactLabelKind,
  value: string,
  zh: boolean,
  geoTerminology: boolean
): string {
  if (kind === "vendor" && value === "seo" && geoTerminology) return "GEO";
  return (zh ? ZH_ARTIFACT_LABELS : EN_ARTIFACT_LABELS)[kind][value] ?? value;
}
```

Keep the legacy dictionaries unchanged so artifacts without the policy still render exactly as before.

- [ ] **Step 5: Implement the source-preserving title cell**

Import `analyzeTitlePatterns` from `@open-geo-console/geo-auditor`. Only compute display matches when `technical.findings` contains `page.duplicateTitles` or `page.dominantTitleTemplate`.

Build a `Map<string, { kind; sharedSegment; uniqueSegment }>` for affected URLs. Replace only the title `<td>` with:

```tsx
function SourceTitleCell({
  title,
  display,
  zh
}: {
  title?: string;
  display?: { kind: "exact_duplicate" | "dominant_prefix" | "dominant_suffix"; sharedSegment: string; uniqueSegment: string };
  zh: boolean;
}) {
  if (!title) return <>—</>;
  if (!display) return <>{title}</>;
  const position = display.kind === "dominant_prefix" ? (zh ? "前缀" : "prefix") :
    display.kind === "dominant_suffix" ? (zh ? "后缀" : "suffix") : (zh ? "标题" : "title");
  return <div className="source-title-cell">
    <strong>{display.uniqueSegment || (zh ? "无独有标题文本" : "No page-unique title text")}</strong>
    <span>{zh ? `共享模板${position}（${[...display.sharedSegment].length} 字）` : `Shared template ${position} (${[...display.sharedSegment].length} characters)`}</span>
    <details><summary>{zh ? "查看来源原文" : "View source original"}</summary><span>{title}</span></details>
  </div>;
}
```

For exact duplicates, show the full title inside `<details>` and the “no page-unique title text” primary message. Do not copy the shared segment into application-generated prose outside the source-original details element.

- [ ] **Step 6: Run rendering and readiness tests**

```powershell
npx vitest run apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/report/combined-artifact-readiness.test.tsx packages/ai-report-engine/src/combined-geo-report.test.ts
```

Expected: PASS, including legacy behavior, GEO label, compact title display, full source title, and no customer PDF link.

- [ ] **Step 7: Commit materialization and rendering**

```powershell
git add apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/components/combined-geo-report-artifact.tsx apps/web/src/components/combined-geo-report-artifact.test.tsx
git commit -m "feat: present new GEO report title evidence"
```

---

### Task 5: Full validation, terminology audit, and durable project state

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`

**Interfaces:**
- Consumes: all behavior completed in Tasks 1–4.
- Produces: repository-wide proof and concise continuation truth.

- [ ] **Step 1: Run all focused regression tests together**

```powershell
npx vitest run packages/geo-auditor/src/title-patterns.test.ts packages/geo-auditor/src/index.test.ts apps/web/src/report/technical-report-localization.test.ts packages/ai-report-engine/src/report-language.test.ts packages/ai-report-engine/src/index.test.ts packages/ai-report-engine/src/combined-business-question-answers.test.ts packages/ai-report-engine/src/combined-geo-report.test.ts apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/report/combined-artifact-readiness.test.tsx
```

Expected: all selected test files pass.

- [ ] **Step 2: Audit customer-visible SEO occurrences**

Run:

```powershell
rg -n -i "\bSEO\b|search[ -]engine optimization" apps/web/src packages/ai-report-engine/src packages/geo-auditor/src
```

Expected remaining occurrences are limited to:

- stable internal enum values and parsers;
- explicit legacy-rendering compatibility branches;
- terminology-rejection tests and regexes;
- source-original test fixtures.

Inspect every match. Any unconditional customer-visible label, deterministic prose, or model instruction that promotes SEO terminology must be removed or made policy-gated.

- [ ] **Step 3: Run repository validation**

```powershell
npm test
npm run lint
npm run build
```

Expected: all commands exit 0. The build must retain customer HTML routes, omit customer PDF routes/actions, and keep internal PDF readiness compiled.

- [ ] **Step 4: Sync and verify CodeGraph after source edits**

```powershell
codegraph sync
codegraph status
```

Expected: index is up to date with no stale or pending source files.

- [ ] **Step 5: Update project state without writing a change log**

Update the existing prospective-language bullet in `docs/PROJECT-STATE.md` to include:

- deterministic duplicate/dominant title-template findings;
- new-report-only compact source-title presentation;
- `geo_v1` terminology policy and GEO-only customer prose;
- historical report and source-original exceptions.

Update the matching item in `docs/TASKS.md` to completed and keep staging/browser acceptance separate from local automated verification.

- [ ] **Step 6: Check the final diff and working tree**

```powershell
git diff --check
git status --short
git log -6 --oneline
```

Expected: no whitespace errors; only the two intended documentation files remain uncommitted before the final documentation commit.

- [ ] **Step 7: Commit durable state**

```powershell
git add docs/PROJECT-STATE.md docs/TASKS.md
git commit -m "docs: record GEO title quality behavior"
```

- [ ] **Step 8: Final acceptance check**

Run:

```powershell
git status --short --branch
```

Expected: clean working tree. Report local automated evidence separately from protected-staging deployment/browser evidence; do not claim deployment or live acceptance unless those actions were actually performed.

---

## Expected Commit Sequence

1. `feat: analyze GEO page title patterns`
2. `feat: report repetitive titles as GEO findings`
3. `feat: enforce GEO report terminology`
4. `feat: present new GEO report title evidence`
5. `docs: record GEO title quality behavior`

## Execution Notes

- Before each task, verify `git status --short` and do not absorb unrelated user changes.
- After any source edit followed by CodeGraph impact analysis, run `codegraph sync` first or read the edited file directly.
- Do not change the persisted `seo` enum or historical parser contract merely to make source search results disappear.
- Do not test the new behavior by mutating a historical production report. Generate a new protected-staging report only after local review and deployment authorization.
