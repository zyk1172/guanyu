# Monetized Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anti-abuse registration, daily free quota, point consumption, Tavily plus Serper search, and richer Markdown export.

**Architecture:** Keep all quota, search-key selection, rate limiting, and registration verification on the server. Store API keys encrypted in PostgreSQL. Use manual Alipay order confirmation for the first paid version.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, existing encrypted secret helper, server route handlers.

---

### Task 1: Data Model and Core Services

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/billing.ts`
- Create: `lib/rate-limit.ts`
- Create: `lib/captcha.ts`
- Create: `lib/email.ts`

- [ ] Add user credit fields, Serper settings, app settings, point transactions, purchase orders, verification codes, and rate limit events.
- [ ] Implement quota decision: 3 free reports per day, then points; quick costs 1, deep costs 2.
- [ ] Implement 5-minute generation limit: 3 reports per user.
- [ ] Implement registration captcha and email-code helpers.
- [ ] Implement email sending abstraction with Aliyun env support and development log fallback.

### Task 2: Registration Verification

**Files:**
- Create: `app/api/captcha/route.ts`
- Create: `app/api/register/send-code/route.ts`
- Modify: `app/api/register/route.ts`
- Modify: `app/register/page.tsx`

- [ ] Generate a captcha challenge.
- [ ] Validate captcha before sending email code.
- [ ] Validate email code before creating account.
- [ ] Add resend and error UI.

### Task 3: Search Providers and Prompt Evidence

**Files:**
- Modify: `lib/search.ts`
- Create: `lib/serper-core.mjs`
- Modify: `lib/prompts.ts`
- Modify: `app/api/analyze/route.ts`

- [ ] Add Serper search provider.
- [ ] Merge Tavily and Serper results when both are available.
- [ ] Select admin keys for free quota and user keys for paid quota with admin fallback.
- [ ] Pass source names and URLs into report context.
- [ ] Require explicit evidence basis and “暂无法核验” when search cannot support a claim.

### Task 4: Billing and Payment UI

**Files:**
- Create: `app/api/billing/status/route.ts`
- Create: `app/api/billing/orders/route.ts`
- Create: `app/api/billing/admin/route.ts`
- Modify: `app/account/page.tsx`
- Modify: `app/api/account/settings/route.ts`

- [ ] Show free quota, credit balance, and point package.
- [ ] Create 6-yuan / 30-point manual payment orders.
- [ ] Add super-admin manual credit grant and order confirmation.
- [ ] Add admin model/search config fields.

### Task 5: Analyze Enforcement

**Files:**
- Modify: `app/api/analyze/route.ts`
- Modify: `components/AnalysisForm.tsx`

- [ ] Check rate limit before calling model.
- [ ] Reserve quota decision before calling external services.
- [ ] Commit quota consumption only after report is saved.
- [ ] Return Chinese errors for quota, points, and rate limit failures.
- [ ] Show cost hints in the form.

### Task 6: Markdown Export

**Files:**
- Create: `lib/markdown-export.ts`
- Modify: `components/AnalysisResult.tsx`
- Modify: `components/InteractiveQA.tsx` if needed.

- [ ] Replace JSON export with complete Markdown export.
- [ ] Include original text and Q&A.
- [ ] Include联网核验依据 and unverified items.
- [ ] Improve heading, table, and list formatting.

### Verification

- [ ] Run `npx prisma generate`.
- [ ] Run `npm run test:report`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Test registration flow locally.
- [ ] Test one quick and one deep report with free quota and then point consumption.

