import { pathToFileURL } from "node:url";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { inspectApprovedReportReplacement, prepareApprovedReportReplacement } from "@/db/report-replacement-fulfillments";
import { prepareStagingCommand } from "./staging-guard";

async function main() {
  await prepareStagingCommand({ environment: process.env, ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
  try {
    const command = process.argv[2];
    if (command === "inspect") {
      console.log(JSON.stringify({ ok: true, ...await inspectApprovedReportReplacement() }, null, 2));
      return;
    }
    if (command === "prepare") {
      const authorizationRef = argument("--authorization-ref");
      if (!authorizationRef) throw new Error("--authorization-ref is required.");
      const result = await prepareApprovedReportReplacement({ confirm: process.argv.includes("--confirm"), authorizationRef });
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      return;
    }
    throw new Error("Use inspect or prepare.");
  } finally {
    await closeDatabase();
  }
}

function argument(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Replacement command failed.");
  process.exitCode = 1;
});
