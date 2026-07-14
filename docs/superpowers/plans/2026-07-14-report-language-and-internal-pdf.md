# Report Language Consistency And Internal-Only PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly generated customer report use its immutable generation language consistently while keeping HTML-to-PDF as an internal readiness capability and removing PDF from customer delivery.

**Architecture:** Add one shared locale instruction and language-validation module in `@open-geo-console/ai-report-engine`, enforce it inside each model retry boundary, and run a prospective final language assertion in combined-artifact readiness before terminalization. Localize application-owned report labels deterministically, preserve source-original evidence, and delete only customer PDF routes/actions/copy while retaining `pdf-export.ts`, private PDF storage, hashes, and readiness checks.

**Tech Stack:** TypeScript, npm workspaces, Vitest, React server rendering, Next.js App Router, Playwright Chromium PDF export, PostgreSQL-backed Worker orchestration.

## Global Constraints

- Existing generated report payloads and active artifact revisions must not be regenerated, translated, rewritten, or replaced.
- A report's persisted generation locale remains immutable; route locale changes only interface chrome.
- Chinese customer prose uses Simplified Chinese except source-original text and unavoidable proper nouns, brands, products, URLs, code, email addresses, and identifiers; English follows the inverse rule.
- Verbatim evidence is never machine-translated or included in the prose-language gate.
- A language violation receives at most one corrective model attempt and cannot reach artifact activation or delivery.
- HTML remains the only customer artifact.
- `apps/web/src/report/pdf-export.ts`, private PDF storage, PDF hashes, page-count checks, and internal readiness materialization remain intact.
- Customer report UI, product copy, email, and artifact routes must expose no PDF or print-to-PDF action.
- Use npm workspaces; add no dependency.
- Preserve all unrelated dirty-worktree changes. Before each task, inspect `git diff -- <listed files>` and integrate rather than overwrite.
- The current worktree already contains uncommitted combined-question-answer and schema-v19 work. Before executing Task 1, run `git status --short` and `git diff -- <target files>`; do not stash, discard, or silently absorb another owner's partial change. If an existing change overlaps a task, finish or commit that prerequisite as its own reviewed unit before staging this plan's delta.

## File Structure

- Create `packages/ai-report-engine/src/report-language.ts`: normalized locale instructions, field descriptors, violation type, allowlist stripping, and language assertions.
- Create `packages/ai-report-engine/src/report-language.test.ts`: focused detector and exception tests.
- Modify `packages/ai-report-engine/src/analysis.ts`, `synthesis.ts`, and `combined-business-question-answers.ts`: apply the shared prompt and validate inside existing retry loops.
- Modify `packages/ai-report-engine/src/combined-geo-report.ts`: collect only customer-prose fields and export a prospective final assertion; do not call it from the historical parser.
- Modify `apps/web/src/report/combined-artifact-readiness.tsx`: invoke the final assertion for newly built artifacts and localize application-owned methodology strings.
- Modify customer artifact components and dictionaries: deterministic labels, source-original labeling, and no PDF/print claims.
- Delete only customer PDF-serving route files and the now-unused serving helper; retain internal export/readiness code.
- Update short project-state and decision documents after verification.

---

### Task 1: Shared Report-Language Contract

**Files:**
- Create: `packages/ai-report-engine/src/report-language.ts`
- Create: `packages/ai-report-engine/src/report-language.test.ts`
- Modify: `packages/ai-report-engine/src/index.ts`

**Interfaces:**
- Produces: `normalizeReportLanguage(locale: string): "en" | "zh"`
- Produces: `reportLanguageInstruction(locale: string): string`
- Produces: `assertReportLanguage(fields: readonly ReportLanguageField[], locale: string, allowedTerms?: readonly string[]): void`
- Produces: `ReportLanguageValidationError` with sanitized `violations: ReportLanguageViolation[]`

- [ ] **Step 1: Write failing detector tests**

