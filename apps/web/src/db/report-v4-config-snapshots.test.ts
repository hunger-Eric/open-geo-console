import { describe, expect, it } from "vitest";
import {
  createReportV4ConfigSnapshotRepository,
  createPostgresReportV4ConfigSnapshotStore,
  getReportV4ConfigSnapshotById,
  lockReportV4ConfigSnapshot,
  type ReportV4ConfigSnapshotPostgresDatabase,
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

  it("loads an exact deeply frozen snapshot by id and returns null when it is absent", async () => {
    const store = new MemoryStore();
    const repository = createReportV4ConfigSnapshotRepository(store);
    const locked = await lockReportV4ConfigSnapshot(snapshotInput(), repository);

    const loaded = await getReportV4ConfigSnapshotById(locked.id, repository);
    expect(loaded).toEqual(locked);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded?.modelProfile)).toBe(true);
    expect(Object.isFrozen(loaded?.modelProfile.operations)).toBe(true);
    expect(Object.isFrozen(loaded?.modelProfile.operations.pageAnalysis)).toBe(true);
    expect(Object.isFrozen(loaded?.reportProfile.fieldBounds)).toBe(true);
    expect(JSON.stringify(loaded)).not.toMatch(/api.?key|raw.?provider.?response|raw.?prompt/i);
    expect(await getReportV4ConfigSnapshotById(`v4-config-${"0".repeat(64)}`, repository)).toBeNull();

    expect(() => {
      (loaded!.modelProfile.operations.pageAnalysis as { model: string }).model = "mutated";
    }).toThrow(TypeError);
    loaded!.createdAt.setUTCFullYear(2040);
    expect((await getReportV4ConfigSnapshotById(locked.id, repository))?.createdAt.toISOString())
      .toBe("2030-01-01T00:00:00.000Z");
  });

  it("fails closed on corrupt persisted JSON, hash, id, operation or profile binding", async () => {
    const cases: Array<[string, (row: Record<string, unknown>) => void, RegExp]> = [
      ["JSON", (row) => { row.modelProfile = "{corrupt-json"; }, /model profile|object|persisted/i],
      ["hash", (row) => { row.modelProfileHash = "0".repeat(64); }, /hash|identity|inconsistent|drift/i],
      ["id", (row) => { row.id = `v4-config-${"f".repeat(64)}`; }, /id|identity|drift/i],
      ["operation", (row) => {
        delete ((row.modelProfile as { operations: Record<string, unknown> }).operations).sourceDiagnosis;
      }, /sourceDiagnosis|operation|missing/i],
      ["profile binding", (row) => { row.modelProfileId = "different-profile"; }, /profile identity|inconsistent|drift/i]
    ];

    for (const [label, corrupt, error] of cases) {
      const store = new MemoryStore();
      const repository = createReportV4ConfigSnapshotRepository(store);
      const locked = await lockReportV4ConfigSnapshot(snapshotInput(), repository);
      const row = structuredClone(store.rows[0]!) as unknown as Record<string, unknown>;
      corrupt(row);
      store.forcedReadRow = row as unknown as ReportV4ConfigSnapshotRow;
      await expect(getReportV4ConfigSnapshotById(locked.id, repository), label).rejects.toThrow(error);
    }
  });

  it("keeps production-shaped and memory reads parser-equivalent without current-config fallback", async () => {
    const memory = new MemoryStore();
    const memoryRepository = createReportV4ConfigSnapshotRepository(memory);
    const locked = await lockReportV4ConfigSnapshot(snapshotInput(), memoryRepository);
    const persistedRow = {
      id: locked.id,
      report_id: locked.reportId,
      order_id: locked.orderId,
      core_job_id: locked.coreJobId,
      identity_hash: locked.identityHash,
      model_profile_id: locked.modelProfileId,
      model_profile_hash: locked.modelProfileHash,
      model_profile_payload: structuredClone(locked.modelProfile),
      report_profile_id: locked.reportProfileId,
      report_profile_hash: locked.reportProfileHash,
      report_profile_payload: structuredClone(locked.reportProfile),
      created_at: new Date(locked.createdAt)
    };
    const database: ReportV4ConfigSnapshotPostgresDatabase = {
      transaction: async (work) => work(async (strings, ...values) => {
        const statement = strings.join("?");
        if (!statement.includes("FROM report_v4_config_snapshots WHERE id=")) {
          throw new Error(`Unexpected SQL in parity fixture: ${statement}`);
        }
        return (values[0] === locked.id ? [structuredClone(persistedRow)] : []) as never;
      })
    };
    const productionRepository = createReportV4ConfigSnapshotRepository(
      createPostgresReportV4ConfigSnapshotStore(database)
    );

    expect(await getReportV4ConfigSnapshotById(locked.id, productionRepository))
      .toEqual(await getReportV4ConfigSnapshotById(locked.id, memoryRepository));
    expect(await getReportV4ConfigSnapshotById(`v4-config-${"0".repeat(64)}`, productionRepository)).toBeNull();
  });
});

class MemoryStore implements ReportV4ConfigSnapshotStore {
  rows: ReportV4ConfigSnapshotRow[] = [];
  forcedReadRow: ReportV4ConfigSnapshotRow | undefined;
  log: string[] = [];
  transactions = 0;

  async transaction<T>(work: (tx: ReportV4ConfigSnapshotTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const rows = this.rows.map((row) => structuredClone(row));
    const result = await work({
      lockReport: async (reportId) => { this.log.push(`lock:${reportId}`); },
      findByReport: async (reportId) => rows.find((row) => row.reportId === reportId) ?? null,
      findById: async (id) => structuredClone(this.forcedReadRow ?? rows.find((row) => row.id === id)) ?? null,
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
