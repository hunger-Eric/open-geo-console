import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const POSTGRES_VERSION = "3.4.9";
export const REPAIR_ID = "postgres-next-write-guard-pr-1168";
export const NEXT_WRITE = "const x = socket.write(chunk, fn)";
export const GUARDED_NEXT_WRITE = "const x = socket ? socket.write(chunk, fn) : false";
export const TARGETS = [
  { module: "esm", file: "src/connection.js", originalSha256: "ee3a218d9aa6a6f2887c1a19da50009335fe84c11a5431d5cab72d6bc528632f", patchedSha256: "984414287cf9075c3a45ac8ab14a6c3da64690c8f804277a6661bf88d73f514a" },
  { module: "cjs", file: "cjs/src/connection.js", originalSha256: "ce6d375809baad79963ef9b3773e6ac757bcf6da2362d4d85482bb14c2c751be", patchedSha256: "97ea65bae558e0806f7a59ce12742a84c56c2cddd78ddca27cccbe4a46e934f6" }
];

class GuardError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const occurrences = (text, needle) => text.split(needle).length - 1;

async function writeAtomically(path, content) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function applyPostgresNextWriteGuard(packageRoot, options = {}) {
  const root = resolve(packageRoot);
  const version = options.version ?? POSTGRES_VERSION;
  const targets = options.targets ?? TARGETS;
  let manifest;
  try { manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")); }
  catch { throw new GuardError("POSTGRES_MANIFEST_UNREADABLE"); }
  if (manifest.version !== version) throw new GuardError("POSTGRES_VERSION_MISMATCH");

  const plans = await Promise.all(targets.map(async (target) => {
    const path = resolve(root, target.file);
    let source;
    try { source = await readFile(path, "utf8"); }
    catch { throw new GuardError("POSTGRES_TARGET_UNREADABLE"); }
    const currentSha256 = sha256(source);
    if (currentSha256 === target.patchedSha256) return { module: target.module, path, state: "already_patched" };
    if (currentSha256 !== target.originalSha256) throw new GuardError("POSTGRES_SHA_MISMATCH");
    if (occurrences(source, NEXT_WRITE) !== 1) throw new GuardError("POSTGRES_TARGET_OCCURRENCE_MISMATCH");
    const patched = source.replace(NEXT_WRITE, GUARDED_NEXT_WRITE);
    if (sha256(patched) !== target.patchedSha256) throw new GuardError("POSTGRES_PATCHED_SHA_MISMATCH");
    return { module: target.module, path, state: "patched", patched };
  }));

  await Promise.all(plans.filter((plan) => plan.state === "patched").map((plan) => writeAtomically(plan.path, plan.patched)));
  return { repairId: REPAIR_ID, package: "postgres", version, state: plans.every((plan) => plan.state === "already_patched") ? "already_patched" : "patched", modules: Object.fromEntries(plans.map((plan) => [plan.module, plan.state])) };
}

async function main() {
  const result = await applyPostgresNextWriteGuard(process.argv[2] ?? "/app/node_modules/postgres");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ repairId: REPAIR_ID, status: "rejected", code: error instanceof GuardError ? error.code : "POSTGRES_GUARD_FAILED" })}\n`);
    process.exitCode = 1;
  });
}
