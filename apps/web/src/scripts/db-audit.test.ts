import { describe, expect, it } from "vitest";
import { summarizeDatabaseAudit } from "./db-audit";

describe("database commercial-terminal audit", () => {
  it("passes only when no terminal job retains reserved credit", () => {
    expect(summarizeDatabaseAudit([])).toEqual({
      exitCode: 0,
      output: "Database audit passed: no terminal commercial job has reserved credit.\n"
    });

    const failed = summarizeDatabaseAudit([
      {
        jobId: "job-1",
        reportId: "report-1",
        stage: "completed_limited",
        reservationId: "reservation-1"
      }
    ]);
    expect(failed.exitCode).toBe(1);
    expect(failed.output).toContain("job=job-1");
    expect(failed.output).toContain("reservation=reservation-1");
  });
});
