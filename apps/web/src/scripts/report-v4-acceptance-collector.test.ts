import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type {
  ReportV4AcceptanceLedgerStore,
  ReportV4AcceptanceScenario,
  ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";
import { ReportV4AcceptanceLedgerVerificationError } from "../report-v4/acceptance-ledger-verifier";
import { createReportV4AcceptanceCollector } from "./report-v4-acceptance-collector";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  OGC_DEPLOYMENT_PROFILE: "staging",
  VERCEL_ENV: "preview",
  COMMERCE_MODE: "test",
  DATABASE_URL: "postgres://secret-value"
};

describe("Report V4 acceptance collector", () => {
  it("asserts protected staging before any read", async () => {
    const store = readStore();
    const collector = createReportV4AcceptanceCollector(store, { ...ENVIRONMENT, VERCEL_ENV: "production" });
    await expect(collector.collect(SESSION_ID)).rejects.toThrow(/protected|staging|Preview/iu);
    expect(store.loadSession).not.toHaveBeenCalled();
  });

  it("loads only the requested ledger, calls the pure verifier, and returns machine JSON data", async () => {
    const store = readStore();
    const verify = vi.fn(() => ({ valid: true as const, sessionId: SESSION_ID, scenarioCount: 3 as const, eventCount: 0, headHash: "0".repeat(64) }));
    const result = await createReportV4AcceptanceCollector(store, ENVIRONMENT, verify).collect(SESSION_ID);
    expect(store.loadSession).toHaveBeenCalledWith(SESSION_ID);
    expect(store.loadScenarios).toHaveBeenCalledWith(SESSION_ID);
    expect(store.loadEvents).toHaveBeenCalledWith(SESSION_ID);
    expect(verify).toHaveBeenCalledWith(expect.objectContaining({ sessionId: SESSION_ID }), expect.any(Array), expect.any(Array));
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      contract: "report-v4-acceptance-ledger-evidence/v1",
      verification: { valid: true, scenarioCount: 3 },
      session: { sessionId: SESSION_ID }
    });
    expect(JSON.stringify(result)).not.toContain("secret-value");
  });

  it("is fail-closed for a missing, unsealed, incomplete, or broken ledger", async () => {
    const missing = readStore();
    vi.mocked(missing.loadSession).mockResolvedValue(null);
    await expect(createReportV4AcceptanceCollector(missing, ENVIRONMENT).collect(SESSION_ID)).rejects.toThrow(/not found/iu);

    const incomplete = readStore();
    await expect(createReportV4AcceptanceCollector(incomplete, ENVIRONMENT).collect(SESSION_ID))
      .rejects.toBeInstanceOf(ReportV4AcceptanceLedgerVerificationError);
  });

  it("contains no mutation, deployment, payment, email, browser, production-access, or Worker path", () => {
    const source = readFileSync(fileURLToPath(new URL("./report-v4-acceptance-collector.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/createSession|createScenario|bindScenario|sealSession|failSession|appendEvent/u);
    expect(source).not.toMatch(/vercel\s+(deploy|alias)|payment|refund|email|browser|playwright|production-worker|worker\//iu);
    expect(source).not.toMatch(/DATABASE_URL/u);
  });
});

function readStore(): ReportV4AcceptanceLedgerStore {
  return {
    createSession: vi.fn(),
    createScenario: vi.fn(),
    bindFaultSource: vi.fn(),
    bindPreAdmissionJob: vi.fn(),
    bindScenario: vi.fn(),
    appendEvent: vi.fn(),
    sealScenario: vi.fn(),
    failScenario: vi.fn(),
    sealSession: vi.fn(),
    failSession: vi.fn(),
    loadSession: vi.fn(async () => session()),
    loadScenarios: vi.fn(async () => scenarios()),
    loadCollectingScenarioByJob: vi.fn(),
    loadEvents: vi.fn(async () => [])
  };
}

function session(): ReportV4AcceptanceSession {
  return {
    sessionId: SESSION_ID,
    environment: "protected_staging",
    previewDeploymentId: "dpl-preview-1",
    protectedAliasUrl: "https://preview.example",
    webGitSha: "a".repeat(40),
    workerGitSha: "a".repeat(40),
    state: "collecting",
    headSequence: 0,
    headHash: "0".repeat(64),
    eventCount: 0,
    startedAt: new Date("2026-07-17T00:00:00.000Z"),
    terminalAt: null
  };
}

function scenarios(): readonly ReportV4AcceptanceScenario[] {
  return ["success", "diagnosis_failure", "question_failure"].map((kind, index) => ({
    sessionId: SESSION_ID,
    scenarioId: `${index + 2}1111111-1111-4111-8111-111111111111`,
    reportId: null,
    orderId: null,
    preAdmissionJobId: null,
    coreJobId: null,
    enhancementJobId: null,
    siteSnapshotId: null,
    configSnapshotId: null,
    questionSetId: null,
    coreArtifactRevisionId: null,
    enhancementArtifactRevisionId: null,
    kind: kind as ReportV4AcceptanceScenario["kind"],
    faultKind: kind === "success" ? "independent_source_read_failure" : kind as ReportV4AcceptanceScenario["faultKind"],
    faultQuestionId: `question-${kind}`,
    faultSourceId: null,
    expectedFaultOccurrences: kind === "success" ? 1 : 2,
    baselineFingerprint: null,
    finalFingerprint: null,
    state: "collecting" as const,
    createdAt: new Date("2026-07-17T00:00:00.000Z"),
    terminalAt: null
  }));
}
