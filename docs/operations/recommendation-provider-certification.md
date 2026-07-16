# Historical V1 recommendation-provider certification

The OpenAI Web Search and Perplexity Sonar certification flow is retired from active admission and deployed Worker wiring. Staging and production methodology audits reached zero non-terminal V1 recommendation jobs on 2026-07-13 before runtime imports and environment requirements were removed.

Historical `RecommendationForensicReportV1` rows, private HTML/PDF rendering, certification records, and parser contracts remain immutable and readable. The old adapters and certification utilities remain only as historical regression sources; they are not reachable from checkout, catalog, V2 fulfillment, or the production Worker dependency graph.

New work uses `public_search_source_forensics_v1`. Its generic certification framework and fail-closed status are documented in `public-search-surface-certification.md`. No V1 credential, flag, authority JSON, or administrator input can reopen new V1 admission.
