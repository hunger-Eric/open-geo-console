# Open GEO Console HeyGen Product Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and deliver a Chinese 16:9 HeyGen product demo of approximately 90 seconds using Miyu, a warm professional Mandarin voice, current Open GEO Console visuals, and the approved internal-beta CTA.

**Architecture:** Treat the current repository and public product URL as source truth, build one complete HeyGen Video Agent prompt from the approved design, resolve Miyu's current landscape-compatible look at runtime, then generate and verify one final MP4. Local working files stay outside the product repository; only the approved design and this execution plan are committed to the repository.

**Tech Stack:** Open GEO Console Next.js UI, HeyGen Video Agent v3, HeyGen public avatar and voice catalog, PowerShell, ffprobe/ffmpeg for media verification.

## Global Constraints

- Use Chinese narration and a 16:9 landscape frame.
- Target approximately 90 seconds; the approved synthesized narration is approximately 84 seconds.
- Use the public Miyu avatar group and resolve a current look at runtime; never trust a stored look ID.
- Use the selected warm, friendly Mandarin voice at speed `1.0`.
- Use current repository or authorized public-product visuals; never fabricate nonexistent pages or data.
- Do not describe public-search result order as AI ranking, recommendation, or causation.
- Do not claim that public paid access is generally available; Open GEO Console is in comprehensive internal testing.
- The final CTA must be: `Open GEO Console 正在全面内测中。欢迎留言联系我，免费检测你的企业官网。`
- Do not expose credentials, access tokens, customer email addresses, payment data, private report links, or protected staging details.

---

### Task 1: Verify Current Product Truth and Visual Sources

**Files:**
- Read: `docs/PROJECT-STATE.md`
- Read: `docs/superpowers/specs/2026-07-15-open-geo-console-heygen-product-demo-design.md`
- Read: `apps/web/src/app/[locale]/page.tsx`
- Read: `apps/web/src/components/report-overview.tsx`
- Read: `apps/web/src/components/combined-geo-report-v3-artifact.tsx`
- Create: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/asset-manifest.md`

**Interfaces:**
- Consumes: current product state, approved script and storyboard, public product URL `https://geo.itheheda.online`.
- Produces: an asset manifest containing only safe customer-facing screens and exact visible copy for the generation prompt.

- [ ] **Step 1: Re-read current truth and confirm the production URL is reachable**

Run:

```powershell
git -C E:\project\open-geo-console status --branch --short
Get-Content -Raw E:\project\open-geo-console\docs\PROJECT-STATE.md
Invoke-WebRequest -Method Head -Uri https://geo.itheheda.online -MaximumRedirection 5
```

Expected: the working tree may contain unrelated user changes; the public URL returns a successful response or a redirect to a successful response. Do not modify or stage unrelated files.

- [ ] **Step 2: Inspect the exact customer-facing screens used by the storyboard**

Read the homepage, free-report overview, and deep-report artifact components listed above. Record these safe visual beats in the manifest:

```markdown
1. Homepage URL field and generate-report action
2. GEO score and machine-readable asset checks
3. One verified evidence issue
4. Non-brand buyer questions and coverage limits
5. Source URL, excerpt, evidence and priority actions
6. Internal-testing CTA
```

Expected: every visual beat maps to a current component or current public page. Omit any beat that is not present in current source truth.

- [ ] **Step 3: Record sensitive-content exclusions**

Add this exact exclusion list to the manifest:

```markdown
- no API keys or environment values
- no report access token or protected staging URL
- no customer email, payment identifier or order identifier
- no private evidence object URL
- no unredacted internal failure report
```

Expected: the manifest contains all six approved beats and all five exclusions.

### Task 2: Resolve Miyu and Validate Presenter Framing

**Files:**
- Read: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/asset-manifest.md`
- Create: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/presenter.json`

**Interfaces:**
- Consumes: Miyu avatar group `1727071993`, voice `1776ddbd05374fa480e92f0297bbc67e`, orientation `landscape`.
- Produces: a current ready look ID plus any required framing/background note.

- [ ] **Step 1: List current Miyu looks**

Use the HeyGen avatar-look listing with:

```json
{"groupId":"1727071993","ownership":"public","limit":50}
```

Expected: at least one ready look with a non-null preview image URL.

- [ ] **Step 2: Select a landscape-compatible look and inspect it**

Prefer a 16:9 or landscape look that preserves Miyu's professional, approachable presentation. Inspect the selected look metadata and record `look_id`, `avatar_type`, preview dimensions, background state, and readiness in `presenter.json`.

Expected: `presenter.json` contains a current ready look ID and never stores credentials.

- [ ] **Step 3: Build the framing correction**

If the selected look is portrait or square, append the approved landscape correction:

```text
FRAMING NOTE: The selected avatar image is in portrait or square orientation but this video is landscape (16:9). Frame the presenter from the chest up, centered in the landscape canvas. Use generative fill to extend the scene horizontally with a clean professional technology-office environment. Do not add black bars or pillarboxing. The presenter must feel natural in the 16:9 frame.
```

If the look is already landscape and has an appropriate background, record `aspect_correction: none`.

Expected: one explicit aspect-correction value is present: `none`, `framing`, `background`, or `both`.

### Task 3: Build the Complete Video Agent Prompt

