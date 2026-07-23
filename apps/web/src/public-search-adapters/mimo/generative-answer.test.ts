import { describe, expect, it, vi } from "vitest";
import { createMiMoGenerativeSearchAnswerProvider } from "./generative-answer";
import type { MiMoPublicSearchConfig } from "./config";

const config: MiMoPublicSearchConfig = { baseUrl: "https://mimo.example/v1", apiKey: "super-secret-key", model: "mimo-v2.5-pro", locale: "zh-CN", region: "CN" };
const input = { questionId: "question-1", question: "跨境物流服务有哪些？", locale: "zh-CN", region: "CN", signal: new AbortController().signal };
const body = (value: unknown) => ({ ok: true, status: 200, json: async () => ({ id: "resp-1", choices: [{ message: { content: JSON.stringify(value) } }] }) }) as Response;
const valid = { questionId: "question-1", answerText: "服务商甲提供跨境运输。", sources: [{ sourceId: "source-1", title: "跨境服务", canonicalUrl: "https://provider.example/services", citedText: "跨境运输", providerResultOrder: 1 }], refusal: null };

describe("MiMo generative answer adapter", () => {
  const mixedLanguage = { ...valid, answerText: "可选方案：Brand-X FBA first-mile service is available for this route." };

  it("uses explicit deferred semantics for marked mixed-language terms without a language retry", async () => {
    let request: RequestInit | undefined;
    const transport = vi.fn(async (_url, init) => { request = init; return body(mixedLanguage); });
    const provider = createMiMoGenerativeSearchAnswerProvider({ config, fetch: transport });
    await expect(provider.answerWithSources({ ...input, semanticValidation: "deferred" }))
      .resolves.toMatchObject({ answerText: mixedLanguage.answerText });
    expect(transport).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(request?.body)) as { messages: Array<{ content: string }> };
    expect(sent.messages[0]!.content).toContain("Preserve brand names, product names, acronyms");
    expect(sent.messages[1]!.content).toContain("preserving appropriate brands");
  });

  it("uses the terminology-preserving deferred prompt for non-Chinese requested locales", async () => {
    let request: RequestInit | undefined;
    const transport = vi.fn(async (_url, init) => { request = init; return body({ ...valid, answerText: "Brand-X FBA first-mile service is available." }); });
    const provider = createMiMoGenerativeSearchAnswerProvider({ config, fetch: transport });
    await provider.answerWithSources({ ...input, locale: "en-US", semanticValidation: "deferred" });
    const sent = JSON.parse(String(request?.body)) as { messages: Array<{ content: string }> };
    expect(sent.messages[0]!.content).toContain("naturally in the requested locale");
    expect(sent.messages[1]!.content).toContain("natural prose in the requested locale");
    expect(sent.messages[1]!.content).toContain("preserving appropriate brands");
  });

  it("retries a marked request only for malformed structure and keeps deferred terminology instructions", async () => {
    const transport = vi.fn().mockResolvedValueOnce(body({ answerText: "", sources: [], refusal: null })).mockResolvedValueOnce(body(mixedLanguage));
    const provider = createMiMoGenerativeSearchAnswerProvider({ config, fetch: transport });
    await expect(provider.answerWithSources({ ...input, semanticValidation: "deferred" }))
      .resolves.toMatchObject({ answerText: mixedLanguage.answerText });
    expect(transport).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(String(transport.mock.calls[1]![1]!.body)) as { messages: Array<{ content: string }> };
    expect(retry.messages[1]!.content).toContain("failed the JSON or structural contract");
    expect(retry.messages[1]!.content).not.toContain("JSON or language contract");
  });

  it("keeps omitted and explicit legacy requests on the exact same prompt and parser behavior", async () => {
    const sent: string[] = [];
    const makeProvider = () => createMiMoGenerativeSearchAnswerProvider({ config, fetch: async (_url, init) => { sent.push(String(init?.body)); return body(valid); } });
    await makeProvider().answerWithSources(input);
    await makeProvider().answerWithSources({ ...input, semanticValidation: "legacy" });
    expect(sent[1]).toBe(sent[0]);
    expect(JSON.parse(sent[0]!)).toMatchInlineSnapshot(`
      {
        "messages": [
          {
            "content": "你必须返回且只返回 JSON 对象。请使用联网搜索完整回答普通问题，并只列出本次回答实际使用的公开来源。answerText 和 refusal.reason 必须全部使用简体中文，不得出现英文单词、英文缩写或括号内英文；请把专业术语翻译成中文。只有来源标题与引用原文可以保持原文。不要用搜索覆盖率、检索过程或“证据不足”代替答案。只有真实的安全、政策或高风险原因才允许拒绝。
      Return JSON only.
      Answer the supplied ordinary question completely using web search.
      Return only sources actually used by this answer operation, and ensure they are public sources.
      Do not replace the answer with a description of search coverage.
      If sources are incomplete, still return the complete answer and the sources available.
      Set refusal only for a genuine safety, policy, or high-risk refusal.
      Write generated prose in the requested locale; preserve source titles and cited text verbatim.
      Use exactly this JSON shape:
      {"questionId":"the supplied question ID","answerText":"complete answer, or empty only for a typed refusal","sources":[{"sourceId":"stable source ID","title":"source title","canonicalUrl":"public http(s) URL","citedText":"supporting text or null","providerResultOrder":0}],"refusal":null}
      For a refusal, refusal must be {"code":"safety_refusal|policy_refusal|high_risk_refusal","reason":"localized reason"} and sources must be empty.",
            "role": "system",
          },
          {
            "content": "Question: 跨境物流服务有哪些？
      Locale: zh-CN
      Region: CN
      除来源标题和引用原文外，answerText 和 refusal.reason 必须全部使用简体中文；不要写任何英文单词或缩写，把专业术语翻译为中文。",
            "role": "user",
          },
        ],
        "model": "mimo-v2.5-pro",
        "response_format": {
          "type": "json_object",
        },
        "stream": false,
        "temperature": 0.1,
        "thinking": {
          "type": "disabled",
        },
        "tools": [
          {
            "force_search": true,
            "limit": 10,
            "type": "web_search",
          },
        ],
      }
    `);

    const transport = vi.fn(async () => body(mixedLanguage));
    await expect(createMiMoGenerativeSearchAnswerProvider({ config, fetch: transport }).answerWithSources(input))
      .rejects.toMatchObject({ errorClass: "malformed" });
    expect(transport).toHaveBeenCalledTimes(2);
  });

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
