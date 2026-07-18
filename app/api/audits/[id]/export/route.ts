import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { assertServiceCreditsAvailable, CREDIT_COSTS, consumeServiceCreditsWithResult } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { parseExportReport } from '@/lib/report-export-content';

type ExportFormat = 'MARKDOWN' | 'PDF' | 'WORD';
const PDF_TEMPLATE_VERSION = '5';
const WORD_TEMPLATE_VERSION = '1';

function filePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 48) || 'report';
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function markdown(audit: { title: string; source: string; publishedAt: string; newsSummary: string; auditResultJson: string; originalContent: string; modelName: string; reasoningDepth: string; reportLanguage: string; createdAt: Date }) {
  const report = parseExportReport(audit.auditResultJson);
  const zh = audit.reportLanguage.startsWith('zh');
  const h = (cn: string, en: string) => zh ? cn : en;
  const conclusion = report.oneSentenceConclusion || report.one_sentence_conclusion || h('当前材料不足，无法形成可靠判断。', 'The available material is insufficient for a reliable conclusion.');
  const sectionItems = (title: string, value: unknown) => {
    const items = asArray(value).map((item: any) => typeof item === 'string' ? item : item.title || item.question || item.actor || item.explanation || item.content || item.detail).filter(Boolean);
    return items.length ? [`## ${title}`, ...items.map((item) => `- ${String(item)}`), ''] : [];
  };
  return [
    `# ${h('观隅 · 新闻叙事审视报告', 'Guanyu · News Narrative Review Report')}`,
    '',
    `## ${h('报告信息', 'Report information')}`,
    `- ${h('新闻标题', 'News title')}：${audit.title}`,
    `- ${h('来源', 'Source')}：${audit.source || h('未提供', 'Not provided')}`,
    `- ${h('发布时间', 'Published')}：${audit.publishedAt || h('未能可靠识别', 'Not reliably identified')}`,
    `- ${h('生成模型', 'Model')}：${audit.modelName}`,
    `- ${h('思考强度', 'Reasoning depth')}：${audit.reasoningDepth}`,
    `- ${h('报告语言', 'Report language')}：${audit.reportLanguage}`,
    `- ${h('生成时间', 'Generated')}：${audit.createdAt.toISOString()}`,
    '',
    `## ${h('新闻简要总结', 'News summary')}`,
    audit.newsSummary,
    '',
    `## ${h('一句话观隅审视', 'One-sentence Guanyu view')}`,
    conclusion,
    '',
    ...sectionItems(h('关键发现', 'Key findings'), report.keyFindings || report.key_findings),
    ...sectionItems(h('支持原文叙事的证据', 'Evidence supporting the article narrative'), report.supportingEvidence || report.narrative_supporting_evidence),
    ...sectionItems(h('主要信息缺口', 'Major information gaps'), report.informationGaps || report.major_information_gaps),
    ...sectionItems(h('关键利益关系', 'Key interest relationships'), report.interestRelationships || (report.nine_mirror_review as Record<string, unknown> | undefined)?.interest_cost_map),
    ...sectionItems(h('替代解释', 'Alternative explanations'), report.alternativeExplanations || report.alternative_explanations),
    ...sectionItems(h('验证路线图', 'Verification roadmap'), report.verificationRoadmap || report.verification_roadmap),
    ...sectionItems(h('继续追问清单', 'Questions to ask next'), report.questionsToAsk || report.questions_to_ask_next),
    `## ${h('附录：新闻原文', 'Appendix: original article')}`,
    audit.originalContent,
  ].join('\n');
}

