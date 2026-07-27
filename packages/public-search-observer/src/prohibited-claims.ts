export interface ProhibitedClaimFinding {
  code: "named_model_attribution" | "ai_rank_attribution" | "model_agreement" | "selection_probability" | "causation_or_guarantee";
  excerpt: string;
}

const RULES: Array<{ code: ProhibitedClaimFinding["code"]; patterns: readonly RegExp[] }> = [
  { code: "named_model_attribution", patterns: [/(?:豆包|千帆|文心|通义|deepseek|chatgpt|perplexity|openai).{0,16}(?:推荐|引用|偏好|首选|排名)/iu, /(?:doubao|qianfan|ernie|tongyi|deepseek|chatgpt|perplexity|openai).{0,30}(?:recommend(?:ed|s)?|cited?|prefers?|ranked?)/iu] },
  { code: "ai_rank_attribution", patterns: [/(?:AI|大模型|模型).{0,12}(?:排名|排行|第一名|首位)/iu, /ranked?\s+(?:first|#?1)\s+by\s+(?:an?\s+)?AI/iu, /搜索.{0,8}(?:第一|顺序).{0,12}(?:AI|模型).{0,8}(?:排名|第一)/iu] },
  { code: "model_agreement", patterns: [/(?:所有|全部|各大|多个).{0,8}(?:模型|大模型).{0,8}(?:一致|都同意|共同推荐)/u, /all\s+(?:AI\s+)?models?\s+agree/iu] },
  { code: "selection_probability", patterns: [/(?:AI|模型).{0,12}(?:引用|推荐|选择).{0,8}(?:概率|可能性)\s*[:：]?\s*\d+%?/iu, /(?:AI|model).{0,15}(?:citation|recommendation|selection)\s+probability/iu] },
  { code: "causation_or_guarantee", patterns: [/(?:保证|确保|必然).{0,12}(?:推荐|引用|排名|收入)/u, /guarantee(?:s|d)?\s+.{0,20}(?:mention|citation|rank|revenue)/iu] }
];

const LIMITATION_CONTEXT = [
  /(?:不能|不可|无法|不应|不得|禁止).{0,12}(?:声称|证明|推断|认为|保证|归因)/u,
  /(?:并非|不代表).{0,28}(?:AI|模型|推荐|排名|引用|概率)/u,
  /(?:does\s+not|cannot|must\s+not|should\s+not|is\s+not|never)\s+(?:claim|prove|infer|mean|represent|guarantee|attribute)/iu,
  /(?:not|no)\s+(?:an?\s+)?(?:AI|model)\s+(?:rank|recommendation|probability|attribution)/iu
];

export function detectProhibitedClaims(text: string): ProhibitedClaimFinding[] {
  if (typeof text !== "string") throw new TypeError("claim text must be a string");
  const segments = text.normalize("NFKC").split(/(?<=[。！？!?;；\n])/u).filter(Boolean);
  const findings: ProhibitedClaimFinding[] = [];
  for (const segment of segments) {
    if (LIMITATION_CONTEXT.some((pattern) => pattern.test(segment))) continue;
    for (const rule of RULES) {
      if (rule.patterns.some((pattern) => pattern.test(segment))) findings.push({ code: rule.code, excerpt: segment.trim().slice(0, 240) });
    }
  }
  return findings;
}

export function assertNoProhibitedClaims(text: string): void {
  const findings = detectProhibitedClaims(text);
  if (findings.length) throw new TypeError(`Prohibited public-search attribution claim: ${findings.map(({ code }) => code).join(", ")}`);
}
