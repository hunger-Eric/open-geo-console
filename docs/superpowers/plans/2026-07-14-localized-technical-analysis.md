# Localized Technical Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Localize deterministic technical-analysis prose in every newly materialized combined report without changing historical report revisions or making `geo-auditor` locale-aware.

**Architecture:** Add a presentation-layer projection that converts `GeoAuditReport` findings and asset summaries through the existing locale dictionaries. `buildReadyCombinedArtifact` stores that projection only in the new combined revision, then the prospective language gate validates it before HTML and private PDF readiness. Historical parsing and rendering remain read-only.

**Tech Stack:** TypeScript, React server rendering, Vitest, npm workspaces, existing `geo-auditor` message keys, existing `apps/web` i18n dictionaries.

## Global Constraints

- Existing report payloads, active revisions, historical HTML, and stored internal PDF bytes must remain unchanged.
- Localization must not call a model and must not add a locale parameter to `geo-auditor`.
- URLs, captured page titles/H1 values, and stable technical identifiers remain source-original.
- Customer delivery remains HTML-only; internal HTML-to-PDF readiness remains private and required.
- A new-artifact language failure remains operator-repairable and must prevent revision activation.

---

### Task 1: Build the deterministic technical-report projection

**Files:**
- Create: `apps/web/src/report/technical-report-localization.ts`
- Create: `apps/web/src/report/technical-report-localization.test.ts`
- Reuse: `apps/web/src/report/presenter.ts`
- Reuse: `apps/web/src/i18n/index.ts`

**Interfaces:**
- Consumes: `GeoAuditReport`, a persisted locale string, `localizeFinding`, `localizedAssetSummary`, and the existing dictionaries.
- Produces: `localizeTechnicalReportForArtifact(report: GeoAuditReport, locale: string): GeoAuditReport`.

- [ ] **Step 1: Write failing projection tests**

```ts
import { describe, expect, it } from "vitest";
import { createFinding, type GeoAuditReport } from "@open-geo-console/geo-auditor";
import { localizeTechnicalReportForArtifact } from "./technical-report-localization";

describe("localizeTechnicalReportForArtifact", () => {
  it("projects deterministic finding prose and asset summaries into Chinese", () => {
    const source = fixture();
    const localized = localizeTechnicalReportForArtifact(source, "zh-CN");
    expect(localized.findings[0]).toMatchObject({
      title: "H1 结构需要调整",
      description: "预期只有一个 H1，实际发现 0 个。"
    });
    expect(localized.machineReadableAssets.robotsTxt.summary).toBe("robots.txt 可访问。");
    expect(source.findings[0]!.title).toBe("H1 structure needs attention");
  });

  it("keeps the English projection in English", () => {
    const localized = localizeTechnicalReportForArtifact(fixture(), "en");
    expect(localized.findings[0]!.title).toBe("H1 structure needs attention");
    expect(localized.machineReadableAssets.robotsTxt.summary).toBe("robots.txt is available.");
  });
});

function fixture(): GeoAuditReport {
  return {
    url: "https://example.com/",
    scannedAt: "2030-01-01T00:00:00.000Z",
    score: 80,
    pages: [],
    findings: [createFinding({ id: "page.h1Structure", messageKey: "page.h1Structure", params: { h1Count: 0 }, url: "https://example.com/" })],
    recommendations: [],
    machineReadableAssets: {
      robotsTxt: { url: "https://example.com/robots.txt", present: true, summary: "Available" },
      sitemapXml: { url: "https://example.com/sitemap.xml", present: false, summary: "Missing" },
      llmsTxt: { url: "https://example.com/llms.txt", present: false, summary: "Missing" }
    }
  };
}
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npx vitest run apps/web/src/report/technical-report-localization.test.ts`

Expected: FAIL because `technical-report-localization.ts` does not exist.

- [ ] **Step 3: Implement the immutable projection**

```ts
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { getDictionary, type Locale } from "@/i18n";
import { localizeFinding, localizedAssetSummary } from "./presenter";

export function localizeTechnicalReportForArtifact(report: GeoAuditReport, locale: string): GeoAuditReport {
  const normalizedLocale: Locale = locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  const dictionary = getDictionary(normalizedLocale);
  const machineReadableAssets = Object.fromEntries(
    (Object.entries(report.machineReadableAssets) as Array<[
      keyof GeoAuditReport["machineReadableAssets"],
      GeoAuditReport["machineReadableAssets"][keyof GeoAuditReport["machineReadableAssets"]]
    ]>).map(([key, asset]) => [key, {
      ...asset,
      summary: localizedAssetSummary(key, asset.present, dictionary)
    }])
  ) as GeoAuditReport["machineReadableAssets"];

  return {
    ...report,
    findings: report.findings.map((finding) => {
      const localized = localizeFinding(finding, dictionary);
      return {
        ...finding,
        title: localized.localizedTitle,
        description: localized.localizedDescription,
        recommendation: localized.localizedRecommendation
      };
    }),
    recommendations: [...new Set(report.findings.map((finding) =>
      localizeFinding(finding, dictionary).localizedRecommendation))],
    machineReadableAssets
  };
}
```

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run apps/web/src/report/technical-report-localization.test.ts`

Expected: PASS, including the assertion that the source report remains English.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- apps/web/src/report/technical-report-localization.ts apps/web/src/report/technical-report-localization.test.ts
git commit -m "feat: localize technical report projections"
```

