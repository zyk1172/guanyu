# 观隅专业审视报告模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an original, print-ready Guanyu PDF report template with robust hierarchy, evidence traceability, and long-document pagination.

**Architecture:** Keep the existing authenticated export API and pdf-lib renderer. Refine the renderer into cover, executive brief, metrics, evidence sections, references, and appendix primitives; extend the smoke script to produce representative Chinese and English reports and verify the resulting PDFs.

**Tech Stack:** Next.js Route Handler, TypeScript, pdf-lib, @pdf-lib/fontkit, production-verified Noto Sans SC, PDF standard Helvetica, Poppler.

## Global Constraints

- Preserve the existing PDF export endpoint, point charging, artifact storage, and authorization behavior.
- Do not reproduce third-party logos, brand colors, layouts, or proprietary design assets.
- Use a single font per export: production-verified Noto Sans SC for CJK report languages and PDF standard Helvetica for Latin report languages, with the original Guanyu blue-gray/neutral palette.
- Keep A4 output searchable, selectable, printable, and visually validated in Chinese and English.
- Do not change news-analysis logic, report JSON semantics, database schema, or billing.

---

### Task 1: Define reusable report hierarchy primitives

**Files:**
- Modify: `lib/pdf-renderer.ts`
- Test: `scripts/pdf-smoke.ts`

**Interfaces:**
- Consumes: `AuditForPdf` and parsed report JSON already used by `renderProfessionalPdf`.
- Produces: `ProfessionalPdf.render(report)` with stable cover, executive brief, section, evidence item, source, and footer hierarchy.

- [ ] **Step 1: Extend the smoke report with a source, a long evidence entry, and both Chinese and English content.**

```ts
onlineVerification: {
  verifiedSources: [{ title: 'Example source', url: 'https://example.com', evidenceGrade: 'B', verificationStatus: '部分支持' }],
}
```

- [ ] **Step 2: Run the smoke test and record the pre-change output.**

Run: `npm run test:pdf`

Expected: both current PDFs are written under `output/pdf/`.

- [ ] **Step 3: Add renderer primitives for an executive brief, a source line, and an evidence card.**

```ts
private executiveBrief(report: ReportItem) { /* summary, conclusion, highlights and priority verification */ }
private evidenceItem(item: ReportItem, index: number) { /* title, assertion, evidence, status and source label */ }
private sourceEntry(source: ReportItem, index: number) { /* [S1] title, URL and state */ }
```

- [ ] **Step 4: Run the smoke test again.**

Run: `npm run test:pdf`

Expected: exit status 0 and two non-empty PDFs.

### Task 2: Apply print and archive layout rules

**Files:**
- Modify: `lib/pdf-renderer.ts`
- Test: `scripts/pdf-smoke.ts`

**Interfaces:**
- Consumes: renderer primitives from Task 1.
- Produces: A4 pages with stable headers, footers, report version data, bounded line lengths, and no stranded section headings.

- [ ] **Step 1: Add a 30+ page smoke source to force multipage layout.**

```ts
originalContent: baseParagraph.repeat(520)
```

- [ ] **Step 2: Ensure headings reserve follow-on body space and evidence blocks start on a fresh page when they cannot fit.**

```ts
private ensureRoom(height: number) { if (this.y - height < A4.bottom) this.addPage(); }
```

- [ ] **Step 3: Standardize header/footer content and render report ID, short title, date, version, and `n / total` page numbers.**

```ts
private pageNumbers() { /* all body pages receive metadata footer */ }
```

- [ ] **Step 4: Run the smoke test and inspect rendered PNGs.**

Run: `npm run test:pdf && pdftoppm -f 1 -l 3 -png -r 130 output/pdf/guanyu-professional-zh.pdf /tmp/guanyu-zh`

Expected: no clipped text, no broken CJK glyphs, no page-number overlap, and no standalone section title at a page bottom.

### Task 3: Improve source traceability and visual restraint

**Files:**
- Modify: `lib/pdf-renderer.ts`
- Test: `scripts/pdf-smoke.ts`

**Interfaces:**
- Consumes: report fields `onlineVerification.verifiedSources`, `evidenceGrade`, and `verificationStatus`.
- Produces: numbered sources and print-safe semantic visual markers.

- [ ] **Step 1: Write smoke data that includes source URLs, evidence grades, and verification statuses.**

```ts
supportingEvidence: [{ title: '...', description: '...', evidenceGrade: 'B', verificationStatus: '外部已核验' }]
```

- [ ] **Step 2: Render sources as `[S1]` entries and include evidence metadata under each related card.**

```ts
this.paragraph(`[S${index + 1}] ${title}\n${url}`, { size: 8.8 });
```

- [ ] **Step 3: Keep semantic colors low-saturation and make non-color text labels mandatory.**

```ts
const statusLine = `${evidenceLabel} ${grade} | ${verificationStatus}`;
```

- [ ] **Step 4: Run PDF smoke and TypeScript checks.**

Run: `npm run test:pdf && npx tsc --noEmit`

Expected: both commands exit 0.

### Task 4: Build, deploy, and production-verify

**Files:**
- Modify: `lib/pdf-renderer.ts`, `scripts/pdf-smoke.ts`, documentation files above.

**Interfaces:**
- Consumes: completed renderer and export route.
- Produces: production PDF downloaded through the real report action.

- [ ] **Step 1: Build the application.**

Run: `npm run build`

Expected: `Compiled successfully` and exit status 0.

- [ ] **Step 2: Deploy the verified application to Vercel production.**

Run: `npx vercel --prod --yes`

Expected: a Ready production deployment with the `guanyu-seven.vercel.app` alias.

- [ ] **Step 3: Export an existing production report in the in-app browser.**

Expected: browser download succeeds and creates a PDF file.

- [ ] **Step 4: Copy the downloaded PDF to Desktop and verify file metadata and two rendered pages.**

Run: `pdfinfo <downloaded.pdf> && pdftoppm -f 1 -l 2 -png -r 130 <downloaded.pdf> /tmp/guanyu-production`

Expected: A4 pages, non-zero file size, readable CJK and English text, cover plus body hierarchy visible.
