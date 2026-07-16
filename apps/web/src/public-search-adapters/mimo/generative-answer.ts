import { parseGenerativeSearchAnswerResult, type GenerativeSearchAnswerProvider } from "@open-geo-console/ai-report-engine";
import { isBlockedHostname, parseHttpUrl } from "@open-geo-console/site-crawler";
import { readMiMoPublicSearchConfig, type MiMoPublicSearchConfig } from "./config";

export type MiMoAnswerErrorClass = "authentication" | "aborted" | "unavailable" | "malformed";
export class MiMoGenerativeSearchAnswerError extends Error {
  constructor(readonly errorClass: MiMoAnswerErrorClass, message: string) { super(message); this.name = "MiMoGenerativeSearchAnswerError"; }
}

const SYSTEM = `Return JSON only.
Answer the supplied ordinary question completely using web search.
Return only sources actually used by this answer operation, and ensure they are public sources.
Do not replace the answer with a description of search coverage.
If sources are incomplete, still return the complete answer and the sources available.
Set refusal only for a genuine safety, policy, or high-risk refusal.
Write generated prose in the requested locale; preserve source titles and cited text verbatim.
Use exactly this JSON shape:
{"questionId":"the supplied question ID","answerText":"complete answer, or empty only for a typed refusal","sources":[{"sourceId":"stable source ID","title":"source title","canonicalUrl":"public http(s) URL","citedText":"supporting text or null","providerResultOrder":0}],"refusal":null}
For a refusal, refusal must be {"code":"safety_refusal|policy_refusal|high_risk_refusal","reason":"localized reason"} and sources must be empty.`;
const CHINESE_SYSTEM = `你必须返回且只返回 JSON 对象。请使用联网搜索完整回答普通问题，并只列出本次回答实际使用的公开来源。answerText 和 refusal.reason 必须全部使用简体中文，不得出现英文单词、英文缩写或括号内英文；请把专业术语翻译成中文。只有来源标题与引用原文可以保持原文。不要用搜索覆盖率、检索过程或“证据不足”代替答案。只有真实的安全、政策或高风险原因才允许拒绝。\n${SYSTEM}`;

export function createMiMoGenerativeSearchAnswerProvider(input: { config: MiMoPublicSearchConfig; fetch?: typeof fetch; now?: () => Date }): GenerativeSearchAnswerProvider {
  const transport = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  return { providerId: "xiaomi-mimo", model: input.config.model, searchMode: "native_web_search", async answerWithSources(request) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { return await requestOnce(input.config, transport, now, request, attempt === 1); }
      catch (error) {
        if (attempt === 0 && error instanceof MiMoGenerativeSearchAnswerError && error.errorClass === "malformed") continue;
        throw error;
      }
    }
    throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer response failed validation.");
  }};
}

