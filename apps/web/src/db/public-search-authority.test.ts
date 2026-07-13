import { beforeEach, describe, expect, it } from "vitest";
import {
  activatePublicSearchSurfaceAuthority,
  createPublicSearchSurfaceAuthorityVersion,
  getActivePublicSearchSurfaceAuthority,
  installPublicSearchSurfaceAuthority,
  listPublicSearchSurfaceAuthorities
} from "./public-search-authority";
import { memorySavePublicSearchSurfaceAuthority } from "./memory";

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
    expect(first).toMatchObject({
      adapterId: "mimo",
      providerId: "xiaomi-mimo",
      productId: "native-web-search",
      modelId: "mimo-v2.5-pro",
      adapterVersion: "mimo-web-search-adapter-v1"
    });
    await expect(installPublicSearchSurfaceAuthority({ ...input, authorityVersion: "forged" }))
      .rejects.toThrow(/deterministic/i);

    const active = await activatePublicSearchSurfaceAuthority({ authorityVersion: expected, ...authorityScope(input) });
    await expect(getActivePublicSearchSurfaceAuthority({
      ...authorityScope(input),
      locale: "zh-CN", region: "CN", authorityVersion: expected
    })).resolves.toEqual(active);
    await expect(getActivePublicSearchSurfaceAuthority({
      ...authorityScope({ ...input, environment: "production" }),
      locale: "zh-CN", region: "CN", authorityVersion: expected
    })).rejects.toThrow(/authority/i);
    await expect(getActivePublicSearchSurfaceAuthority({
      ...authorityScope({ ...input, surfaceVersion: "2026-08" }),
      locale: "zh-CN", region: "CN", authorityVersion: expected
    })).rejects.toThrow(/authority/i);
    expect(await listPublicSearchSurfaceAuthorities({ environment: "staging" })).toEqual([active]);
  });

  it("activates an installed authority only inside its exact scope", async () => {
    const installed = await installPublicSearchSurfaceAuthority({ ...authorityInput(), active: false });
    await expect(getActivePublicSearchSurfaceAuthority({ ...authorityScope(authorityInput()), locale: "zh-CN", region: "CN" })).rejects.toThrow(/authority/i);
    await expect(activatePublicSearchSurfaceAuthority({ authorityVersion: installed.authorityVersion, ...authorityScope({ ...authorityInput(), environment: "production" }) })).rejects.toThrow(/scope/i);
    await activatePublicSearchSurfaceAuthority({ authorityVersion: installed.authorityVersion, ...authorityScope(authorityInput()) });
    await expect(getActivePublicSearchSurfaceAuthority({ ...authorityScope(authorityInput()), locale: "zh-CN", region: "CN", authorityVersion: installed.authorityVersion })).resolves.toMatchObject({ active: true });
  });

  it("never admits a historical-unbound authority to the live activation or lookup boundary", async () => {
    const installed = await installPublicSearchSurfaceAuthority(authorityInput());
    const historical = {
      ...installed,
      authorityVersion: "historical-authority",
      adapterId: "historical-unbound-v1",
      providerId: "historical-unbound-v1",
      productId: "historical-unbound-v1",
      modelId: "historical-unbound-v1",
      adapterVersion: "historical-unbound-v1",
      active: true
    };
    memorySavePublicSearchSurfaceAuthority(historical);
    const historicalScope = authorityScope(historical);
    await expect(getActivePublicSearchSurfaceAuthority({ ...historicalScope, locale: "zh-CN", region: "CN", authorityVersion: historical.authorityVersion }))
      .rejects.toThrow(/authority/i);
    await expect(activatePublicSearchSurfaceAuthority({ authorityVersion: historical.authorityVersion, ...historicalScope }))
      .rejects.toThrow(/scope/i);
  });
});

function authorityInput() {
  return {
    environment: "staging" as const,
    adapterId: "mimo",
    providerId: "xiaomi-mimo",
    productId: "native-web-search",
    modelId: "mimo-v2.5-pro",
    adapterVersion: "mimo-web-search-adapter-v1",
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

function authorityScope(input: {
  environment: "staging" | "production";
  adapterId: string;
  providerId: string;
  productId: string;
  modelId: string;
  adapterVersion: string;
  surfaceId: string;
  surfaceVersion: string;
}) {
  return {
    environment: input.environment,
    adapterId: input.adapterId,
    providerId: input.providerId,
    productId: input.productId,
    modelId: input.modelId,
    adapterVersion: input.adapterVersion,
    surfaceId: input.surfaceId,
    surfaceVersion: input.surfaceVersion
  };
}
