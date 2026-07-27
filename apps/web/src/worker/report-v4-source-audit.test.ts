import { describe, expect, it, vi } from "vitest";
import type { CombinedGeoReportV4Question, CombinedGeoReportV4Source } from "@open-geo-console/ai-report-engine";
import {
  auditReportV4Sources,
  type ReportV4SourceAuditDependencies,
  type ReportV4SourceAuditRead
} from "./report-v4-source-audit";

// @requirement GEO-V4-SOURCE-01
// @requirement GEO-V4-SOURCE-02

function source(questionId: string, index: number): CombinedGeoReportV4Source {
  return {
    questionId,
    sourceId: `${questionId}-source-${index}`,
    title: `${questionId} source ${index}`,
    canonicalUrl: `https://${questionId}.example/source-${index}`,
    citedText: `${questionId} cited text ${index}`,
    retrievalStatus: "not_checked"
  };
}

function question(questionId: string, order: 1 | 2 | 3, sourceCount = 2): CombinedGeoReportV4Question {
  return {
    questionId,
    order,
    questionText: `${questionId} text`,
    status: "answered",
    answer: `${questionId} original answer`,
    sources: Array.from({ length: sourceCount }, (_, index) => source(questionId, index + 1))
  };
}

function dependencies(overrides: Partial<ReportV4SourceAuditDependencies> = {}): ReportV4SourceAuditDependencies {
  return {
    readRawSource: vi.fn(async (): Promise<ReportV4SourceAuditRead> => ({ status: "available", summary: " raw summary " })),
    renderBrowserSource: vi.fn(async (): Promise<ReportV4SourceAuditRead> => ({ status: "available", summary: " browser summary " })),
    ...overrides
  };
}

