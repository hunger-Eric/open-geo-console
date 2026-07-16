import { describe, expect, it } from "vitest";
import {
  SiteDiscovery,
  V4_STANDARD_ANALYZABLE_PAGE_LIMIT,
  assessAnalyzableSiteAdmission,
  createSiteKey,
  extractPageContent
} from "./index";

describe("site-crawler public exports", () => {
  it("exports the V4 admission primitives without removing existing APIs", () => {
    expect(V4_STANDARD_ANALYZABLE_PAGE_LIMIT).toBe(50);
    expect(typeof assessAnalyzableSiteAdmission).toBe("function");
    expect(typeof SiteDiscovery).toBe("function");
    expect(typeof createSiteKey).toBe("function");
    expect(typeof extractPageContent).toBe("function");
  });
});
