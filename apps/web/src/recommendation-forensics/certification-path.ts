import { existsSync, readFileSync } from "node:fs";
import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";

export function privateCertificationPath(value: string, start = process.cwd()): string {
  const root = workspaceRoot(start);
  const privateRoot = path.join(root, ".data", "recommendation-certification");
  const resolved = path.resolve(root, value);
  if (path.dirname(resolved) !== privateRoot || path.basename(resolved) !== resolved.slice(privateRoot.length + 1) || !path.extname(resolved)) {
    throw new Error("Certification artifacts must be direct files under .data/recommendation-certification.");
  }
  return resolved;
}

export async function ensurePrivateCertificationDirectory(start = process.cwd()): Promise<string> {
  const root = workspaceRoot(start);
  const dataRoot = path.join(root, ".data");
  const privateRoot = path.join(root, ".data", "recommendation-certification");
  for (const candidate of [root, dataRoot, privateRoot]) await assertExistingPathSafe(candidate);
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  for (const candidate of [root, dataRoot, privateRoot]) await assertExistingPathSafe(candidate);
  return privateRoot;
}

export async function assertPrivateCertificationArtifact(pathname: string, start = process.cwd()): Promise<void> {
  const expected = privateCertificationPath(pathname, start);
  await ensurePrivateCertificationDirectory(start);
  const stat = await lstat(expected);
  const actual = await realpath(expected);
  if (!stat.isFile() || stat.isSymbolicLink() || !samePath(actual, expected)) {
    throw new Error("Certification artifact must be a regular private file, not a symlink or junction.");
  }
}

function workspaceRoot(start: string): string {
  let current = path.resolve(start);
  while (true) {
    const packageFile = path.join(current, "package.json");
    if (existsSync(packageFile)) {
      try { if ((JSON.parse(readFileSync(packageFile, "utf8")) as { workspaces?: unknown }).workspaces) return current; } catch {}
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}
async function assertExistingPathSafe(candidate: string): Promise<void> {
  if (!existsSync(candidate)) return;
  const stat = await lstat(candidate);
  const actual = await realpath(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(actual, candidate)) {
    throw new Error("Certification artifact path ancestors must not be symlinks or junctions.");
  }
}
function samePath(left: string, right: string) { return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right; }