```ts
import { describe, expect, it } from "vitest";
import {
  ReportLanguageValidationError,
  assertReportLanguage,
  normalizeReportLanguage,
  reportLanguageInstruction
} from "./report-language";

describe("report language contract", () => {
  it("normalizes only supported report languages", () => {
    expect(normalizeReportLanguage("zh-CN")).toBe("zh");
    expect(normalizeReportLanguage("en_US")).toBe("en");
    expect(() => normalizeReportLanguage("fr")).toThrow(/unsupported report locale/i);
  });

  it("gives the model an explicit non-bilingual Chinese instruction", () => {
    expect(reportLanguageInstruction("zh-CN")).toContain("Simplified Chinese");
    expect(reportLanguageInstruction("zh-CN")).toContain("Do not repeat the prose in English");
  });

  it("rejects sentence-scale English leakage in Chinese prose", () => {
    expect(() => assertReportLanguage([
      { path: "executiveSummary.overview", text: "这是结论。The customer should update all public materials immediately." }
    ], "zh-CN")).toThrow(ReportLanguageValidationError);
  });

  it("allows brands, URLs, code, and source-original fields", () => {
    expect(() => assertReportLanguage([
      { path: "finding.title", text: "为 Open GEO Console 增加 JSON-LD" },
      { path: "finding.url", text: "https://example.com/docs/getting-started" },
      { path: "evidence.quote", text: "This exact source passage remains verbatim.", kind: "source_original" }
    ], "zh", ["Open GEO Console", "JSON-LD"])).not.toThrow();
  });

  it("rejects Chinese narrative in an English report but allows an official name", () => {
    expect(() => assertReportLanguage([{ path: "overview", text: "客户应当立即更新网站内容。" }], "en"))
      .toThrow(ReportLanguageValidationError);
    expect(() => assertReportLanguage([{ path: "organization", text: "Report for 小米集团" }], "en", ["小米集团"]))
      .not.toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `npx vitest run packages/ai-report-engine/src/report-language.test.ts`

Expected: FAIL because `./report-language` does not exist.

- [ ] **Step 3: Implement the shared locale and validation module**

```ts
export type NormalizedReportLanguage = "en" | "zh";
export type ReportLanguageFieldKind = "prose" | "source_original" | "identifier";

export interface ReportLanguageField {
  path: string;
  text: string;
  kind?: ReportLanguageFieldKind;
}

export interface ReportLanguageViolation {
  path: string;
  reason: "unexpected_english_sentence" | "unexpected_chinese_prose";
}

export class ReportLanguageValidationError extends TypeError {
  constructor(readonly violations: ReportLanguageViolation[]) {
    super(`Report language validation failed at ${violations.map(({ path }) => path).join(", ")}.`);
    this.name = "ReportLanguageValidationError";
  }
}

export function normalizeReportLanguage(locale: string): NormalizedReportLanguage {
  const language = locale.trim().toLowerCase().split(/[-_]/, 1)[0];
  if (language === "en" || language === "zh") return language;
  throw new TypeError(`Unsupported report locale: ${locale}.`);
}

export function reportLanguageInstruction(locale: string): string {
  return normalizeReportLanguage(locale) === "zh"
    ? "Write all report prose in Simplified Chinese. Keep only unavoidable official names, brands, product names, URLs, code, email addresses, and identifiers in their original form. Preserve verbatim evidence in its source language. Do not repeat the prose in English."
    : "Write all report prose in English. Keep only unavoidable official names and verbatim evidence in their source language. Do not repeat the prose in Chinese.";
}

