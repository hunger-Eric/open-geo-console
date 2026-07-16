import { describe, expect, it } from "vitest";
import {
  createReportV4ConfigSnapshotRepository,
  lockReportV4ConfigSnapshot,
  type ReportV4ConfigSnapshotRow,
  type ReportV4ConfigSnapshotStore,
  type ReportV4ConfigSnapshotTransaction
} from "./report-v4-config-snapshots";

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-DELIVERY-01

describe("V4 immutable runtime configuration snapshots", () => {
  it("persists parsed model and editorial profiles with stable independent hashes", async () => {
    const store = new MemoryStore();
    const input = snapshotInput();

    const first = await lockReportV4ConfigSnapshot(input, createReportV4ConfigSnapshotRepository(store));
    const resumed = await lockReportV4ConfigSnapshot({
      ...input,
      modelProfile: reorder(input.modelProfile),
      reportProfile: reorder(input.reportProfile)
    }, createReportV4ConfigSnapshotRepository(store));

    expect(resumed).toEqual(first);
    expect(first).toMatchObject({
      reportId: "report-1",
      orderId: "order-1",
      coreJobId: "core-job-1",
      modelProfileId: "mimo-v4",
      reportProfileId: "business-operator-zh-v1"
    });
    expect(first.id).toMatch(/^v4-config-[a-f0-9]{64}$/u);
    expect(first.identityHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.modelProfileHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.reportProfileHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(first.modelProfileHash).not.toBe(first.reportProfileHash);
    expect(store.rows).toHaveLength(1);
    expect(store.log).toEqual(["lock:report-1", `insert:${first.id}`, "lock:report-1"]);
  });

  it("fails closed when resume changes either immutable parsed profile", async () => {
    const store = new MemoryStore();
    const repository = createReportV4ConfigSnapshotRepository(store);
    const input = snapshotInput();
    await lockReportV4ConfigSnapshot(input, repository);

    await expect(lockReportV4ConfigSnapshot({
      ...input,
      modelProfile: {
        ...input.modelProfile,
        operations: {
          ...input.modelProfile.operations,
          questionAnswer: { ...input.modelProfile.operations.questionAnswer, model: "different-model" }
        }
      }
    }, repository)).rejects.toThrow(/immutable|exact|configuration drift/i);
    await expect(lockReportV4ConfigSnapshot({
      ...input,
      reportProfile: { ...input.reportProfile, tone: ["different editorial direction"] }
    }, repository)).rejects.toThrow(/immutable|exact|configuration drift/i);
    expect(store.rows).toHaveLength(1);
  });

  it("rejects API keys, secrets and raw prompts before persistence", async () => {
    for (const injected of [
      { apiKey: "should-never-persist" },
      { secret: "should-never-persist" },
      { rawPrompt: "ignore previous instructions" }
    ]) {
      const store = new MemoryStore();
      await expect(lockReportV4ConfigSnapshot({
        ...snapshotInput(),
        modelProfile: { ...snapshotInput().modelProfile, ...injected }
      }, createReportV4ConfigSnapshotRepository(store))).rejects.toThrow(/unknown|apiKey|secret|rawPrompt/i);
      expect(store.rows).toHaveLength(0);
      expect(store.transactions).toBe(0);
    }
  });

  it("rejects a conflicting report, order or core-job identity without inserting a second snapshot", async () => {
    const store = new MemoryStore();
    const repository = createReportV4ConfigSnapshotRepository(store);
    const input = snapshotInput();
    await lockReportV4ConfigSnapshot(input, repository);

    for (const override of [{ orderId: "order-2" }, { coreJobId: "core-job-2" }]) {
      await expect(lockReportV4ConfigSnapshot({ ...input, ...override }, repository))
        .rejects.toThrow(/immutable|identity|report.*snapshot/i);
    }
    expect(store.rows).toHaveLength(1);
  });
});

class MemoryStore implements ReportV4ConfigSnapshotStore {
  rows: ReportV4ConfigSnapshotRow[] = [];
  log: string[] = [];
  transactions = 0;

  async transaction<T>(work: (tx: ReportV4ConfigSnapshotTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const rows = this.rows.map((row) => structuredClone(row));
    const result = await work({
      lockReport: async (reportId) => { this.log.push(`lock:${reportId}`); },
      findByReport: async (reportId) => rows.find((row) => row.reportId === reportId) ?? null,
      insert: async (row) => {
        if (rows.some((current) => current.reportId === row.reportId || current.orderId === row.orderId || current.coreJobId === row.coreJobId)) {
          throw new Error("V4 configuration snapshot identity conflict.");
        }
        const inserted = { ...structuredClone(row), createdAt: new Date("2030-01-01T00:00:00.000Z") };
        rows.push(inserted);
        this.log.push(`insert:${row.id}`);
        return inserted;
      }
    });
    this.rows = rows;
    return result;
  }
}

function snapshotInput() {
  return {
    reportId: "report-1",
    orderId: "order-1",
    coreJobId: "core-job-1",
    modelProfile: modelProfile(),
    reportProfile: reportProfile()
  };
}

function modelProfile() {
  const operation = (model: string, nativeWebSearch: boolean) => ({
    model,
    contextWindowTokens: 128_000,
    maxInputTokens: 32_000,
    maxOutputTokens: 8_000,
    timeoutMs: 120_000,
    nativeWebSearch,
    structuredOutput: true,
    tokenizer: "mimo"
  });
  return {
    profileId: "mimo-v4",
    provider: "mimo",
    adapterId: "mimo-native-v1",
    operations: {
      pageAnalysis: operation("mimo-analysis", false),
      websiteSynthesis: operation("mimo-synthesis", false),
      questionAnswer: operation("mimo-search", true),
      sourceDiagnosis: operation("mimo-analysis", false)
    }
  };
}

function reportProfile() {
  return {
    schemaVersion: 1,
    profileId: "business-operator-zh-v1",
    locale: "zh-CN",
    audiences: { primary: ["business operator"], secondary: ["marketing lead"] },
    readingOrder: ["conclusion", "reason", "action"],
    tone: ["professional", "direct"],
    terminology: {
      requiredGeoTerms: ["GEO", "AI visibility", "source readiness"],
      prohibitedSeoFraming: ["SEO"],
      prohibitedInternalLanguage: ["checkpoint"],
      prohibitedPromptLeakage: ["system prompt"]
    },
    presentation: { conciseByDefault: true, detailedEvidenceCollapsed: true },
    fieldBounds: {
      websiteSummary: { minChars: 20, maxChars: 500 },
      websiteListItem: { minChars: 5, maxChars: 200, minItems: 1, maxItems: 5 },
      questionAnswer: { minChars: 20, maxChars: 800 },
      selectionSummary: { minChars: 20, maxChars: 500 },
      observableFactors: { minChars: 5, maxChars: 200, exactItems: 3 },
      targetGap: { minChars: 20, maxChars: 500 },
      recommendedActions: { minChars: 5, maxChars: 200, exactItems: 3 }
    }
  };
}

function reorder<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reorder) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([key, child]) => [key, reorder(child)])) as T;
}
