# Open GEO Console Project State

## Current Goal

Operate a durable, self-hostable report product whose main journey is `free technical report + AI preview → private deep AI report → optional AI Bot evidence`. The next commercial phase is payment and email-based Key delivery; the report engine, credit ledger and access-token boundary are already in place.

## Current Architecture

- `apps/web` is a localized Next.js App Router app backed by PostgreSQL. It owns routes, persistence, access controls, report UI, operator scripts and the standalone Worker entry point.
- `packages/geo-auditor` owns deterministic technical evidence and the reproducible GEO score.
- `packages/site-crawler` owns URL/SSRF safety, registrable site identity, robots/sitemap/link discovery, HTML extraction, template clustering and representative-page selection.
- `packages/ai-report-engine` owns OpenAI-compatible transport, page planning, batch analysis, `AiWebsiteReportV1`, synthesis and evidence verification.
- `packages/crawler-rules` and `packages/log-parser` continue to own AI crawler identity and sanitized access-log evidence.

The web process persists a technical report and enqueues work. A separate Worker uses PostgreSQL leases and checkpoints to execute `discovering → planning → fetching → analyzing → synthesizing`. Free reports analyze up to 8 pages and show three verified findings; deep reports analyze up to 50 pages and are private.

## Implemented

- Site-wide URL discovery capped at 50,000, candidate compression capped at 500, AI page planning and deterministic fallback selection.
- DNS-pinned safe HTTP crawling, per-redirect validation, robots enforcement, response limits and Playwright fallback for JavaScript-rendered pages.
- Structured model output, six AI dimensions, organization profile, page-type findings, evidence citations, coverage/provenance and 90-day roadmap.
- Citation verification that removes unsupported model findings before persistence.
- PostgreSQL schema for reports, jobs, AI payloads, seven-day page evidence, free trials, rate buckets, access Keys, credit ledger and private report tokens.
- Thirty-day free preview reuse by registrable site, private-suffix tenant handling, and three distinct free sites per HMAC client IP/day.
- HMAC-only Key/token storage; idempotent credit reservation, settlement and system-failure refund; report-specific HttpOnly access links.
- Progressive status, retry, Key unlock, AI analysis, technical, issues, bot evidence and print/PDF report surfaces in English and Chinese.
- Legacy SQLite import preserving report UUIDs and sanitized Bot Evidence.
- Live MiMo 2.5 Pro acceptance against `me.itheheda.online`: 8 pages planned, 7 analyzed, one failed, evidence-validated Chinese preview persisted and rendered without browser console errors.
- Non-2xx pages now emit only the HTTP root cause; repeated rule findings are grouped by page template and capped for scoring. The overview rolls template groups into one priority card with at most three representative URLs.
- Free and deep report jobs have independent Worker lanes. The status API/UI shows real queue position, wait reason, and active tier with completion-driven polling.
- Live regression scan of `shun-express.com` produced a score of 35 with 26 grouped findings instead of the previous score of 0 with 62 repeated findings; the overview correctly summarizes 10 dead links.

## Known Boundaries

- There are no user accounts, payment provider, email delivery, subscriptions or teams yet. Access Keys are manually issued.
- Official-site identity is inferred from internal site evidence only; external ownership/search verification is not performed.
- Image aesthetics, video, login-only pages and form submission are outside the first AI report version.
- A production deployment requires persistent PostgreSQL plus a continuously running Worker. Vercel `/tmp` and browser-local report persistence are not supported authorities.
- Real model behavior depends on the configured provider. CI uses mock clients; `npm run test:ai-live` remains the repeatable paid integration command.
- The credential shared in chat is configured only in ignored local state for this acceptance run. It must still be rotated before any public production deployment.

## Next Steps

1. Rotate the exposed model credential before public deployment and keep `OGC_ALLOW_BENCHMARK_NETWORK=false` outside the local Codex sandbox.
2. Verify one manually issued deep-report Key against the running PostgreSQL/Web/two-Worker stack.
3. Design the separate payment/email Key issuance phase against the existing `createAccessKey` service.

## Acceptance Commands

```bash
npm run lint
npm test
npm run build
```
