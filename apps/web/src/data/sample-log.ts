export const sampleCrawlerLog = [
  '203.0.113.10 - - [08/Jul/2026:09:10:11 +0800] "GET /llms.txt HTTP/1.1" 200 342 "-" "GPTBot/1.0"',
  '203.0.113.11 - - [08/Jul/2026:09:12:11 +0800] "GET /articles/open-geo-console HTTP/1.1" 200 912 "-" "OAI-SearchBot/1.0"',
  '203.0.113.12 - - [08/Jul/2026:09:14:11 +0800] "GET /about HTTP/1.1" 200 1204 "-" "Claude-SearchBot"',
  '203.0.113.13 - - [08/Jul/2026:09:15:11 +0800] "GET / HTTP/1.1" 200 2232 "-" "Bytespider"',
  '203.0.113.14 - - [08/Jul/2026:09:16:11 +0800] "GET /projects HTTP/1.1" 200 2032 "-" "PerplexityBot"',
  JSON.stringify({
    EdgeStartTimestamp: "2026-07-08T01:20:11Z",
    ClientRequestMethod: "GET",
    ClientRequestPath: "/sitemap.xml",
    EdgeResponseStatus: 200,
    ClientRequestUserAgent: "ClaudeBot"
  })
].join("\n");
