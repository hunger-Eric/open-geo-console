import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createAnswerResponseHash,
  createAnswerSnapshotCellId,
  type AnswerEngineAdapter,
  type AnswerEngineSurface,
  type AnswerQuestion,
  type AnswerSnapshotCell
} from "@open-geo-console/answer-engine-observer";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { prepareStagingCommand } from "./staging-guard";
import { createOpenAIWebSearchAdapter } from "@/recommendation-forensics/adapters/openai-web-search";
import { createPerplexitySonarAdapter } from "@/recommendation-forensics/adapters/perplexity-sonar";
import { finalizeCertificationArtifact } from "@/recommendation-forensics/certification-artifact";
import { retrieveCitationSource } from "@/worker/recommendation-forensics";

export interface CertificationCommandOptions {
  provider: "openai" | "perplexity";
  model: string;
  locale: string;
  region: string;
  site: string;
  question: string;
  output: string;
  dryFixture: boolean;
}

export function parseCertificationCommand(args: string[]): CertificationCommandOptions {
  const values = argumentMap(args);
  const provider = values.get("provider");
  if (provider !== "openai" && provider !== "perplexity") throw new Error("--provider must be openai or perplexity.");
  const result: CertificationCommandOptions = {
    provider, model: required(values, "model"), locale: required(values, "locale"), region: required(values, "region"),
    site: validatedSite(required(values, "site")), question: validatedNonBrandQuestion(required(values, "question"), required(values, "site")),
    output: privateCertificationPath(required(values, "output")), dryFixture: values.has("dry-fixture")
  };
  if (result.dryFixture && !isReservedTestHostname(new URL(result.site).hostname)) {
    throw new Error("--dry-fixture requires a reserved .example, .test, or .invalid site.");
  }
  return result;
}

export function assertCertificationCredential(options: CertificationCommandOptions, environment: NodeJS.ProcessEnv): void {
  if (options.dryFixture) return;
  const prefix = options.provider === "openai" ? "OGC_ANSWER_OPENAI" : "OGC_ANSWER_PERPLEXITY";
  const missing = [`${prefix}_API_KEY`, `${prefix}_MODEL`].filter((name) => !environment[name]?.trim());
  if (missing.length > 0) throw new Error(`Missing certification variables: ${missing.join(", ")}.`);
  if (environment[`${prefix}_MODEL`]?.trim() !== options.model) throw new Error(`${prefix}_MODEL must exactly match --model.`);
}

