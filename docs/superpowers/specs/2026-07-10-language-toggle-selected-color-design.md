# Language Toggle Selected Color Design

## Goal

Replace the current near-black active-language fill with the product's existing teal primary color so the language switcher belongs to the same visual system as primary actions.

## Scope

- Change only the active language link in `AppHeader`.
- Active state: `var(--teal)` background with white icon and text.
- Inactive state: keep the current white background, muted text, and neutral hover treatment.
- Keep the existing border, spacing, radius, labels, links, and `aria-current="page"` behavior.
- Do not change the OG logo or global navigation colors.

## Accessibility and verification

- Teal `#0f766e` with white text has a 5.47:1 contrast ratio and passes WCAG AA for normal text.
- Verify both `/zh/...` and `/en/...` so the selected color follows the active locale.
- Verify keyboard focus remains visible above the selected fill and the browser console stays clean.
