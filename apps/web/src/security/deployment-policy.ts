import { createHash } from "node:crypto";

export type DeploymentProfile = "staging" | "production";

export class DeploymentPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentPolicyError";
  }
}

type Environment = Readonly<Partial<NodeJS.ProcessEnv>>;

export function readDeploymentProfile(environment: Environment = process.env): DeploymentProfile {
  const value = environment.OGC_DEPLOYMENT_PROFILE?.trim();
  if (value === "staging" || value === "production") return value;
  throw new DeploymentPolicyError("OGC_DEPLOYMENT_PROFILE must be staging or production.");
}

export function assertDeploymentRuntime(environment: Environment = process.env): DeploymentProfile {
  const profile = readDeploymentProfile(environment);
  const vercelEnvironment = environment.VERCEL_ENV?.trim();
  const commerceMode = environment.COMMERCE_MODE?.trim();
  if (vercelEnvironment === "production" && profile !== "production") {
    throw new DeploymentPolicyError("A Vercel production deployment must use the production profile.");
  }
  if (vercelEnvironment === "preview" && profile !== "staging") {
    throw new DeploymentPolicyError("A protected Vercel Preview must use the staging profile.");
  }
  if (profile === "staging" && commerceMode === "live") {
    throw new DeploymentPolicyError("The staging profile cannot use live commerce.");
  }
  if (profile === "production" && environment.OGC_TEST_EMAIL_RECIPIENT?.trim()) {
    throw new DeploymentPolicyError("The production profile must not configure a test email recipient.");
  }
  return profile;
}

export function isProtectedStagingPreview(environment: Environment = process.env): boolean {
  return environment.VERCEL_ENV?.trim() === "preview"
    && environment.OGC_DEPLOYMENT_PROFILE?.trim() === "staging"
    && environment.COMMERCE_MODE?.trim() !== "live";
}

export function freeDistinctSiteLimit(environment: Environment = process.env): number {
  if (environment.VERCEL_ENV?.trim() === "production") return 2;
  if (!isProtectedStagingPreview(environment)) return 2;
  const raw = environment.OGC_STAGING_FREE_SITE_LIMIT?.trim();
  if (raw === undefined || raw === "") return 100;
  if (!/^\d+$/.test(raw)) {
    throw new DeploymentPolicyError("OGC_STAGING_FREE_SITE_LIMIT must be an integer from 1 through 100.");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new DeploymentPolicyError("OGC_STAGING_FREE_SITE_LIMIT must be an integer from 1 through 100.");
  }
  return value;
}

export function assertStagingCommandEnvironment(environment: Environment = process.env): void {
  if (readDeploymentProfile(environment) !== "staging") {
    throw new DeploymentPolicyError("This command only runs with the staging deployment profile.");
  }
  if (environment.COMMERCE_MODE?.trim() === "live") {
    throw new DeploymentPolicyError("A staging command cannot run live commerce.");
  }
}

export function nonSensitiveDatabaseFingerprint(input: {
  databaseName: string;
  databaseOid: string | number;
  profile: DeploymentProfile;
}): string {
  return createHash("sha256")
    .update(`${input.profile}\0${input.databaseName}\0${input.databaseOid}`)
    .digest("hex")
    .slice(0, 16);
}