---

### Task 2: Store and validate the localized projection in new revisions

**Files:**
- Modify: `apps/web/src/report/combined-artifact-readiness.tsx`
- Modify: `apps/web/src/report/combined-artifact-readiness.test.tsx`
- Modify: `packages/ai-report-engine/src/combined-geo-report.ts`
- Modify: `packages/ai-report-engine/src/combined-geo-report.test.ts`

**Interfaces:**
- Consumes: `localizeTechnicalReportForArtifact(report, locale)` from Task 1.
- Produces: a new combined payload whose `technicalFoundation.technicalReport` contains locale-matching deterministic prose; extends `assertCombinedGeoReportLanguage` coverage.

- [ ] **Step 1: Add failing final-gate tests**

```ts
it("rejects untranslated deterministic technical prose", () => {
  const report = fixture("zh-CN");
  report.technicalFoundation.technicalReport.findings = [{
    id: "page.h1Structure",
    severity: "warning",
    title: "H1 structure needs attention",
    description: "Expected one H1, found 0.",
    recommendation: "Use one descriptive H1 per page."
  }];
  expect(() => assertCombinedGeoReportLanguage(report)).toThrow(ReportLanguageValidationError);
});

it("still validates projected technical prose during presentation refresh", () => {
  const report = fixture("zh-CN");
  report.technicalFoundation.aiReport.organizationProfile.summary = "Historical English summary.";
  report.technicalFoundation.technicalReport.findings[0]!.description = "Expected one H1, found 0.";
  expect(() => assertCombinedGeoReportLanguage(report, "presentation_refresh"))
    .toThrow(ReportLanguageValidationError);
});
```

- [ ] **Step 2: Run the gate tests and verify they fail**

Run: `npx vitest run packages/ai-report-engine/src/combined-geo-report.test.ts`

Expected: FAIL because deterministic technical fields are not in the gate and refresh excludes the whole technical foundation.

- [ ] **Step 3: Add deterministic technical fields to the gate**

In `assertCombinedGeoReportLanguage`, add the customer-visible deterministic fields before the AI fields:

```ts
const technical = report.technicalFoundation.technicalReport;
technical.findings.forEach((finding, index) => {
  add(`technicalFoundation.technicalReport.findings[${index}].title`, finding.title);
  add(`technicalFoundation.technicalReport.findings[${index}].description`, finding.description);
  add(`technicalFoundation.technicalReport.findings[${index}].recommendation`, finding.recommendation);
});
Object.entries(technical.machineReadableAssets).forEach(([key, asset]) =>
  add(`technicalFoundation.technicalReport.machineReadableAssets.${key}.summary`, asset.summary));
```

Narrow the refresh exception to historical AI prose and the locked historical question text:

```ts
const scopedFields = scope === "presentation_refresh"
  ? fields.filter(({ path }) =>
      !path.startsWith("technicalFoundation.aiReport.") &&
      !path.startsWith("businessQuestionSet."))
  : fields;
```

- [ ] **Step 4: Project before combined report validation and readiness**

In `buildReadyCombinedArtifact`, create the projection after locale/system-copy resolution:

```ts
const localizedTechnicalReport = localizeTechnicalReportForArtifact(input.technicalReport, forensic.locale);
```

In the `technicalFoundation` object passed to `requireReadyCombinedGeoReport`, replace:

```ts
technicalReport: input.technicalReport,
```

with:

```ts
technicalReport: localizedTechnicalReport,
```

In the canonical artifact model, replace:

```ts
technicalReport: input.technicalReport,
```

with:

```ts
technicalReport: report.technicalFoundation.technicalReport,
```

Keep `technicalInputIdentity` based on `input.technicalReport` so provenance continues to identify the original audit input rather than presentation copy.

- [ ] **Step 5: Add readiness-level projection assertions**

Extend the focused readiness test to inspect the same projection used by the builder with an explicit minimal audit fixture:

```ts
const technicalReport: GeoAuditReport = {
  url: "https://example.com/",
  scannedAt: "2030-01-01T00:00:00.000Z",
  score: 80,
  pages: [],
  findings: [createFinding({
    id: "page.h1Structure",
    messageKey: "page.h1Structure",
    params: { h1Count: 0 },
    url: "https://example.com/"
  })],
  recommendations: [],
  machineReadableAssets: {
    robotsTxt: { url: "https://example.com/robots.txt", present: true, summary: "Available" },
    sitemapXml: { url: "https://example.com/sitemap.xml", present: false, summary: "Missing" },
    llmsTxt: { url: "https://example.com/llms.txt", present: false, summary: "Missing" }
  }
};
const localized = localizeTechnicalReportForArtifact(technicalReport, "zh-CN");
expect(localized.findings[0]!.title).toBe("H1 结构需要调整");
expect(localized.findings[0]!.recommendation).toContain("H2");
```

