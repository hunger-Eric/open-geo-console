import { closeDatabase } from "../db";
import {
  findReservedTerminalCommercialJobs,
  type ReservedTerminalCommercialJob
} from "../db/credits";
import { pathToFileURL } from "node:url";

export function summarizeDatabaseAudit(violations: ReservedTerminalCommercialJob[]): {
  exitCode: 0 | 1;
  output: string;
} {
  if (violations.length === 0) {
    return {
      exitCode: 0,
      output: "Database audit passed: no terminal commercial job has reserved credit.\n"
    };
  }
  return {
    exitCode: 1,
    output: [
        `Database audit failed: ${violations.length} terminal commercial job(s) still have reserved credit.`,
        ...violations.map(
          (violation) =>
            `job=${violation.jobId} report=${violation.reportId} stage=${violation.stage} reservation=${violation.reservationId}`
        )
      ].join("\n") + "\n"
  };
}

export async function runDatabaseAudit(): Promise<number> {
  try {
    const result = summarizeDatabaseAudit(await findReservedTerminalCommercialJobs());
    (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
    return result.exitCode;
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runDatabaseAudit();
}
