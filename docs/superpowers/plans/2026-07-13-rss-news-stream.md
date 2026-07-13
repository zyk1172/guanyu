# RSS News Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable, secure RSS headline stream beside the home analysis form, with selected headlines able to start the existing Guanyu analysis flow.

**Architecture:** Keep the catalog and XML normalization in a dedicated server helper. A single RSS endpoint resolves effective configuration based on account plan, fetches only validated sources, and returns presentation-ready headlines. The home panel is a small client component that uses the existing form callback to prefill selected article data.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, `fast-xml-parser` (MIT), Tailwind CSS, existing account and billing services.

## Global Constraints

- Preserve the existing deep-analysis-only, 3-point usage flow.
- Fetch and render only headlines, dates, source names and source links in the RSS UI.
- Use official public feeds where available and clearly mark feed availability.
- Never server-fetch arbitrary private-network or credential-bearing URLs.
- Free/points accounts use administrator RSS sources; buyout and super-admin accounts can configure their own.

---

### Task 1: Feed catalog and parser

**Files:**
- Create: `lib/rss-core.ts`
- Modify: `package.json`
- Modify: `scripts/report-logic.test.mjs`

- [ ] Write failing tests for parsing RSS 2.0/RDF/Atom items, resolving catalog IDs and rejecting unsafe custom URLs.
- [ ] Run `npm run test:report` and confirm the RSS cases fail because the helper does not exist.
- [ ] Add MIT-licensed `fast-xml-parser`, source catalog and normalized parser.
- [ ] Run `npm run test:report` and confirm all cases pass.

### Task 2: Persisted configuration and headlines endpoint

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/db-bootstrap.ts`
- Modify: `app/api/account/settings/route.ts`
- Create: `app/api/rss/headlines/route.ts`

- [ ] Add failing tests for effective administrator/personal source choice.
- [ ] Add JSON fields with runtime schema migration and account permission enforcement.
- [ ] Add the server endpoint with timeout, response-size, redirect and DNS checks.
- [ ] Run tests, TypeScript and focused endpoint checks.

### Task 3: Account and home UI

**Files:**
- Create: `components/RssNewsPanel.tsx`
- Modify: `components/AnalysisForm.tsx`
- Modify: `app/page.tsx`
- Modify: `app/account/page.tsx`
- Modify: `lib/ui-language-core.mjs`

- [ ] Add a desktop 3:1 analysis/RSS row and a mobile vertical stack.
- [ ] Make the RSS list bounded and scrollable; selected headlines use the existing URL parser to pre-fill the existing form.
- [ ] Add the effective configuration table and permission-aware controls in account settings.
- [ ] Add Chinese and English labels without hard-coded language mixing.

### Task 4: Verification and deployment

**Files:**
- Modify: `README.md`

- [ ] Run `npm run test:report`, `npx tsc --noEmit`, `npm run build`, `git diff --check`.
- [ ] Test one live catalog feed and one selected headline path locally.
- [ ] Deploy the verified current worktree to Vercel and inspect status.
