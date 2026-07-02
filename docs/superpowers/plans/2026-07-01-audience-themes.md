# Audience Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add account-level audience themes that adjust 观隅 visual tone and report reading complexity for teen, youth, mature, and senior readers.

**Architecture:** Persist `defaultAudienceTheme` on `UserSettings`, expose it through account settings APIs, apply it client-side through a provider, and use the theme hook in report rendering to reduce or enrich visible report content. Keep AI schema and saved audit JSON unchanged.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Tailwind CSS, React client context, node:test.

---

### Task 1: Theme Core

**Files:**
- Create: `lib/audience-theme-core.mjs`
- Modify: `lib/types.ts`
- Modify: `scripts/report-logic.test.mjs`

- [ ] Add pure theme metadata and normalization.
- [ ] Add tests that validate supported values and senior display limits.

### Task 2: Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `app/api/account/settings/route.ts`
- Modify: `app/account/page.tsx`

- [ ] Add `UserSettings.defaultAudienceTheme`.
- [ ] Return and patch the theme through `/api/account/settings`.
- [ ] Add account UI selector with four audience options.

### Task 3: Client Theme Application

**Files:**
- Create: `components/AudienceThemeProvider.tsx`
- Modify: `components/Providers.tsx`
- Modify: `app/globals.css`

- [ ] Fetch account theme after login.
- [ ] Apply `data-audience-theme`.
- [ ] Add CSS rules for visual tone, font scale, contrast, and reduced motion.

### Task 4: Report Reading Complexity

**Files:**
- Modify: `components/AnalysisResult.tsx`

- [ ] Use the theme hook.
- [ ] Show theme-specific reading guide.
- [ ] Limit visible detail cards for teen and senior themes while keeping Markdown export complete.

### Task 5: Verification

**Commands:**
- `npm run test:report`
- `npm run lint`
- `npm run build`
- `npx prisma db push` with the active Postgres `DATABASE_URL`

**Expected:** tests pass, build passes, and the account settings page can save and reload the selected theme.
