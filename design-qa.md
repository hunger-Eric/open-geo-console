# Open GEO Console Design QA

## Visual truth and artifacts

- Reference: `docs/design/report-workspace-reference.png`
- Desktop implementation: `docs/design/qa/report-overview-1440x1024.png`
- Mobile implementation: `docs/design/qa/report-overview-390x844.png`
- Chinese locale state: `docs/design/qa/language-toggle-zh-selected-895x919.png`
- English locale state: `docs/design/qa/language-toggle-en-selected-895x919.png`
- Tested report: `/zh/reports/9ac935cb-acd3-4611-8ee2-4114185a1706`

The 1440x1024 reference and implementation were reviewed together after the final radius and timestamp fixes. A second focused comparison reviewed the annotated language selector before and after the approved teal-state change.

## Fidelity review

- Typography: passed. The system CJK sans-serif stack, restrained weights, and editorial hierarchy match the selected direction.
- Spacing and geometry: passed. The implementation preserves the wide reading column, narrow evidence rail, compact repair rows, horizontal tabs, and consistent 8px control/surface radii.
- Color: passed. Warm neutral surfaces, forest text, teal actions, and text-labelled red/amber severities are consistent and never rely on color alone. The active locale now uses teal with white text; inactive locale text is muted.
- Assets and icons: passed. Existing Lucide icons are preserved; no placeholder or hand-built graphic assets were introduced.
- Copy and product semantics: passed. The implementation intentionally shows bot/operator counts instead of a synthetic coverage percentage because log evidence is independent from the GEO score.

The implementation keeps the report URL in a dedicated context block rather than the reference's site selector because v1 has report UUIDs but no separate site entity. This preserves the selected hierarchy without inventing unsupported product state.

## Interaction and responsive QA

- 1440x1024: score, top fixes, and bot evidence entry appear in the first viewport; no horizontal overflow.
- 1280x720: all three primary overview regions remain within two viewports; no horizontal overflow.
- 390x844: workspace tabs remain usable, actions wrap, content becomes one column, and page width stays within the viewport.
- Mobile technical tables use labelled grouped rows; the document does not scroll horizontally.
- Keyboard focus is visibly outlined; workspace and locale links expose `aria-current`.
- Import, replace, refresh persistence, registry toggle, delete, and collapsed simulator states were exercised in the browser.
- AI queued/failed progress, retry, Key unlock, evidence-backed preview, dimension scores and cited findings were exercised at 1440x1024 and 390x844.
- Chinese and English locale links both move the active teal state with the route.
- White on teal contrast is 5.47:1; forest text on white is 16.73:1.
- Overview, AI analysis, issues, bots, technical, print, and standalone log routes rendered without console errors.
- The completed live MiMo report at `/zh/reports/08015f7a-a374-4714-b24d-d4c9d6876af2/analysis` rendered its organization profile, six dimensions and three cited findings in the in-app browser with no console errors.
- The `shun-express.com` regression report at `/zh/reports/08f58f73-a303-4252-8034-52ea1baf33a9` renders one overview card for 10 dead links, lists only three representative URLs, and keeps the four template groups on the issues page without horizontal overflow at the desktop viewport.
- A synthetic queued report rendered queue position 1, the `awaiting_claim` explanation, the active deep tier, and an accessible 0/100 progress bar. The synthetic records were deleted after QA.
- The homepage-only free report at `/zh/reports/b86bde02-4842-40a9-bbb3-83a62a80c4ea` rendered one audited page, an explicit homepage-score disclaimer, one AI finding, no dimension-detail section, and no horizontal overflow. Its direct `/print` route rendered only the deep-report unlock explanation with no report table or print button.
- The same live run persisted `plannedPages=1`, `analyzedPages=1`, one free AI finding and no free technical payload. A temporary deep job persisted a private technical payload and settled its test credit; the temporary deep job, ledger and access Key were deleted after verification.

## Comparison history

- P0: none.
- P1: the standalone log page initially produced an SSR hydration error because malformed Nginx dates fell back to different current timestamps. Fixed with deterministic timezone-aware parsing; post-fix console is clean.
- P2: shared report surfaces used 12px radii while the selected system specified 8px. Fixed globally and re-captured at 1440x1024.
- P2: the first locale-color pass changed the background, but the global anchor rule overrode white text. Fixed with scoped `.locale-action` states; both active locales now compute to teal with white text, while inactive text remains muted.
- P3: the reference includes a cross-site selector and bot coverage percentage. Both were intentionally omitted because the current product has no site entity and log evidence must not affect GEO scoring.

final result: passed
