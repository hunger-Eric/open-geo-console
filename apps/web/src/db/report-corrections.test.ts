import { beforeEach, describe, expect, it, vi } from "vitest";

const correctionGuardHarness = vi.hoisted(() => {
  const state = { blockedSite: null as string | null, guardSites: [] as string[], delegatedSites: [] as string[] };
  const blocked = new Error("blocked by correction guard test");
  return {
    state,
    blocked,
    run: vi.fn(async (input: { guardSite: string; delegate: () => Promise<unknown> }) => {
      state.guardSites.push(input.guardSite);
      if (state.blockedSite === input.guardSite) throw blocked;
      state.delegatedSites.push(input.guardSite);
      return input.delegate();
    })
  };
});
const correctionDatabase = vi.hoisted(() => {
  const state = { correctionExists: false };
  const sql = vi.fn(async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("FROM payment_orders orders JOIN scan_jobs")) {
      return [{ payment_status: "paid", fulfillment_status: "completed", refund_status: "not_required", job_stage: "completed", credit_status: "settled" }];
    }
    if (query.includes("FROM report_corrections WHERE order_id")) {
      return state.correctionExists
        ? [{ id: "correction-1", question_set_id: "questions-1", correction_job_id: null, state: "review_required" }]
        : [];
    }
    if (query.includes("max(revision)")) return [{ revision: 0 }];
    return [];
  });
  const begin = vi.fn(async (delegate: (tx: typeof sql) => Promise<unknown>) => delegate(sql));
  Object.assign(sql, { begin });
  return { state, sql, begin, ensureDatabase: vi.fn(), getSqlClient: vi.fn(() => sql) };
});
const correctionDependencies = vi.hoisted(() => ({
  getAiReport: vi.fn(),
  getBusinessQuestionSet: vi.fn(),
  prepareBusinessQuestionCandidates: vi.fn(),
  confirmBusinessQuestions: vi.fn()
}));

vi.mock("@/report-v4/prohibited-operation-guard-runtime", () => ({
  runReportV4GuardedOperation: correctionGuardHarness.run
}));
vi.mock("./index", () => ({
  ensureDatabase: correctionDatabase.ensureDatabase,
  getSqlClient: correctionDatabase.getSqlClient
}));
vi.mock("./ai-reports", () => ({ getAiReport: correctionDependencies.getAiReport }));
vi.mock("./business-questions", () => ({
  getBusinessQuestionSet: correctionDependencies.getBusinessQuestionSet,
  prepareBusinessQuestionCandidates: correctionDependencies.prepareBusinessQuestionCandidates,
  confirmBusinessQuestions: correctionDependencies.confirmBusinessQuestions
}));

import { confirmApprovedReportCorrection, prepareApprovedReportCorrection } from "./report-corrections";

beforeEach(() => {
  vi.clearAllMocks();
  correctionGuardHarness.state.blockedSite = null;
  correctionGuardHarness.state.guardSites.length = 0;
  correctionGuardHarness.state.delegatedSites.length = 0;
  correctionDatabase.state.correctionExists = false;
  correctionDatabase.ensureDatabase.mockResolvedValue(undefined);
  correctionDatabase.begin.mockImplementation(async (delegate: (tx: typeof correctionDatabase.sql) => Promise<unknown>) => delegate(correctionDatabase.sql));
  correctionDependencies.getAiReport.mockResolvedValue({ technicalPayload: {}, payload: { tier: "deep" } });
  correctionDependencies.prepareBusinessQuestionCandidates.mockResolvedValue(questionSet(false));
  correctionDependencies.confirmBusinessQuestions.mockResolvedValue(questionSet(true));
});

describe("approved report correction prohibited-operation guard", () => {
  it.each([
    ["correction_prepare", () => prepareApprovedReportCorrection()],
    ["correction_confirm", () => confirmApprovedReportCorrection({ finalTexts: ["one", "two", "three"], acknowledgedLowConfidence: true })]
  ] as const)("blocks %s before any database or question work", async (site, operation) => {
    correctionGuardHarness.state.blockedSite = site;

    await expect(operation()).rejects.toBe(correctionGuardHarness.blocked);

    expect(correctionGuardHarness.state.guardSites).toEqual([site]);
    expect(correctionGuardHarness.state.delegatedSites).toEqual([]);
    expect(correctionDatabase.ensureDatabase).not.toHaveBeenCalled();
    expect(correctionDatabase.getSqlClient).not.toHaveBeenCalled();
    expect(correctionDatabase.sql).not.toHaveBeenCalled();
    expect(correctionDatabase.begin).not.toHaveBeenCalled();
    expect(correctionDependencies.getAiReport).not.toHaveBeenCalled();
    expect(correctionDependencies.confirmBusinessQuestions).not.toHaveBeenCalled();
  });

  it("delegates correction preparation once and opens one transaction", async () => {
    await expect(prepareApprovedReportCorrection()).resolves.toMatchObject({ correctionId: expect.any(String) });

    expect(correctionGuardHarness.state.guardSites).toEqual(["correction_prepare"]);
    expect(correctionGuardHarness.state.delegatedSites).toEqual(["correction_prepare"]);
    expect(correctionDatabase.ensureDatabase).toHaveBeenCalledTimes(1);
    expect(correctionDatabase.begin).toHaveBeenCalledTimes(1);
  });

  it("delegates correction confirmation once and preserves its transaction failure", async () => {
    correctionDatabase.state.correctionExists = true;
    const failure = new Error("correction confirmation transaction failed");
    correctionDatabase.begin.mockRejectedValueOnce(failure);

    await expect(confirmApprovedReportCorrection({ finalTexts: ["one", "two", "three"], acknowledgedLowConfidence: true })).rejects.toBe(failure);

    expect(correctionGuardHarness.state.guardSites).toEqual(["correction_confirm"]);
    expect(correctionGuardHarness.state.delegatedSites).toEqual(["correction_confirm"]);
    expect(correctionDatabase.ensureDatabase).toHaveBeenCalledTimes(1);
    expect(correctionDatabase.begin).toHaveBeenCalledTimes(1);
  });
});

function questionSet(confirmed: boolean) {
  return {
    id: "questions-1",
    reportId: "a71d7481-c5dc-4e2a-a042-b9be878feab8",
    locale: "en-US",
    contentHash: "questions-hash",
    confirmedAt: confirmed ? "2026-07-17T00:00:00.000Z" : null
  };
}
