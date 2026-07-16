import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  beginReportV4PreAdmissionSnapshot,
  finalizeReportV4PreAdmissionSnapshot,
  resolvePaidReportV4SiteSnapshot,
  type ReportV4SiteSnapshotPageInput
} from "./report-v4-site-snapshots";

// @requirement GEO-V4-CRAWL-04
describe("V4 pre-admission site snapshot repository", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.OPEN_GEO_DB_PATH = `memory-v4-site-${randomUUID()}`;
  });

  it("binds one immutable pre-admission identity and paid generation only resolves that exact terminal snapshot", async () => {
    const identity = fixtureIdentity();
    const collecting = await beginReportV4PreAdmissionSnapshot(identity);
    expect(collecting).toMatchObject({ ...identity, status: "collecting", contentIdentityHash: null });

    await expect(resolvePaidReportV4SiteSnapshot({
      ...identity,
      contentIdentityHash: sha("content")
    })).rejects.toThrow(/not terminal/i);

    const terminal = await finalizeReportV4PreAdmissionSnapshot({
      ...identity,
      status: "completed",
      completedAt: new Date("2030-01-01T00:05:00.000Z"),
      contentIdentityHash: sha("content"),
      candidateUrlCount: 1,
      pages: pages(1)
    });
    const resolved = await resolvePaidReportV4SiteSnapshot({
      ...identity,
      contentIdentityHash: sha("content")
    });
    expect(resolved).toEqual(terminal);
    expect(resolved.pages).toHaveLength(1);

    await expect(resolvePaidReportV4SiteSnapshot({ ...identity, siteKey: "other.example", contentIdentityHash: sha("content") })).rejects.toThrow(/identity/i);
    await expect(resolvePaidReportV4SiteSnapshot({ ...identity, collectorConfigIdentityHash: sha("other-config"), contentIdentityHash: sha("content") })).rejects.toThrow(/identity/i);
    await expect(resolvePaidReportV4SiteSnapshot({ ...identity, contentIdentityHash: sha("other-content") })).rejects.toThrow(/identity/i);
  });

  it("makes concurrent begin/finalize idempotent but rejects a second identity or terminal overwrite", async () => {
    const identity = fixtureIdentity();
    const begun = await Promise.all(Array.from({ length: 8 }, () => beginReportV4PreAdmissionSnapshot(identity)));
    expect(new Set(begun.map(({ id }) => id))).toEqual(new Set([identity.id]));

    await expect(beginReportV4PreAdmissionSnapshot({ ...identity, id: "different-snapshot" })).rejects.toThrow(/already bound/i);

    const terminalInput = {
      ...identity,
      status: "completed" as const,
      completedAt: new Date("2030-01-01T00:05:00.000Z"),
      contentIdentityHash: sha("content"),
      candidateUrlCount: 2,
      pages: pages(2)
    };
    const completed = await Promise.all(Array.from({ length: 8 }, () => finalizeReportV4PreAdmissionSnapshot(terminalInput)));
    expect(completed.every((bundle) => bundle.snapshot.contentIdentityHash === sha("content"))).toBe(true);

    await expect(finalizeReportV4PreAdmissionSnapshot({
      ...terminalInput,
      contentIdentityHash: sha("mutated-content")
    })).rejects.toThrow(/immutable|conflict/i);
    await expect(finalizeReportV4PreAdmissionSnapshot({
      ...terminalInput,
      pages: terminalInput.pages.map((page, index) => index === 0 ? { ...page, summary: "Mutated page" } : page)
    })).rejects.toThrow(/immutable|conflict/i);
    await expect(beginReportV4PreAdmissionSnapshot(identity)).rejects.toThrow(/terminal|immutable/i);
  });

  it("keeps zero, limited, 50-page, and 51-page admission outcomes explicit", async () => {
    await expect(finalizeFixture("zero-invalid", "completed", pages(0), 0)).rejects.toThrow(/completed.*1.*50/i);
    await expect(finalizeFixture("zero", "unavailable", pages(0), 0)).resolves.toMatchObject({
      snapshot: { status: "unavailable", analyzablePageCount: 0 }
    });

    const limitedPages = [...pages(2), excludedPage(3)];
    await expect(finalizeFixture("limited", "completed_limited", limitedPages, 3)).resolves.toMatchObject({
      snapshot: { status: "completed_limited", analyzablePageCount: 2, excludedPageCount: 1 }
    });
    await expect(finalizeFixture("limited-without-gap", "completed_limited", pages(2), 2)).rejects.toThrow(/limited.*excluded/i);

    await expect(finalizeFixture("fifty", "completed", pages(50), 50)).resolves.toMatchObject({
      snapshot: { status: "completed", analyzablePageCount: 50 }
    });
    await expect(finalizeFixture("fifty-custom", "custom_service", pages(50), 50)).rejects.toThrow(/custom.*51/i);
    await expect(finalizeFixture("fifty-one-limited", "completed_limited", pages(51), 51)).rejects.toThrow(/limited.*1.*50/i);
    await expect(finalizeFixture("fifty-one", "custom_service", pages(51), 51)).resolves.toMatchObject({
      snapshot: { status: "custom_service", analyzablePageCount: 51 }
    });
  });

  it("fails closed before paid generation for unavailable and custom-service snapshots without creating or refreshing", async () => {
    for (const fixture of [
      { suffix: "paid-zero", status: "unavailable" as const, snapshotPages: pages(0), candidateUrlCount: 0 },
      { suffix: "paid-51", status: "custom_service" as const, snapshotPages: pages(51), candidateUrlCount: 51 }
    ]) {
      const identity = fixtureIdentity(fixture.suffix);
      await beginReportV4PreAdmissionSnapshot(identity);
      await finalizeReportV4PreAdmissionSnapshot({
        ...identity,
        status: fixture.status,
        completedAt: new Date("2030-01-01T00:05:00.000Z"),
        contentIdentityHash: sha(`content-${fixture.suffix}`),
        candidateUrlCount: fixture.candidateUrlCount,
        pages: fixture.snapshotPages.map((page) => ({ ...page, id: `${fixture.suffix}:${page.id}` }))
      });
      await expect(resolvePaidReportV4SiteSnapshot({
        ...identity,
        contentIdentityHash: sha(`content-${fixture.suffix}`)
      })).rejects.toThrow(/not eligible.*standard paid|paid.*not eligible/i);
      await expect(beginReportV4PreAdmissionSnapshot(identity)).rejects.toThrow(/terminal|immutable/i);
    }

    const missing = fixtureIdentity("paid-missing");
    await expect(resolvePaidReportV4SiteSnapshot({ ...missing, contentIdentityHash: sha("missing") })).rejects.toThrow(/not found/i);
    await expect(beginReportV4PreAdmissionSnapshot(missing)).resolves.toMatchObject({ status: "collecting" });
  });
});

