# Report Workspace, Bot Evidence, and Persistence

## Routes

| Route | Purpose |
| --- | --- |
| `/[locale]/reports/[id]` | Score explanation, top three fixes, asset/scan summary, and bot evidence summary |
| `/[locale]/reports/[id]/analysis` | Free AI preview or authorized private deep AI report |
| `/[locale]/reports/[id]/issues?page=N` | Severity-grouped findings, 20 per page |
| `/[locale]/reports/[id]/bots` | Log import, detected bots/operators, paginated registry, and collapsed simulator |
| `/[locale]/reports/[id]/technical?page=N` | Scanned pages, assets, and technical appendix, 20 per page |
| `/[locale]/reports/[id]/print` | Authorized deep-report print/PDF document; free previews render an upgrade explanation |
| `/[locale]/logs` | Standalone advanced log analysis with an explicit target URL |

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
