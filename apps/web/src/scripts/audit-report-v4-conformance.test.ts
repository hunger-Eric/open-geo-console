import { describe, expect, it } from "vitest";
import { parseReportV4AuditArgs } from "./audit-report-v4-conformance";

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
});
