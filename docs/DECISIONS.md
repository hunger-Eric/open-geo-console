# Open GEO Console Decisions

## 2026-07-10: Reports are workspaces

The persisted report UUID is the product context. Overview, issues, bot evidence, technical details, and print views are sibling routes under that report. The standalone logs route remains an advanced utility and does not compete with the report journey.

## 2026-07-10: Bot evidence is share-safe and replaceable

SQLite stores exactly one `analysisVersion: 1` summary per report. A new import replaces the summary. The server may return full analysis to the importing session, but persisted JSON excludes raw logs, IPs, full paths, and raw User-Agent strings.

## 2026-07-10: GEO score and log evidence are independent

Only `geo-auditor` determines the GEO score. Imported logs describe observed crawler access and never raise or lower the score. This avoids presenting traffic evidence as website quality.

## 2026-07-10: Simulation is not observation

The simulator uses the current report URL and stays collapsed by default. A simulated request records an attempt; only imported logs with recognizable evidence can mark access as observed.

## 2026-07-10: Option 1 is the visual baseline

The report UI uses a restrained editorial hierarchy, horizontal workspace tabs, warm neutral surfaces, forest text, teal primary actions, red/amber severity labels, Lucide icons, system CJK sans-serif fonts, 8px radii, and no ambient shadows or decorative grid background.
