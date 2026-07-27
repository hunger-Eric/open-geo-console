import { describe, expect, it } from "vitest";
import { selectProviderPassages } from "./provider-passages";

const common = {
  candidateNames: ["美新物流"],
  serviceTerms: ["物流", "专线"],
  controlTerms: ["自营", "自有", "运营"],
  capabilityTerms: ["海外仓", "卡车车队", "清关", "末端"],
  selectorVersion: "provider-passage-selector-v1" as const
};

describe("provider evidence passage selection", () => {
  it("rejects an unrelated publication even when it is readable", () => {
    expect(selectProviderPassages({
      ...common,
      sourceEvidenceId: "source-huawei",
      normalizedText: "华为技术创刊100期。技术创新与行业发展。"
    })).toEqual([]);
  });

  it("selects a relevant passage from the middle of the document", () => {
    const normalizedText = `${"首页导航。".repeat(300)}\n美新物流在美国运营自有海外仓和卡车车队，提供固定专线门到门物流服务。\n联系我们。`;
    const [passage] = selectProviderPassages({
      ...common,
      sourceEvidenceId: "source-anl",
      normalizedText
    });

    expect(passage?.exactExcerpt).toContain("自有海外仓和卡车车队");
    expect(passage?.relevanceScore).toBe(100);
    expect(normalizedText).toContain(passage!.exactExcerpt);
  });

  it("keeps candidate leads below the strict threshold and returns at most three passages", () => {
    const normalizedText = [
      "美新物流提供跨境专线物流服务。",
      "美新物流拥有自有卡车车队并运营固定专线物流。",
      "美新物流运营自有海外仓支持专线物流。",
      "美新物流提供自营清关与末端专线物流服务。"
    ].join("\n");
    const result = selectProviderPassages({ ...common, sourceEvidenceId: "source-many", normalizedText });
    expect(result).toHaveLength(3);
    expect(result.every(({ exactExcerpt }) => normalizedText.includes(exactExcerpt))).toBe(true);
    expect(result[0]!.relevanceScore).toBeGreaterThanOrEqual(result[1]!.relevanceScore);
  });
});
