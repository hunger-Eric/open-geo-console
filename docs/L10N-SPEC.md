# L10n Specification

## Purpose

This document defines the localization content contract for Open GEO Console. It covers product voice, glossary, report language, and finding copy. Engineering routing and locale fallback rules belong in `docs/I18N-SPEC.md`.

## Supported Locales

- `en`: concise B2B English for operators, founders, marketers, and technical owners.
- `zh`: business-readable Simplified Chinese. Chinese copy should sound native, direct, and advisory, not machine-translated.

## Product Voice

English:

- Use concise B2B product and report language.
- Prefer concrete audit nouns: report, evidence, finding, recommendation, crawl policy.
- Keep headings short and decision-oriented.
- Avoid hype such as "revolutionary", "ultimate", or "growth hack".

Chinese:

- Use clear business language that a company operator can read quickly.
- Prefer stable terms: 体检报告、证据、问题、修复建议、技术附录、访问日志。
- Explain technical risk in business terms before implementation detail.
- Avoid literal translation and avoid overly academic phrasing.

## Glossary

| Key | English Term | Chinese Term | Usage Notes |
| --- | --- | --- | --- |
| `geo` | GEO | GEO | Use as the product category term. Expand as Generative Engine Optimization in longer educational copy only. |
| `aiCrawler` | AI crawler | AI 爬虫 | Use for bots operated by AI search or answer systems. |
| `finding` | Finding | 问题 | In reports, use "finding" in English and "问题" in Chinese for readability. |
| `recommendation` | Recommendation | 修复建议 | Use for action-oriented remediation. |
| `executiveSummary` | Executive summary | 管理摘要 | Use at the top of shareable reports. |
| `technicalAppendix` | Technical appendix | 技术附录 | Use for evidence tables and low-level crawl details. |
| `severity` | Severity | 严重程度 | Use for critical, warning, and info labels. |
| `logReport` | AI crawler access report | AI 爬虫访问报告 | Use for log-derived crawler visibility. |

## Severity Labels

- `critical`
  - English: Critical
  - Chinese: 严重
  - Meaning: Blocks discovery, report generation quality, or canonical page reliability.
- `warning`
  - English: Warning
  - Chinese: 警告
  - Meaning: Reduces AI readability or weakens citation confidence.
- `info`
  - English: Info
  - Chinese: 提示
  - Meaning: Helpful improvement that does not block basic discovery.

## Finding Copy Rules

- Each finding must have a stable content key.
- Localized copy lives in dictionaries, not React components.
- Dynamic values must be template parameters such as `{url}`, `{status}`, `{h1Count}`, or `{asset}`.
- Existing persisted reports may contain literal English fields; UI may use them only as backward-compatible fallback.
- New finding types must add English and Chinese entries in the same change.

## Report Copy Rules

- The report should read like a public case report, not an internal debug panel.
- Start with business impact and priority, then expose technical evidence.
- Do not hide technical evidence; place it under evidence sections or the technical appendix.
- Print/PDF copy should remain meaningful without interactive controls.

## Maintenance Checklist

- Add or update dictionary keys in both locales.
- Add glossary entries when introducing a new product term.
- Add tests for dictionary parity and finding copy rendering.
- Keep Chinese copy business-readable and do not copy English syntax directly.
