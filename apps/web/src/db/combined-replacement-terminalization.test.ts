import { describe, expect, it } from "vitest";
import type { GenerativeSearchAnswerCardV3 } from "@open-geo-console/ai-report-engine";
import { combinedV3CommercialOutcome } from "./combined-correction-terminalization";
import { replacementRefundAllowsActivation } from "./combined-replacement-terminalization";

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
});

function generative(status:"answered"|"source_limited",index:number):GenerativeSearchAnswerCardV3{return {answerMode:"generative_search_v1",questionId:`question-${index}`,exactQuestion:"Which provider is suitable?",status,answerText:"Provider alpha is suitable.",sources:status==="answered"?[{sourceId:`source-${index}`,title:"Provider",canonicalUrl:`https://provider-${index}.example`,registrableDomain:`provider-${index}.example`,citedText:null,providerResultOrder:0,retrievalStatus:"search_source_only",ownershipCategory:"unknown"}]:[],provenance:{providerId:"mimo",model:"fixture",searchMode:"native_web_search",promptVersion:"generative-search-answer-v1",searchedAt:"2030-01-01T00:00:00.000Z",completedAt:"2030-01-01T00:00:01.000Z",answerHash:"a".repeat(64),sourceHash:"b".repeat(64)},refusal:null,geoDiagnosis:{targetMentioned:false,targetFirstSentence:null,targetRoles:[],competitorEntityIds:[],citedOwnership:{target_owned:0,competitor_owned:0,third_party_editorial:0,directory:0,government:0,other:0,institution:0,community:0,social:0,unknown:0},missingEvidenceFamilies:[],retestQuestion:"Which provider is suitable?"},audit:{verifiedBodyCount:0,searchSourceOnlyCount:status==="answered"?1:0,inaccessibleCount:0}};}
