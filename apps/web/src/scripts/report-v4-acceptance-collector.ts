import { pathToFileURL } from "node:url";
import { closeDatabase } from "../db";
import {
  createProductionReportV4AcceptanceLedgerRepository,
  createReportV4AcceptanceLedgerRepository,
  type ReportV4AcceptanceLedgerStore
} from "../db/report-v4-acceptance-ledger";
import {
  verifyReportV4AcceptanceLedger,
  type ReportV4AcceptanceLedgerVerification
} from "../report-v4/acceptance-ledger-verifier";
import { assertProtectedStagingCommercePreview } from "../security/deployment-policy";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

type Verifier = typeof verifyReportV4AcceptanceLedger;

export interface ReportV4AcceptanceCollector {
  collect(sessionId: string): Promise<ReportV4AcceptanceEvidence>;
}

export interface ReportV4AcceptanceEvidence {
  readonly contract: "report-v4-acceptance-ledger-evidence/v1";
  readonly verification: ReportV4AcceptanceLedgerVerification;
  readonly session: NonNullable<Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadSession"]>>>;
  readonly scenarios: Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadScenarios"]>>;
  readonly events: Awaited<ReturnType<ReportV4AcceptanceLedgerStore["loadEvents"]>>;
}

export function createReportV4AcceptanceCollector(
  store: ReportV4AcceptanceLedgerStore,
  environment: NodeJS.ProcessEnv = process.env,
  verifier: Verifier = verifyReportV4AcceptanceLedger
): ReportV4AcceptanceCollector {
  const ledger = createReportV4AcceptanceLedgerRepository(store, environment);
  return {
    async collect(rawSessionId) {
      assertProtectedStagingCommercePreview(environment);
      const sessionId = parseSessionId(rawSessionId);
      const session = await ledger.loadSession(sessionId);
      if (!session) throw new Error("The Report V4 acceptance session was not found.");
      const [scenarios, events] = await Promise.all([
        ledger.loadScenarios(sessionId),
        ledger.loadEvents(sessionId)
      ]);
      const verification = verifier(session, scenarios, events);
      return Object.freeze({
        contract: "report-v4-acceptance-ledger-evidence/v1",
        verification,
        session,
        scenarios,
        events
      });
    }
  };
}

function parseSessionId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TypeError("sessionId must be a lowercase UUID.");
  return value;
}

async function main(): Promise<number> {
  try {
    const [sessionId, ...extras] = process.argv.slice(2);
    if (!sessionId || extras.length > 0) throw new TypeError("Usage: report-v4-acceptance-collector <session-uuid>");
    const collector = createReportV4AcceptanceCollector(createProductionReportV4AcceptanceLedgerRepository(process.env), process.env);
    process.stdout.write(`${JSON.stringify(await collector.collect(sessionId))}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Report V4 acceptance collector failed.";
    process.stderr.write(`Report V4 acceptance collector failed: ${message}\n`);
    return 1;
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
