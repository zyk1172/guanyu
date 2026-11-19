import path from 'node:path';
import PDFDocument from 'pdfkit';
import { buildReportExport, buildReportOutline, type ExportAudit, type ExportBar, type ExportEntry, type ExportOptions, type ReportExport } from './report-export-content';
import { getReportEmphasisRuns } from './report-emphasis';

const PAGE = { width: 595.28, height: 841.89, left: 52, right: 52, top: 52, bottom: 52 };
const WIDTH = PAGE.width - PAGE.left - PAGE.right;
const INK = '#161b20';
const MUTED = '#4b5563';
const ACCENT = '#196960';
const TRACK = '#e6efed';

export async function renderPdfExport(report: ReportExport): Promise<Buffer> {
  const outline = buildReportOutline(report);
  const fonts = path.join(process.cwd(), 'public', 'fonts');
  const family = report.language === 'ko-KR' ? 'NotoSansKR' : 'NotoSansSC';
  const regular = path.join(fonts, `${family}-Regular.ttf`);
  const bold = path.join(fonts, `${family}-Bold.ttf`);
  const doc = new PDFDocument({
    font: regular,
    size: 'A4', bufferPages: true,
    margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right },
    info: { Title: report.title, CreationDate: report.createdAt },
  });
  doc.registerFont('Report', regular);
  doc.registerFont('ReportBold', bold);
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  function font(size: number, color = INK, strong = false) {
    return doc.font(strong ? 'ReportBold' : 'Report').fillColor(color).fontSize(size);
  }
  function ensureSpace(height: number) {
    if (doc.y + height > PAGE.height - PAGE.bottom) doc.addPage();
  }
  function plain(value: string, size: number, color = INK, href?: string) {
    if (!value) return;
    font(size, color).text(value, PAGE.left, doc.y, { width: WIDTH, lineGap: 2.4, link: href, underline: !!href });
    doc.moveDown(0.24);
  }
  function prose(value: string, verbatim = false, size = 10, color = INK) {
    for (const block of value.split(/\n\s*\n/).filter(Boolean)) {
      doc.x = PAGE.left;
      const runs = verbatim ? [{ text: block, bold: false }] : getReportEmphasisRuns(block, report.emphasisPhrases);
      runs.forEach((run, index) => font(size, color, run.bold).text(run.text, {
        width: WIDTH, lineGap: 2.5, continued: index < runs.length - 1,
      }));
      doc.moveDown(0.28);
    }
  }
  function heading(title: string, main = true, id?: string) {
    const size = main ? 14 : 10.5;
    font(size, INK, true);
    const height = doc.heightOfString(title, { width: WIDTH, lineGap: 2 });
    ensureSpace(Math.min(215, height + (main ? 46 : 34)));
    doc.y += main ? 8 : 4;
    if (id) {
      doc.addNamedDestination(id, 'XYZ', null, doc.y, null);
      doc.outline.addItem(title);
    }
    font(size, INK, true).text(title, PAGE.left, doc.y, { width: WIDTH, lineGap: 2 });
    doc.moveDown(0.24);
  }
  function row(item: ExportEntry, reference: boolean) {
    const links = item.links ?? [];
    if (reference) {
      const [link] = links;
      ensureSpace(33);
      if (link) plain(`[${link.label}] ${item.heading || link.href}`, 9.5, ACCENT, link.href);
      plain(item.detail || '', 8.6, MUTED);
      return;
    }
    if (item.heading) heading(item.heading, false);
    if (item.body) prose(item.body, item.verbatim);
    if (item.detail) plain(item.detail, 8.6, MUTED);
    if (links.length) {
      ensureSpace(18);
      links.forEach((link, index) => font(8.6, ACCENT).text(`[${link.label}]${index < links.length - 1 ? '  ' : ''}`, {
        width: WIDTH, underline: true, link: link.href, continued: index < links.length - 1,
      }));
      doc.moveDown(0.27);
    }
  }
  function chart(rows: ExportBar[], limit: number, suffix = '') {
    const labelWidth = 167, valueWidth = 52;
    const barWidth = WIDTH - labelWidth - valueWidth - 26;
    for (const bar of rows) {
      font(9.5);
      const height = Math.max(20, doc.heightOfString(bar.label, { width: labelWidth }) + 4);
      ensureSpace(height);
      const y = doc.y;
      font(9.5).text(bar.label, PAGE.left, y, { width: labelWidth });
      const x = PAGE.left + labelWidth + 9;
      doc.rect(x, y + 4, barWidth, 7).fill(TRACK);
      if (bar.value) doc.rect(x, y + 4, barWidth * bar.value / limit, 7).fill(ACCENT);
      font(9.5, INK, true).text(`${bar.value}${suffix}`, x + barWidth + 9, y, { width: valueWidth, lineBreak: false });
      doc.x = PAGE.left;
      doc.y = y + height;
    }
  }

  font(23, INK, true).text(report.title, { width: WIDTH, lineGap: 2.5 });
  doc.moveDown(0.36);
  plain(report.subtitle, 13, ACCENT);
  plain(report.publisher, 9.5, MUTED);
  if (report.original) plain(report.original.label, 9.5, ACCENT, report.original.href);
  heading(report.contentsTitle);
  const tocWidth = WIDTH - 34;
  const tocRows = outline.map(item => {
    const options = { width: tocWidth, lineGap: 1.6 };
    const height = font(10, ACCENT).heightOfString(item.title, options);
    ensureSpace(height + 6);
    const y = doc.y;
    const page = doc.bufferedPageRange().count - 1;
    font(10, ACCENT).text(item.title, PAGE.left, y, options);
    doc.goTo(PAGE.left, y, WIDTH, height, item.id);
    doc.y = y + height + 5;
    return { page, y, destination: 0 };
  });
  if (outline.length) doc.addPage();
  for (const [index, item] of outline.entries()) {
    heading(item.title, true, item.id);
    tocRows[index].destination = doc.bufferedPageRange().count;
    if (item.kind === 'metrics') {
      chart(report.metrics, 100, '/100');
      for (const metric of report.metrics) {
        if (metric.reason) prose(`${metric.label} · ${metric.reason}`, false, 8.8, MUTED);
      }
      plain(report.metricsNote, 8.6, MUTED);
    } else if (item.kind === 'grades') {
      chart(report.grades, Math.max(...report.grades.map(grade => grade.value)));
      plain(report.gradesNote, 8.6, MUTED);
    } else {
      item.entries.forEach(entry => row(entry, item.kind === 'references'));
    }
  }
  doc.moveDown(0.45);
  plain(report.metadata, 8.4, MUTED);
  plain(report.disclaimer, 8.1, MUTED);
  for (const row of tocRows) {
    doc.switchToPage(row.page);
    font(9.5, MUTED).text(String(row.destination), PAGE.left + tocWidth, row.y, { width: 34, align: 'right' });
  }

  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    // Footer text lies below the normal flow boundary.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    font(8.5, MUTED).text(String(i + 1), PAGE.left, PAGE.height - 33, { width: WIDTH, align: 'center', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return output;
}

export function renderProfessionalPdf(audit: ExportAudit, options?: ExportOptions) {
  return renderPdfExport(buildReportExport(audit, options));
}
