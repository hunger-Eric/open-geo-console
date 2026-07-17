import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerativeSearchAnswerCardV3 } from "@open-geo-console/ai-report-engine";

const replacementTerminalGuard = vi.hoisted(() => {
  const state = { blockedSite: null as string | null, guardSites: [] as string[], delegatedSites: [] as string[] };
  const blocked = new Error("blocked by replacement terminalization guard test");
  return {
    state,
    blocked,
    run: vi.fn(async (input: { guardSite: string; delegate: () => Promise<unknown> }) => {
      state.guardSites.push(input.guardSite);
      if (state.blockedSite === input.guardSite) throw blocked;
      state.delegatedSites.push(input.guardSite);
      return input.delegate();
    })
  };
});
const replacementTerminalDatabase = vi.hoisted(() => ({
  ensureDatabase: vi.fn(),
  begin: vi.fn(),
  getSqlClient: vi.fn()
}));

vi.mock("@/report-v4/prohibited-operation-guard-runtime", () => ({
  runReportV4GuardedOperation: replacementTerminalGuard.run
}));
vi.mock("./index", () => ({
  ensureDatabase: replacementTerminalDatabase.ensureDatabase,
  getSqlClient: replacementTerminalDatabase.getSqlClient
}));
vi.mock("@open-geo-console/ai-report-engine", () => ({
  requireReadyCombinedGeoReport: (value: unknown) => value,
  requireReadyCombinedGeoReportV2: (value: unknown) => value,
  requireReadyCombinedGeoReportV3: (value: unknown) => value
}));

import { combinedV3CommercialOutcome } from "./combined-correction-terminalization";
import { replacementRefundAllowsActivation, terminalizeCombinedReplacement } from "./combined-replacement-terminalization";

beforeEach(() => {
  vi.clearAllMocks();
  replacementTerminalGuard.state.blockedSite = null;
  replacementTerminalGuard.state.guardSites.length = 0;
  replacementTerminalGuard.state.delegatedSites.length = 0;
  replacementTerminalDatabase.ensureDatabase.mockResolvedValue(undefined);
  replacementTerminalDatabase.getSqlClient.mockReturnValue({ begin: replacementTerminalDatabase.begin });
});

describe("combined replacement terminalization outcomes", () => {
  it("uses delivered generative answers instead of audit coverage", () => {
    const cards = [generative("answered",0),generative("answered",1),generative("answered",2)];
    expect(combinedV3CommercialOutcome(cards)).toBe("completed");
  });

  it("keeps an all-source-limited replacement non-deliverable", () => {
    const cards = [generative("source_limited",0),generative("source_limited",1),generative("source_limited",2)];
    expect(combinedV3CommercialOutcome(cards)).toBe("failed");
  });

  it("keeps replacement delivery independent from the real refund outcome", () => {
    expect(replacementRefundAllowsActivation("pending")).toBe(true);
    expect(replacementRefundAllowsActivation("submitted")).toBe(true);
    expect(replacementRefundAllowsActivation("refunded")).toBe(true);
    expect(replacementRefundAllowsActivation("failed")).toBe(true);
    expect(replacementRefundAllowsActivation("not_required")).toBe(false);
  });

  it("blocks replacement terminalization before validation or SQL", async () => {
    replacementTerminalGuard.state.blockedSite = "replacement_terminalize";

    await expect(terminalizeCombinedReplacement({} as never)).rejects.toBe(replacementTerminalGuard.blocked);

    expect(replacementTerminalGuard.state.guardSites).toEqual(["replacement_terminalize"]);
    expect(replacementTerminalGuard.state.delegatedSites).toEqual([]);
    expect(replacementTerminalDatabase.ensureDatabase).not.toHaveBeenCalled();
    expect(replacementTerminalDatabase.getSqlClient).not.toHaveBeenCalled();
    expect(replacementTerminalDatabase.begin).not.toHaveBeenCalled();
  });

  it("delegates replacement terminalization once and preserves its transaction failure", async () => {
    const failure = new Error("replacement terminalization transaction failed");
    replacementTerminalDatabase.begin.mockRejectedValueOnce(failure);

    await expect(terminalizeCombinedReplacement({
      report: { artifactContract: "combined_geo_report_v3", answerCards: [generative("answered", 0), generative("answered", 1), generative("answered", 2)] },
      workerId: "worker-1",
      checkpointIdentityHash: "checkpoint-1",
      snapshotRefs: [],
      htmlSha256: "h".repeat(64),
      pdfSha256: "p".repeat(64),
      pdfStorageKey: "private/report.pdf",
      pageCount: 5
    })).rejects.toBe(failure);

    expect(replacementTerminalGuard.state.guardSites).toEqual(["replacement_terminalize"]);
    expect(replacementTerminalGuard.state.delegatedSites).toEqual(["replacement_terminalize"]);
    expect(replacementTerminalDatabase.ensureDatabase).toHaveBeenCalledTimes(1);
    expect(replacementTerminalDatabase.begin).toHaveBeenCalledTimes(1);
  });
});

function generative(status:"answered"|"source_limited",index:number):GenerativeSearchAnswerCardV3{return {answerMode:"generative_search_v1",questionId:`question-${index}`,exactQuestion:"Which provider is suitable?",status,answerText:"Provider alpha is suitable.",sources:status==="answered"?[{sourceId:`source-${index}`,title:"Provider",canonicalUrl:`https://provider-${index}.example`,registrableDomain:`provider-${index}.example`,citedText:null,providerResultOrder:0,retrievalStatus:"search_source_only",ownershipCategory:"unknown"}]:[],provenance:{providerId:"mimo",model:"fixture",searchMode:"native_web_search",promptVersion:"generative-search-answer-v1",searchedAt:"2030-01-01T00:00:00.000Z",completedAt:"2030-01-01T00:00:01.000Z",answerHash:"a".repeat(64),sourceHash:"b".repeat(64)},refusal:null,geoDiagnosis:{targetMentioned:false,targetFirstSentence:null,targetRoles:[],competitorEntityIds:[],citedOwnership:{target_owned:0,competitor_owned:0,third_party_editorial:0,directory:0,government:0,other:0,institution:0,community:0,social:0,unknown:0},missingEvidenceFamilies:[],retestQuestion:"Which provider is suitable?"},audit:{verifiedBodyCount:0,searchSourceOnlyCount:status==="answered"?1:0,inaccessibleCount:0}};}