export function assertReportLanguage(
  fields: readonly ReportLanguageField[],
  locale: string,
  allowedTerms: readonly string[] = []
): void {
  const language = normalizeReportLanguage(locale);
  const violations = fields.flatMap((field): ReportLanguageViolation[] => {
    if ((field.kind ?? "prose") !== "prose") return [];
    const candidate = sanitize(field.text, allowedTerms);
    if (language === "zh" && /(?:\b[A-Za-z][A-Za-z'’-]*\b[\s,;:—–-]+){4,}\b[A-Za-z][A-Za-z'’-]*\b/.test(candidate)) {
      return [{ path: field.path, reason: "unexpected_english_sentence" }];
    }
    if (language === "en" && /[\u3400-\u9fff]{2,}/u.test(candidate)) {
      return [{ path: field.path, reason: "unexpected_chinese_prose" }];
    }
    return [];
  });
  if (violations.length) throw new ReportLanguageValidationError(violations);
}

function sanitize(value: string, allowedTerms: readonly string[]): string {
  let result = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, " ")
    .replace(/`[^`]*`/g, " ");
  for (const term of [...allowedTerms].sort((a, b) => b.length - a.length)) {
    if (term.trim()) result = result.split(term).join(" ");
  }
  return result;
}
```

Export the module from `packages/ai-report-engine/src/index.ts`:

```ts
export * from "./report-language";
```

- [ ] **Step 4: Run the focused test and package build**

Run: `npx vitest run packages/ai-report-engine/src/report-language.test.ts && npm run build --workspace packages/ai-report-engine`

Expected: PASS; TypeScript emits no errors.

- [ ] **Step 5: Commit the isolated contract**

```powershell
git add -- packages/ai-report-engine/src/report-language.ts packages/ai-report-engine/src/report-language.test.ts packages/ai-report-engine/src/index.ts
git commit -m "feat: add report language contract"
```

---

### Task 2: Locale-Bound Model Prompts And Bounded Correction

**Files:**
- Modify: `packages/ai-report-engine/src/analysis.ts`
- Modify: `packages/ai-report-engine/src/synthesis.ts`
- Modify: `packages/ai-report-engine/src/combined-business-question-answers.ts`
- Modify: `packages/ai-report-engine/src/index.test.ts`
- Modify: `packages/ai-report-engine/src/combined-business-question-answers.test.ts`

**Interfaces:**
- Consumes: `reportLanguageInstruction`, `assertReportLanguage`, `ReportLanguageValidationError`
- Produces: page analysis, website synthesis, and combined answers that retry a language violation once and then fail closed

- [ ] **Step 1: Add failing prompt and retry tests**

In `combined-business-question-answers.test.ts`, add a test whose first completion returns an English sentence for `zh-CN` and whose second completion returns Chinese. Assert two calls, a Chinese language instruction in both requests, and a Chinese final answer.

```ts
it("corrects Chinese answer language once and then fails closed", async () => {
  const { questionSet, forensic, value } = fixture("zh-CN");
  const english = value.answers.map((item) => ({ ...item, answer: "The customer should update all public materials from the verified evidence." }));
  const chinese = value.answers.map((item, index) => ({ ...item, answer: `客户应依据已核验证据更新第 ${index + 1} 项公开材料。` }));
  const completeJson = vi.fn()
    .mockResolvedValueOnce({ value: { answers: english }, modelId: "served", rawContent: "{}" })
    .mockResolvedValueOnce({ value: { answers: chinese }, modelId: "served", rawContent: "{}" });
  const result = await synthesizeCombinedBusinessQuestionAnswers(
    { configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 3, delay: async () => {} }
  );
  expect(result.answers[0].answer).toContain("客户应依据");
  expect(completeJson).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(completeJson.mock.calls[0]?.[0])).toContain("Simplified Chinese");
});

it("does not make a third model call after a repeated language violation", async () => {
  const { questionSet, forensic, value } = fixture("zh-CN");
  const invalid = value.answers.map((item) => ({ ...item, answer: "The customer should update all public materials from the verified evidence." }));
  const completeJson = vi.fn(async () => ({ value: { answers: invalid }, modelId: "served", rawContent: "{}" }));
  await expect(synthesizeCombinedBusinessQuestionAnswers(
    { configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 3, delay: async () => {} }
  )).rejects.toThrow(ReportLanguageValidationError);
  expect(completeJson).toHaveBeenCalledTimes(2);
});

```

Change the existing fixture signature to `function fixture(locale = "en")`, assign `locale` to both `questionSet.locale` and `forensic.locale`, and keep all other evidence identities unchanged.

In `index.test.ts`, capture requests for `analyzePageBatch` and `synthesizeWebsiteReportWithRecovery`. Assert explicit locale instructions and that source evidence quotes are not rejected solely for being in the source language.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npx vitest run packages/ai-report-engine/src/index.test.ts packages/ai-report-engine/src/combined-business-question-answers.test.ts`

Expected: FAIL because prompts are generic and generated prose is not language-validated.

- [ ] **Step 3: Apply the shared instruction and field-level validation inside retry boundaries**

For every model request, append `reportLanguageInstruction(input.locale)` to the system message and include it as the first user rule. Validate only generated narrative fields, never evidence quotes or URLs.

Use helpers local to each module to keep field selection explicit. For combined answers:

```ts
function assertAnswerLanguage(answers: CombinedBusinessQuestionAnswer[], locale: string): void {
  assertReportLanguage(
    answers.map((answer, index) => ({ path: `answers[${index}].answer`, text: answer.answer })),
    locale
  );
}
```

Call it immediately after `parseCombinedBusinessQuestionAnswers(...)` and before returning. Track language correction separately from ordinary transient attempts:

```ts
let languageCorrectionUsed = false;
let languageFeedback: string[] = [];
// inside catch
if (error instanceof ReportLanguageValidationError) {
  if (languageCorrectionUsed) throw error;
  languageCorrectionUsed = true;
  languageFeedback = error.violations.map(({ path, reason }) => `${path}: ${reason}`);
}
```

Include `languageFeedback` in the next user JSON under `correctionRequired`. Do not expose report content or evidence excerpts in the feedback.

For page analysis, collect `summary`, `organizationSignals`, `strengths`, finding `title`, `impact`, `recommendation`, and `rewriteExample`. For website synthesis, collect organization explanation fields, executive summary, dimension explanations, page-type narrative arrays, finding narrative fields, roadmap narrative, sampling method, and limitations. Exclude `EvidenceCitation.quote`, URLs, IDs, enum values, organization/brand/product names, and provenance.

Use organization names, brand names, product/service names, and legal entity values as `allowedTerms` when asserting the final website report.

- [ ] **Step 4: Run focused tests and the AI package build**

Run: `npx vitest run packages/ai-report-engine/src/report-language.test.ts packages/ai-report-engine/src/index.test.ts packages/ai-report-engine/src/combined-business-question-answers.test.ts && npm run build --workspace packages/ai-report-engine`

Expected: PASS; a repeated language violation makes exactly two model calls and throws the typed error.

- [ ] **Step 5: Commit model-language enforcement**

```powershell
git add -- packages/ai-report-engine/src/analysis.ts packages/ai-report-engine/src/synthesis.ts packages/ai-report-engine/src/combined-business-question-answers.ts packages/ai-report-engine/src/index.test.ts packages/ai-report-engine/src/combined-business-question-answers.test.ts
git commit -m "feat: enforce report locale in model output"
```

---

### Task 3: Prospective Final Language Gate And Localized HTML

**Files:**
- Modify: `packages/ai-report-engine/src/combined-geo-report.ts`
- Create: `packages/ai-report-engine/src/combined-geo-report.test.ts`
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: `apps/web/src/report/combined-artifact-readiness.test.tsx`
- Modify: `apps/web/src/worker/job-errors.ts`
- Modify: `apps/web/src/worker/job-errors.test.ts`
- Modify: `apps/web/src/components/combined-geo-report-artifact.tsx`
- Modify: `apps/web/src/components/combined-geo-report-artifact.test.tsx`
- Modify: `apps/web/src/public-source-forensics/report-builder.test.ts`

**Interfaces:**
- Produces: `assertCombinedGeoReportLanguage(report: CombinedGeoReportV1): void`
- Consumes: the assertion only from new artifact readiness; historical `parseCombinedGeoReportV1` remains permissive
- Preserves: `buildReadyCombinedArtifact` still returns internal `pdf`, `pdfSha256`, `pdfStorageKey`, and `pageCount`
- Produces: exhausted language correction is classified as `operator_repairable` with code `report_language_validation_failed`, so it enters `repair_wait` instead of repeatedly regenerating or terminalizing

- [ ] **Step 1: Write failing prospective-gate tests**

Add a combined-report unit test for the prospective assertion. Keep `parseCombinedGeoReportV1` unchanged and do not call the new assertion from it; the existing parser contract remains the historical compatibility boundary.

```ts
it("rejects mixed prose when the prospective activation gate is called", () => {
  const report = languageGateFixture("zh-CN");
  report.businessQuestionAnswers!.answers[0].answer = "The customer should update every public page immediately.";
  expect(() => assertCombinedGeoReportLanguage(report)).toThrow(ReportLanguageValidationError);
});

function languageGateFixture(locale: string): CombinedGeoReportV1 {
  return {
    locale,
    technicalFoundation: {
      aiReport: {
        organizationProfile: { summary: "客户概况。", identityConsistency: "身份一致。", organizationName: "示例公司", brandNames: [], productsAndServices: [], legalEntity: null },
        executiveSummary: { overview: "中文概述。", strengths: [], keyRisks: [], topPriorities: [] },
        dimensionScores: [], pageTypeAnalyses: [], findings: [],
        roadmap: { immediate: [], nextPhase: [], ongoing: [] },
        coverage: { samplingMethod: "确定性抽样。", limitations: [] }
      }
    },
    businessQuestionSet: { questions: [{ privateText: "业务问题一。" }, { privateText: "业务问题二。" }, { privateText: "业务问题三。" }] },
    businessQuestionAnswers: { answers: [
      { answer: "基于证据的回答一。" }, { answer: "基于证据的回答二。" }, { answer: "基于证据的回答三。" }
    ] },
    publicSourceForensics: { customerComparison: [], executiveVerdict: { title: "结论", text: "中文结论。" }, executivePriorities: [] },
    vendorTaskPackage: { tasks: [] }, methodology: { limitations: [] }
  } as unknown as CombinedGeoReportV1;
}
```

In the artifact test, assert Chinese enum labels (`严重`, `机会`, localized page types as applicable), a visible `来源原文` label around foreign-language evidence, and absence of raw customer-facing `critical`, `opportunity`, `core_service_discovery`, and snake-case values.

- [ ] **Step 2: Run focused tests and verify failures**

Run: `npx vitest run packages/ai-report-engine/src/combined-geo-report.test.ts apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/public-source-forensics/report-builder.test.ts`

Expected: FAIL because there is no final prospective assertion and raw values still render.

- [ ] **Step 3: Implement the combined field collector without changing historical parsing**

Add `assertCombinedGeoReportLanguage(report)` after the parser in `combined-geo-report.ts`. Collect:

```ts
const fields: ReportLanguageField[] = [
  ...aiReportFields(report.technicalFoundation.aiReport),
  ...report.businessQuestionSet.questions.map((item, index) => ({ path: `businessQuestionSet.questions[${index}].privateText`, text: item.privateText })),
  ...report.businessQuestionAnswers!.answers.map((item, index) => ({ path: `businessQuestionAnswers.answers[${index}].answer`, text: item.answer })),
  ...report.publicSourceForensics.customerComparison.flatMap(sectionFields("publicSourceForensics.customerComparison")),
  ...sectionFields("publicSourceForensics.executiveVerdict")(report.publicSourceForensics.executiveVerdict, 0),
  ...report.publicSourceForensics.executivePriorities.flatMap(sectionFields("publicSourceForensics.executivePriorities")),
  ...report.vendorTaskPackage.tasks.flatMap((task, index) => [
    { path: `vendorTaskPackage.tasks[${index}].title`, text: task.title },
    { path: `vendorTaskPackage.tasks[${index}].text`, text: task.text },
    ...task.actions.map((text, action) => ({ path: `vendorTaskPackage.tasks[${index}].actions[${action}]`, text })),
    ...task.acceptanceCriteria.map((text, criterion) => ({ path: `vendorTaskPackage.tasks[${index}].acceptanceCriteria[${criterion}]`, text }))
  ]),
  ...report.methodology.limitations.map((text, index) => ({ path: `methodology.limitations[${index}]`, text }))
];
```

Define the referenced collectors in the same module so their contracts cannot drift:

```ts
function sectionFields(prefix: string) {
  return (section: { title: string; text: string }, index: number): ReportLanguageField[] => [
    { path: `${prefix}[${index}].title`, text: section.title },
    { path: `${prefix}[${index}].text`, text: section.text }
  ];
}

function aiReportFields(report: AiWebsiteReportV1): ReportLanguageField[] {
  const roadmap = [...report.roadmap.immediate, ...report.roadmap.nextPhase, ...report.roadmap.ongoing];
  return [
    { path: "technicalFoundation.aiReport.organizationProfile.summary", text: report.organizationProfile.summary },
    { path: "technicalFoundation.aiReport.organizationProfile.identityConsistency", text: report.organizationProfile.identityConsistency },
    { path: "technicalFoundation.aiReport.executiveSummary.overview", text: report.executiveSummary.overview },
    ...[...report.executiveSummary.strengths, ...report.executiveSummary.keyRisks, ...report.executiveSummary.topPriorities]
      .map((text, index) => ({ path: `technicalFoundation.aiReport.executiveSummary.items[${index}]`, text })),
    ...report.dimensionScores.map((item, index) => ({ path: `technicalFoundation.aiReport.dimensionScores[${index}].explanation`, text: item.explanation })),
    ...report.pageTypeAnalyses.flatMap((item, index) => [...item.strengths, ...item.commonIssues, ...item.recommendations]
      .map((text, itemIndex) => ({ path: `technicalFoundation.aiReport.pageTypeAnalyses[${index}].items[${itemIndex}]`, text }))),
    ...report.findings.flatMap((item, index) => [item.title, item.impact, item.recommendation, ...(item.rewriteExample ? [item.rewriteExample] : [])]
      .map((text, itemIndex) => ({ path: `technicalFoundation.aiReport.findings[${index}].prose[${itemIndex}]`, text }))),
    ...roadmap.flatMap((item, index) => [item.title, item.rationale, ...item.actions]
      .map((text, itemIndex) => ({ path: `technicalFoundation.aiReport.roadmap[${index}].prose[${itemIndex}]`, text }))),
    { path: "technicalFoundation.aiReport.coverage.samplingMethod", text: report.coverage.samplingMethod },
    ...report.coverage.limitations.map((text, index) => ({ path: `technicalFoundation.aiReport.coverage.limitations[${index}]`, text }))
  ];
}

function collectProperTerms(report: CombinedGeoReportV1): string[] {
  const profile = report.technicalFoundation.aiReport.organizationProfile;
  return [
    profile.organizationName,
    profile.legalEntity,
    ...profile.brandNames,
    ...profile.productsAndServices
  ].filter((value): value is string => Boolean(value?.trim()));
}
```

Exclude public-source `verifiedExcerpt`, source titles, URLs, domains, IDs, enum values, and hashes. Call `assertReportLanguage(fields, report.locale, collectProperTerms(report))`.

Invoke this function in `buildReadyCombinedArtifact` immediately after `requireReadyCombinedGeoReport(...)` and before HTML rendering or PDF materialization. Do not invoke it in `parseCombinedGeoReportV1`, artifact-model loading, or historical routes.

In `job-errors.ts`, recognize the exhausted typed gate before generic classification:

```ts
const languageFailure = source.name === "ReportLanguageValidationError";
const classification = languageFailure ? "operator_repairable" : known?.classification ?? classifyUnknown(source);
const code = languageFailure ? "report_language_validation_failed" : known?.code ?? "unexpected_internal_error";
```

Add a `job-errors.test.ts` case asserting `normalizeJobError(new ReportLanguageValidationError([...]), context)` returns that code, `operator_repairable`, and `retryableAt: null`. This prevents automatic phase retry from making more model correction attempts.

- [ ] **Step 4: Localize application-owned values and source-original labeling**

Replace raw enum output in `CombinedGeoReportArtifact` with typed locale maps, for example:

```ts
const copy = zh ? {
  sourceOriginal: "来源原文",
  severities: { critical: "严重", warning: "警告", opportunity: "机会" },
  purposes: {
    core_service_discovery: "核心服务发现",
    customer_region_fit: "客户与区域匹配",
    purchase_delivery_risk: "采购与交付风险"
  }
} : {
  sourceOriginal: "Source original",
  severities: { critical: "Critical", warning: "Warning", opportunity: "Opportunity" },
  purposes: {
    core_service_discovery: "Core service discovery",
    customer_region_fit: "Customer and region fit",
    purchase_delivery_risk: "Purchase and delivery risk"
  }
} as const;
```

Label preserved quotes with `<span>{copy.sourceOriginal}</span>` and `lang` inferred from the report language only when the source language is unknown; do not translate the quote.

Localize the application-owned readiness methodology strings in `combined-artifact-readiness.tsx`:

```ts
const zh = forensic.locale.toLowerCase().startsWith("zh");
technicalCoverage: zh
  ? `${input.technicalReport.pages.length} 个技术页面；AI 已分析 ${input.aiReport.coverage.analyzedPages}/${input.aiReport.coverage.plannedPages} 个页面`
  : `${input.technicalReport.pages.length} technical pages; ${input.aiReport.coverage.analyzedPages}/${input.aiReport.coverage.plannedPages} AI-analyzed pages`,
evidenceFreshness: zh
  ? `${forensic.customerCostDisclosure.freshness === "fresh" ? "新鲜" : "混合时效"}；证据截止 ${forensic.evidenceCutoffAt}`
  : `${forensic.customerCostDisclosure.freshness}; cutoff ${forensic.evidenceCutoffAt}`
```

- [ ] **Step 5: Run focused report tests and builds**

Run: `npx vitest run packages/ai-report-engine/src/combined-geo-report.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/public-source-forensics/report-builder.test.ts && npm run build --workspace packages/ai-report-engine && npm run build --workspace apps/web`

Expected: PASS; internal PDF readiness still runs, and `parseCombinedGeoReportV1` remains unchanged and independent from the prospective activation assertion.

- [ ] **Step 6: Commit the final language gate and HTML localization**

```powershell
git add -- packages/ai-report-engine/src/combined-geo-report.ts packages/ai-report-engine/src/combined-geo-report.test.ts apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/report/combined-artifact-readiness.test.tsx apps/web/src/worker/job-errors.ts apps/web/src/worker/job-errors.test.ts apps/web/src/components/combined-geo-report-artifact.tsx apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/public-source-forensics/report-builder.test.ts
git commit -m "feat: gate new reports on locale consistency"
```

---

### Task 4: Remove PDF From Customer Delivery

**Files:**
- Modify: `apps/web/src/components/report-actions.tsx`
- Modify: `apps/web/src/components/pending-report-view.tsx`
- Modify: `apps/web/src/components/report-view.tsx`
- Modify: `apps/web/src/components/report-artifact.tsx`
- Modify: `apps/web/src/components/report-artifact.test.tsx`
- Modify: `apps/web/src/components/recommendation-report-artifact.tsx`
- Modify: `apps/web/src/components/recommendation-report-artifact.test.tsx`
- Modify: `apps/web/src/components/public-source-forensics-report-artifact.tsx`
- Modify: `apps/web/src/components/public-source-forensics-report-artifact.test.tsx`
- Modify: `apps/web/src/components/combined-geo-report-artifact.tsx`
- Modify: `apps/web/src/components/combined-geo-report-artifact.test.tsx`
- Delete: `apps/web/src/components/print-toolbar.tsx`
- Delete: `apps/web/src/components/report-print-view.tsx`
- Modify: `apps/web/src/app/[locale]/reports/[id]/[section]/page.tsx`
- Modify: `apps/web/src/product/config.ts`
- Modify: `apps/web/src/i18n/types.ts`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/zh.ts`
- Modify: `apps/web/src/email/templates.ts`
- Modify: `apps/web/src/email/resend.test.ts`
- Delete: `apps/web/src/report/pdf-artifact-route.ts`
- Delete: `apps/web/src/report/pdf-artifact-route.test.ts`
- Delete: `apps/web/src/app/api/reports/[id]/artifacts/report.pdf/route.ts`
- Delete: `apps/web/src/app/api/reports/[id]/artifacts/legacy-report.pdf/route.ts`
- Delete: `apps/web/src/app/api/reports/[id]/artifacts/recommendation-report.pdf/route.ts`
- Modify: `apps/web/src/report/pdf-export.test.ts`

**Interfaces:**
- Changes: `ReportActions` accepts `{ dictionary, htmlHref, htmlEnabled, shareHref }`; there is no `pdfHref` or print-disabled upsell
- Preserves: `exportCanonicalArtifactHtmlPdf(html: string): Promise<Buffer>` and every Worker readiness caller

- [ ] **Step 1: Change customer tests to assert absence**

Update all artifact component tests from `toContain(...pdf)` to:

```ts
expect(html).toContain(`/reports/${reportId}/report.html`);
expect(html).not.toMatch(/\.pdf\b|>PDF</i);
```

In `resend.test.ts`, assert both HTML and text for `report_ready` and `corrected_report_ready` do not match `/PDF|\.pdf/i` and still contain the secure HTML link. Task 5's exact `rg` audit and protected-staging requests prove the deleted App Router handlers are absent/404.

- [ ] **Step 2: Run customer-surface tests and verify failures**

Run: `npx vitest run apps/web/src/components/report-artifact.test.tsx apps/web/src/components/recommendation-report-artifact.test.tsx apps/web/src/components/public-source-forensics-report-artifact.test.tsx apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/email/resend.test.ts apps/web/src/report/pdf-export.test.ts`

Expected: FAIL because customer buttons and email copy still mention PDF.

- [ ] **Step 3: Remove PDF and print actions from React and product copy**

Make `ReportActions` render only copy-link plus the canonical HTML link when available:

```tsx
export function ReportActions({ dictionary, htmlHref, htmlEnabled, shareHref }: {
  dictionary: Dictionary;
  htmlHref: string;
  htmlEnabled: boolean;
  shareHref: string;
}) {
  // preserve copyLink state and handler
  return <div className="flex flex-wrap gap-2 print:hidden">
    <button type="button" onClick={copyLink} className="button-secondary">
      <Share2 aria-hidden="true" className="size-4" />
      {copied ? dictionary.actions.copiedLink : dictionary.actions.copyLink}
    </button>
    {htmlEnabled ? <Link href={htmlHref} className="button-secondary">
      <FileText aria-hidden="true" className="size-4" />HTML
    </Link> : null}
  </div>;
}
```

Remove `print` from `ReportWorkspaceSection` and the dynamic route's allowed sections. Delete `PrintToolbar` and `ReportPrintView`. Remove `printReport`, `printLockedTitle`, and `printLockedDescription` from dictionary types and both locale dictionaries. Change `shareDescription` to HTML-link-only wording. Remove the `printReport` action from `product/config.ts`.

Remove PDF anchors and copy keys from all four artifact components. A canonical artifact may retain an HTML self-link or omit the format nav entirely; it must not render PDF text or a `.pdf` URL.

- [ ] **Step 4: Delete customer PDF routes without touching internal export**

Delete the three App Router PDF route files and `pdf-artifact-route.ts` plus its test after `rg` confirms no remaining imports. Keep `pdf-export.ts`, `combined-artifact-readiness.tsx`, `public-source-forensics/artifact-readiness.tsx`, database PDF fields, storage keys, hashes, and readiness tests.

Update `pdf-export.test.ts` so controlled inputs contain only HTML artifact paths and continue rejecting `.pdf` paths:

```ts
expect(isControlledReportArtifactUrl("/reports/report-1/report.html")).toBe(true);
expect(isControlledReportArtifactUrl("/api/reports/report-1/artifacts/report.pdf")).toBe(false);
```

- [ ] **Step 5: Remove PDF claims from email while retaining the secure HTML link**

Change `corrected_report_ready` copy to:

```ts
body: zh
  ? "三个业务问题、公开来源证据和完整技术分析已通过验证。请使用下面的安全链接打开新的合并 HTML 报告。"
  : "The three business questions, public-source evidence, and complete technical analysis passed verification. Open the new combined HTML report using the secure link below."
```

Do not add attachments or storage keys to the email gateway.

- [ ] **Step 6: Run surface tests and prove internal PDF survives**

Run: `npx vitest run apps/web/src/components/report-artifact.test.tsx apps/web/src/components/recommendation-report-artifact.test.tsx apps/web/src/components/public-source-forensics-report-artifact.test.tsx apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/email/resend.test.ts apps/web/src/report/pdf-export.test.ts apps/web/src/public-source-forensics/artifact-readiness.test.tsx apps/web/src/report/combined-artifact-readiness.test.tsx`

Expected: PASS; customer HTML/email contain no PDF, while both internal readiness suites still materialize a `%PDF-` artifact.

- [ ] **Step 7: Commit the customer-delivery change**

```powershell
git add -A -- apps/web/src/components apps/web/src/app/[locale]/reports apps/web/src/app/api/reports apps/web/src/product/config.ts apps/web/src/i18n apps/web/src/email apps/web/src/report/pdf-artifact-route.ts apps/web/src/report/pdf-artifact-route.test.ts apps/web/src/report/pdf-export.test.ts
git commit -m "feat: make HTML the only customer report"
```

---

### Task 5: Full Verification And Scoped Project-State Sync

**Files:**
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/AI-REPORT-ENGINE.md`
- Modify: `docs/REPORT-WORKSPACE.md`

**Interfaces:**
- Documents: prospective language gate, one correction attempt, source-original exception, HTML-only customer delivery, and internal PDF readiness
- Does not document historical reports as migrated

- [ ] **Step 1: Run the complete deterministic acceptance suite**

Run:

```powershell
npm test
npm run lint
npm run build
npm run db:audit
```

Expected: all commands exit `0`. `db:audit` reports no terminal commercial job with a reserved credit.

- [ ] **Step 2: Run static customer-PDF and language-contract audits**

Run:

```powershell
rg -n "report\.pdf|recommendation-report\.pdf|legacy-report\.pdf|Print / PDF|打印 / PDF|same-source PDF|同源 PDF" apps/web/src
rg -n "exportCanonicalArtifactHtmlPdf|pdfSha256|pdfStorageKey|pageCount" apps/web/src/report apps/web/src/worker apps/web/src/db
```

Expected: the first command has no customer UI, email, product-copy, or App Router route hits; internal test fixtures/database names may remain only when explicitly justified. The second command proves internal generation, hashing, storage, and readiness remain wired.

- [ ] **Step 3: Perform manual new-report acceptance without changing historical artifacts**

On protected staging, create one new Chinese fixture/report and one new English fixture/report using the normal sanctioned admission path. For each:

1. Read every HTML section and confirm report narrative stays in the persisted locale.
2. Confirm foreign evidence is labeled `来源原文` / `Source original` and remains verbatim.
3. Confirm the completion email links only to HTML.
4. Confirm former customer `.pdf` endpoints return application-level `404`.
5. Query only the two new artifact rows and confirm internal `pdf_sha256`, `pdf_storage_key`, and readiness page count remain populated.
6. Do not enqueue correction jobs or update active revisions for any pre-deployment report.

Expected: both new reports pass; historical report IDs and active artifact revisions are unchanged.

- [ ] **Step 4: Run a scoped neat sync**

Update existing entries rather than appending a chat log:

- `PROJECT-STATE.md`: HTML-only customer delivery, internal PDF readiness, prospective locale gate, verification commands, and current rollout state.
- `TASKS.md`: mark implementation/acceptance accurately; leave manual staging acceptance open if not run.
- `DECISIONS.md`: supersede the 2026-07-11 customer-PDF portion while preserving HTML-first and same-HTML internal rendering.
- `AI-REPORT-ENGINE.md`: explicit prompt/validation contract and typed recoverable language failure.
- `REPORT-WORKSPACE.md`: remove print/PDF customer routes and describe the canonical HTML link.

- [ ] **Step 5: Re-run documentation-sensitive checks and inspect the final diff**

Run:

```powershell
npm run lint
npm run build
git diff --check
git status --short --branch
```

Expected: commands pass; only intended implementation/docs changes remain.

- [ ] **Step 6: Commit the verified rollout state**

```powershell
git add -- docs/PROJECT-STATE.md docs/TASKS.md docs/DECISIONS.md docs/AI-REPORT-ENGINE.md docs/REPORT-WORKSPACE.md
git commit -m "docs: record HTML-only locale-safe reports"
```

- [ ] **Step 7: Sync CodeGraph after all source changes**

Run: `codegraph sync && codegraph status`

Expected: `[OK] Index is up to date` and the index includes the new `report-language.ts` module.
