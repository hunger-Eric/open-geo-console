import { describe, expect, it } from "vitest";
import { generativeSearchAnswerHash, generativeSearchSourceHash, parseGenerativeSearchAnswerResult } from "./generative-search-answer";

const valid = { questionId: "question-1", answerText: "服务商甲提供跨境海运，服务商乙提供跨境空运。", sources: [{ sourceId: "source-1", title: "跨境物流服务", canonicalUrl: "https://provider.example/services?utm_source=model", registrableDomain: "wrong.example", citedText: "提供跨境海运服务", providerResultOrder: 1 }], refusal: null, searchedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z", providerResponseId: "response-1" };
describe("parseGenerativeSearchAnswerResult", () => {
  it("accepts and canonicalizes public sources", () => { const parsed = parseGenerativeSearchAnswerResult(valid, { expectedQuestionId: "question-1", locale: "zh-CN" }); expect(parsed.answerText).toContain("服务商甲"); expect(parsed.sources[0]!.canonicalUrl).toBe("https://provider.example/services"); expect(parsed.sources[0]!.registrableDomain).toBe("provider.example"); });
  it("rejects blank answers without typed refusal", () => { expect(() => parseGenerativeSearchAnswerResult({ ...valid, answerText: "" }, { expectedQuestionId: "question-1", locale: "zh-CN" })).toThrow(/nonblank answer/i); });
  it("rejects mismatched IDs and answer/refusal", () => { expect(() => parseGenerativeSearchAnswerResult(valid, { expectedQuestionId: "other", locale: "zh-CN" })).toThrow(/questionId/); expect(() => parseGenerativeSearchAnswerResult({ ...valid, refusal: { code: "policy_refusal", reason: "拒绝" } }, { expectedQuestionId: "question-1", locale: "zh-CN" })).toThrow(/simultaneous|may not/); });
  it("deduplicates URLs by lowest provider order", () => { const parsed = parseGenerativeSearchAnswerResult({ ...valid, sources: [valid.sources[0], { ...valid.sources[0], providerResultOrder: 0, canonicalUrl: "https://provider.example/services#x" }] }, { expectedQuestionId: "question-1", locale: "zh-CN" }); expect(parsed.sources).toHaveLength(1); expect(parsed.sources[0]!.providerResultOrder).toBe(0); });
  it("rejects reversed timestamps", () => { expect(() => parseGenerativeSearchAnswerResult({ ...valid, searchedAt: "2030-01-01T00:00:02.000Z" }, { expectedQuestionId: "question-1", locale: "zh-CN" })).toThrow(/completedAt/); });
  it("rejects private URLs", () => { expect(() => parseGenerativeSearchAnswerResult({ ...valid, sources: [{ ...valid.sources[0], canonicalUrl: "http://127.0.0.1/private" }] }, { expectedQuestionId: "question-1", locale: "zh-CN" })).toThrow(/public HTTP/i); });
  it("accepts typed refusals", () => { const parsed = parseGenerativeSearchAnswerResult({ ...valid, answerText: "", sources: [], refusal: { code: "safety_refusal", reason: "服务商安全拒绝。" } }, { expectedQuestionId: "question-1", locale: "zh-CN" }); expect(parsed.refusal?.code).toBe("safety_refusal"); });
  it("accepts typed insufficient evidence", () => { const parsed = parseGenerativeSearchAnswerResult({ ...valid, answerText: "", sources: [], refusal: { code: "insufficient_evidence", reason: "当前公开来源不足。" } }, { expectedQuestionId: "question-1", locale: "zh-CN" }); expect(parsed.refusal?.code).toBe("insufficient_evidence"); });
  it("accepts normalized provider refusals with retained sources", () => { const parsed = parseGenerativeSearchAnswerResult({ ...valid, answerText: "", refusal: { code: "provider_refusal", reason: "供应商返回了非标准拒绝。" } }, { expectedQuestionId: "question-1", locale: "zh-CN", semanticValidation: "free_direct" }); expect(parsed.refusal?.code).toBe("provider_refusal"); expect(parsed.sources).toHaveLength(1); });
  it("retains and hashes only the first ten supplied sources instead of rejecting the result", async () => {
    const sources = Array.from({ length: 12 }, (_, index) => ({ ...valid.sources[0], sourceId: `source-${index}`, title: `Source ${index}`, canonicalUrl: `https://provider-${index}.example/evidence`, providerResultOrder: index }));
    const parsed = parseGenerativeSearchAnswerResult({ ...valid, sources }, { expectedQuestionId: "question-1", locale: "zh-CN", semanticValidation: "free_direct", sourceOverflow: "truncate" });
    expect(parsed.sources).toHaveLength(10);
    expect(parsed.sources.at(-1)?.sourceId).toBe("source-9");
    expect(() => parseGenerativeSearchAnswerResult({ ...valid, sources }, { expectedQuestionId: "question-1", locale: "zh-CN", semanticValidation: "free_direct" })).toThrow(/internal retained explanation budget/i);
    await expect(generativeSearchAnswerHash(parsed, { locale: "zh-CN", semanticValidation: "free_direct" })).resolves.toMatch(/^[a-f0-9]{64}$/);
  });
  it("discards an overlong optional provider response ID", () => { const parsed = parseGenerativeSearchAnswerResult({ ...valid, providerResponseId: "r".repeat(501) }, { expectedQuestionId: "question-1", locale: "zh-CN" }); expect(parsed.providerResponseId).toBeNull(); });
  it("keeps Direct zero-source answers and refusal annotations as valid core outcomes", () => {
    expect(parseGenerativeSearchAnswerResult({ ...valid, sources: [], harmlessExtra: true }, { expectedQuestionId: "question-1", locale: "zh-CN", semanticValidation: "free_direct" }).sources).toEqual([]);
    const refused = parseGenerativeSearchAnswerResult({ ...valid, answerText: "", refusal: { code: "policy_refusal", reason: "服务商政策拒绝。" } }, { expectedQuestionId: "question-1", locale: "zh-CN", semanticValidation: "free_direct" });
    expect(refused.refusal?.code).toBe("policy_refusal");
    expect(refused.sources).toHaveLength(1);
  });
  it("produces a stable hash", async () => { await expect(generativeSearchAnswerHash(valid)).resolves.toMatch(/^[a-f0-9]{64}$/); });
  it("hashes a localized typed refusal", async () => { await expect(generativeSearchAnswerHash({ ...valid, answerText: "", sources: [], refusal: { code: "policy_refusal", reason: "服务商政策拒绝。" } })).resolves.toMatch(/^[a-f0-9]{64}$/); });
  it("hashes source arrays stably regardless of order", async () => { const parsed = parseGenerativeSearchAnswerResult(valid, { expectedQuestionId: "question-1", locale: "zh-CN" }); await expect(generativeSearchSourceHash(parsed.sources)).resolves.toBe(await generativeSearchSourceHash([...parsed.sources].reverse())); });
  it("hashes persisted sources stably regardless of JSON object key order", async () => {
    const parsed = parseGenerativeSearchAnswerResult(valid, { expectedQuestionId: "question-1", locale: "zh-CN" });
    const reordered = parsed.sources.map((source) => ({
      providerResultOrder: source.providerResultOrder,
      citedText: source.citedText,
      registrableDomain: source.registrableDomain,
      canonicalUrl: source.canonicalUrl,
      title: source.title,
      sourceId: source.sourceId
    }));
    await expect(generativeSearchSourceHash(reordered)).resolves.toBe(await generativeSearchSourceHash(parsed.sources));
  });
  it("rejects prose in the wrong locale", () => { expect(() => parseGenerativeSearchAnswerResult({ ...valid, answerText: "This is an ordinary English sentence." }, { expectedQuestionId: "question-1", locale: "zh-CN" })).toThrow(/language/i); });
  it("defers language judgment only when the caller explicitly opts into the unified semantic review", async () => {
    const mixed = { ...valid, answerText: "A new Brand-X FBA product is described in English for this Chinese report." };
    const parsed = parseGenerativeSearchAnswerResult(mixed, {
      expectedQuestionId: "question-1",
      locale: "zh-CN",
      semanticValidation: "deferred"
    });
    expect(parsed.answerText).toContain("Brand-X FBA");
    await expect(generativeSearchAnswerHash(parsed, { locale: "zh-CN", semanticValidation: "deferred" }))
      .resolves.toMatch(/^[a-f0-9]{64}$/u);
  });
  it("rejects an English answer with only a short Chinese preface", () => {
    expect(() => parseGenerativeSearchAnswerResult({
      ...valid,
      answerText: "可选方案：This answer is otherwise ordinary English prose about providers, delivery, pricing, and market access."
    }, { expectedQuestionId: "question-1", locale: "zh-CN" })).toThrow(/language/i);
  });
  it("accepts Chinese provider discovery answers containing unavoidable official Latin names", () => {
    const parsed = parseGenerativeSearchAnswerResult({
      ...valid,
      answerText: `${"公开资料显示该服务商提供模型接入并支持全球部署。".repeat(12)} ${"MiMo-V2.5-Pro TencentCloud ApiAirforce YahooFinance ".repeat(3)}`
    }, { expectedQuestionId: "question-1", locale: "zh-CN" });
    expect(parsed.answerText).toContain("MiMo-V2.5-Pro");
  });
  it("accepts predominantly Chinese answers with ordinary industry acronyms", () => {
    const parsed = parseGenerativeSearchAnswerResult({
      ...valid,
      answerText: "跨境物流方案应核验 FBA 头程、API 对接、ISO 认证和各目的地的清关交付条件。"
    }, { expectedQuestionId: "question-1", locale: "zh-CN" });
    expect(parsed.answerText).toContain("FBA");
  });
});