function attachment(content: Uint8Array | string, filename: string, contentType: string) {
  return new NextResponse(typeof content === 'string' ? content : (Buffer.from(content) as any), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

async function getAuthorizedAudit(request: Request, id: string) {
  const user = await getCurrentUser(request);
  if (!user) return { error: NextResponse.json({ error: '请登录后导出报告。' }, { status: 401 }) } as const;
  const audit = await prisma.audit.findUnique({
    where: { id },
    select: {
      id: true, userId: true, reportVersion: true, title: true, source: true, publishedAt: true,
      newsSummary: true, auditResultJson: true, originalContent: true, completionMarkdown: true, modelName: true,
      reasoningDepth: true, reportLanguage: true, createdAt: true,
    },
  });
  if (!audit) return { error: NextResponse.json({ error: '报告不存在。' }, { status: 404 }) } as const;
  const isAdmin = await getSuperAdminStatus(user.id);
  if (audit.userId !== user.id && !isAdmin) return { error: NextResponse.json({ error: '只有报告创建者可以导出正式文件。' }, { status: 403 }) } as const;
  return { user, audit } as const;
}

function filenameFor(audit: { title: string; reportLanguage: string; createdAt: Date }, format: ExportFormat) {
  const prefix = audit.reportLanguage.startsWith('zh') ? '观隅_新闻叙事审视报告' : 'Guanyu_Narrative_Review_Report';
  const extension = format === 'PDF' ? 'pdf' : format === 'WORD' ? 'docx' : 'md';
  return `${prefix}_${filePart(audit.title)}_${audit.createdAt.toISOString().slice(0, 10)}.${extension}`;
}

async function getExisting(userId: string, reportId: string, reportVersion: number, format: ExportFormat) {
  const artifact = await prisma.exportArtifact.findUnique({ where: { userId_reportId_reportVersion_exportFormat: { userId, reportId, reportVersion, exportFormat: format } } });
  // Formal export templates are separately versioned. Markdown remains content-versioned only.
  const expectedTemplateVersion = format === 'PDF' ? PDF_TEMPLATE_VERSION : format === 'WORD' ? WORD_TEMPLATE_VERSION : null;
  if (expectedTemplateVersion && artifact?.templateVersion !== expectedTemplateVersion) return null;
  return artifact;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getAuthorizedAudit(request, id);
  if ('error' in found) return found.error;
  const format = String(new URL(request.url).searchParams.get('format') || 'PDF').toUpperCase() as ExportFormat;
  if (format !== 'MARKDOWN' && format !== 'PDF' && format !== 'WORD') return NextResponse.json({ error: '不支持的导出格式。' }, { status: 400 });
  const artifact = await getExisting(found.user.id, id, found.audit.reportVersion, format);
  if (!artifact?.content || artifact.status !== 'READY') return NextResponse.json({ error: '该版本尚未生成此导出文件。' }, { status: 404 });
  if (format === 'PDF') return attachment(Buffer.from(artifact.content, 'base64'), artifact.downloadFilename, 'application/pdf');
  if (format === 'WORD') return attachment(Buffer.from(artifact.content, 'base64'), artifact.downloadFilename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return attachment(artifact.content, artifact.downloadFilename, 'text/markdown; charset=utf-8');
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getAuthorizedAudit(request, id);
  if ('error' in found) return found.error;
  const body = await request.json().catch(() => ({}));
  const format = String(body.format || 'MARKDOWN').toUpperCase() as ExportFormat;
  if (format !== 'MARKDOWN' && format !== 'PDF' && format !== 'WORD') return NextResponse.json({ error: '不支持的导出格式。' }, { status: 400 });

  const existing = await getExisting(found.user.id, id, found.audit.reportVersion, format);
  if (existing?.status === 'READY' && existing.content) {
    if (format === 'PDF' || format === 'WORD') return NextResponse.json({ filename: existing.downloadFilename, charged: false, downloadUrl: `/api/audits/${encodeURIComponent(id)}/export?format=${format}` });
    return NextResponse.json({ content: existing.content, filename: existing.downloadFilename, charged: false });
  }

  const creditCost = format === 'PDF' ? CREDIT_COSTS.PDF_EXPORT : format === 'WORD' ? CREDIT_COSTS.WORD_EXPORT : CREDIT_COSTS.MARKDOWN_EXPORT;
  try {
    await assertServiceCreditsAvailable({ userId: found.user.id, cents: creditCost });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '当前点数不足。' }, { status: 402 });
  }

  const filename = filenameFor(found.audit, format);
  try {
    const startedAt = Date.now();
    console.info('Report export started', { auditId: id, format, reportVersion: found.audit.reportVersion });
    // Markdown must remain available even when Chromium is unavailable. Loading
    // the PDF renderer only for a PDF request also keeps its runtime dependency
    // out of the light-weight Markdown path.
    const generated = format === 'PDF'
      ? await (await import('@/lib/pdf-renderer')).renderProfessionalPdf(found.audit)
      : format === 'WORD'
        ? await (await import('@/lib/docx-renderer')).renderProfessionalWord(found.audit)
        : Buffer.from(markdown(found.audit), 'utf8');
    console.info('Report export rendered', { auditId: id, format, bytes: generated.byteLength, elapsedMs: Date.now() - startedAt });
    const content = format === 'PDF' || format === 'WORD' ? Buffer.from(generated).toString('base64') : generated.toString('utf8');
    const hash = crypto.createHash('sha256').update(generated).digest('hex');
    const committed = await consumeServiceCreditsWithResult({
      userId: found.user.id,
      cents: creditCost,
      transactionType: format === 'PDF' ? 'PDF_EXPORT' : format === 'WORD' ? 'WORD_EXPORT' : 'MARKDOWN_EXPORT',
      description: format === 'PDF' ? '首次导出 PDF 消耗 1 点' : format === 'WORD' ? '首次导出 Word 消耗 1 点' : '首次导出 Markdown 消耗 1 点',
      auditId: id,
      reportVersion: found.audit.reportVersion,
      idempotencyKey: `export:${found.user.id}:${id}:${found.audit.reportVersion}:${format}`,
    }, (tx, transaction) => tx.exportArtifact.upsert({
      where: { userId_reportId_reportVersion_exportFormat: { userId: found.user.id, reportId: id, reportVersion: found.audit.reportVersion, exportFormat: format } },
      update: { content, contentHash: hash, fileHash: hash, fileSizeBytes: generated.byteLength, downloadFilename: filename, status: 'READY', language: found.audit.reportLanguage, templateVersion: format === 'PDF' ? PDF_TEMPLATE_VERSION : format === 'WORD' ? WORD_TEMPLATE_VERSION : '2', pointTransactionId: transaction?.id, errorCode: null, errorMessageSanitized: null },
      create: { userId: found.user.id, reportId: id, reportVersion: found.audit.reportVersion, exportFormat: format, content, contentHash: hash, fileHash: hash, fileSizeBytes: generated.byteLength, downloadFilename: filename, language: found.audit.reportLanguage, status: 'READY', templateVersion: format === 'PDF' ? PDF_TEMPLATE_VERSION : format === 'WORD' ? WORD_TEMPLATE_VERSION : '2', pointTransactionId: transaction?.id },
    }));
    const artifact = committed.result;
    console.info('Report export stored', { auditId: id, format, elapsedMs: Date.now() - startedAt });
    if (format === 'PDF' || format === 'WORD') return NextResponse.json({ filename: artifact.downloadFilename, charged: true, downloadUrl: `/api/audits/${encodeURIComponent(id)}/export?format=${format}` });
    return NextResponse.json({ content: artifact.content, filename: artifact.downloadFilename, charged: true });
  } catch (error) {
    // Rendering happens before the transaction. Charging and artifact storage
    // then commit atomically, so a persistence failure cannot strand a charge.
    console.error('Report export failed', { auditId: id, format, error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: format === 'PDF' ? 'PDF 生成失败，请稍后重试。' : format === 'WORD' ? 'Word 文档生成失败，请稍后重试。' : 'Markdown 导出失败，请稍后重试。' }, { status: 500 });
  }
}
