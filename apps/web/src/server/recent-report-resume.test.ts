import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGeoReport: vi.fn(),
  getLatestScanJob: vi.fn(),
  getReportV4PreAdmissionJob: vi.fn()
}));

vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/db/jobs", () => ({ getLatestScanJob: mocks.getLatestScanJob }));
vi.mock("@/db/report-v4-admission-jobs", () => ({ getReportV4PreAdmissionJob: mocks.getReportV4PreAdmissionJob }));

import {
  issueRecentReportResumeMarker,
  readRecentReportResumeMarker,
  RECENT_REPORT_RESUME_TTL_SECONDS,
  resolveRecentReportResume
} from "./recent-report-resume";

const now = new Date("2026-08-07T10:00:00.000Z");

describe("recent report resume marker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OGC_TOKEN_HASH_SECRET = "token-hash-secret-with-at-least-32-characters";
    mocks.getGeoReport.mockResolvedValue({ url: "https://company.example/path" });
    mocks.getLatestScanJob.mockResolvedValue({ stage: "analyzing" });
    mocks.getReportV4PreAdmissionJob.mockResolvedValue(null);
  });

  it("signs only bounded navigation context", () => {
    const marker = issueRecentReportResumeMarker({ reportId: "report-1", locale: "zh", now });
    const [encoded] = marker.raw.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));

    expect(payload).toEqual({
      v: 1,
      reportId: "report-1",
      locale: "zh",
      issuedAt: Math.floor(now.getTime() / 1_000),
      expiresAt: Math.floor(now.getTime() / 1_000) + RECENT_REPORT_RESUME_TTL_SECONDS
    });
    expect(marker.raw).not.toContain("company.example");
    expect(marker.raw).not.toContain("token-hash-secret");
  });

  it("rejects tampered, future, and expired markers", () => {
    const marker = issueRecentReportResumeMarker({ reportId: "report-1", locale: "en", now });
    const [encoded, signature] = marker.raw.split(".");
    expect(readRecentReportResumeMarker(`${encoded}x.${signature}`, now)).toBeNull();
    expect(readRecentReportResumeMarker(marker.raw, new Date(now.getTime() - 1_000))).toBeNull();
    expect(readRecentReportResumeMarker(
      marker.raw,
      new Date(now.getTime() + (RECENT_REPORT_RESUME_TTL_SECONDS + 1) * 1_000)
    )).toBeNull();
  });

  it("resolves a generating task from authoritative report and job state", async () => {
    const marker = issueRecentReportResumeMarker({ reportId: "report-1", locale: "zh", now });

    await expect(resolveRecentReportResume(marker.raw, now)).resolves.toEqual({
      reportId: "report-1", locale: "zh", domain: "company.example", state: "generating"
    });
    expect(mocks.getLatestScanJob).toHaveBeenCalledWith("report-1", "free", { excludeReasons: ["v4_pre_admission"] });
  });

  it("shows failed tasks but hides every completed state", async () => {
    const marker = issueRecentReportResumeMarker({ reportId: "report-1", locale: "en", now });
    mocks.getLatestScanJob.mockResolvedValue({ stage: "failed" });
    await expect(resolveRecentReportResume(marker.raw, now)).resolves.toMatchObject({ state: "failed" });

    for (const stage of ["completed", "completed_limited", "partial"]) {
      mocks.getLatestScanJob.mockResolvedValue({ stage });
      await expect(resolveRecentReportResume(marker.raw, now)).resolves.toBeNull();
    }
  });

  it("uses an active preview job and hides invalid or missing authority", async () => {
    const marker = issueRecentReportResumeMarker({ reportId: "report-1", locale: "en", now });
    mocks.getLatestScanJob.mockResolvedValue({ stage: "completed" });
    mocks.getReportV4PreAdmissionJob.mockResolvedValue({ stage: "synthesizing" });
    await expect(resolveRecentReportResume(marker.raw, now)).resolves.toMatchObject({ state: "generating" });

    mocks.getGeoReport.mockResolvedValue(null);
    await expect(resolveRecentReportResume(marker.raw, now)).resolves.toBeNull();
    await expect(resolveRecentReportResume(undefined, now)).resolves.toBeNull();
  });
});