async function main() {
  const options = parseCertificationCommand(process.argv.slice(2));
  assertCertificationCredential(options, process.env);
  await prepareStagingCommand({ environment: process.env, ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
  const adapter = createAdapter(options);
  const cell = options.dryFixture ? dryFixtureCell(adapter.surface, options) : await observe(adapter, options);
  const retrievals = options.dryFixture || cell.status !== "succeeded" ? [] : await Promise.all(cell.sources.map(async ({ url }) => {
    const result = await retrieveCitationSource(url);
    return { url, retrievalState: result.retrievalState, excerptHash: result.excerptHash, contentHash: result.contentHash };
  }));
  if (!options.dryFixture && (cell.status !== "succeeded" || cell.sources.length === 0 || !retrievals.some(({ retrievalState }) => retrievalState === "available"))) {
    throw new Error("Live certification did not produce a safely retrievable source-bearing cell.");
  }
  const artifact = finalizeCertificationArtifact({
    version: 1, mode: options.dryFixture ? "dry_fixture" : "live", installable: !options.dryFixture,
    environment: "protected_staging", providerId: options.provider, siteUrl: options.site, question: options.question,
    surface: adapter.surface, observedAt: cell.executedAt, cell, retrievals,
    operatorReviewRequired: ["commercial_terms", "surface_label", "evidence_quality"]
  });
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await chmod(options.output, 0o600);
  if (process.platform === "win32") console.error(JSON.stringify({ warning: "Verify that the artifact Windows ACL grants access only to the operator account.", output: options.output }));
  console.log(JSON.stringify({ provider: options.provider, mode: artifact.mode, installable: artifact.installable, artifactHash: artifact.artifactHash, output: options.output }));
}

function createAdapter(options: CertificationCommandOptions): AnswerEngineAdapter {
  if (options.provider === "openai") return createOpenAIWebSearchAdapter({
    apiKey: options.dryFixture ? "dry-fixture-key" : process.env.OGC_ANSWER_OPENAI_API_KEY,
    model: options.model, locale: options.locale, region: options.region
  });
  return createPerplexitySonarAdapter({
    environment: {
      OGC_ANSWER_PERPLEXITY_API_KEY: options.dryFixture ? "dry-fixture-key" : process.env.OGC_ANSWER_PERPLEXITY_API_KEY,
      OGC_ANSWER_PERPLEXITY_MODEL: options.model
    }, locale: options.locale, region: options.region
  });
}

async function observe(adapter: AnswerEngineAdapter, options: CertificationCommandOptions): Promise<AnswerSnapshotCell> {
  const runId = digest([options.provider, options.model, options.locale, options.region, options.site, options.question]);
  const question: AnswerQuestion = { id: digest([runId, "question"]), locale: options.locale, category: "supplier_selection", exactText: options.question, inferenceBasis: [`Operator certification site: ${new URL(options.site).hostname}`] };
  return adapter.observe({
    run: { id: runId, reportId: `cert-${runId}`, jobId: `cert-${runId}`, locale: options.locale, region: options.region, questionSetVersion: "certification-v1", startedAt: new Date().toISOString() },
    question, surface: adapter.surface, signal: AbortSignal.timeout(60_000)
  });
}

function dryFixtureCell(surface: AnswerEngineSurface, options: CertificationCommandOptions): AnswerSnapshotCell {
  const runId = digest(["dry", options.provider, options.model, options.locale, options.region]);
  const questionId = digest([runId, "question"]);
  const answerText = options.locale.startsWith("zh") ? "Fixture Atlas 是推荐供应商。" : "Fixture Atlas is the recommended supplier.";
  return {
    id: createAnswerSnapshotCellId({ runId, questionId, surface }), runId, questionId, surface, status: "succeeded",
    answerText, responseHash: createAnswerResponseHash(answerText), recommendationOutcome: "recommendations_present",
    sources: [{ url: options.site, title: "Dry fixture source", providerOrder: 0, providerMetadata: { sourceType: "dry_fixture" } }],
    executedAt: new Date().toISOString(), executionDurationMs: 0
  };
}

function argumentMap(args: string[]) {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const item = args[index]!;
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const name = item.slice(2);
    if (name === "dry-fixture") { result.set(name, "true"); continue; }
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value.`);
    result.set(name, value);
  }
  return result;
}
function required(values: Map<string, string>, name: string) { const value = values.get(name)?.trim(); if (!value) throw new Error(`--${name} is required.`); return value; }
function validatedSite(value: string) { const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) throw new Error("--site must be an HTTPS URL without credentials."); return url.href; }
function validatedNonBrandQuestion(question: string, site: string) {
  if (question.length < 20 || question.length > 1_000) throw new Error("--question must contain 20-1000 characters.");
  const labels = new URL(site).hostname.toLowerCase().split(".").filter((label) => label.length >= 4 && !["www", "test", "staging"].includes(label));
  if (labels.some((label) => question.toLowerCase().includes(label))) throw new Error("--question must be non-brand and must not name the test site.");
  return question;
}
function digest(parts: string[]) { return createHash("sha256").update(parts.join("\0")).digest("hex"); }

export function privateCertificationPath(value: string): string {
  const root = workspaceRoot(process.cwd());
  const privateRoot = path.join(root, ".data", "recommendation-certification");
  const resolved = path.resolve(root, value);
  if (resolved !== privateRoot && !resolved.startsWith(`${privateRoot}${path.sep}`)) {
    throw new Error("Certification artifacts must stay under .data/recommendation-certification.");
  }
  return resolved;
}
function workspaceRoot(start: string): string { let current = path.resolve(start); while (true) { const packageFile = path.join(current, "package.json"); if (existsSync(packageFile)) { try { const parsed = JSON.parse(readFileSync(packageFile, "utf8")) as { workspaces?: unknown }; if (parsed.workspaces) return current; } catch {} } const parent = path.dirname(current); if (parent === current) return path.resolve(start); current = parent; } }
function isReservedTestHostname(hostname: string) { return [".example", ".test", ".invalid"].some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix)); }

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Certification failed."); process.exitCode = 1; }).finally(closeDatabase);
}
