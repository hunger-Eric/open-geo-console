import { createOpenAiCompatibleClient } from "@open-geo-console/ai-report-engine";

const client = configuredClient();
const result = await client.completeJson({
  temperature: 0,
  maxTokens: 200,
  messages: [
    { role: "system", content: "Return JSON only." },
    { role: "user", content: "Return exactly an object with ok=true and capability='website-analysis'." }
  ]
});
if (!result.value || typeof result.value !== "object" || (result.value as { ok?: unknown }).ok !== true) {
  throw new Error("The configured model responded, but did not follow the JSON probe contract.");
}
process.stdout.write(`AI endpoint is ready. model=${result.modelId}\n`);

function configuredClient() {
  const baseUrl = process.env.OGC_AI_BASE_URL?.trim();
  const apiKey = process.env.OGC_AI_API_KEY?.trim();
  const model = process.env.OGC_AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) {
    throw new Error("OGC_AI_BASE_URL, OGC_AI_API_KEY, and OGC_AI_MODEL are required.");
  }
  return createOpenAiCompatibleClient({
    baseUrl,
    apiKey,
    model,
    useJsonResponseFormat: process.env.OGC_AI_JSON_RESPONSE_FORMAT === "true"
  });
}
