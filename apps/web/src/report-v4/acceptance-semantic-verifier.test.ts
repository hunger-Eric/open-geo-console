import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ReportV4AcceptanceEvent, ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import { compareReportV4CommerceAuthoritySnapshots } from "./report-v4-commerce-authority-comparator";
import { createReportV4CommerceAuthoritySnapshotPair } from "./report-v4-commerce-authority-comparator.test-fixture";
import {
  ReportV4AcceptanceSemanticVerificationError,
  verifyReportV4AcceptanceScenarioSemantics,
  type ReportV4AcceptanceSemanticAuthority
} from "./acceptance-semantic-verifier";

// @requirement GEO-V4-ACCEPT-01
// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-CRAWL-01
// @requirement GEO-V4-CRAWL-02
// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-ANSWER-01
// @requirement GEO-V4-ANSWER-02
// @requirement GEO-V4-SOURCE-01
// @requirement GEO-V4-SOURCE-02
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-DIAG-02
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-COMMERCE-01

describe("Report V4 acceptance semantic verifier", () => {
  it.each(["success", "diagnosis_failure", "question_failure"] as const)("accepts complete explicit %s authority", (kind) => {
    const fixture = completeFixture(kind);
    expect(verify(fixture)).toEqual({
      valid: true,
      scenarioId: fixture.scenario.scenarioId,
      verifiedEventCount: fixture.events.length
    });
  });

  it("rejects the structurally-valid minimal fault ledger for every missing required evidence family", () => {
    const fixture = completeFixture("diagnosis_failure");
    fixture.events = fixture.events.filter((event) => event.kind === "fault_injection");
    const issues = verifyIssues(fixture);
    expect(issues.join("\n")).toMatch(/v4_dispatch/u);
    expect(issues.join("\n")).toMatch(/crawl_run/u);
    expect(issues.join("\n")).toMatch(/page_analysis/u);
    expect(issues.join("\n")).toMatch(/checkpoint_terminal/u);
    expect(issues.join("\n")).toMatch(/html_assembly/u);
    expect(issues.join("\n")).toMatch(/commerce_fingerprint/u);
  });

  it.each([
    ["missing dispatch", (f: Fixture) => remove(f, "v4_dispatch", "core") , /v4_dispatch/u],
    ["missing crawl", (f: Fixture) => remove(f, "crawl_run", f.authority.crawl.unitId, "completed"), /crawl_run/u],
    ["missing site read", (f: Fixture) => remove(f, "site_read", f.authority.requiredSiteReads[0]!.unitId, "completed"), /site_read/u],
    ["missing page model", (f: Fixture) => remove(f, "model_operation", "page-1", "completed"), /page_analysis/u],
    ["missing synthesis", (f: Fixture) => remove(f, "model_operation", "websiteSynthesis", "completed"), /website_synthesis/u],
    ["missing checkpoint", (f: Fixture) => remove(f, "checkpoint_terminal", hash("qi-q2")), /checkpoint_terminal/u],
    ["missing token rejection", (f: Fixture) => remove(f, "model_operation", "oversized-probe", "rejected"), /oversized-probe/u],
    ["missing HTML", (f: Fixture) => remove(f, "html_assembly", "core-artifact", "completed"), /html_assembly/u],
    ["missing activation", (f: Fixture) => remove(f, "artifact_activation", "core-artifact"), /artifact_activation/u],
    ["missing commerce", (f: Fixture) => remove(f, "commerce_fingerprint", "commerce-final"), /commerce_fingerprint/u]
  ] as const)("rejects %s", (_label, mutate, message) => {
    const fixture = completeFixture("success");
    mutate(fixture);
    expect(() => verify(fixture)).toThrow(message);
  });

  it("rejects empty required authority arrays rather than treating them as proof of zero", () => {
    const fixture = completeFixture("success");
    fixture.authority = { ...fixture.authority, requiredSiteReads: [], allowedSiteReads: [], analyzablePageIds: [], pageSummaries: [], questions: [] };
    expect(verifyIssues(fixture).join("\n")).toMatch(/requiredSiteReads.*at least one.*allowedSiteReads.*enumerate.*analyzablePageIds.*not be empty.*pageSummaries.*not be empty.*questions.*not be empty/su);
  });

  it("rejects extra and unowned dispatch, model, checkpoint, HTML, activation, crawl, site-read and commerce units", () => {
    for (const event of [
      ev("v4_dispatch", "v4_dispatch", "foreign-job", 0, "observed", {}),
      model("page_analysis", "foreign-page", 1, "started"),
      ev("checkpoint_terminal", "question_answer", hash("foreign-checkpoint"), 0, "observed", { checkpointHash: hash("x"), state: "answered" }),
      ev("html_assembly", "core_html", "foreign-artifact", 0, "started", { artifactRevisionId: "foreign-artifact", htmlSha256: hash("html") }),
      ev("artifact_activation", "artifact_activation", "foreign-artifact", 0, "observed", { artifactRevisionId: "foreign-artifact", htmlSha256: hash("html") }),
      ev("crawl_run", "crawl", "foreign-crawl", 0, "started", crawlDetails()),
      ev("site_read", "site_raw_read", "foreign-read", 1, "started", siteDetails("raw", hash("url"))),
      ev("commerce_fingerprint", "commerce", "foreign-commerce", 0, "observed", { fingerprint: hash("foreign") })
    ]) {
      const fixture = completeFixture("success");
      fixture.events.push(event);
      resequence(fixture.events);
      expect(verifyIssues(fixture).some((issue) => issue.includes("extra or unowned"))).toBe(true);
    }
  });

  it.each([
    ["providerCall", { providerCall: false }, /providerCall=true/u],
    ["retry", { retry: true }, /retry=false/u],
    ["budget", { budgetOutcome: "rejected" }, /budgetOutcome=allowed/u]
  ] as const)("rejects wrong attempt-1 %s grammar", (_label, patch, message) => {
    const fixture = completeFixture("success");
    patchDetails(find(fixture, "model_operation", "q2", "started", 1), patch);
    expect(() => verify(fixture)).toThrow(message);
  });

  it("requires attempt 2 only after attempt 1 failed and checks physical start cardinality", () => {
    const fixture = completeFixture("success");
    const questions = fixture.authority.questions.map((question) => question.questionId === "q2"
      ? { ...question, logicalProviderCallCount: 2 as const, physicalProviderCallCount: 2 as const }
      : question);
    fixture.authority = { ...fixture.authority, questions };
    const firstCompleted = find(fixture, "model_operation", "q2", "completed", 1);
    firstCompleted.phase = "failed";
    const checkpointIndex = fixture.events.findIndex((event) => event.kind === "checkpoint_terminal" && event.unitId === hash("qi-q2"));
    fixture.events.splice(checkpointIndex, 0,
      model("question_answer", "q2", 2, "started"),
      model("question_answer", "q2", 2, "completed"));
    resequence(fixture.events);
    expect(verify(fixture).valid).toBe(true);
    const retry = find(fixture, "model_operation", "q2", "started", 2);
    retry.details = { ...retry.details as Record<string, unknown>, retry: false } as ReportV4AcceptanceEvent["details"];
    expect(() => verify(fixture)).toThrow(/retry=true/u);
  });

  it("distinguishes injected zero-call question and diagnosis faults from physical provider calls", () => {
    const question = completeFixture("question_failure");
    question.events.push(model("question_answer", "q-fault", 1, "started"));
    resequence(question.events);
    expect(() => verify(question)).toThrow(/faulted question.*zero physical/u);

    const diagnosis = completeFixture("diagnosis_failure");
    diagnosis.events.push(model("source_diagnosis", "enh:q-fault", 1, "started"));
    resequence(diagnosis.events);
    expect(() => verify(diagnosis)).toThrow(/faulted diagnosis.*zero physical/u);
  });

  it("requires source fault injection plus DB zero-claim proof and rejects a physical source claim", () => {
    const fixture = completeFixture("success");
    const faultUnit = fixture.authority.sourceFaultZeroClaim!.unitId;
    fixture.events.push(ev("site_read", "site_raw_read", faultUnit, 1, "started", siteDetails("raw", hash("fault-url"))));
    resequence(fixture.events);
    expect(() => verify(fixture)).toThrow(/zero physical site-read/u);

    const missingFault = completeFixture("success");
    remove(missingFault, "fault_injection", faultUnit);
    expect(() => verify(missingFault)).toThrow(/exactly one consumed fault/u);
  });

  it("requires exact crawl authority, page-summary completeness, and website checkpoint authority", () => {
    const crawl = completeFixture("success");
    crawl.authority = { ...crawl.authority, crawl: { ...crawl.authority.crawl, candidatePages: 3 } };
    expect(verifyIssues(crawl).join("\n")).toMatch(/candidatePages must equal.*completed crawl candidatePages/su);

    const summary = completeFixture("success");
    summary.authority = { ...summary.authority, pageSummaries: [{ ...summary.authority.pageSummaries[0]!, pageId: "foreign-page" }] };
    expect(() => verify(summary)).toThrow(/exactly equal analyzable/u);

    const website = completeFixture("success");
    website.authority = { ...website.authority, websiteCheckpoint: { ...website.authority.websiteCheckpoint, correctionCount: 1 } as never };
    expect(() => verify(website)).toThrow(/website checkpoint.*zero corrections/u);

    const freshStart = completeFixture("success");
    patchDetails(find(freshStart, "crawl_run", freshStart.authority.crawl.unitId, "started", 0), { candidatePages: 2 });
    expect(() => verify(freshStart)).toThrow(/started crawl candidatePages does not match fresh zero/u);
  });

  it.each([
    ["questionId", "wrong-question"],
    ["sourceId", "wrong-source"],
    ["persistedAuditStatus", "accessible"],
    ["coreAnswerContentPreserved", false],
    ["sourceLinkPreserved", false]
  ] as const)("fails closed when source-fault DB proof %s is wrong", (key, value) => {
    const fixture = completeFixture("success");
    fixture.authority = { ...fixture.authority, sourceFaultZeroClaim: { ...fixture.authority.sourceFaultZeroClaim!, [key]: value } as never };
    expect(() => verify(fixture)).toThrow(/source-fault DB proof/u);
  });

  it("requires recomputed artifact identity and enhancement content preservation proofs", () => {
    const core = completeFixture("success");
    core.authority = { ...core.authority, coreArtifact: { ...core.authority.coreArtifact, recomputedPayloadIdentityHash: hash("wrong") } };
    expect(() => verify(core)).toThrow(/Core artifact.*integrity proof/u);

    const enhancement = completeFixture("success");
    enhancement.authority = { ...enhancement.authority, enhancementArtifact: { ...enhancement.authority.enhancementArtifact!, coreSourceContentPreserved: false } as never };
    expect(() => verify(enhancement)).toThrow(/preserve Core answer and source content/u);
  });

  it("allows absent DB-known optional discovery and shared-cache reads, and verifies an observed excluded-page browser fallback", () => {
    const fixture = completeFixture("success");
    const optionalDiscovery = { pairBindingHash: hash("discovery-optional"), unitId: `admission-discovery:raw:${hash("robots")}`, mode: "raw" as const,
      urlHash: hash("robots"), attempt: 0 as const };
    const optionalSharedSource = { pairBindingHash: hash("shared-cache"), unitId: "enh:q3:shared", mode: "raw" as const,
      urlHash: hash("shared"), attempt: 1 as const };
    const fallbackRaw = { pairBindingHash: hash("excluded-fallback"), unitId: `admission-page:raw:${hash("excluded")}`, mode: "raw" as const,
      urlHash: hash("excluded"), attempt: 0 as const };
    const fallbackBrowser = { pairBindingHash: hash("excluded-fallback"), unitId: `admission-page:browser:${hash("excluded")}`, mode: "browser" as const,
      urlHash: hash("excluded"), attempt: 0 as const };
    fixture.authority = { ...fixture.authority, allowedSiteReads: [...fixture.authority.allowedSiteReads,
      optionalDiscovery, optionalSharedSource, fallbackRaw, fallbackBrowser] };
    const crawlCompletedIndex = fixture.events.findIndex((event) => event.kind === "crawl_run" && event.phase === "completed");
    const observedFallback: ReportV4AcceptanceEvent[] = [];
    addSitePair(observedFallback, fallbackRaw);
    addSitePair(observedFallback, fallbackBrowser);
    fixture.events.splice(crawlCompletedIndex, 0, ...observedFallback);
    resequence(fixture.events);
    fixture.authority = { ...fixture.authority, paidAt: find(fixture, "crawl_run", fixture.authority.crawl.unitId, "completed").occurredAt };
    expect(verify(fixture).valid).toBe(true);
  });

  it("requires raw/browser pairing and orders browser after raw terminal without imposing cross-unit order", () => {
    const fixture = completeFixture("success");
    const raw = fixture.authority.allowedSiteReads.find((read) => read.pairBindingHash === hash("source-q2") && read.mode === "raw")!;
    fixture.authority = { ...fixture.authority, allowedSiteReads: fixture.authority.allowedSiteReads.filter((read) => read !== raw),
      requiredSiteReads: fixture.authority.requiredSiteReads.filter((read) => read !== raw) };
    expect(() => verify(fixture)).toThrow(/exactly one raw/u);

    const ordered = completeFixture("success");
    const browserStart = find(ordered, "site_read", "enh:q2:s2", "started", 1, "site_browser_read");
    const rawComplete = find(ordered, "site_read", "enh:q2:s2", "completed", 1, "site_raw_read");
    [browserStart.sequence, rawComplete.sequence] = [rawComplete.sequence, browserStart.sequence];
    expect(() => verify(ordered)).toThrow(/browser claim must follow raw/u);
  });

  it("rejects token-probe aliasing and wrong rejected-call grammar", () => {
    const alias = completeFixture("success");
    alias.authority = { ...alias.authority, oversizedTokenProbe: { ...alias.authority.oversizedTokenProbe, unitId: "q2" } };
    expect(() => verify(alias)).toThrow(/must not alias/u);

    const details = completeFixture("success");
    patchDetails(find(details, "model_operation", "oversized-probe", "started", 0), { providerCall: true });
    expect(() => verify(details)).toThrow(/providerCall=false/u);
  });

  it("binds exact checkpoint identity/state/fingerprint", () => {
    const fixture = completeFixture("success");
    patchDetails(find(fixture, "checkpoint_terminal", hash("qi-q2"), "observed", 0), { checkpointHash: hash("wrong") });
    expect(() => verify(fixture)).toThrow(/terminal checkpoint state or fingerprint/u);
  });

  it("binds HTML and activation hashes and order", () => {
    const mismatch = completeFixture("success");
    patchDetails(find(mismatch, "html_assembly", "core-artifact", "completed", 0), { htmlSha256: hash("wrong") });
    expect(() => verify(mismatch)).toThrow(/HTML hash mismatch/u);

    const ordering = completeFixture("success");
    find(ordering, "artifact_activation", "core-artifact").sequence = find(ordering, "html_assembly", "core-artifact", "started").sequence - 1;
    expect(() => verify(ordering)).toThrow(/completion must precede activation/u);
  });

  it("requires partial diagnosis-failure enhancement activation, not total failure", () => {
    const fixture = completeFixture("diagnosis_failure");
    fixture.authority = { ...fixture.authority, enhancementArtifact: { ...fixture.authority.enhancementArtifact!, active: false } };
    expect(() => verify(fixture)).toThrow(/partial enhancement/u);
  });

  it("binds distinct commerce baseline/final authority and sealed final fingerprint", () => {
    const fixture = completeFixture("success");
    patchDetails(find(fixture, "commerce_fingerprint", "commerce-final"), { fingerprint: hash("wrong") });
    expect(() => verify(fixture)).toThrow(/commerce final fingerprint mismatch/u);
    const alias = completeFixture("success");
    alias.authority = { ...alias.authority, commerce: { ...alias.authority.commerce, finalUnitId: "commerce-baseline" } };
    expect(() => verify(alias)).toThrow(/must be distinct/u);
  });

  it.each([
    "pdfInvocationCount", "replacementFulfillmentCount", "correctionFulfillmentCount", "fullRerunCount", "extraSnapshotCountAfterPayment"
  ] as const)("rejects prohibited DB-derived %s", (key) => {
    const fixture = completeFixture("success");
    fixture.authority = { ...fixture.authority, databaseZeroClaims: { ...fixture.authority.databaseZeroClaims, [key]: 1 } as never };
    expect(() => verify(fixture)).toThrow(new RegExp(key, "u"));
  });

  it("rejects prohibited-operation ledger evidence even with otherwise valid authority", () => {
    const fixture = completeFixture("success");
    fixture.events.push(ev("prohibited_operation", "pdf", "pdf", 0, "started", {}));
    resequence(fixture.events);
    expect(() => verify(fixture)).toThrow(/prohibited_operation/u);
  });

  it("enforces crawl, paid-Core and Core-enhancement timing bounds", () => {
    const crawl = completeFixture("success");
    const crawlStarted = find(crawl, "crawl_run", crawl.authority.crawl.unitId, "started");
    find(crawl, "crawl_run", crawl.authority.crawl.unitId, "completed").occurredAt = new Date(crawlStarted.occurredAt.getTime() + 10 * 60_000 + 1);
    expect(() => verify(crawl)).toThrow(/crawl exceeded 10 minutes/u);

    const core = completeFixture("success");
    const lateCoreActivation = find(core, "artifact_activation", "core-artifact");
    lateCoreActivation.occurredAt = new Date(core.authority.paidAt.getTime() + 5 * 60_000 + 1);
    find(core, "artifact_activation", "enh-artifact").occurredAt = new Date(lateCoreActivation.occurredAt.getTime() + 1_000);
    expect(() => verify(core)).toThrow(/Core activation exceeded 5 minutes/u);

    const enhancement = completeFixture("success");
    const coreActivation = find(enhancement, "artifact_activation", "core-artifact");
    find(enhancement, "artifact_activation", "enh-artifact").occurredAt = new Date(coreActivation.occurredAt.getTime() + 10 * 60_000 + 1);
    expect(() => verify(enhancement)).toThrow(/enhancement activation exceeded 10 minutes/u);

    const postPaymentAdmission = completeFixture("success");
    postPaymentAdmission.authority = { ...postPaymentAdmission.authority, paidAt: new Date(BASE + 4_000) };
    expect(() => verify(postPaymentAdmission)).toThrow(/crawl completion must not occur after paidAt/u);
  });

  it("aggregates actionable independent semantic issues", () => {
    const fixture = completeFixture("success");
    remove(fixture, "crawl_run", fixture.authority.crawl.unitId, "completed");
    remove(fixture, "commerce_fingerprint", "commerce-final");
    const issues = verifyIssues(fixture);
    expect(issues.some((issue) => issue.includes("crawl_run"))).toBe(true);
    expect(issues.some((issue) => issue.includes("commerce_fingerprint"))).toBe(true);
  });

  it("enforces the exact three-scenario outcome matrix", () => {
    const success = completeFixture("success");
    success.authority = { ...success.authority, questions: success.authority.questions.map((question, index) => index === 0 ? { ...question, state: "unavailable" } : question) as never };
    expect(() => verify(success)).toThrow(/success must have exactly three answered/u);

    const diagnosis = completeFixture("diagnosis_failure");
    diagnosis.authority = { ...diagnosis.authority, diagnoses: diagnosis.authority.diagnoses.map((item) => item.questionId === "q2" ? { ...item, state: "failed" } : item) as never };
    expect(() => verify(diagnosis)).toThrow(/two completed sibling diagnoses/u);

    const question = completeFixture("question_failure");
    question.authority = { ...question.authority, questions: question.authority.questions.map((item) => item.questionId === "q2" ? { ...item, state: "unavailable" } : item) as never };
    expect(() => verify(question)).toThrow(/two answered sibling questions/u);
  });

  it("requires independently recomputed oversized token estimates and exact event details", () => {
    const zero = completeFixture("success");
    zero.authority = { ...zero.authority, oversizedTokenProbe: { ...zero.authority.oversizedTokenProbe, estimatedSystemTokens: 0, estimatedInputTokens: 0, reservedOutputTokens: 0, providerSafetyMarginTokens: 0 } };
    patchDetails(find(zero, "model_operation", "oversized-probe", "started", 0), { inputTokens: 0, outputTokens: 0 });
    patchDetails(find(zero, "model_operation", "oversized-probe", "rejected", 0), { inputTokens: 0, outputTokens: 0 });
    expect(() => verify(zero)).toThrow(/positive configured-limit violation/u);

    const mismatch = completeFixture("success");
    patchDetails(find(mismatch, "model_operation", "oversized-probe", "rejected", 0), { inputTokens: 999 });
    expect(() => verify(mismatch)).toThrow(/match recomputed estimates/u);
  });

  it("enforces Core stage barriers while retaining website/question parallelism", () => {
    const pages = completeFixture("success");
    find(pages, "model_operation", "page-1", "completed", 1).sequence = find(pages, "model_operation", "websiteSynthesis", "started", 1).sequence + 1;
    expect(() => verify(pages)).toThrow(/page page-1 completion must precede website/u);

    const provider = completeFixture("success");
    find(provider, "model_operation", "q2", "completed", 1).sequence = find(provider, "checkpoint_terminal", hash("qi-q2")).sequence + 1;
    expect(() => verify(provider)).toThrow(/provider terminal must precede its checkpoint/u);

    const parallel = completeFixture("success");
    find(parallel, "model_operation", "websiteSynthesis", "completed", 1).sequence = find(parallel, "model_operation", "q2", "started", 1).sequence + 1;
    expect(verify(parallel).valid).toBe(true);
  });

  it("enforces crawl/payment/Core and injected-fault causal barriers", () => {
    const crawl = completeFixture("success");
    find(crawl, "crawl_run", crawl.authority.crawl.unitId, "completed").sequence = find(crawl, "v4_dispatch", "core").sequence + 1;
    expect(() => verify(crawl)).toThrow(/crawl completion must precede Core dispatch/u);

    const paid = completeFixture("success");
    paid.authority = { ...paid.authority, paidAt: new Date(find(paid, "v4_dispatch", "core").occurredAt.getTime() + 1) };
    expect(() => verify(paid)).toThrow(/Core dispatch timestamp must not precede paidAt/u);

    const fault = completeFixture("diagnosis_failure");
    for (const event of fault.events.filter((item) => item.kind === "fault_injection")) event.sequence = fault.events.length + 1;
    expect(() => verify(fault)).toThrow(/fault consumption must precede target/u);
  });

  it("requires source terminals before their bound diagnosis", () => {
    const fixture = completeFixture("success");
    find(fixture, "site_read", "enh:q2:s2", "completed", 1, "site_browser_read").sequence =
      find(fixture, "model_operation", "enh:q2", "started", 1).sequence + 1;
    expect(() => verify(fixture)).toThrow(/source read.*must precede its diagnosis/u);
  });

  it("enforces comparator component authority and commerce phase order", () => {
    const reversed = completeFixture("success");
    find(reversed, "commerce_fingerprint", "commerce-baseline").sequence = find(reversed, "v4_dispatch", "enh").sequence + 1;
    expect(() => verify(reversed)).toThrow(/baseline must precede enhancement/u);

    const duplicate = completeFixture("success");
    duplicate.authority = { ...duplicate.authority, commerce: { ...duplicate.authority.commerce,
      comparison: { ...duplicate.authority.commerce.comparison, components: { ...duplicate.authority.commerce.comparison.components,
        paymentEvents: { ...duplicate.authority.commerce.comparison.components.paymentEvents,
          final: { ...duplicate.authority.commerce.comparison.components.paymentEvents.final, duplicateCount: 1 } } } } } };
    expect(() => verify(duplicate)).toThrow(/component paymentEvents contains duplicate/u);
  });

  it("binds deterministic site pairs and accepts optional completed or failed terminals", () => {
    const mismatch = completeFixture("success");
    mismatch.authority = { ...mismatch.authority, allowedSiteReads: mismatch.authority.allowedSiteReads.map((read) =>
      read.mode === "browser" && read.unitId === "enh:q2:s2" ? { ...read, urlHash: hash("wrong-url") } : read) };
    expect(() => verify(mismatch)).toThrow(/raw\/browser URL hashes must match/u);

    for (const terminalPhase of ["completed", "failed"] as const) {
      const optional = completeFixture("success");
      const read = { pairBindingHash: hash(`optional-${terminalPhase}`), unitId: `enh:q3:${terminalPhase}`, mode: "raw" as const,
        urlHash: hash(`optional-url-${terminalPhase}`), attempt: 1 as const };
      optional.authority = { ...optional.authority, allowedSiteReads: [...optional.authority.allowedSiteReads, read] };
      const diagnosisIndex = optional.events.findIndex((event) => event.kind === "model_operation" && event.unitId === "enh:q3" && event.phase === "started");
      optional.events.splice(diagnosisIndex, 0,
        ev("site_read", "site_raw_read", read.unitId, 1, "started", siteDetails("raw", read.urlHash)),
        ev("site_read", "site_raw_read", read.unitId, 1, terminalPhase, siteDetails("raw", read.urlHash)));
      resequence(optional.events);
      expect(verify(optional).valid).toBe(true);
    }
  });

  it("binds exact artifact/diagnosis lineage and trusted checkpoint/page integrity", () => {
    const artifact = completeFixture("success");
    artifact.authority = { ...artifact.authority, coreArtifact: { ...artifact.authority.coreArtifact, revisionId: "foreign" } };
    expect(() => verify(artifact)).toThrow(/does not match scenario lineage/u);

    const diagnosis = completeFixture("success");
    diagnosis.authority = { ...diagnosis.authority, diagnoses: diagnosis.authority.diagnoses.map((item, index) => index === 0 ? { ...item, questionId: "foreign" } : item) };
    expect(() => verify(diagnosis)).toThrow(/diagnosis question IDs must exactly equal/u);

    const question = completeFixture("success");
    question.authority = { ...question.authority, questions: question.authority.questions.map((item, index) => index === 0 ? { ...item, sourceCount: 6 } : item) };
    expect(() => verify(question)).toThrow(/source count\/ownership\/input scope/u);

    const audit = completeFixture("success");
    audit.authority = { ...audit.authority, diagnoses: audit.authority.diagnoses.map((item) => item.questionId === "q2" ? { ...item, sourceAuditCount: 2 } : item) };
    expect(() => verify(audit)).toThrow(/source-audit count must equal/u);

    const page = completeFixture("success");
    page.authority = { ...page.authority, pageSummaries: [{ ...page.authority.pageSummaries[0]!, chunkIntegrity: false } as never] };
    expect(() => verify(page)).toThrow(/hierarchy\/chunk\/source-position integrity/u);
  });

  it("uses the real token-budget formula for system and safety context pressure", () => {
    const fixture = completeFixture("success");
    fixture.authority = { ...fixture.authority, oversizedTokenProbe: { ...fixture.authority.oversizedTokenProbe,
      estimatedSystemTokens: 20, estimatedInputTokens: 4, reservedOutputTokens: 5, providerSafetyMarginTokens: 2,
      maxInputTokens: 5, maxOutputTokens: 5, contextWindowTokens: 30 } };
    for (const event of fixture.events.filter((item) => item.kind === "model_operation" && item.unitId === "oversized-probe")) {
      patchDetails(event as Mutable<ReportV4AcceptanceEvent>, { inputTokens: 24, outputTokens: 5 });
    }
    expect(verify(fixture).valid).toBe(true);
    patchDetails(find(fixture, "model_operation", "oversized-probe", "started", 0), { inputTokens: 4 });
    expect(() => verify(fixture)).toThrow(/match recomputed estimates/u);
  });

  it("rejects required/allowed identity conflicts and invalid crawl/page/website authority", () => {
    const reads = completeFixture("success");
    reads.authority = { ...reads.authority, requiredSiteReads: reads.authority.requiredSiteReads.map((read, index) => index === 0 ? { ...read, urlHash: hash("conflict") } : read) };
    expect(() => verify(reads)).toThrow(/conflicts with allowed identity/u);

    const crawl = completeFixture("success");
    crawl.authority = { ...crawl.authority, crawl: { ...crawl.authority.crawl, jsDependentPages: 2 } };
    expect(() => verify(crawl)).toThrow(/jsDependentPages cannot exceed/u);

    const website = completeFixture("success");
    website.authority = { ...website.authority, websiteCheckpoint: { ...website.authority.websiteCheckpoint, pageSummaryIdentitySetHash: hash("wrong-set") } };
    expect(() => verify(website)).toThrow(/website checkpoint.*stable identity/u);

    const duplicate = completeFixture("success");
    duplicate.authority = { ...duplicate.authority, pageSummaries: [duplicate.authority.pageSummaries[0]!, { ...duplicate.authority.pageSummaries[0]!, pageId: "page-2" }], analyzablePageIds: ["page-1", "page-2"], crawl: { ...duplicate.authority.crawl, candidatePages: 3, analyzablePages: 2 } };
    expect(() => verify(duplicate)).toThrow(/page summary identity hash identifiers must be unique/u);
  });

  it("orders success source fault before the target diagnosis provider start", () => {
    const fixture = completeFixture("success");
    find(fixture, "fault_injection", "enh:q-fault:s-fault").sequence = find(fixture, "model_operation", "enh:q-fault", "started", 1).sequence + 1;
    expect(() => verify(fixture)).toThrow(/source fault consumption must precede target diagnosis provider start/u);
  });

  it("rejects invalid comparator verdicts, flags, violations, topology, and final binding", () => {
    const valid = completeFixture("success");
    valid.authority = { ...valid.authority, commerce: { ...valid.authority.commerce,
      comparison: { ...valid.authority.commerce.comparison, valid: false } } };
    expect(() => verify(valid)).toThrow(/comparison must be valid/u);

    const flag = completeFixture("success");
    flag.authority = { ...flag.authority, commerce: { ...flag.authority.commerce,
      comparison: { ...flag.authority.commerce.comparison, verified: { ...flag.authority.commerce.comparison.verified, finalTopology: false } } } };
    expect(() => verify(flag)).toThrow(/verified.finalTopology must be true/u);

    const violation = completeFixture("success");
    const item = { code: "tamper", component: "snapshot" as const, message: "tampered" };
    violation.authority = { ...violation.authority, commerce: { ...violation.authority.commerce,
      comparison: { ...violation.authority.commerce.comparison, violations: [item] } } };
    expect(() => verify(violation)).toThrow(/must have no violations/u);

    const kind = completeFixture("success");
    kind.authority = { ...kind.authority, commerce: { ...kind.authority.commerce,
      comparison: { ...kind.authority.commerce.comparison, scenarioKind: "question_failure" } } };
    expect(() => verify(kind)).toThrow(/scenarioKind does not match/u);

    const component = completeFixture("success");
    component.authority = { ...component.authority, commerce: { ...component.authority.commerce,
      comparison: { ...component.authority.commerce.comparison, components: { ...component.authority.commerce.comparison.components,
        orders: { ...component.authority.commerce.comparison.components.orders, violations: [{ code: "row", component: "orders", message: "bad" }] } } } } };
    expect(() => verify(component)).toThrow(/component orders has violations/u);

    const fingerprint = completeFixture("success");
    fingerprint.authority = { ...fingerprint.authority, commerce: { ...fingerprint.authority.commerce,
      comparison: { ...fingerprint.authority.commerce.comparison, finalFingerprint: hash("wrong-final") } } };
    expect(() => verify(fingerprint)).toThrow(/final fingerprint must equal scenario/u);
  });
});

