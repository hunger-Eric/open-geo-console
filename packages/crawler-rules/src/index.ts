export type AiCrawlerOperator =
  | "OpenAI"
  | "Anthropic"
  | "Perplexity"
  | "Google"
  | "Microsoft"
  | "Meta"
  | "ByteDance"
  | "Amazon"
  | "Apple"
  | "Common Crawl";

export type CrawlerIntent = "training" | "search" | "assistant" | "preview" | "general";
export type CrawlerDetectability = "log-detectable" | "robots-token-only" | "suspected-or-community";

export interface CrawlerRule {
  id: string;
  operator: AiCrawlerOperator;
  bot: string;
  intent: CrawlerIntent;
  detectability: CrawlerDetectability;
  pattern?: RegExp;
  userAgentPattern?: RegExp;
  robotsToken?: string;
  docsUrl?: string;
  notes?: string;
}

export interface CrawlerMatch {
  operator: AiCrawlerOperator;
  bot: string;
  intent: CrawlerIntent;
  detectability: CrawlerDetectability;
  ruleId: string;
  robotsToken?: string;
  docsUrl?: string;
}

export const crawlerRules: CrawlerRule[] = [
  {
    id: "openai-gptbot",
    operator: "OpenAI",
    bot: "GPTBot",
    intent: "training",
    detectability: "log-detectable",
    pattern: /\bGPTBot\b/i,
    userAgentPattern: /\bGPTBot\b/i,
    robotsToken: "GPTBot",
    docsUrl: "https://developers.openai.com/docs/bots",
    notes: "Official OpenAI crawler for foundation model training."
  },
  {
    id: "openai-oai-searchbot",
    operator: "OpenAI",
    bot: "OAI-SearchBot",
    intent: "search",
    detectability: "log-detectable",
    pattern: /\bOAI-SearchBot\b/i,
    userAgentPattern: /\bOAI-SearchBot\b/i,
    robotsToken: "OAI-SearchBot",
    docsUrl: "https://developers.openai.com/docs/bots",
    notes: "Official OpenAI crawler for ChatGPT search visibility."
  },
  {
    id: "openai-chatgpt-user",
    operator: "OpenAI",
    bot: "ChatGPT-User",
    intent: "assistant",
    detectability: "log-detectable",
    pattern: /\bChatGPT-User\b/i,
    userAgentPattern: /\bChatGPT-User\b/i,
    docsUrl: "https://developers.openai.com/docs/bots",
    notes: "Official user-triggered fetcher; robots.txt may not apply."
  },
  {
    id: "anthropic-claudebot",
    operator: "Anthropic",
    bot: "ClaudeBot",
    intent: "training",
    detectability: "log-detectable",
    pattern: /\bClaudeBot\b/i,
    userAgentPattern: /\bClaudeBot\b/i,
    robotsToken: "ClaudeBot",
    docsUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
    notes: "Official Anthropic crawler for model development data."
  },
  {
    id: "anthropic-claude-user",
    operator: "Anthropic",
    bot: "Claude-User",
    intent: "assistant",
    detectability: "log-detectable",
    pattern: /\bClaude-User\b/i,
    userAgentPattern: /\bClaude-User\b/i,
    robotsToken: "Claude-User",
    docsUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
    notes: "Official user-directed fetcher for Claude responses."
  },
  {
    id: "anthropic-claude-searchbot",
    operator: "Anthropic",
    bot: "Claude-SearchBot",
    intent: "search",
    detectability: "log-detectable",
    pattern: /\bClaude-SearchBot\b/i,
    userAgentPattern: /\bClaude-SearchBot\b/i,
    robotsToken: "Claude-SearchBot",
    docsUrl:
      "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
    notes: "Official Anthropic crawler for search result quality."
  },
  {
    id: "perplexity-perplexitybot",
    operator: "Perplexity",
    bot: "PerplexityBot",
    intent: "search",
    detectability: "log-detectable",
    pattern: /\bPerplexityBot\b/i,
    userAgentPattern: /\bPerplexityBot\b/i,
    robotsToken: "PerplexityBot",
    docsUrl: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
    notes: "Official crawler for Perplexity search results."
  },
  {
    id: "perplexity-user",
    operator: "Perplexity",
    bot: "Perplexity-User",
    intent: "assistant",
    detectability: "log-detectable",
    pattern: /\bPerplexity-User\b/i,
    userAgentPattern: /\bPerplexity-User\b/i,
    robotsToken: "Perplexity-User",
    docsUrl: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
    notes: "Official user-triggered fetcher; generally ignores robots.txt."
  },
  {
    id: "google-extended",
    operator: "Google",
    bot: "Google-Extended",
    intent: "training",
    detectability: "robots-token-only",
    robotsToken: "Google-Extended",
    docsUrl: "https://blog.google/innovation-and-ai/products/an-update-on-web-publisher-controls/",
    notes: "Robots.txt control token; not an HTTP crawler user agent."
  },
  {
    id: "google-googlebot",
    operator: "Google",
    bot: "Googlebot",
    intent: "search",
    detectability: "log-detectable",
    pattern: /\bGooglebot\b/i,
    userAgentPattern: /\bGooglebot\b/i,
    robotsToken: "Googlebot",
    docsUrl: "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers",
    notes: "Official Google Search crawler family."
  },
  {
    id: "google-googleother",
    operator: "Google",
    bot: "GoogleOther",
    intent: "general",
    detectability: "log-detectable",
    pattern: /\bGoogleOther\b/i,
    userAgentPattern: /\bGoogleOther\b/i,
    robotsToken: "GoogleOther",
    docsUrl: "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers",
    notes: "Official generic Google crawler for non-search product teams."
  },
  {
    id: "microsoft-bingbot",
    operator: "Microsoft",
    bot: "Bingbot",
    intent: "search",
    detectability: "log-detectable",
    pattern: /\bbingbot\b/i,
    userAgentPattern: /\bbingbot\b/i,
    robotsToken: "bingbot",
    docsUrl: "https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0",
    notes: "Official Microsoft Bing search crawler."
  },
  {
    id: "microsoft-copilot",
    operator: "Microsoft",
    bot: "Microsoft Copilot",
    intent: "assistant",
    detectability: "suspected-or-community",
    pattern: /\b(Microsoft-Copilot|CopilotBot|msnbot)\b/i,
    userAgentPattern: /\b(Microsoft-Copilot|CopilotBot|msnbot)\b/i,
    robotsToken: "msnbot",
    docsUrl: "https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0",
    notes: "Microsoft AI surfaces often rely on Bing crawl infrastructure."
  },
  {
    id: "meta-external-agent",
    operator: "Meta",
    bot: "Meta-ExternalAgent",
    intent: "training",
    detectability: "log-detectable",
    pattern: /\bMeta-ExternalAgent\b/i,
    userAgentPattern: /\bMeta-ExternalAgent\b/i,
    robotsToken: "Meta-ExternalAgent",
    docsUrl: "https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers",
    notes: "Official Meta crawler for AI and product indexing use cases."
  },
  {
    id: "bytedance-bytespider",
    operator: "ByteDance",
    bot: "Bytespider",
    intent: "training",
    detectability: "suspected-or-community",
    pattern: /\bBytespider\b/i,
    userAgentPattern: /\bBytespider\b/i,
    robotsToken: "Bytespider",
    docsUrl: "https://www.bytedance.com/",
    notes: "Widely observed ByteDance UA; official crawler docs are limited."
  },
  {
    id: "amazon-amazonbot",
    operator: "Amazon",
    bot: "Amazonbot",
    intent: "general",
    detectability: "log-detectable",
    pattern: /\bAmazonbot\b/i,
    userAgentPattern: /\bAmazonbot\b/i,
    robotsToken: "Amazonbot",
    docsUrl: "https://developer.amazon.com/amazonbot",
    notes: "Official Amazon crawler that may support AI product improvement."
  },
  {
    id: "apple-applebot",
    operator: "Apple",
    bot: "Applebot",
    intent: "search",
    detectability: "log-detectable",
    pattern: /\bApplebot(?!-Extended)\b/i,
    userAgentPattern: /\bApplebot(?!-Extended)\b/i,
    robotsToken: "Applebot",
    docsUrl: "https://support.apple.com/en-us/119829",
    notes: "Official Apple crawler for Siri, Spotlight, Safari, and AI context."
  },
  {
    id: "apple-applebot-extended",
    operator: "Apple",
    bot: "Applebot-Extended",
    intent: "training",
    detectability: "robots-token-only",
    robotsToken: "Applebot-Extended",
    docsUrl: "https://support.apple.com/en-us/119829",
    notes: "Robots.txt control token; Apple says it does not crawl webpages."
  },
  {
    id: "common-crawl-ccbot",
    operator: "Common Crawl",
    bot: "CCBot",
    intent: "training",
    detectability: "log-detectable",
    pattern: /\bCCBot\b/i,
    userAgentPattern: /\bCCBot\b/i,
    robotsToken: "CCBot",
    docsUrl: "https://commoncrawl.org/ccbot",
    notes: "Official Common Crawl web archive crawler."
  }
];

export const aiBotRegistry = crawlerRules;

export const logDetectableCrawlerRules = crawlerRules.filter(
  (rule) => rule.detectability !== "robots-token-only" && rule.pattern
);

export const robotsTokenOnlyCrawlerRules = crawlerRules.filter(
  (rule) => rule.detectability === "robots-token-only"
);

export function matchUserAgent(userAgent: string | null | undefined): CrawlerMatch | null {
  if (!userAgent || userAgent.trim() === "-" || userAgent.trim() === "") {
    return null;
  }

  const rule = logDetectableCrawlerRules.find((candidate) => candidate.pattern?.test(userAgent));
  if (!rule) {
    return null;
  }

  return {
    operator: rule.operator,
    bot: rule.bot,
    intent: rule.intent,
    detectability: rule.detectability,
    ruleId: rule.id,
    robotsToken: rule.robotsToken,
    docsUrl: rule.docsUrl
  };
}

export function isKnownAiCrawler(userAgent: string | null | undefined): boolean {
  return matchUserAgent(userAgent) !== null;
}
