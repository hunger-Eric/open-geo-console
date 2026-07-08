export const sampleCrawlerLog = [
  '203.0.113.10 - - [08/Jul/2026:09:10:11 +0800] "GET /llms.txt HTTP/1.1" 200 342 "-" "GPTBot/1.0"',
  '203.0.113.11 - - [08/Jul/2026:09:12:11 +0800] "GET /articles/open-geo-console HTTP/1.1" 200 912 "-" "OAI-SearchBot/1.0"',
  '203.0.113.15 - - [08/Jul/2026:10:01:17 +0800] "GET /pricing HTTP/1.1" 404 231 "-" "ChatGPT-User/1.0"',
  '203.0.113.12 - - [08/Jul/2026:09:14:11 +0800] "GET /about HTTP/1.1" 200 1204 "-" "Claude-SearchBot"',
  '203.0.113.16 - - [09/Jul/2026:08:05:29 +0800] "GET /case-studies HTTP/1.1" 200 1888 "-" "Perplexity-User/1.0"',
  '203.0.113.13 - - [09/Jul/2026:08:15:11 +0800] "GET / HTTP/1.1" 200 2232 "-" "Bytespider"',
  '203.0.113.17 - - [09/Jul/2026:08:18:40 +0800] "GET /blog/geo-readiness HTTP/1.1" 301 0 "-" "CCBot/2.0 (https://commoncrawl.org/faq/)"',
  '198.51.100.20 - - [09/Jul/2026:08:20:03 +0800] "GET /contact HTTP/1.1" 200 1780 "https://example.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"',
  '203.0.113.14 - - [10/Jul/2026:09:16:11 +0800] "GET /projects HTTP/1.1" 200 2032 "-" "PerplexityBot"',
  JSON.stringify({
    EdgeStartTimestamp: "2026-07-10T01:20:11Z",
    ClientRequestMethod: "GET",
    ClientRequestPath: "/sitemap.xml",
    EdgeResponseStatus: 200,
    ClientRequestUserAgent: "ClaudeBot"
  }),
  JSON.stringify({
    EdgeStartTimestamp: "2026-07-10T01:24:33Z",
    ClientRequestMethod: "GET",
    ClientRequestPath: "/robots.txt",
    EdgeResponseStatus: 200,
    ClientRequestUserAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
  })
].join("\n");
