export type AiCrawlerOperator =
  | "OpenAI"
  | "Anthropic"
  | "Perplexity"
  | "Google"
  | "Microsoft"
  | "Meta"
  | "ByteDance"
  | "Amazon"
  | "Common Crawl";

export type CrawlerIntent = "training" | "search" | "assistant" | "preview" | "general";

export interface CrawlerRule {
  id: string;
  operator: AiCrawlerOperator;
  bot: string;
  intent: CrawlerIntent;
  pattern: RegExp;
  docsUrl?: string;
}

export interface CrawlerMatch {
  operator: AiCrawlerOperator;
  bot: string;
  intent: CrawlerIntent;
  ruleId: string;
}

export const crawlerRules: CrawlerRule[] = [
  {
    id: "openai-gptbot",
    operator: "OpenAI",
    bot: "GPTBot",
    intent: "training",
    pattern: /\bGPTBot\b/i,
    docsUrl: "https://platform.openai.com/docs/gptbot"
  },
  {
    id: "openai-oai-searchbot",
    operator: "OpenAI",
    bot: "OAI-SearchBot",
    intent: "search",
    pattern: /\bOAI-SearchBot\b/i
  },
  {
    id: "openai-chatgpt-user",
    operator: "OpenAI",
    bot: "ChatGPT-User",
    intent: "assistant",
    pattern: /\bChatGPT-User\b/i
  },
  {
    id: "anthropic-claudebot",
    operator: "Anthropic",
    bot: "ClaudeBot",
    intent: "training",
    pattern: /\bClaudeBot\b/i
  },
  {
    id: "anthropic-claude-searchbot",
    operator: "Anthropic",
    bot: "Claude-SearchBot",
    intent: "search",
    pattern: /\bClaude-SearchBot\b/i
  },
  {
    id: "perplexity-perplexitybot",
    operator: "Perplexity",
    bot: "PerplexityBot",
    intent: "search",
    pattern: /\bPerplexityBot\b/i
  },
  {
    id: "google-extended",
    operator: "Google",
    bot: "Google-Extended",
    intent: "training",
    pattern: /\bGoogle-Extended\b/i
  },
  {
    id: "google-googlebot",
    operator: "Google",
    bot: "Googlebot",
    intent: "search",
    pattern: /\bGooglebot\b/i
  },
  {
    id: "microsoft-bingbot",
    operator: "Microsoft",
    bot: "Bingbot",
    intent: "search",
    pattern: /\bbingbot\b/i
  },
  {
    id: "microsoft-copilot",
    operator: "Microsoft",
    bot: "Microsoft Copilot",
    intent: "assistant",
    pattern: /\b(Microsoft-Copilot|CopilotBot|msnbot)\b/i
  },
  {
    id: "meta-external-agent",
    operator: "Meta",
    bot: "Meta-ExternalAgent",
    intent: "training",
    pattern: /\bMeta-ExternalAgent\b/i
  },
  {
    id: "bytedance-bytespider",
    operator: "ByteDance",
    bot: "Bytespider",
    intent: "training",
    pattern: /\bBytespider\b/i
  },
  {
    id: "amazon-amazonbot",
    operator: "Amazon",
    bot: "Amazonbot",
    intent: "general",
    pattern: /\bAmazonbot\b/i
  },
  {
    id: "common-crawl-ccbot",
    operator: "Common Crawl",
    bot: "CCBot",
    intent: "training",
    pattern: /\bCCBot\b/i
  }
];

export function matchUserAgent(userAgent: string | null | undefined): CrawlerMatch | null {
  if (!userAgent || userAgent.trim() === "-" || userAgent.trim() === "") {
    return null;
  }

  const rule = crawlerRules.find((candidate) => candidate.pattern.test(userAgent));
  if (!rule) {
    return null;
  }

  return {
    operator: rule.operator,
    bot: rule.bot,
    intent: rule.intent,
    ruleId: rule.id
  };
}

export function isKnownAiCrawler(userAgent: string | null | undefined): boolean {
  return matchUserAgent(userAgent) !== null;
}
