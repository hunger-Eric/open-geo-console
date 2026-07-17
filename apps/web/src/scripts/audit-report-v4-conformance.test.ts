import { describe, expect, it } from "vitest";
import {
  parseReportV4AuditArgs,
  reportV4AcceptanceCommandEnvironment
} from "./audit-report-v4-conformance";

describe("report V4 conformance CLI", () => {
  it("accepts structural traceability and final acceptance modes", () => {
    expect(parseReportV4AuditArgs(["traceability"])).toEqual({ mode: "traceability", writeMatrix: false });
    expect(parseReportV4AuditArgs(["acceptance"])).toEqual({ mode: "acceptance", writeMatrix: false });
    expect(parseReportV4AuditArgs(["traceability", "--write-matrix"])).toEqual({ mode: "traceability", writeMatrix: true });
  });

  it("keeps matrix writes structural and rejects unknown arguments", () => {
    expect(() => parseReportV4AuditArgs(["acceptance", "--write-matrix"])).toThrow(/traceability only/i);
    expect(() => parseReportV4AuditArgs(["unknown"])).toThrow(/traceability or acceptance/i);
    expect(() => parseReportV4AuditArgs(["traceability", "--extra"])).toThrow(/unknown argument/i);
  });

  it("sanitizes every evidence override from final acceptance verification commands", () => {
    const source = {
      KEEP_ME: "yes",
      OGC_REPORT_V4_STAGING_EVIDENCE_CANDIDATE_PATH:
        "docs/operations/evidence/.report-v4-00000000-0000-4000-8000-000000000321.candidate.json",
      OGC_REPORT_V4_STAGING_EVIDENCE_PATH: "artifacts/bypass.json",
      ogc_report_v4_staging_evidence_candidate_path: "artifacts/windows-case-bypass.json"
    } as NodeJS.ProcessEnv;
    const sanitized = reportV4AcceptanceCommandEnvironment(source);

    expect(sanitized.KEEP_ME).toBe("yes");
    expect(sanitized.OGC_REPORT_V4_STAGING_EVIDENCE_CANDIDATE_PATH).toBeUndefined();
    expect(sanitized.OGC_REPORT_V4_STAGING_EVIDENCE_PATH).toBeUndefined();
    expect(sanitized.ogc_report_v4_staging_evidence_candidate_path).toBeUndefined();
    expect(source.OGC_REPORT_V4_STAGING_EVIDENCE_CANDIDATE_PATH).toBeDefined();
  });
});