const BASE = Date.parse("2026-07-17T00:00:00.000Z");
type Kind = ReportV4AcceptanceScenario["kind"];
interface Fixture { scenario: ReportV4AcceptanceScenario; events: ReportV4AcceptanceEvent[]; authority: ReportV4AcceptanceSemanticAuthority }

function completeFixture(kind: Kind): Fixture {
  const hasEnhancement = kind !== "question_failure";
  const commercePair = createReportV4CommerceAuthoritySnapshotPair(kind);
  const comparison = compareReportV4CommerceAuthoritySnapshots({ ...commercePair, scenarioKind: kind });
  const finalFingerprint = comparison.finalFingerprint;
  const scenario = {
    sessionId: "11111111-1111-4111-8111-111111111111", scenarioId: `scenario-${kind}`,
    reportId: `report-${kind}`, orderId: `order-${kind}`, preAdmissionJobId: "pre", coreJobId: "core",
    enhancementJobId: hasEnhancement ? "enh" : null, siteSnapshotId: "site", configSnapshotId: "config",
    questionSetId: "questions", coreArtifactRevisionId: "core-artifact", enhancementArtifactRevisionId: hasEnhancement ? "enh-artifact" : null,
    kind, faultKind: kind === "success" ? "independent_source_read_failure" : kind,
    faultQuestionId: "q-fault", faultSourceId: kind === "success" ? "s-fault" : null,
    expectedFaultOccurrences: kind === "success" ? 1 : 2, baselineFingerprint: hash(`baseline-${kind}`), finalFingerprint,
    state: "sealed", createdAt: new Date(BASE), terminalAt: new Date(BASE + 100_000)
  } as ReportV4AcceptanceScenario;
  const questionIds = ["q-fault", "q2", "q3"];
  const questions = questionIds.map((questionId) => ({ questionId, identityHash: hash(`qi-${questionId}`), terminalFingerprint: hash(`qt-${questionId}`),
    state: kind === "question_failure" && questionId === "q-fault" ? "unavailable" as const : "answered" as const,
    logicalProviderCallCount: kind === "question_failure" && questionId === "q-fault" ? 2 as const : 1 as const,
    physicalProviderCallCount: kind === "question_failure" && questionId === "q-fault" ? 0 as const : 1 as const,
    sourceCount: 1, sourceOwnershipVerified: true as const, inputScopeVerified: true as const }));
  const diagnoses = hasEnhancement ? questionIds.map((questionId) => ({ questionId, identityHash: hash(`di-${questionId}`), terminalFingerprint: hash(`dt-${questionId}`),
    state: kind === "diagnosis_failure" && questionId === "q-fault" ? "failed" as const : "completed" as const,
    logicalProviderCallCount: kind === "diagnosis_failure" && questionId === "q-fault" ? 2 as const : 1 as const,
    physicalProviderCallCount: kind === "diagnosis_failure" && questionId === "q-fault" ? 0 as const : 1 as const,
    sourceAuditCount: 1, sourceAuditOwnershipVerified: true as const, inputScopeVerified: true as const })) : [];
  const siteReads = [
    { pairBindingHash: hash("admission"), unitId: `admission-page:raw:${hash("home")}`, mode: "raw" as const, urlHash: hash("home"), attempt: 0 as const, terminalPhase: "completed" as const },
    ...(hasEnhancement ? [
      { pairBindingHash: hash("source-q2"), unitId: "enh:q2:s2", mode: "raw" as const, urlHash: hash("source2"), attempt: 1 as const, terminalPhase: "completed" as const },
      { pairBindingHash: hash("source-q2"), unitId: "enh:q2:s2", mode: "browser" as const, urlHash: hash("source2"), attempt: 1 as const, terminalPhase: "completed" as const }
    ] : [])
  ];
  const authority: ReportV4AcceptanceSemanticAuthority = {
    scenarioId: scenario.scenarioId, dispatch: { preAdmissionJobId: "pre", coreJobId: "core", enhancementJobId: hasEnhancement ? "enh" : null },
    crawl: { unitId: "pre-admission-crawl:pre", terminalStatus: "completed", candidatePages: 2, analyzablePages: 1, excludedPages: 1, jsDependentPages: 0 },
    requiredSiteReads: siteReads, allowedSiteReads: kind === "success" ? [...siteReads,
      { pairBindingHash: hash("fault-source"), unitId: "enh:q-fault:s-fault", mode: "raw", urlHash: hash("fault-source"), attempt: 1 }] : siteReads,
    sourceFaultZeroClaim: kind === "success" ? { unitId: "enh:q-fault:s-fault", physicalClaimCount: 0, injectedBeforeClaim: true,
      questionId: "q-fault", sourceId: "s-fault", persistedAuditStatus: "inaccessible", coreAnswerContentPreserved: true, sourceLinkPreserved: true } : null,
    analyzablePageIds: ["page-1"], pageSummaries: [{ pageId: "page-1", identityHash: hash("page-summary-1"), parsedHierarchyIntegrity: true, chunkIntegrity: true, sourcePositionIntegrity: true }], websiteSynthesisUnitId: "websiteSynthesis",
    websiteCheckpoint: { state: "completed", providerCallCount: 1, correctionCount: 0, identityHash: hash("website-checkpoint"), inputIdentityHash: hash("website-input"), pageSummaryIdentitySetHash: hash(JSON.stringify([hash("page-summary-1")])) }, questions, diagnoses,
    oversizedTokenProbe: { operation: "question_answer", unitId: "oversized-probe", estimatedSystemTokens: 3, estimatedInputTokens: 10, reservedOutputTokens: 5, providerSafetyMarginTokens: 2, maxInputTokens: 5, maxOutputTokens: 5, contextWindowTokens: 30 },
    coreArtifact: { revisionId: "core-artifact", htmlSha256: hash("core-html"), payloadIdentityHash: hash("core-payload"), recomputedPayloadIdentityHash: hash("core-payload"), integrityVerified: true },
    enhancementArtifact: hasEnhancement ? { revisionId: "enh-artifact", htmlSha256: hash("enh-html"), payloadIdentityHash: hash("enh-payload"), recomputedPayloadIdentityHash: hash("enh-payload"), integrityVerified: true, coreAnswerContentPreserved: true, coreSourceContentPreserved: true, active: true } : null,
    commerce: { baselineUnitId: "commerce-baseline", finalUnitId: "commerce-final", comparison },
    databaseZeroClaims: { pdfInvocationCount: 0, replacementFulfillmentCount: 0, correctionFulfillmentCount: 0, fullRerunCount: 0, extraSnapshotCountAfterPayment: 0 },
    paidAt: new Date(BASE + 6_000)
  };
  const events: ReportV4AcceptanceEvent[] = [];
  events.push(ev("v4_dispatch", "v4_dispatch", "pre", 0, "observed", {}));
  events.push(ev("crawl_run", "crawl", authority.crawl.unitId, 0, "started", zeroCrawlDetails()));
  addSitePair(events, siteReads[0]!);
  events.push(ev("crawl_run", "crawl", authority.crawl.unitId, 0, "completed", crawlDetails()));
  events.push(ev("v4_dispatch", "v4_dispatch", "core", 0, "observed", {}));
  addModelPair(events, "page_analysis", "page-1", 1, "completed");
  addModelPair(events, "website_synthesis", "websiteSynthesis", 1, "completed");
  if (kind === "question_failure") {
    events.push(ev("fault_injection", "question_failure", "core:q-fault", 1, "consumed", {}));
    events.push(ev("fault_injection", "question_failure", "core:q-fault", 2, "consumed", {}));
  }
  for (const question of questions) {
    if (question.physicalProviderCallCount === 1) addModelPair(events, "question_answer", question.questionId, 1, question.state === "answered" ? "completed" : "failed");
    events.push(ev("checkpoint_terminal", "question_answer", question.identityHash, 0, "observed", { checkpointHash: question.terminalFingerprint, state: question.state }));
  }
  events.push(model("question_answer", "oversized-probe", 0, "started", false, "rejected", 13, 5));
  events.push(model("question_answer", "oversized-probe", 0, "rejected", false, "rejected", 13, 5));
  addArtifact(events, "core_html", authority.coreArtifact);
  events.push(ev("commerce_fingerprint", "commerce", "commerce-baseline", 0, "observed", { fingerprint: authority.commerce.comparison.baselineFingerprint }));
  if (hasEnhancement) {
    events.push(ev("v4_dispatch", "v4_dispatch", "enh", 0, "observed", {}));
    if (kind === "success") events.push(ev("fault_injection", "independent_source_read_failure", "enh:q-fault:s-fault", 1, "consumed", {}));
    if (kind === "diagnosis_failure") {
      events.push(ev("fault_injection", "diagnosis_failure", "enh:q-fault", 1, "consumed", {}));
      events.push(ev("fault_injection", "diagnosis_failure", "enh:q-fault", 2, "consumed", {}));
    }
    for (const read of siteReads.slice(1)) addSitePair(events, read);
    for (const diagnosis of diagnoses) {
      if (diagnosis.physicalProviderCallCount === 1) addModelPair(events, "source_diagnosis", `enh:${diagnosis.questionId}`, 1, diagnosis.state === "completed" ? "completed" : "failed");
      events.push(ev("checkpoint_terminal", "source_diagnosis", diagnosis.identityHash, 0, "observed", { checkpointHash: diagnosis.terminalFingerprint, state: diagnosis.state }));
    }
    addArtifact(events, "enhancement_html", authority.enhancementArtifact!);
  }
  events.push(ev("commerce_fingerprint", "commerce", "commerce-final", 0, "observed", { fingerprint: finalFingerprint }));
  resequence(events);
  return { scenario, authority, events };
}

