import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyPostgresNextWriteGuard, GUARDED_NEXT_WRITE, NEXT_WRITE } from "./apply-postgres-next-write-guard.mjs";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const tracked = new Set<string>();
const source = (body = NEXT_WRITE) => `before\n${body}\nafter\n`;
const targetsFor = (esm: string, cjs: string, patchedSha = true) => [
  { module: "esm", file: "src/connection.js", originalSha256: hash(esm), patchedSha256: patchedSha ? hash(esm.replace(NEXT_WRITE, GUARDED_NEXT_WRITE)) : "f".repeat(64) },
  { module: "cjs", file: "cjs/src/connection.js", originalSha256: hash(cjs), patchedSha256: patchedSha ? hash(cjs.replace(NEXT_WRITE, GUARDED_NEXT_WRITE)) : "e".repeat(64) }
];

async function fixture(options: { esm?: string; cjs?: string; version?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), "postgres-next-write-"));
  tracked.add(root);
  const esm = options.esm ?? source();
  const cjs = options.cjs ?? source();
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(join(root, "cjs", "src"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "package.json"), JSON.stringify({ version: options.version ?? "3.4.9" })),
    writeFile(join(root, "src", "connection.js"), esm),
    writeFile(join(root, "cjs", "src", "connection.js"), cjs)
  ]);
  return { root, esm, cjs };
}

afterEach(async () => { await Promise.all([...tracked].map((path) => rm(path, { recursive: true, force: true }))); tracked.clear(); });

describe("postgres nextWrite guard", () => {
  it("patches the ESM and CJS targets exactly once", async () => {
    const { root, esm, cjs } = await fixture();
    await expect(applyPostgresNextWriteGuard(root, { targets: targetsFor(esm, cjs) })).resolves.toMatchObject({ state: "patched", modules: { esm: "patched", cjs: "patched" } });
    await expect(readFile(join(root, "src", "connection.js"), "utf8")).resolves.toBe(esm.replace(NEXT_WRITE, GUARDED_NEXT_WRITE));
    await expect(readFile(join(root, "cjs", "src", "connection.js"), "utf8")).resolves.toBe(cjs.replace(NEXT_WRITE, GUARDED_NEXT_WRITE));
  });

  it("is idempotent after both targets are patched", async () => {
    const { root, esm, cjs } = await fixture();
    const options = { targets: targetsFor(esm, cjs) };
    await applyPostgresNextWriteGuard(root, options);
    await expect(applyPostgresNextWriteGuard(root, options)).resolves.toMatchObject({ state: "already_patched", modules: { esm: "already_patched", cjs: "already_patched" } });
  });

  it("fails closed on version or source SHA drift", async () => {
    const versioned = await fixture({ version: "3.4.8" });
    await expect(applyPostgresNextWriteGuard(versioned.root)).rejects.toThrow("POSTGRES_VERSION_MISMATCH");
    const drifted = await fixture({ esm: source("const x = socket.write(chunk, changed)") });
    await expect(applyPostgresNextWriteGuard(drifted.root, { targets: targetsFor(source(), drifted.cjs) })).rejects.toThrow("POSTGRES_SHA_MISMATCH");
  });

  it("fails closed when the target occurs zero or multiple times", async () => {
    const zero = await fixture({ esm: source("const y = false") });
    await expect(applyPostgresNextWriteGuard(zero.root, { targets: [targetsFor(zero.esm, zero.cjs, false)[0]] })).rejects.toThrow("POSTGRES_TARGET_OCCURRENCE_MISMATCH");
    const multiple = await fixture({ esm: source(`${NEXT_WRITE}\n${NEXT_WRITE}`) });
    await expect(applyPostgresNextWriteGuard(multiple.root, { targets: [targetsFor(multiple.esm, multiple.cjs, false)[0]] })).rejects.toThrow("POSTGRES_TARGET_OCCURRENCE_MISMATCH");
  });
});
