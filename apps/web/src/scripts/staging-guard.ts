import type { DeploymentProfile } from "@/security/deployment-policy";
import { assertStagingCommandEnvironment } from "@/security/deployment-policy";

export interface StagingStartupSummary {
  profile: "staging";
  databaseFingerprint: string;
  commerceMode: string;
  fulfillmentMode: string;
}

export async function prepareStagingCommand(options: {
  environment?: NodeJS.ProcessEnv;
  ensureDatabase: () => Promise<void>;
  getDatabaseStatus: () => Promise<{ profile: DeploymentProfile; fingerprint: string }>;
}): Promise<StagingStartupSummary> {
  const environment = options.environment ?? process.env;
  assertStagingCommandEnvironment(environment);
  await options.ensureDatabase();
  const database = await options.getDatabaseStatus();
  if (database.profile !== "staging") {
    throw new Error("The staging command is connected to a non-staging database.");
  }
  return {
    profile: "staging",
    databaseFingerprint: database.fingerprint,
    commerceMode: environment.COMMERCE_MODE?.trim() || "disabled",
    fulfillmentMode: environment.FULFILLMENT_MODE?.trim() || "batch_24h"
  };
}