**Files:**
- Read: `docs/superpowers/specs/2026-07-15-open-geo-console-heygen-product-demo-design.md`
- Read: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/asset-manifest.md`
- Read: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/presenter.json`
- Create: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/heygen-prompt.md`

**Interfaces:**
- Consumes: approved narration, six storyboard beats, current product URL, current Miyu look and framing notes.
- Produces: one complete prompt ready for HeyGen Video Agent submission without later creative rewriting.

- [ ] **Step 1: Write the narrator and duration block**

Use this exact direction:

```text
Create one approximately 90-second Chinese-language 16:9 product demo for potential customers of Open GEO Console. The selected presenter is a warm, credible technology product consultant: professional but not overly serious. Use the selected presenter full-screen for the opening and closing, then as a small lower-right picture-in-picture guide during the product walkthrough without covering key interface content.
```

- [ ] **Step 2: Insert the approved narration verbatim**

Copy the complete `定稿旁白` section from the approved design specification. Follow it with:

```text
This script is a concept and theme to convey—not a verbatim transcript. You have full creative freedom to pace the visuals naturally, but preserve the factual boundaries, exact technical terms, and final CTA. Do not pad with silence or pauses.
```

- [ ] **Step 3: Add product-visual direction**

Use the public URL only as product context:

```text
Use https://geo.itheheda.online and the supplied asset manifest as the visual reference for the current Open GEO Console interface. Favor faithful website/interface views and restrained motion graphics. Show the URL input, GEO score, robots.txt, sitemap.xml, llms.txt, verified evidence, coverage limits, source URLs, evidence excerpts, priorities and the 90-day roadmap. Never invent customer data or expose protected report links.
```

- [ ] **Step 4: Add critical screen text and style block**

Append the exact critical text list from the design specification, then append:

```text
VISUAL STYLE: Clean B2B product demonstration. Warm white workspace surfaces, charcoal text, restrained teal accents, subtle blue data highlights, generous whitespace, crisp interface zooms and smooth cursor-led transitions. Use motion graphics only to explain AI search, evidence flow and chapter changes. Keep the real product interface as the dominant visual. No flashy cyberpunk effects, fake dashboards, exaggerated AI imagery or dense kinetic typography.
```

Append the framing/background note from Task 2 last.

Expected: the prompt contains the full narration, exact CTA, URL, critical text, factual boundaries, media guidance, style block and aspect correction.

- [ ] **Step 5: Validate the prompt**

Run:

```powershell
rg -n "全面内测中|留言联系我|免费检测你的企业官网|AI 排名|robots.txt|sitemap.xml|llms.txt|FRAMING NOTE|VISUAL STYLE" C:\Users\fengc\Documents\Codex\2026-07-15\heygen-plugin-heygen-openai-curated-remote\work\open-geo-console-video\heygen-prompt.md
```

Expected: every required term appears; `AI 排名` appears only inside a prohibition against making that claim.

### Task 4: Generate the HeyGen Video

**Files:**
- Read: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/heygen-prompt.md`
- Read: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/presenter.json`
- Create: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/generation-result.json`

**Interfaces:**
- Consumes: final prompt, current Miyu look ID, selected Mandarin voice ID and landscape orientation.
- Produces: HeyGen session ID, video ID and completed video URL.

- [ ] **Step 1: Submit one Video Agent session**

Submit the complete prompt with conversation context that expands all references. Read `look_id` from `presenter.json` at submission time and map it to `avatar_id`; set `voice_id` to `1776ddbd05374fa480e92f0297bbc67e` and `orientation` to `landscape`.

Expected: one new session is returned. Capture the session ID immediately in `generation-result.json`.

- [ ] **Step 2: Poll silently to completion**

Poll the HeyGen Video Agent session at five minutes, then every sixty seconds. Do not submit a duplicate unless the first session reaches a terminal failed state and the prompt is revised.

Expected: status becomes `completed`, with a video ID and video URL. If it remains `thinking` for more than fifteen minutes, report the delay once and continue monitoring.

- [ ] **Step 3: Save generation metadata**

Record session ID, video ID, URL, selected look, voice, orientation and completion status in `generation-result.json`. Do not store access credentials.

### Task 5: Download, Verify and Deliver

**Files:**
- Read: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/work/open-geo-console-video/generation-result.json`
- Create: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/outputs/open-geo-console-product-demo-zh-90s.mp4`
- Create: `C:/Users/fengc/Documents/Codex/2026-07-15/heygen-plugin-heygen-openai-curated-remote/heygen-video-log.jsonl`

**Interfaces:**
- Consumes: completed HeyGen video URL and approved acceptance criteria.
- Produces: verified local MP4, HeyGen edit link, concise delivery summary and generation log.

- [ ] **Step 1: Download the MP4**

Download the completed video to the exact output path above.

Expected: the file exists, is non-empty and opens as an MP4.

- [ ] **Step 2: Verify technical media properties**

Run:

```powershell
ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,width,height -of json C:\Users\fengc\Documents\Codex\2026-07-15\heygen-plugin-heygen-openai-curated-remote\outputs\open-geo-console-product-demo-zh-90s.mp4
```

Expected: H.264 or another standard playable video codec, landscape dimensions, and a duration between 80 and 100 seconds.

- [ ] **Step 3: Inspect representative frames and audio**

Extract frames near 5, 20, 35, 50, 68 and 85 seconds. Verify Miyu appears as approved, the product interface remains dominant, no secrets are visible, and the ending shows the internal-testing CTA. Listen to the opening and ending to confirm natural Mandarin and correct CTA pronunciation.

Expected: all six storyboard beats are represented; any factual or visual failure requires a revised prompt before regeneration.

- [ ] **Step 4: Append the self-evaluation log**

Append one JSON line containing timestamp, video ID, session ID, target and actual duration, duration ratio, avatar look, voice ID, orientation, aspect correction, attachment count, status, concerns and topic.

Expected: valid JSONL with one entry for this generation.

- [ ] **Step 5: Deliver**

Provide the local MP4 link, HeyGen session/edit link, actual duration, selected Miyu look and any remaining concerns. Do not expose internal IDs beyond the edit link needed by the user.
