import { lstat, mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertPrivateCertificationArtifact,
  ensurePrivateCertificationDirectory,
  privateCertificationPath
} from "./certification-path";

describe("private certification artifact paths", () => {
  it("rejects parent escape and nested output paths", async () => {
    const root = await fixtureRoot();
    try {
      expect(() => privateCertificationPath("../outside.json", root)).toThrow("direct files");
      expect(() => privateCertificationPath(".data/recommendation-certification/nested/artifact.json", root)).toThrow("direct files");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects a symlink artifact when the platform supports it", async () => {
    const root = await fixtureRoot();
    try {
      const base = await ensurePrivateCertificationDirectory(root);
      const target = path.join(base, "target.json");
      const link = path.join(base, "link.json");
      await writeFile(target, "{}");
      try { await symlink(target, link, "file"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") return; throw error; }
      await expect(assertPrivateCertificationArtifact(link, root)).rejects.toThrow("symlink");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects a junction certification directory when the platform supports it", async () => {
    const root = await fixtureRoot();
    try {
      const data = path.join(root, ".data");
      const target = path.join(root, "junction-target");
      await mkdir(data, { recursive: true });
      await mkdir(target, { recursive: true });
      try { await symlink(target, path.join(data, "recommendation-certification"), process.platform === "win32" ? "junction" : "dir"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") return; throw error; }
      await expect(ensurePrivateCertificationDirectory(root)).rejects.toThrow("symlinks or junctions");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("rejects a .data junction before recursive mkdir can create an external child", async () => {
    const root = await fixtureRoot();
    const external = await mkdtemp(path.join(tmpdir(), "ogc-cert-external-"));
    try {
      try { await symlink(external, path.join(root, ".data"), process.platform === "win32" ? "junction" : "dir"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") return; throw error; }
      await expect(ensurePrivateCertificationDirectory(root)).rejects.toThrow("symlinks or junctions");
      await expect(lstat(path.join(external, "recommendation-certification"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(external, { recursive: true, force: true });
    }
  });
});

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "ogc-cert-path-"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ private: true, workspaces: ["apps/*"] }));
  return root;
}
