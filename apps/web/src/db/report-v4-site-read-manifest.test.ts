import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createReportV4AcceptanceSiteReadManifestRepository,
  hashReportV4AcceptanceSiteReadUrl,
  loadReportV4AcceptanceSiteReadManifestAuthority,
  loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction,
  projectReportV4AcceptanceSiteReadManifestAuthority,
  reportV4AcceptanceSiteReadIdentityHash,
  reportV4AcceptanceSiteReadPairBindingHash,
  type LoadReportV4AcceptanceSiteReadManifestAuthorityInput,
  type ReportV4AcceptanceSiteReadManifestEntry,
  type ReportV4AcceptanceSiteReadManifestStore
} from "./report-v4-site-read-manifest";

const environment = { VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" } as NodeJS.ProcessEnv;
const sessionId = "11111111-1111-4111-8111-111111111111";
const scenarioId = "22222222-2222-4222-8222-222222222222";

// @requirement GEO-V4-ACCEPT-01
describe("Report V4 protected-acceptance site-read manifest", () => {
  it("canonicalizes and hashes the raw URL before persistence without exposing sensitive input", async () => {
    const store = fakeStore();
    const repository = createReportV4AcceptanceSiteReadManifestRepository(store, environment);
    const rawUrl = "HTTPS://Example.COM:443/source?q=secret-token#fragment";
    await repository.begin({ sessionId, scenarioId, reportId: "report-1", jobId: "job-1",
      scope: "enhancement_source", purpose: "source", rawUrl, mode: "raw", attempt: 1,
      ownerQuestionId: "question-1", ownerSourceId: "source-1" });

    const persisted = store.begin.mock.calls[0]![0] as Record<string, unknown>;
    expect(persisted.urlHash).toBe(hashReportV4AcceptanceSiteReadUrl("https://example.com/source?q=secret-token"));
    expect(persisted).not.toHaveProperty("rawUrl");
    expect(JSON.stringify(persisted)).not.toContain("secret-token");
    expect(persisted.identityHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted.pairBindingHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("domain-separates identity and pair hashes while pairing raw/browser across owner labels", () => {
    const base = { sessionId, scenarioId, reportId: "report-1", jobId: "enhancement-1",
      scope: "enhancement_source" as const, purpose: "source" as const,
      urlHash: "a".repeat(64), attempt: 1 as const };
    const rawFirst = { ...base, mode: "raw" as const, ownerQuestionId: "question-1", ownerSourceId: "source-1" };
    const browserOtherOwner = { ...base, mode: "browser" as const, ownerQuestionId: "question-2", ownerSourceId: "source-2" };
    expect(reportV4AcceptanceSiteReadPairBindingHash(rawFirst))
      .toBe(reportV4AcceptanceSiteReadPairBindingHash(browserOtherOwner));
    expect(reportV4AcceptanceSiteReadIdentityHash(rawFirst))
      .not.toBe(reportV4AcceptanceSiteReadIdentityHash(browserOtherOwner));
    expect(reportV4AcceptanceSiteReadIdentityHash(rawFirst))
      .not.toBe(reportV4AcceptanceSiteReadPairBindingHash(rawFirst));
  });

  it("validates exact scope, purpose, attempt, owner, mode, hashes, and protected preview policy", async () => {
    const store = fakeStore();
    const repository = createReportV4AcceptanceSiteReadManifestRepository(store, environment);
    const admission = { sessionId, scenarioId, reportId: "report-1", jobId: "pre-1",
      scope: "admission_page" as const, purpose: "page" as const,
      rawUrl: "https://example.com/", mode: "raw" as const, attempt: 0 as const };
    await repository.begin(admission);
    await expect(repository.begin({ ...admission, purpose: "source" } as never)).rejects.toThrow(/scope.*purpose.*attempt.*owner/i);
    await expect(repository.begin({ ...admission, ownerQuestionId: "q" } as never)).rejects.toThrow(/fields/i);
    await expect(repository.begin({ ...admission, mode: "cache" } as never)).rejects.toThrow(/mode/i);
    await expect(repository.begin({ ...admission, rawUrl: "https://user:password@example.com/" })).rejects.toThrow(/credentials/i);
    await expect(repository.terminalize({ sessionId, scenarioId, identityHash: "x", terminalPhase: "completed" }))
      .rejects.toThrow(/hash/i);
    await expect(repository.terminalize({ sessionId, scenarioId, identityHash: "a".repeat(64), terminalPhase: "observed" as never }))
      .rejects.toThrow(/completed or failed/i);

    const production = createReportV4AcceptanceSiteReadManifestRepository(store, {
      VERCEL_ENV: "production", OGC_DEPLOYMENT_PROFILE: "production", COMMERCE_MODE: "live"
    } as NodeJS.ProcessEnv);
    await expect(production.begin(admission)).rejects.toThrow(/protected staging preview/i);
    await expect(production.loadScenarioManifest({ sessionId, scenarioId })).rejects.toThrow(/protected staging preview/i);
  });

  it("sends deterministic exact replay claims to the store and returns only hash-safe rows", async () => {
    const calls: Record<string, unknown>[] = [];
    const store = fakeStore();
    store.begin.mockImplementation(async (input: Record<string, unknown>) => {
      calls.push(input);
      return { entry: entry(input), inserted: calls.length === 1 };
    });
    const repository = createReportV4AcceptanceSiteReadManifestRepository(store, environment);
    const input = { sessionId, scenarioId, reportId: "report-1", jobId: "pre-1",
      scope: "admission_discovery" as const, purpose: "robots" as const,
      rawUrl: "https://example.com/robots.txt#ignored", mode: "raw" as const, attempt: 0 as const };
    const first = await repository.begin(input);
    const replay = await repository.begin(input);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(first.inserted).toBe(true);
    expect(replay.inserted).toBe(false);
    expect(replay.entry).not.toHaveProperty("rawUrl");
    expect(Object.keys(replay.entry).sort()).toEqual([
      "attempt", "identityHash", "jobId", "mode", "networkPerformed", "ownerQuestionId", "ownerSourceId",
      "pairBindingHash", "purpose", "reportId", "scenarioId", "scope", "sessionId", "startedAt",
      "terminalAt", "terminalPhase", "urlHash"
    ].sort());
  });

  it("projects every terminal and started-only row into one deterministic hash-safe authority", () => {
    const raw = manifestEntry({ mode: "raw", terminalPhase: "completed", terminalAt: new Date("2026-07-17T00:00:02.000Z") });
    const browser = manifestEntry({ mode: "browser", terminalPhase: null, terminalAt: null });
    const first = projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [browser, raw]);
    const replay = projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [raw, browser]);

    expect(replay).toEqual(first);
    expect(first.requiredIdentityHashes).toEqual([raw.identityHash]);
    expect(first.allowedIdentityHashes).toEqual([browser.identityHash, raw.identityHash].sort());
    expect(first.records.map((record) => record.semanticState).sort()).toEqual(["started_only", "terminal"]);
    expect(first.records.every((record) => record.reportIdHash === sha("report-1") && record.jobIdHash === sha("pre-1"))).toBe(true);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toMatch(/https?:|rawUrl|<html|secret-token/iu);
    expect(first.authorityHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it.each([
    ["stored identity", { identityHash: "f".repeat(64) }],
    ["stored pair", { pairBindingHash: "e".repeat(64) }],
    ["owner", { ownerQuestionId: "question-1" }],
    ["attempt", { attempt: 1 }],
    ["mode", { mode: "cache" }],
    ["scope", { scope: "unknown" }],
    ["purpose", { purpose: "source" }],
    ["report scope", { reportId: "other-report" }],
    ["job scope", { jobId: "other-job" }]
  ])("fails closed for a tampered %s row", (_label, change) => {
    expect(() => projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [
      { ...manifestEntry(), ...change } as never
    ])).toThrow();
  });

  it("rejects missing/extra row fields and invalid raw/browser pair cardinality", () => {
    const row = manifestEntry();
    const missing = { ...row } as Partial<ReportV4AcceptanceSiteReadManifestEntry>;
    delete missing.terminalAt;
    expect(() => projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [missing as never])).toThrow(/fields/i);
    expect(() => projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [{ ...row, rawUrl: "https://secret.example" } as never]))
      .toThrow(/fields/i);
    expect(() => projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [row, row])).toThrow(/duplicate|pair/i);
  });

  it("requires exactly one raw row per pair and permits browser fallback only after terminal raw", () => {
    const rawStarted = manifestEntry();
    const rawTerminal = manifestEntry({ terminalPhase: "failed", terminalAt: new Date("2026-07-17T00:00:02.000Z") });
    const browser = manifestEntry({ mode: "browser" });

    expect(projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [rawStarted]).records[0]?.semanticState)
      .toBe("started_only");
    expect(() => projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [browser]))
      .toThrow(/raw.*cardinality/i);
    expect(() => projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [rawStarted, browser]))
      .toThrow(/raw read.*terminalize/i);
    expect(projectReportV4AcceptanceSiteReadManifestAuthority(authorityInput(), [rawTerminal, browser]).records)
      .toHaveLength(2);

    const enhancementInput = authorityInput({ enhancementJobId: "enhancement-1", phase: "final" });
    const firstRaw = enhancementEntry("question-1", "source-1");
    const secondRaw = enhancementEntry("question-2", "source-2");
    expect(firstRaw.identityHash).not.toBe(secondRaw.identityHash);
    expect(firstRaw.pairBindingHash).toBe(secondRaw.pairBindingHash);
    expect(() => projectReportV4AcceptanceSiteReadManifestAuthority(enhancementInput, [firstRaw, secondRaw]))
      .toThrow(/raw.*cardinality/i);
  });

  it("validates exact acceptance binding before accepting even an empty manifest", async () => {
    const exact = authorityTx([], bindingRow());
    const empty = await loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction(exact, authorityInput());
    expect(empty.records).toEqual([]);

    for (const candidate of [
      authorityInput({ reportId: "fake-report" }),
      authorityInput({ preAdmissionJobId: "fake-pre" }),
      authorityInput({ enhancementJobId: "fake-enhancement" })
    ]) {
      await expect(loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction(authorityTx([], bindingRow()), candidate))
        .rejects.toThrow(/exact scenario kind, report, and job binding/i);
    }
    await expect(loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction(
      authorityTx([], bindingRow({ environment: "production" })), authorityInput()))
      .rejects.toThrow(/collecting protected-Staging/i);
  });

  it("enforces exact phase/scenario-kind enhancement topology and binds it into authority identity", () => {
    for (const invalid of [
      authorityInput({ phase: "baseline", scenarioKind: "success", enhancementJobId: "enhancement-1" }),
      authorityInput({ phase: "baseline", scenarioKind: "question_failure", enhancementJobId: "enhancement-1" }),
      authorityInput({ phase: "final", scenarioKind: "question_failure", enhancementJobId: "enhancement-1" }),
      authorityInput({ phase: "final", scenarioKind: "success", enhancementJobId: null }),
      authorityInput({ phase: "final", scenarioKind: "diagnosis_failure", enhancementJobId: null })
    ]) {
      expect(() => projectReportV4AcceptanceSiteReadManifestAuthority(invalid, [])).toThrow(/enhancement job lineage/i);
    }
    const valid = [
      authorityInput({ phase: "baseline", scenarioKind: "success", enhancementJobId: null }),
      authorityInput({ phase: "baseline", scenarioKind: "diagnosis_failure", enhancementJobId: null }),
      authorityInput({ phase: "baseline", scenarioKind: "question_failure", enhancementJobId: null }),
      authorityInput({ phase: "final", scenarioKind: "question_failure", enhancementJobId: null }),
      authorityInput({ phase: "final", scenarioKind: "success", enhancementJobId: "enhancement-1" }),
      authorityInput({ phase: "final", scenarioKind: "diagnosis_failure", enhancementJobId: "enhancement-1" })
    ].map((candidate) => projectReportV4AcceptanceSiteReadManifestAuthority(candidate, []));
    expect(new Set(valid.map(({ authorityHash }) => authorityHash)).size).toBe(valid.length);
  });

  it("opens exactly one RR/RO transaction and does not nest the transaction-scoped loader", async () => {
    const row = manifestEntry({ terminalPhase: "failed", terminalAt: new Date("2026-07-17T00:00:03.000Z") });
    const tx = authorityTx([row], bindingRow());
    const sql = { begin: vi.fn(async (_options: string, work: (inner: typeof tx) => Promise<unknown>) => work(tx)) };
    const authority = await loadReportV4AcceptanceSiteReadManifestAuthority(sql, authorityInput());
    expect(sql.begin).toHaveBeenCalledOnce();
    expect(sql.begin).toHaveBeenCalledWith("isolation level repeatable read read only", expect.any(Function));
    expect(tx.unsafe).toHaveBeenCalledTimes(3);
    expect(authority.requiredIdentityHashes).toEqual([row.identityHash]);
  });
});

