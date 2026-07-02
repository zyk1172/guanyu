# Audience Themes Design

## Goal

Add account-level audience themes for 观隅 so the app can adapt visual tone and report reading complexity for different age groups without changing the underlying audit logic or saved report JSON.

## Theme Set

- 青少年版 (`teen`): brighter and more explanatory; show terminology guidance and keep displayed findings shorter.
- 青年版 (`youth`): current professional dense default; keep high-frequency workflow compact.
- 成熟版 (`mature`): calmer, more restrained; emphasize evidence and verification structure.
- 长者版 (`senior`): larger type, higher contrast, reduced motion, fewer visible report cards by default.

## Architecture

Theme is stored on `UserSettings.defaultAudienceTheme`. A client-side `AudienceThemeProvider` reads `/api/account/settings` after login, applies `data-audience-theme` to `<html>`, stores the current value in `localStorage`, and exposes a hook for report components. Account settings is the persistence surface; localStorage is only a fast client fallback.

## Reading Complexity

The AI output stays unchanged. The report renderer adapts display:

- Teen and senior themes show a short reading guide before the report.
- Teen and senior themes display fewer key cards per section, with a note that Markdown export still contains the complete report.
- Youth and mature themes keep the full dense report layout.
- Senior theme reduces motion and increases base font size.

## Non-Goals

- Do not generate different AI prompts by age group.
- Do not add child-account or parental controls.
- Do not rewrite historical reports.
- Do not save theme into each `Audit`.
