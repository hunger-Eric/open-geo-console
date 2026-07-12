import { beforeEach, describe, expect, it } from "vitest";
import {
  activatePublicSearchSurfaceAuthority,
  createPublicSearchSurfaceAuthorityVersion,
  getActivePublicSearchSurfaceAuthority,
  installPublicSearchSurfaceAuthority,
  listPublicSearchSurfaceAuthorities
} from "./public-search-authority";

describe("public search surface authority repository", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.OPEN_GEO_DB_PATH = `memory-authority-${crypto.randomUUID()}`;
  });

  it("installs an exact deterministic authority idempotently and fails closed on mismatch", async () => {
    const input = authorityInput();
    const expected = createPublicSearchSurfaceAuthorityVersion(input);
    const first = await installPublicSearchSurfaceAuthority(input);
    const second = await installPublicSearchSurfaceAuthority(input);
    expect(first.authorityVersion).toBe(expected);
    expect(second).toEqual(first);
    await expect(installPublicSearchSurfaceAuthority({ ...input, authorityVersion: "forged" }))
      .rejects.toThrow(/deterministic/i);

    const active = await activatePublicSearchSurfaceAuthority({ authorityVersion: expected, environment: "staging", surfaceId: "surface-a", surfaceVersion: "2026-07" });
    await expect(getActivePublicSearchSurfaceAuthority({
      environment: "staging", surfaceId: "surface-a", surfaceVersion: "2026-07",
      locale: "zh-CN", region: "CN", authorityVersion: expected
    })).resolves.toEqual(active);
    await expect(getActivePublicSearchSurfaceAuthority({
      environment: "production", surfaceId: "surface-a", surfaceVersion: "2026-07",
      locale: "zh-CN", region: "CN", authorityVersion: expected
    })).rejects.toThrow(/authority/i);
    await expect(getActivePublicSearchSurfaceAuthority({
      environment: "staging", surfaceId: "surface-a", surfaceVersion: "2026-08",
      locale: "zh-CN", region: "CN", authorityVersion: expected
    })).rejects.toThrow(/authority/i);
    expect(await listPublicSearchSurfaceAuthorities({ environment: "staging" })).toEqual([active]);
  });

  it("activates an installed authority only inside its exact scope", async () => {
    const installed = await installPublicSearchSurfaceAuthority({ ...authorityInput(), active: false });
    await expect(getActivePublicSearchSurfaceAuthority({ environment: "staging", surfaceId: "surface-a", surfaceVersion: "2026-07", locale: "zh-CN", region: "CN" })).rejects.toThrow(/authority/i);
    await expect(activatePublicSearchSurfaceAuthority({ authorityVersion: installed.authorityVersion, environment: "production", surfaceId: installed.surfaceId, surfaceVersion: installed.surfaceVersion })).rejects.toThrow(/scope/i);
    await activatePublicSearchSurfaceAuthority({ authorityVersion: installed.authorityVersion, environment: "staging", surfaceId: installed.surfaceId, surfaceVersion: installed.surfaceVersion });
    await expect(getActivePublicSearchSurfaceAuthority({ environment: "staging", surfaceId: installed.surfaceId, surfaceVersion: installed.surfaceVersion, locale: "zh-CN", region: "CN", authorityVersion: installed.authorityVersion })).resolves.toMatchObject({ active: true });
  });
});

function authorityInput() {
  return {
    environment: "staging" as const,
    surfaceId: "surface-a",
    surfaceVersion: "2026-07",
    localeCapabilities: ["en", "zh-CN"],
    regionCapabilities: ["CN", "global"],
    termsReviewedAt: "2030-01-01T00:00:00.000Z",
    evidenceReferences: ["operator-review-1"],
    capturedAt: "2030-01-02T00:00:00.000Z",
    active: false
  };
}
