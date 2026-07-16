import { parseGenerativeSearchAnswerResult, type GenerativeSearchAnswerProvider } from "@open-geo-console/ai-report-engine";
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

export function createMiMoGenerativeSearchAnswerProvider(input: { config: MiMoPublicSearchConfig; fetch?: typeof fetch; now?: () => Date }): GenerativeSearchAnswerProvider {
  const transport = input.fetch ?? fetch;
  const now = input.now ?? (() => new Date());
  return { providerId: "xiaomi-mimo", model: input.config.model, searchMode: "native_web_search", async answerWithSources(request) {
    if (request.signal.aborted) throw new MiMoGenerativeSearchAnswerError("aborted", "MiMo answer request was aborted.");
    const searchedAt = now().toISOString();
    let response: Response;
    try { response = await transport(`${input.config.baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.config.apiKey}` }, body: JSON.stringify({ model: input.config.model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `Question: ${request.question}\nLocale: ${request.locale}\nRegion: ${request.region}` }], tools: [{ type: "web_search", force_search: true, limit: 10 }], response_format: { type: "json_object" }, temperature: 0.1, stream: false, thinking: { type: "disabled" } }), signal: request.signal }); }
    catch (error) { if (isAbort(error)) throw new MiMoGenerativeSearchAnswerError("aborted", "MiMo answer request was aborted."); throw new MiMoGenerativeSearchAnswerError("unavailable", "MiMo answer transport failed."); }
    if (response.status === 401 || response.status === 403) throw new MiMoGenerativeSearchAnswerError("authentication", "MiMo answer authentication failed.");
    if (!response.ok) throw new MiMoGenerativeSearchAnswerError("unavailable", `MiMo answer request failed with HTTP ${response.status}.`);
    let payload: unknown; try { payload = await response.json(); } catch { throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer response was not valid JSON."); }
    const content = extractContent(payload); if (!content) throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer response was malformed.");
    let parsed: unknown; try { parsed = JSON.parse(content); } catch { throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer content was not valid JSON."); }
    const parsedRecord = record(parsed); if (!parsedRecord) throw new MiMoGenerativeSearchAnswerError("malformed", "MiMo answer content was malformed.");
    const raw = { ...parsedRecord, searchedAt, completedAt: now().toISOString(), providerResponseId: extractId(payload) };
    try { return parseGenerativeSearchAnswerResult(raw, { expectedQuestionId: request.questionId, locale: request.locale }); }
    catch (error) { throw new MiMoGenerativeSearchAnswerError("malformed", error instanceof Error ? error.message : "MiMo answer response failed validation."); }
  }};
}

function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function extractContent(value: unknown): string | null { const root = record(value); const choices = root?.choices; const first = Array.isArray(choices) ? record(choices[0]) : null; const message = record(first?.message); const c = message?.content; if (typeof c === "string") return c; if (Array.isArray(c)) return c.map((x) => record(x)?.text).filter((x): x is string => typeof x === "string").join(""); return null; }
function extractId(value: unknown): string | null { const id = record(value)?.id; return typeof id === "string" ? id : null; }
function isAbort(error: unknown): boolean { return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"); }

export function resolveMiMoGenerativeSearchAnswerProvider(environment: NodeJS.ProcessEnv, input: { locale: string; region: string }, dependencies: { fetch?: typeof fetch; now?: () => Date } = {}) { return createMiMoGenerativeSearchAnswerProvider({ config: readMiMoPublicSearchConfig(environment, input.locale, input.region), ...dependencies }); }
