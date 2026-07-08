# Open GEO Console

Open GEO Console is an open-source AI Search Console for company websites.

The MVP follows one product story: scan first, connect logs next. A user enters a company website URL, receives a GEO readiness report, then can upload or sample access logs to see whether AI crawlers such as OpenAI, Anthropic, Perplexity, Google, Microsoft, Meta, ByteDance, Amazon, and Common Crawl visited the site.

## What v1 Does

- Generates a GEO audit for a website URL.
- Checks `robots.txt`, `sitemap.xml`, `llms.txt`, schema, metadata, heading structure, canonical URLs, OpenGraph tags, readable content length, internal links, and HTTP status.
- Parses Nginx combined/access logs and Cloudflare JSONL into AI crawler visits.
- Persists generated reports in local SQLite so `/reports/[id]` can be revisited.

## Workspaces

- `apps/web` - Next.js UI, API routes, SQLite/Drizzle persistence.
- `packages/crawler-rules` - AI User-Agent rules.
- `packages/log-parser` - log parsing and aggregation.
- `packages/geo-auditor` - GEO website audit engine.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, scan a website, then try the sample crawler log report.

## First Case

The first real test site is `https://me.itheheda.online`. It is intentionally treated as a case study and fixture source, not as part of this repository.

## Verification

```bash
npm run lint
npm test
npm run build
```