function addSitePair(events: ReportV4AcceptanceEvent[], read: ReportV4AcceptanceSemanticAuthority["allowedSiteReads"][number] & { terminalPhase?: "completed" | "failed" }): void {
  const operation = read.mode === "raw" ? "site_raw_read" : "site_browser_read";
  events.push(ev("site_read", operation, read.unitId, read.attempt, "started", siteDetails(read.mode, read.urlHash)));
  events.push(ev("site_read", operation, read.unitId, read.attempt, read.terminalPhase ?? "completed", siteDetails(read.mode, read.urlHash)));
}
function addModelPair(events: ReportV4AcceptanceEvent[], operation: string, unitId: string, attempt: 1 | 2, terminal: "completed" | "failed"): void {
  events.push(model(operation, unitId, attempt, "started")); events.push(model(operation, unitId, attempt, terminal));
}
function addArtifact(events: ReportV4AcceptanceEvent[], operation: "core_html" | "enhancement_html", artifact: { revisionId: string; htmlSha256: string }): void {
  const details = { artifactRevisionId: artifact.revisionId, htmlSha256: artifact.htmlSha256 };
  events.push(ev("html_assembly", operation, artifact.revisionId, 0, "started", details));
  events.push(ev("html_assembly", operation, artifact.revisionId, 0, "completed", details));
  events.push(ev("artifact_activation", "artifact_activation", artifact.revisionId, 0, "observed", details));
}
function model(operation: string, unitId: string, attempt: 0 | 1 | 2, phase: string, providerCall = true, budgetOutcome: "allowed" | "rejected" = "allowed", inputTokens = 10, outputTokens = 5): ReportV4AcceptanceEvent {
  return ev("model_operation", operation, unitId, attempt, phase, { providerCall, retry: attempt === 2, budgetOutcome, inputTokens, outputTokens });
}
function ev(kind: string, operation: string, unitId: string, attempt: 0 | 1 | 2, phase: string, details: Record<string, unknown>): ReportV4AcceptanceEvent {
  return { idempotencyKey: hash(`${kind}-${operation}-${unitId}-${attempt}-${phase}`), sessionId: "11111111-1111-4111-8111-111111111111", scenarioId: "", sequence: 0,
    kind, operation, unitId, attempt, phase, details, detailsCanonical: JSON.stringify(details), prevHash: hash("prev"), eventHash: hash("event"),
    occurredAt: new Date(BASE), occurredAtCanonical: "2026-07-17T00:00:00.000000Z" } as ReportV4AcceptanceEvent;
}
function resequence(events: ReportV4AcceptanceEvent[]): void { events.forEach((event, index) => { const mutable = event as Mutable<ReportV4AcceptanceEvent>; mutable.sequence = index + 1; mutable.scenarioId = scenarioIdFor(events); mutable.occurredAt = new Date(BASE + (index + 1) * 1_000); }); }
function scenarioIdFor(events: ReportV4AcceptanceEvent[]): string { const fault = events.find((event) => event.kind === "fault_injection"); return fault?.operation === "question_failure" ? "scenario-question_failure" : fault?.operation === "diagnosis_failure" ? "scenario-diagnosis_failure" : "scenario-success"; }
function crawlDetails() { return { candidatePages: 2, analyzablePages: 1, excludedPages: 1, jsDependentPages: 0 }; }
function zeroCrawlDetails() { return { candidatePages: 0, analyzablePages: 0, excludedPages: 0, jsDependentPages: 0 }; }
function siteDetails(readMode: "raw" | "browser", urlHash: string) { return { urlHash, readMode, networkPerformed: true }; }
function find(fixture: Fixture, kind: string, unitId: string, phase?: string, attempt?: number, operation?: string): Mutable<ReportV4AcceptanceEvent> {
  const event = fixture.events.find((candidate) => candidate.kind === kind && candidate.unitId === unitId && (phase === undefined || candidate.phase === phase)
    && (attempt === undefined || candidate.attempt === attempt) && (operation === undefined || candidate.operation === operation));
  if (!event) throw new Error(`fixture event missing ${kind}/${unitId}/${phase ?? "*"}`); return event as Mutable<ReportV4AcceptanceEvent>;
}
function remove(fixture: Fixture, kind: string, unitId: string, phase?: string): void { fixture.events = fixture.events.filter((event) => !(event.kind === kind && event.unitId === unitId && (phase === undefined || event.phase === phase))); resequence(fixture.events); }
function patchDetails(event: Mutable<ReportV4AcceptanceEvent>, patch: Record<string, unknown>): void { event.details = { ...event.details as Record<string, unknown>, ...patch } as ReportV4AcceptanceEvent["details"]; }
function verify(fixture: Fixture) { return verifyReportV4AcceptanceScenarioSemantics(fixture); }
function verifyIssues(fixture: Fixture): readonly string[] { try { verify(fixture); throw new Error("expected semantic failure"); } catch (error) { expect(error).toBeInstanceOf(ReportV4AcceptanceSemanticVerificationError); return (error as ReportV4AcceptanceSemanticVerificationError).issues; } }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