async function requestOnce(config: MiMoPublicSearchConfig, transport: typeof fetch, now: () => Date, request: Parameters<GenerativeSearchAnswerProvider["answerWithSources"]>[0], correction: boolean) {
    if (request.signal.aborted) throw new MiMoGenerativeSearchAnswerError("aborted", "MiMo answer request was aborted.");
    const searchedAt = now().toISOString();
    let response: Response;
    const chinese = request.locale.toLowerCase().startsWith("zh");
    const localeInstruction = chinese ? "除来源标题和引用原文外，answerText 和 refusal.reason 必须全部使用简体中文；不要写任何英文单词或缩写，把专业术语翻译为中文。" : "Write answerText and refusal.reason in English; preserve only source-original fields.";
    const correctionText = correction ? (chinese
      ? "\n上一次输出未满足 JSON 或语言契约。请严格返回指定对象，用简体中文完整回答；answerText 不得包含任何英文字母、英文缩写或括号内英文，并列出本次回答实际使用的公开来源。"
      : "\nYour previous output did not satisfy the JSON or language contract. Return exactly the requested object with a complete English answer and the public sources used.") : "";
    try { response = await transport(`${config.baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, messages: [{ role: "system", content: chinese ? CHINESE_SYSTEM : SYSTEM }, { role: "user", content: `Question: ${request.question}\nLocale: ${request.locale}\nRegion: ${request.region}\n${localeInstruction}${correctionText}` }], tools: [{ type: "web_search", force_search: true, limit: 10 }], response_format: { type: "json_object" }, temperature: 0.1, stream: false, thinking: { type: "disabled" } }), signal: request.signal }); }
    catch (error) { if (isAbort(error)) throw new MiMoGenerativeSearchAnswerError("aborted", "MiMo answer request was aborted."); throw new MiMoGenerativeSearchAnswerError("unavailable", "MiMo answer transport failed."); }
    if (response.status === 401 || response.status === 403) throw new MiMoGenerativeSearchAnswerError("authentication", "MiMo answer authentication failed.");
    if (!response.ok) throw new MiMoGenerativeSearchAnswerError("unavailable", `MiMo answer request failed with HTTP ${response.status}.`);
    let payload: unknown; try { payload = await response.json(); } catch { throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer response was not valid JSON."); }
    const content = extractContent(payload); if (!content) throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer response was malformed.");
    let parsed: unknown; try { parsed = JSON.parse(content); } catch { throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer content was not valid JSON."); }
    const parsedRecord = record(parsed); if (!parsedRecord) throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer content was malformed.");
    // The question ID is local correlation metadata, not generated prose. Bind
    // it to the request so a model echo cannot misroute an otherwise valid answer.
    const annotationSources = extractAnnotationSources(payload);
    const raw = { ...parsedRecord, questionId: request.questionId, sources: annotationSources.length ? annotationSources : parsedRecord.sources, searchedAt, completedAt: now().toISOString(), providerResponseId: extractId(payload) };
    try { return parseGenerativeSearchAnswerResult(raw, { expectedQuestionId: request.questionId, locale: request.locale }); }
    catch (error) {
      const message = error instanceof Error ? error.message : "MiMo answer response failed validation.";
      throw new MiMoGenerativeSearchAnswerError("malformed", /language/i.test(message) ? `${message} ${languageShape(parsedRecord.answerText)}` : message);
    }
}

function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function extractContent(value: unknown): string | null { const root = record(value); const choices = root?.choices; const first = Array.isArray(choices) ? record(choices[0]) : null; const message = record(first?.message); const c = message?.content; if (typeof c === "string") return c; if (Array.isArray(c)) return c.map((x) => record(x)?.text).filter((x): x is string => typeof x === "string").join(""); return null; }
function extractId(value: unknown): string | null { const id = record(value)?.id; return typeof id === "string" ? id : null; }
function extractAnnotationSources(value: unknown) {
  const root=record(value); const choices=root?.choices; const first=Array.isArray(choices)?record(choices[0]):null; const message=record(first?.message); const annotations=message?.annotations;
  if(!Array.isArray(annotations))return [];
  return annotations.flatMap((item,index)=>{
    const row=record(item); if(row?.type!=="url_citation"||typeof row.url!=="string"||typeof row.title!=="string"||!row.url.trim()||!row.title.trim()||row.url.length>2_000)return [];
    try { const parsed=parseHttpUrl(row.url); if(isBlockedHostname(parsed.hostname))return []; }
    catch { return []; }
    const citedText=typeof row.summary==="string"&&row.summary.trim()?row.summary.trim().slice(0,2_000):null;
    return [{sourceId:`mimo-annotation-${index+1}`,title:row.title.trim().slice(0,500),canonicalUrl:row.url,citedText,providerResultOrder:index}];
  }).slice(0,20);
}
function languageShape(value: unknown): string { if(typeof value!=="string")return "(answer type is not text)."; const cjk=(value.match(/[\u3400-\u9fff]/gu)??[]).length; const latin=(value.match(/[A-Za-z]/gu)??[]).length; return `(answer length ${value.length}, CJK ${cjk}, Latin ${latin}).`; }
function isAbort(error: unknown): boolean { return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"); }

export function resolveMiMoGenerativeSearchAnswerProvider(environment: NodeJS.ProcessEnv, input: { locale: string; region: string }, dependencies: { fetch?: typeof fetch; now?: () => Date } = {}) { return createMiMoGenerativeSearchAnswerProvider({ config: readMiMoPublicSearchConfig(environment, input.locale, input.region), ...dependencies }); }
