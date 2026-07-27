import { closeDatabase, getDatabaseEnvironmentStatus, initializeDatabaseEnvironment } from "@/db";

const operation = process.argv[2];
const profile = process.argv[3];

try {
  const status = operation === "init"
    ? await initializeDatabaseEnvironment(profile === "staging" || profile === "production" ? profile : failProfile())
    : operation === "inspect"
      ? await getDatabaseEnvironmentStatus()
      : failOperation();
  process.stdout.write(`${JSON.stringify(status)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "database_environment_failed" })}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

function failProfile(): never {
  throw new Error("The database profile must be staging or production.");
}

function failOperation(): never {
  throw new Error("Use init <staging|production> or inspect.");
}