function authorityInput(
  overrides: Partial<LoadReportV4AcceptanceSiteReadManifestAuthorityInput> = {}
): LoadReportV4AcceptanceSiteReadManifestAuthorityInput {
  return { sessionId, scenarioId, phase: "baseline", scenarioKind: "success", reportId: "report-1", preAdmissionJobId: "pre-1",
    enhancementJobId: null, ...overrides };
}

function manifestEntry(overrides: Partial<ReportV4AcceptanceSiteReadManifestEntry> = {}): ReportV4AcceptanceSiteReadManifestEntry {
  const base = { sessionId, scenarioId, reportId: "report-1", jobId: "pre-1", scope: "admission_page" as const,
    purpose: "page" as const, urlHash: sha("https://example.com/page"), mode: "raw" as const, attempt: 0 as const,
    ownerQuestionId: null, ownerSourceId: null };
  const merged = { ...base, ...overrides };
  const identityHash = reportV4AcceptanceSiteReadIdentityHash(merged);
  const pairBindingHash = reportV4AcceptanceSiteReadPairBindingHash(merged);
  return { ...merged, identityHash, pairBindingHash, networkPerformed: true, terminalPhase: null,
    startedAt: new Date("2026-07-17T00:00:00.000Z"), terminalAt: null, ...overrides } as ReportV4AcceptanceSiteReadManifestEntry;
}

