# AI Bot Registry

Open GEO Console uses the AI Bot Registry to turn access-log User-Agent strings into a clear AI Bot Visibility Report. The registry is intentionally conservative: log evidence and robots.txt policy controls are different things, and the product should not blur them.

## Purpose

- Identify AI-related crawlers and fetchers that appear in Nginx, Apache-style, Cloudflare, or similar access logs.
- Group detected visits by operator, bot, path, status, and date.
- Show registry coverage even when a bot has not appeared in the uploaded logs.
- Document robots.txt tokens that help site owners manage AI crawling policy, without presenting those tokens as historical log hits.

## Detectability Statuses

- `log-detectable`: The bot has a recognizable HTTP User-Agent pattern and can be counted as log evidence when it appears in access logs.
- `robots-token-only`: The entry is a robots.txt control token, not a reliable HTTP User-Agent hit. These entries belong in policy guidance and coverage matrices, but must not be counted as detected visits.
- `suspected-or-community`: The bot or operator relationship is widely observed or inferred, but official documentation is limited. These entries should be labeled clearly and treated as lower-confidence.

## Robots Tokens Are Not Log Evidence

Tokens such as `Google-Extended` and `Applebot-Extended` are used to express crawler or training policy in `robots.txt`. They do not prove that Google or Apple visited a site, and they should not be shown as detected visits unless a real access-log line contains a matching log-detectable User-Agent.

The report should therefore separate:

- **Detected access**: a log line with a recognizable User-Agent.
- **Policy controls**: robots.txt tokens that the site owner may allow or disallow.
- **Unverified candidates**: community-observed or inferred patterns that need stronger documentation.

## Covered Operators

The v1 registry covers:

- OpenAI
- Anthropic
- Perplexity
- Google/Gemini
- Microsoft/Copilot
- Meta
- ByteDance
- Amazon
- Apple
- Common Crawl

## Source Preference

Use official documentation first. Accept community or observed evidence only when it is clearly marked as `suspected-or-community`, and include notes explaining why the entry is lower-confidence.

Preferred source order:

1. Official crawler or webmaster documentation from the operator.
2. Official product policy pages that define robots.txt controls.
3. Reputable ecosystem evidence for observed User-Agent strings, labeled as suspected or community-derived.

## Adding a New Bot Safely

When adding a bot:

1. Add one registry entry with a stable id, operator, bot name, intent, detectability status, docs URL, and notes.
2. Add a precise User-Agent pattern only for `log-detectable` or `suspected-or-community` entries that can appear in logs.
3. Do not add a pattern for `robots-token-only` entries unless official docs confirm it is also an HTTP User-Agent.
4. Add matcher tests for a positive User-Agent, a normal browser negative example, and any adjacent robots token that must not match.
5. Update sample logs only with plausible HTTP User-Agent hits. Do not insert robots-token-only values as if they were real visits.
