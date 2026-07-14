# Report Workspace, Bot Evidence, and Persistence

## Routes

| Route | Purpose |
| --- | --- |
| `/[locale]/reports/[id]` | Score explanation, top three fixes, asset/scan summary, and bot evidence summary |
| `/[locale]/reports/[id]/analysis` | Free AI preview or authorized private deep AI report |
| `/[locale]/reports/[id]/issues?page=N` | Severity-grouped findings, 20 per page |
| `/[locale]/reports/[id]/bots` | Log import, detected bots/operators, paginated registry, and collapsed simulator |
| `/[locale]/reports/[id]/technical?page=N` | Scanned pages, assets, and technical appendix, 20 per page |
| `/reports/[id]/report.html` | Canonical authorized combined/deep HTML artifact with visual evidence |
| `/reports/[id]/legacy-report.html` | Frozen legacy HTML artifact |
| `/reports/[id]/recommendation-report.html` | Version-dispatched recommendation-forensics HTML artifact |
| `/api/reports/[id]/evidence/[assetId]` | Authorized private screenshot proxy; never exposes a stable object URL |
| `/[locale]/logs` | Standalone advanced log analysis with an explicit target URL |

The report header shows the persisted generation language. Interface language switches navigation and labels only. The workspace and transactional completion email expose only the secure HTML link; customer PDF routes and the print workspace do not exist. Homepage technical score, site technical score and AI dimension scores remain separately named and include `/ 100` plus their coverage context.

## Artifact and language contract

New reports keep their persisted generation locale across model prompts, deterministic labels, final artifact readiness and email. One language correction is permitted inside each model boundary; an exhausted final gate enters `repair_wait`. Foreign source evidence remains verbatim and is labeled `来源原文` / `Source original`.

The canonical server-rendered HTML is the only customer artifact. Workers privately convert the same HTML to PDF for signature/page-count readiness, hashing and storage before activation. Those bytes and database fields are not customer-routable. Existing historical payloads, active revisions and private PDF bytes are not migrated or deleted.

## Report status contract

The status surface exposes only `generating`, `completed`, `completed_limited`, or `unavailable`. Queue position and wait reason are visible while generating; internal Worker stage and checkpoint names are not. Limited reports remain readable with neutral styling and no manual checkpoint retry. A mismatched authorized legacy deep artifact may use `POST /api/reports/[id]/locale-correction` once without consuming another credit.

## Summary contract

`@open-geo-console/log-parser` owns `BotEvidenceSummary` and `buildBotEvidenceSummary`. Version 1 includes analysis time, line counts, AI hits, registry size, operator aggregates, and sanitized detected-bot rows. It must not contain raw logs, IP addresses, request paths, or raw User-Agent strings.

## Persistence

`report_bot_evidence` has a one-to-one relationship with `scan_reports`:

- `report_id`: primary key and report foreign key
- `summary`: JSON-encoded `BotEvidenceSummary`
- `updated_at`: replacement timestamp

Re-importing evidence upserts the row. Deleting evidence removes it. History and raw logs are intentionally not retained.

## API

`PUT /api/reports/[id]/bot-evidence`

```json
{ "logs": "..." }
```

- Maximum UTF-8 payload: 5 MiB.
- Returns `{ analysis, summary }` for the current importing session.
- Errors: `report_not_found`, `empty_logs`, `payload_too_large`, `analysis_failed`.
- Missing User-Agent data is a successful analysis with a warning.

`DELETE /api/reports/[id]/bot-evidence` removes the current summary.

## Storage authority

PostgreSQL is the report authority for technical reports, AI reports, jobs, access controls and bot evidence. The browser does not retain an authoritative report copy. Public technical reports are projected to the homepage plus standard assets. Deep AI and multi-page technical payloads require the report-specific HttpOnly access cookie; free previews remain accessible through their unlisted report UUID.

Private deep findings may reference `report_evidence_assets` metadata. Screenshot bytes stay outside report JSON in the selected filesystem or S3-compatible adapter. Critical findings prefer an issue crop plus context image; warning/opportunity findings use compact captures; unreliable crops fall back to a viewport image. Any capture failure leaves the verified quote and URL visible with an explicit screenshot-unavailable state.