describe("V4 question-owned source audit", () => {
  it("audits only each question's own persisted sources without creating a cross-question pool", async () => {
    const questions = [question("question-1", 1), question("question-2", 2), question("question-3", 3, 0)] as const;
    const seen: Array<{ questionId: string; sourceId: string }> = [];
    const deps = dependencies({
      readRawSource: vi.fn(async (value) => {
        seen.push({ questionId: value.questionId, sourceId: value.sourceId });
        return { status: "available", summary: `${value.questionId} summary` };
      })
    });

    const results = await auditReportV4Sources(questions, deps);

    expect(seen).toEqual([
      { questionId: "question-1", sourceId: "question-1-source-1" },
      { questionId: "question-1", sourceId: "question-1-source-2" },
      { questionId: "question-2", sourceId: "question-2-source-1" },
      { questionId: "question-2", sourceId: "question-2-source-2" }
    ]);
    expect(results[0]!.sourceAudits.every((audit) => audit.questionId === "question-1")).toBe(true);
    expect(results[1]!.sourceAudits.every((audit) => audit.questionId === "question-2")).toBe(true);
    expect(results[0]!.sourceAudits.some((audit) => audit.canonicalUrl.includes("question-2"))).toBe(false);
  });

  it("keeps the original answer, source URL and label when independent retrieval fails", async () => {
    const original = question("question-1", 1, 1);
    const deps = dependencies({
      readRawSource: vi.fn(async () => { throw new Error("source timed out"); })
    });

    const [result] = await auditReportV4Sources([original], deps);

    expect(result!.question).toBe(original);
    expect(result!.question.answer).toBe("question-1 original answer");
    expect(result!.question.sources[0]).toMatchObject({
      title: "question-1 source 1",
      canonicalUrl: "https://question-1.example/source-1"
    });
    expect(result!.sourceAudits).toEqual([{
      questionId: "question-1",
      sourceId: "question-1-source-1",
      canonicalUrl: "https://question-1.example/source-1",
      status: "inaccessible"
    }]);
    expect(deps.renderBrowserSource).not.toHaveBeenCalled();
  });

  it("uses at most one raw read and one browser fallback per source while preserving the signal", async () => {
    const controller = new AbortController();
    const original = question("question-1", 1, 1);
    const deps = dependencies({
      readRawSource: vi.fn(async () => ({ status: "insufficient" })),
      renderBrowserSource: vi.fn(async () => ({ status: "available", summary: "browser evidence" }))
    });

    const [result] = await auditReportV4Sources([original], deps, controller.signal);

    expect(deps.readRawSource).toHaveBeenCalledTimes(1);
    expect(deps.readRawSource).toHaveBeenCalledWith(original.sources[0], controller.signal);
    expect(deps.renderBrowserSource).toHaveBeenCalledTimes(1);
    expect(deps.renderBrowserSource).toHaveBeenCalledWith(original.sources[0], controller.signal);
    expect(result!.sourceAudits[0]).toMatchObject({ status: "available", summary: "browser evidence" });
  });

  it("does not launch a browser after an available or explicitly inaccessible raw result", async () => {
    const deps = dependencies({
      readRawSource: vi.fn(async (value) => value.sourceId.endsWith("-1")
        ? { status: "available" as const, summary: "available" }
        : { status: "inaccessible" as const })
    });

    const [result] = await auditReportV4Sources([question("question-1", 1, 2)], deps);

    expect(deps.readRawSource).toHaveBeenCalledTimes(2);
    expect(deps.renderBrowserSource).not.toHaveBeenCalled();
    expect(result!.sourceAudits.map(({ status }) => status)).toEqual(["available", "inaccessible"]);
  });

  it("contains browser/source-local failures and continues auditing the remaining questions", async () => {
    const deps = dependencies({
      readRawSource: vi.fn(async (value) => value.questionId === "question-1"
        ? { status: "insufficient" as const }
        : { status: "available" as const, summary: "second question remains available" }),
      renderBrowserSource: vi.fn(async () => { throw new Error("browser failed"); })
    });

    const results = await auditReportV4Sources([
      question("question-1", 1, 1),
      question("question-2", 2, 1)
    ], deps);

    expect(results[0]!.sourceAudits[0]!.status).toBe("inaccessible");
    expect(results[1]!.sourceAudits[0]).toMatchObject({
      status: "available",
      summary: "second question remains available"
    });
    expect(results[0]!.question.answer).toBe("question-1 original answer");
    expect(results[1]!.question.answer).toBe("question-2 original answer");
  });

  it("never audits more than five persisted sources for one question", async () => {
    const deps = dependencies();
    const overBound = question("question-1", 1, 7);

    const [result] = await auditReportV4Sources([overBound], deps);

    expect(deps.readRawSource).toHaveBeenCalledTimes(5);
    expect(result!.sourceAudits).toHaveLength(5);
    expect(result!.question).toBe(overBound);
  });

  it("propagates a caller abort instead of misreporting it as source inaccessibility", async () => {
    const controller = new AbortController();
    const reason = new Error("Worker deadline reached");
    const deps = dependencies({
      readRawSource: vi.fn(async (_source, signal) => {
        controller.abort(reason);
        throw signal!.reason;
      })
    });

    await expect(auditReportV4Sources([question("question-1", 1, 1)], deps, controller.signal)).rejects.toBe(reason);
    expect(deps.readRawSource).toHaveBeenCalledTimes(1);
    expect(deps.renderBrowserSource).not.toHaveBeenCalled();
  });

  it("rejects the exact caller reason when raw resolves after abort and does not audit a later source", async () => {
    const controller = new AbortController();
    const reason = new Error("Worker deadline reached during raw source read");
    const deps = dependencies({
      readRawSource: vi.fn(async () => {
        controller.abort(reason);
        return { status: "available", summary: "must be discarded" };
      })
    });

    await expect(auditReportV4Sources([question("question-1", 1, 1)], deps, controller.signal)).rejects.toBe(reason);
    expect(deps.readRawSource).toHaveBeenCalledTimes(1);
    expect(deps.renderBrowserSource).not.toHaveBeenCalled();
  });

  it("rejects the exact caller reason when browser resolves after abort and does not audit a later source", async () => {
    const controller = new AbortController();
    const reason = new Error("Worker deadline reached during browser source read");
    const deps = dependencies({
      readRawSource: vi.fn(async () => ({ status: "insufficient" })),
      renderBrowserSource: vi.fn(async () => {
        controller.abort(reason);
        return { status: "available", summary: "must be discarded" };
      })
    });

    await expect(auditReportV4Sources([question("question-1", 1, 1)], deps, controller.signal)).rejects.toBe(reason);
    expect(deps.readRawSource).toHaveBeenCalledTimes(1);
    expect(deps.renderBrowserSource).toHaveBeenCalledTimes(1);
  });

  it("emits no provider causal claim, qualification or snapshot fields", async () => {
    const [result] = await auditReportV4Sources([question("question-1", 1, 1)], dependencies());
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(/providerClaim|qualification|snapshot|causalClaim/i);
  });
});
