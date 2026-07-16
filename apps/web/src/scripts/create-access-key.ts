import { createAccessKey } from "../db/credits";
import { closeDatabase } from "../db";

const args = process.argv.slice(2);
const credits = readIntegerFlag(args, "--credits");
const expiresAtValue = readStringFlag(args, "--expires-at");
const expiresAt = expiresAtValue ? new Date(expiresAtValue) : undefined;

if (!credits || (expiresAt && Number.isNaN(expiresAt.getTime()))) {
  process.stderr.write("Usage: npm run access-key:create -- --credits <positive integer> [--expires-at <ISO date>]\n");
  process.exitCode = 1;
} else {
  try {
    const issued = await createAccessKey({ credits, ...(expiresAt ? { expiresAt } : {}) });
    process.stdout.write([
      "Access key created. The raw key is displayed once and is not stored by Open GEO Console.",
      `id=${issued.id}`,
      `prefix=${issued.keyPrefix}`,
      `credits=${issued.credits}`,
      `expiresAt=${issued.expiresAt?.toISOString() ?? "never"}`,
      `key=${issued.rawKey}`
    ].join("\n") + "\n");
  } finally {
    await closeDatabase();
  }
}

function readStringFlag(values: string[], name: string): string | undefined {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}

function readIntegerFlag(values: string[], name: string): number | undefined {
  const parsed = Number(readStringFlag(values, name));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
