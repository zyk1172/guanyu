import {
  AlignmentType, Bookmark, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, ImageRun, InternalHyperlink,
  PageNumber, Packer, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx';
import sharp from 'sharp';
import { buildReportExport, buildReportOutline, type ExportAudit, type ExportBar, type ExportEntry, type ExportLink, type ExportOptions, type ReportExport } from './report-export-content';
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
  const outline = buildReportOutline(report);
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
  const heading = (title: string, sectionId?: string, pageBreakBefore = false) => new Paragraph({
    heading: sectionId ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    keepNext: true,
    pageBreakBefore,
    spacing: { before: sectionId ? 216 : 110, after: 54, line: 285 },
    children: sectionId
      ? [new Bookmark({ id: sectionId, children: [run(title, { bold: true, size: 30 })] })]
      : [run(title, { bold: true, size: 23 })],
  });
  const paragraphs = (value: string, options: { muted?: boolean; raw?: boolean } = {}) => value.split(/\n\s*\n/).filter(Boolean).map(block => new Paragraph({
    spacing: { after: options.muted ? 68 : 85, line: 286 },
    children: block.split('\n').flatMap((line, i) => {
      const runs = options.raw ? [{ text: line, bold: false }] : getReportEmphasisRuns(line, report.emphasisPhrases);
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
      ...(item.heading ? [heading(item.heading)] : []),
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
    await chart(report.metrics, 100, [report.columns.metric, `${report.columns.score}/100`]),
    ...report.metrics.flatMap(item => item.reason ? paragraphs(`${item.label} · ${item.reason}`, { muted: true }) : []),
    ...paragraphs(report.metricsNote, { muted: true }),
  ] : [];
  const grades = report.grades.length ? [
    await chart(report.grades, Math.max(...report.grades.map(grade => grade.value)), [report.columns.grade, report.columns.count]),
    ...paragraphs(report.gradesNote, { muted: true }),
  ] : [];

  const doc = new Document({
    title: report.title,
    styles: {
      default: { document: { run: { font: font(), size: 21, color: INK, language: { value: report.language, eastAsia: report.language } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal' },
        { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal' },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1020, right: 1080, bottom: 1050, left: 1080 } } },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: MUTED })],
      })] }) },
      children: [
        new Paragraph({ style: 'Title', keepNext: true, spacing: { after: 120, line: 445 }, children: [run(report.title, { size: 42, bold: true })] }),
        new Paragraph({ style: 'Subtitle', keepNext: true, spacing: { after: 100 }, children: [run(report.subtitle, { size: 27, bold: true, color: ACCENT })] }),
        ...(report.publisher || report.original ? [new Paragraph({
          keepNext: true, spacing: { after: 165, line: 275 },
          children: [
            ...(report.publisher ? [run(report.publisher, { size: 19, color: MUTED })] : []),
            ...(report.original ? [...(report.publisher ? [run(' · ')] : []), link(report.original)] : []),
          ],
        })] : []),
        new Paragraph({ keepNext: true, spacing: { before: 240, after: 115 }, children: [run(report.contentsTitle, { size: 30, bold: true })] }),
        ...outline.map(item => new Paragraph({
          keepLines: true, spacing: { after: 60, line: 260 },
          children: [new InternalHyperlink({ anchor: item.id, children: [run(item.title, { linked: true, color: ACCENT })] })],
        })),
        ...outline.flatMap((item, index) => [
          heading(item.title, item.id, index === 0),
          ...(item.kind === 'metrics' ? measures : item.kind === 'grades' ? grades : item.entries.flatMap(row => entry(row, item.kind === 'references'))),
        ]),
        ...paragraphs(report.metadata, { muted: true, raw: true }),
        ...paragraphs(report.disclaimer, { muted: true, raw: true }),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

export function renderProfessionalWord(audit: AuditForWord, options?: ExportOptions) {
  return renderWordExport(buildReportExport(audit, options));
}
