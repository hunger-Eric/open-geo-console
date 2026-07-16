import { closeDatabase } from "../db";
import { importLegacySqliteDatabase } from "../db/sqlite-import";

const sourcePath = readStringFlag(process.argv.slice(2), "--source");
if (!sourcePath) {
  process.stderr.write("Usage: npm run db:migrate:sqlite -- --source <path-to-open-geo-console.sqlite>\n");
  process.exitCode = 1;
} else {
  try {
    const result = await importLegacySqliteDatabase(sourcePath);
    process.stdout.write(
      `Imported ${result.reportsImported} report(s) and ${result.botEvidenceImported} bot evidence record(s). Re-running this command is safe.\n`
    );
  } finally {
    await closeDatabase();
  }
}

function readStringFlag(values: string[], name: string): string | undefined {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}
