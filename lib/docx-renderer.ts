import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, ImageRun,
  PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx';
import sharp from 'sharp';
import { buildReportExport, type ExportAudit, type ExportBar, type ExportEntry, type ExportLink, type ExportOptions, type ExportSection, type ReportExport } from './report-export-content';
import { getReportEmphasisRuns } from './report-emphasis';

export type AuditForWord = ExportAudit;

const CONTENT_WIDTH = 9746;
const INK = '161B20';
const MUTED = '4B5563';
const ACCENT = '196960';
const TRACK = 'E6EFED';

function eastAsia(text: string, language: string) {
  if (/[\uac00-\ud7af]/u.test(text) || language === 'ko-KR') return 'Malgun Gothic';
  if (/[\u3040-\u30ff]/u.test(text) || language === 'ja-JP') return 'Yu Gothic';
  return language === 'zh-TW' ? 'Microsoft JhengHei' : 'PingFang SC';
}

export async function renderWordExport(report: ReportExport) {
  const font = (text = '') => ({
    ascii: 'Arial',
    hAnsi: 'Arial',
    eastAsia: eastAsia(text, report.language),
    hint: /^(zh|ja|ko)-/.test(report.language) ? 'eastAsia' : undefined,
  });
  const run = (text: string, options: { bold?: boolean; color?: string; size?: number; break?: number; linked?: boolean } = {}) => {
    const { linked, ...style } = options;
    return new TextRun({ text, font: font(text), color: style.color ?? INK, underline: linked ? { type: 'single' } : undefined, ...style });
  };
  const link = ({ href, label }: ExportLink) => new ExternalHyperlink({
    link: href, children: [run(label, { linked: true, color: ACCENT })],
  });
  const links = (entries: ExportLink[]) => entries.flatMap((entry, i) => [
    ...(i ? [run(' · ', { color: MUTED })] : []),
    link(entry),
  ]);
  const heading = (title: string, main = true) => new Paragraph({
    heading: main ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: main ? 216 : 110, after: 54, line: 285 },
    children: [run(title, { bold: true, size: main ? 28 : 22 })],
  });
  const paragraphs = (value: string, options: { muted?: boolean; raw?: boolean } = {}) => value.split(/\n\s*\n/).filter(Boolean).map(block => new Paragraph({
    spacing: { after: options.muted ? 68 : 85, line: 286 },
    children: block.split('\n').flatMap((line, i) => {
      const runs = options.raw || options.muted ? [{ text: line, bold: false }] : getReportEmphasisRuns(line);
      return runs.map((part, j) => run(part.text, { bold: part.bold, color: options.muted ? MUTED : INK, size: options.muted ? 18 : 21, break: i && j === 0 ? 1 : undefined }));
    }),
  }));
  function entry(item: ExportEntry, reference = false) {
    const sourceLinks = item.links ?? [];
    if (reference) {
      return [new Paragraph({
        spacing: { after: 70, line: 255 },
        children: [
          ...links(sourceLinks.map(source => ({ ...source, label: `[${source.label}] ${item.heading || source.href}` }))),
          ...(item.detail ? [run(` · ${item.detail}`, { color: MUTED, size: 18 })] : []),
        ],
      })];
    }
    return [
      ...(item.heading ? [heading(item.heading.replaceAll('\n', ' '), false)] : []),
      ...paragraphs(item.body || '', { raw: item.verbatim }),
      ...(item.detail || sourceLinks.length ? [new Paragraph({
        spacing: { after: 90, line: 258 },
        children: [
          ...(item.detail ? [run(item.detail, { color: MUTED, size: 18 })] : []),
          ...(item.detail && sourceLinks.length ? [run(' · ', { size: 18 })] : []),
          ...links(sourceLinks.map(source => ({ ...source, label: `[${source.label}]` }))),
        ],
      })] : []),
    ];
  }
  const section = ({ title, entries }: ExportSection, reference = false) => entries.length
    ? [heading(title), ...entries.flatMap(item => entry(item, reference))]
    : [];

  async function chart(rows: ExportBar[], limit: number, columns: [string, string]) {
    const widths = [3446, 5100, 1200];
    const cell = (contents: Array<TextRun | ImageRun>, width: number, header = false) => new TableCell({
      width: { size: width, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 42, bottom: 42, left: 84, right: 84 },
      shading: header ? { type: ShadingType.CLEAR, fill: TRACK } : undefined,
      children: [new Paragraph({ spacing: { after: 0, line: 247 }, children: contents })],
    });
    const body = await Promise.all(rows.map(async row => {
      const width = Math.round(row.value / limit * 420);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="16"><rect width="420" height="16" fill="#${TRACK}"/><rect width="${width}" height="16" fill="#${ACCENT}"/></svg>`;
      const data = await sharp(Buffer.from(svg)).png().toBuffer();
      return new TableRow({ cantSplit: true, children: [
        cell([run(row.label, { size: 19 })], widths[0]),
        cell([new ImageRun({ type: 'png', data, transformation: { width: 210, height: 8 } })], widths[1]),
        cell([run(String(row.value), { size: 19, bold: true })], widths[2]),
      ] });
    }));
    return new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
      borders: { insideHorizontal: { style: BorderStyle.SINGLE, color: TRACK, size: 3 } },
      rows: [new TableRow({ tableHeader: true, cantSplit: true, children: [
        cell([run(columns[0], { size: 19, bold: true })], widths[0]),
        cell([], widths[1]),
        cell([run(columns[1], { size: 19, bold: true })], widths[2]),
      ] }), ...body],
    });
  }

  const measures = report.metrics.length ? [
    heading(report.metricsTitle),
    await chart(report.metrics, 100, [report.columns.metric, `${report.columns.score}/100`]),
    ...report.metrics.flatMap(item => item.reason ? paragraphs(`${item.label} · ${item.reason}`, { muted: true }) : []),
    ...paragraphs(report.metricsNote, { muted: true }),
  ] : [];
  const grades = report.grades.length ? [
    heading(report.gradesTitle),
    await chart(report.grades, Math.max(...report.grades.map(grade => grade.value)), [report.columns.grade, report.columns.count]),
    ...paragraphs(report.gradesNote, { muted: true }),
  ] : [];

  const doc = new Document({
    title: report.title,
    styles: {
      default: { document: { run: { font: font(), size: 21, color: INK, language: { value: report.language, eastAsia: report.language } } } },
      paragraphStyles: [{ id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal' }],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1020, right: 1080, bottom: 1050, left: 1080 } } },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: MUTED })],
      })] }) },
      children: [
        new Paragraph({ style: 'Title', keepNext: true, spacing: { after: 120, line: 445 }, children: [run(report.title, { size: 42, bold: true })] }),
        ...(report.publisher || report.original ? [new Paragraph({
          keepNext: true, spacing: { after: 165, line: 275 },
          children: [
            ...(report.publisher ? [run(report.publisher, { size: 19, color: MUTED })] : []),
            ...(report.original ? [...(report.publisher ? [run(' · ')] : []), link(report.original)] : []),
          ],
        })] : []),
        ...paragraphs(report.summary),
        ...(report.conclusion ? [heading(report.conclusionLabel), ...paragraphs(report.conclusion)] : []),
        ...paragraphs(report.evidenceNote, { muted: true }),
        ...measures, ...grades,
        ...report.sections.flatMap(item => section(item)),
        ...section(report.references, true),
        ...paragraphs(report.metadata, { muted: true }),
        ...paragraphs(report.disclaimer, { muted: true }),
        ...(report.appendix ? section(report.appendix) : []),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

export function renderProfessionalWord(audit: AuditForWord, options?: ExportOptions) {
  return renderWordExport(buildReportExport(audit, options));
}