function databaseRow(row: ReportV4AcceptanceSiteReadManifestEntry): Record<string, unknown> {
  return { identity_hash: row.identityHash, session_id: row.sessionId, scenario_id: row.scenarioId,
    report_id: row.reportId, job_id: row.jobId, scope: row.scope, purpose: row.purpose, url_hash: row.urlHash,
    mode: row.mode, attempt: row.attempt, pair_binding_hash: row.pairBindingHash,
    owner_question_id: row.ownerQuestionId, owner_source_id: row.ownerSourceId, network_performed: row.networkPerformed,
    terminal_phase: row.terminalPhase, started_at: row.startedAt, terminal_at: row.terminalAt };
}

function enhancementEntry(ownerQuestionId: string, ownerSourceId: string): ReportV4AcceptanceSiteReadManifestEntry {
  return manifestEntry({ jobId: "enhancement-1", scope: "enhancement_source", purpose: "source", attempt: 1,
    ownerQuestionId, ownerSourceId });
}

function bindingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { environment: "protected_staging", session_state: "collecting", scenario_state: "collecting",
    scenario_kind: "success", report_id: "report-1", pre_admission_job_id: "pre-1", enhancement_job_id: null, ...overrides };
}

function authorityTx(entries: readonly ReportV4AcceptanceSiteReadManifestEntry[], binding: Record<string, unknown>) {
  return { unsafe: vi.fn(async (query: string) => {
    if (query.includes("site-read-authority:isolation")) {
      return [{ transaction_isolation: "repeatable read", transaction_read_only: "on" }];
    }
    if (query.includes("site-read-authority:binding")) return [binding];
    if (query.includes("report_v4_acceptance_site_read_manifest")) return entries.map(databaseRow);
    throw new Error(`unexpected query: ${query}`);
  }) };
}

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function fakeStore(): ReportV4AcceptanceSiteReadManifestStore & Record<string, ReturnType<typeof vi.fn>> {
  return { begin: vi.fn(), terminalize: vi.fn(), loadScenarioManifest: vi.fn() } as never;
}

function entry(input: Record<string, unknown>) {
  return { ...input, networkPerformed: true as const, terminalPhase: null, startedAt: new Date("2026-07-17T00:00:00Z"), terminalAt: null } as never;
}