async function finalizeFixture(
  suffix: string,
  status: "completed" | "completed_limited" | "unavailable" | "custom_service",
  snapshotPages: ReportV4SiteSnapshotPageInput[],
  candidateUrlCount: number
) {
  const identity = fixtureIdentity(suffix);
  await beginReportV4PreAdmissionSnapshot(identity);
  return finalizeReportV4PreAdmissionSnapshot({
    ...identity,
    status,
    completedAt: new Date("2030-01-01T00:05:00.000Z"),
    contentIdentityHash: sha(`content-${suffix}`),
    candidateUrlCount,
    pages: snapshotPages.map((page) => ({ ...page, id: `${suffix}:${page.id}` }))
  });
}

function fixtureIdentity(suffix = "main") {
  return {
    id: `snapshot-${suffix}`,
    reportId: `report-${suffix}`,
    siteKey: `${suffix}.example`,
    collectorConfigIdentityHash: sha(`config-${suffix}`),
    capturedAt: new Date("2030-01-01T00:00:00.000Z")
  };
}

function pages(count: number): ReportV4SiteSnapshotPageInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `page-${index + 1}`,
    ordinal: index + 1,
    normalizedUrl: `https://example.com/page-${index + 1}`,
    analyzable: true,
    readMode: index % 2 === 0 ? "direct_readable" : "js_dependent",
    summary: `Page ${index + 1}`,
    contentHash: sha(`page-${index + 1}`),
    exclusionReason: null
  }));
}

function excludedPage(ordinal: number): ReportV4SiteSnapshotPageInput {
  return {
    id: `page-${ordinal}`,
    ordinal,
    normalizedUrl: `https://example.com/page-${ordinal}`,
    analyzable: false,
    readMode: null,
    summary: null,
    contentHash: null,
    exclusionReason: "ai_readability_limited"
  };
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
