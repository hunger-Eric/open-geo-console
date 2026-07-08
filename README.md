# Open GEO Console

Open GEO Console is an open-source AI Search Console for company websites.

The MVP follows one product story: scan first, connect logs next. A user enters a company website URL, receives a GEO readiness report, then can upload or sample access logs to see whether identifiable AI crawlers such as OpenAI, Anthropic, Perplexity, Google, Microsoft, Meta, ByteDance, Amazon, Apple, and Common Crawl visited the site.

## What v1 Does

- Generates a GEO audit for a website URL.
- Checks `robots.txt`, `sitemap.xml`, `llms.txt`, schema, metadata, heading structure, canonical URLs, OpenGraph tags, readable content length, internal links, and HTTP status.
- Parses Nginx combined/access logs and Cloudflare JSONL into an AI Bot Visibility Report.
- Marks detected AI bots from access-log User-Agent values and separates them from robots.txt-only policy tokens such as `Google-Extended` and `Applebot-Extended`.
- Provides a stand-alone external AI crawler simulator for Open GEO Console. The simulator is not code integrated into the first case personal website or any customer website.
- Maintains an AI Bot Registry covering OpenAI, Anthropic, Perplexity, Google/Gemini, Microsoft/Copilot, Meta, ByteDance, Amazon, Apple, and Common Crawl.
- Persists generated reports in local SQLite so `/reports/[id]` can be revisited.

## External AI Crawler Simulator

The external simulator is an Open GEO Console feature. It attempts HTTP requests with log-detectable AI crawler User-Agent strings and tags those requests with an `ogc_run=<runId>` marker so a site owner can later import access logs and check whether the requests reached the site.

Attempted simulator requests are not proof of real AI company traffic. They only prove that Open GEO Console tried to make a request with a simulator User-Agent. Observed evidence comes from imported access logs that contain both a recognizable AI crawler User-Agent and the matching `ogc_run=<runId>` marker. Logs without the marker should stay in the attempted-but-not-observed state for that run.

Robots-token-only entries such as `Google-Extended` and `Applebot-Extended` are policy controls, not HTTP User-Agent visits, so the simulator must not send them as crawler visits. Ordinary browser User-Agent strings are also not counted as AI bot evidence.

## Workspaces

- `apps/web` - Next.js UI, API routes, SQLite/Drizzle persistence.
- `packages/crawler-rules` - AI User-Agent rules.
- `packages/log-parser` - log parsing and aggregation.
- `packages/geo-auditor` - GEO website audit engine.

## AI Bot Registry

The AI Bot Registry is the source of truth for v1 bot visibility. It records which bots can be detected from logs, which entries are robots.txt policy controls only, and which entries need extra verification because public documentation is incomplete. See `docs/AI-BOT-REGISTRY.md` before adding or changing bot rules.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, scan a website, then try the sample crawler log report.

By default, local self-hosted reports are stored in `.data/open-geo-console.sqlite`. Set `OPEN_GEO_DB_PATH` to use a different SQLite file.

## Deployment

The Vercel project is configured as a monorepo Next.js app:

- Framework preset: Next.js
- Build command: `npm run build`
- Output directory: `apps/web/.next`

Vercel serverless runtime uses `/tmp/open-geo-console.sqlite` unless `OPEN_GEO_DB_PATH` is configured. The scanner also stores the just-created report in the browser so the post-scan report page works in the demo deployment even when serverless functions do not share temp storage.

## First Case

The first real test site is `https://me.itheheda.online`. It is intentionally treated as a case study and fixture source, not as part of this repository. The external simulator remains stand-alone inside Open GEO Console and should not require code changes inside that personal website.

## Verification

```bash
npm run lint
npm test
npm run build
```