- [ ] **Step 6: Run Task 2 tests and builds**

Run:

```powershell
npx vitest run packages/ai-report-engine/src/combined-geo-report.test.ts apps/web/src/report/technical-report-localization.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx
npm run build --workspace packages/ai-report-engine
npm run build --workspace apps/web
```

Expected: all tests and both builds PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add -- packages/ai-report-engine/src/combined-geo-report.ts packages/ai-report-engine/src/combined-geo-report.test.ts apps/web/src/report/combined-artifact-readiness.tsx apps/web/src/report/combined-artifact-readiness.test.tsx
git commit -m "fix: gate localized technical analysis"
```

---

### Task 3: Explain source-original table values and close the regression

**Files:**
- Modify: `apps/web/src/components/combined-geo-report-artifact.tsx`
- Modify: `apps/web/src/components/combined-geo-report-artifact.test.tsx`
- Modify: `docs/PROJECT-STATE.md`
- Modify: `docs/TASKS.md`

**Interfaces:**
- Consumes: the localized technical projection persisted by Task 2.
- Produces: an artifact that distinguishes localized report prose from source-original page title/H1/URL values.

- [ ] **Step 1: Add a failing rendering regression**

```ts
it("renders localized deterministic findings and labels source-original page values", () => {
  const model = combinedArtifactFixture();
  model.locale = "zh";
  model.combinedReport.technicalFoundation.technicalReport.findings = [{
    id: "page.h1Structure",
    severity: "warning",
    title: "H1 结构需要调整",
    description: "预期只有一个 H1，实际发现 0 个。",
    recommendation: "每个页面使用一个描述清晰的 H1，并将 H2 用于章节结构。"
  }];
  model.combinedReport.technicalFoundation.technicalReport.pages = [{
    url: "https://example.com/",
    status: 200,
    title: "Original English Page Title",
    metaDescription: "Original source description",
    h1: ["Original English H1"],
    h2: [],
    canonical: "https://example.com/",
    hasOpenGraph: true,
    hasJsonLd: true,
    readableTextLength: 1000,
    internalLinks: 3
  }];
  const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model }));
  expect(html).toContain("H1 结构需要调整");
  expect(html).toContain("预期只有一个 H1，实际发现 0 个。");
  expect(html).toContain("页面标题、H1 和 URL 为来源原文");
  expect(html).toContain("Original English Page Title");
  expect(html).not.toContain("H1 structure needs attention");
});
```

- [ ] **Step 2: Run the component test and verify the missing explanatory copy**

Run: `npx vitest run apps/web/src/components/combined-geo-report-artifact.test.tsx`

Expected: FAIL because the source-original note is absent.

- [ ] **Step 3: Add the locale-owned note before the technical page table**

```tsx
<p className="source-original-label">
  {zh
    ? "页面标题、H1 和 URL 为来源原文"
    : "Page titles, H1 values, and URLs are source-original"}
</p>
```

Do not translate `page.title`, `page.h1`, `page.url`, or `page.canonical` at render time.

- [ ] **Step 4: Run focused customer and internal-PDF regressions**

Run:

```powershell
npx vitest run apps/web/src/components/combined-geo-report-artifact.test.tsx apps/web/src/report/technical-report-localization.test.ts apps/web/src/report/combined-artifact-readiness.test.tsx packages/ai-report-engine/src/combined-geo-report.test.ts
npm test
npm run lint
npm run build
```

Expected: focused tests, full tests, lint, and production build PASS; internal readiness tests still assert a valid `%PDF-` artifact.

- [ ] **Step 5: Run scoped neat sync**

Update existing current-state entries rather than appending history:

- `docs/PROJECT-STATE.md`: deterministic technical findings are localized only in newly materialized revisions.
- `docs/TASKS.md`: mark the complete-technical-analysis localization regression complete.
- Do not change historical evidence files or Codex memory.

- [ ] **Step 6: Run final static audits**

Run:

```powershell
rg -n "H1 structure needs attention|Expected one H1|Missing canonical URL" apps/web/src/components apps/web/src/report
rg -n "localizeTechnicalReportForArtifact|technicalFoundation\.technicalReport\.findings" apps/web/src packages/ai-report-engine/src
codegraph sync
git diff --check
git status --short --branch
```

Expected: English fallback strings occur only in explicit English fixtures/tests or the locale-independent auditor; the localization helper and final gate are wired; CodeGraph is current; the worktree is clean after commit.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- apps/web/src/components/combined-geo-report-artifact.tsx apps/web/src/components/combined-geo-report-artifact.test.tsx docs/PROJECT-STATE.md docs/TASKS.md
git commit -m "fix: localize complete technical analysis"
```
