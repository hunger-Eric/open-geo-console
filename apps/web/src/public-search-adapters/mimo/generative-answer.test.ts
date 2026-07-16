import { describe, expect, it, vi } from "vitest";
import { createMiMoGenerativeSearchAnswerProvider } from "./generative-answer";
import type { MiMoPublicSearchConfig } from "./config";

const config: MiMoPublicSearchConfig = { baseUrl: "https://mimo.example/v1", apiKey: "super-secret-key", model: "mimo-v2.5-pro", locale: "zh-CN", region: "CN" };
const input = { questionId: "question-1", question: "跨境物流服务有哪些？", locale: "zh-CN", region: "CN", signal: new AbortController().signal };
const body = (value: unknown) => ({ ok: true, status: 200, json: async () => ({ id: "resp-1", choices: [{ message: { content: JSON.stringify(value) } }] }) }) as Response;
const valid = { questionId: "question-1", answerText: "服务商甲提供跨境运输。", sources: [{ sourceId: "source-1", title: "跨境服务", canonicalUrl: "https://provider.example/services", citedText: "跨境运输", providerResultOrder: 1 }], refusal: null };

describe("MiMo generative answer adapter", () => {
  it("sends JSON answer prompt and normalizes answer sources", async () => {
    let request: RequestInit | undefined;
    const provider = createMiMoGenerativeSearchAnswerProvider({ config, fetch: vi.fn(async (_url, init) => { request = init; return body(valid); }), now: () => new Date("2030-01-01T00:00:00Z") });
    const result = await provider.answerWithSources(input);
    const sent = JSON.parse(String(request?.body));
    expect(sent).toMatchObject({ model: "mimo-v2.5-pro", temperature: 0.1, response_format: { type: "json_object" } });
    expect(JSON.stringify(sent)).toContain("Answer the supplied ordinary question completely");
    expect(JSON.stringify(sent)).toContain("Return only sources actually used");
    expect(result.answerText).toContain("服务商甲"); expect(result.sources[0]?.canonicalUrl).toBe(valid.sources[0].canonicalUrl);
  });
  it("accepts typed refusals", async () => { const p = createMiMoGenerativeSearchAnswerProvider({ config, fetch: async () => body({ questionId: "question-1", answerText: "", sources: [], refusal: { code: "safety_refusal", reason: "请求涉及安全限制" } }) }); expect((await p.answerWithSources(input)).refusal?.code).toBe("safety_refusal"); });
  it("binds model output to the requested local question identity", async () => { const p = createMiMoGenerativeSearchAnswerProvider({ config, fetch: async () => body({ ...valid, questionId: "model-echo" }) }); await expect(p.answerWithSources(input)).resolves.toMatchObject({ questionId: "question-1" }); });
  it("uses citation annotations returned by the same answer operation as source authority", async () => { const response={ok:true,status:200,json:async()=>({id:"resp-annotations",choices:[{message:{content:JSON.stringify({...valid,sources:[]}),annotations:[{type:"url_citation",url:"https://authority.example/guide?utm_source=mimo",title:"采购指南",summary:"核验交付限制"}]}}]})} as Response; const p=createMiMoGenerativeSearchAnswerProvider({config,fetch:async()=>response}); await expect(p.answerWithSources(input)).resolves.toMatchObject({sources:[{canonicalUrl:"https://authority.example/guide",title:"采购指南",citedText:"核验交付限制"}]}); });
  it("retries one malformed model contract and keeps the second operation's answer and sources", async () => { const transport=vi.fn().mockResolvedValueOnce(body({answerText:"",sources:[],refusal:null})).mockResolvedValueOnce(body(valid)); const p=createMiMoGenerativeSearchAnswerProvider({config,fetch:transport}); await expect(p.answerWithSources(input)).resolves.toMatchObject({answerText:valid.answerText,sources:[expect.objectContaining({canonicalUrl:valid.sources[0].canonicalUrl})]}); expect(transport).toHaveBeenCalledTimes(2); expect(String((JSON.parse(String(transport.mock.calls[1]![1]!.body)) as {messages:{content:string}[]}).messages[1]!.content)).toContain("上一次输出"); });
  it("sanitizes auth, timeout, malformed, empty and unsafe failures", async () => {
    const cases = [
      { response: { ok: false, status: 401 }, error: "authentication" },
      { throw: Object.assign(new Error("timeout"), { name: "AbortError" }), error: "aborted" },
      { response: { ok: true, status: 200, json: async () => { throw new Error("raw-body-secret"); } }, error: "malformed" },
      { response: body({ questionId: "question-1", answerText: "", sources: [], refusal: null }), error: "malformed" },
      { response: body({ ...valid, sources: [{ ...valid.sources[0], canonicalUrl: "http://127.0.0.1/private" }] }), error: "malformed" }
    ];
    for (const c of cases) { const p = createMiMoGenerativeSearchAnswerProvider({ config, fetch: async () => { if ("throw" in c) throw c.throw; return c.response as Response; } }); try { await p.answerWithSources(input); throw new Error("expected failure"); } catch (e) { expect((e as Error).message).not.toContain(config.apiKey); expect((e as Error).message).not.toContain("raw-body-secret"); expect(e).toMatchObject({ errorClass: c.error }); } }
  });
});
