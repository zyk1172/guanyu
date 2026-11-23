import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { assertServiceCreditsAvailable, changeBalance, CREDIT_COSTS } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { buildReportExport, renderMarkdownExport, type ExportAudit } from '@/lib/report-export-content';
import { exportCopy, getExportBrand, normalizeExportLanguage } from '@/lib/export-language-core.mjs';
import { withHistoricalAuditModelName } from '@/lib/audit-model-display';
import { sameOriginResponse } from '@/lib/request-security';

const FORMATS = {
  PDF: { extension: 'pdf', mime: 'application/pdf', version: '10', cost: CREDIT_COSTS.PDF_EXPORT },
  WORD: { extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', version: '6', cost: CREDIT_COSTS.WORD_EXPORT },
  MARKDOWN: { extension: 'md', mime: 'text/markdown; charset=utf-8', version: '5', cost: CREDIT_COSTS.MARKDOWN_EXPORT },
} as const;
type ExportFormat = keyof typeof FORMATS;
type Context = { params: Promise<{ id: string }> };
type ArtifactScope = { userId: string; reportId: string; reportVersion: number; exportFormat: ExportFormat };

export const maxDuration = 60;

function exportFormat(value: unknown): ExportFormat | null {
  const format = String(value || 'MARKDOWN').toUpperCase();
  return Object.hasOwn(FORMATS, format) ? format as ExportFormat : null;
}

function sha256(content: string | Uint8Array) {
  return createHash('sha256').update(content).digest('hex');
}

function filePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 48) || 'report';
}

function filenameFor(audit: ExportAudit, format: ExportFormat, includeOriginal: boolean) {
  const language = normalizeExportLanguage(audit.reportLanguage);
  const brand = getExportBrand(language);
  const prefix = `${filePart(brand.name)}_${filePart(exportCopy(language, '新闻叙事审视报告', 'News Narrative Review Report'))}`;
  return `${prefix}_${filePart(audit.title)}_${audit.createdAt.toISOString().slice(0, 10)}${includeOriginal ? '_original' : ''}.${FORMATS[format].extension}`;
}

async function getAuthorizedAudit(request: Request, id: string) {
  const user = await getCurrentUser(request);
  if (!user) return { error: NextResponse.json({ error: '请登录后导出报告。' }, { status: 401 }) } as const;
  const audit = await prisma.audit.findUnique({
    where: { id },
    select: {
      id: true, userId: true, reportVersion: true, title: true, source: true, publishedAt: true,
      newsSummary: true, auditResultJson: true, originalContent: true, completionMarkdown: true, modelName: true,
      modelDisplayNameSnapshot: true, reasoningDepth: true, reportLanguage: true, createdAt: true,
    },
  });
  if (!audit) return { error: NextResponse.json({ error: '报告不存在。' }, { status: 404 }) } as const;
  if (audit.userId !== user.id && !await getSuperAdminStatus(user.id)) {
    return { error: NextResponse.json({ error: '只有报告创建者可以导出正式文件。' }, { status: 403 }) } as const;
  }
  return { user, audit: withHistoricalAuditModelName(audit) } as const;
}

function artifactKey(scope: ArtifactScope, includeOriginal: boolean) {
  return { userId_reportId_reportVersion_exportFormat_includeOriginal: { ...scope, includeOriginal } };
}

function downloadResponse(scope: ArtifactScope, includeOriginal: boolean, artifact: { content: string | null; downloadFilename: string }, charged: boolean) {
  const filename = artifact.downloadFilename;
  if (scope.exportFormat === 'MARKDOWN') return NextResponse.json({ content: artifact.content, filename, charged });
  const query = new URLSearchParams({ format: scope.exportFormat });
  if (includeOriginal) query.set('original', '1');
  return NextResponse.json({ filename, charged, downloadUrl: `/api/audits/${encodeURIComponent(scope.reportId)}/export?${query}` });
}

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  const found = await getAuthorizedAudit(request, id);
  if ('error' in found) return found.error;
  const query = new URL(request.url).searchParams;
  const format = exportFormat(query.get('format') || 'PDF');
  if (!format) return NextResponse.json({ error: '不支持的导出格式。' }, { status: 400 });
  const scope = { userId: found.user.id, reportId: id, reportVersion: found.audit.reportVersion, exportFormat: format };
  const artifact = await prisma.exportArtifact.findUnique({ where: artifactKey(scope, query.get('original') === '1') });
  if (!artifact?.content || artifact.status !== 'READY' || artifact.templateVersion !== FORMATS[format].version) {
    return NextResponse.json({ error: '该版本尚未生成此导出文件。' }, { status: 404 });
  }
  const content = format === 'MARKDOWN' ? artifact.content : new Uint8Array(Buffer.from(artifact.content, 'base64'));
  return new NextResponse(content, {
    headers: {
      'Content-Type': FORMATS[format].mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(artifact.downloadFilename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(request: Request, { params }: Context) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const { id } = await params;
  const found = await getAuthorizedAudit(request, id);
  if ('error' in found) return found.error;
  const input = await request.json().catch(() => null);
  const format = exportFormat(input?.format);
  if (!format) return NextResponse.json({ error: '不支持的导出格式。' }, { status: 400 });

  const includeOriginal = input?.includeOriginal === true;
  const { audit, user } = found;
  const { cost, version } = FORMATS[format];
  const scope = { userId: user.id, reportId: id, reportVersion: audit.reportVersion, exportFormat: format };
  const where = artifactKey(scope, includeOriginal);
  const ready = { ...scope, status: 'READY', content: { not: null } };
  try {
    const [followups, existing, paid] = await Promise.all([
      prisma.reportFollowup.findMany({
        where: { userId: user.id, reportId: id, reportVersion: audit.reportVersion },
        select: { question: true, answer: true, sources: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.exportArtifact.findUnique({ where }),
      prisma.exportArtifact.findFirst({ where: ready, select: { id: true } }),
    ]);
    const report = buildReportExport(audit, { includeOriginal, followups });
    const snapshotHash = sha256(JSON.stringify(report));
    if (existing?.status === 'READY' && existing.content && existing.templateVersion === version && existing.snapshotHash === snapshotHash) {
      return downloadResponse(scope, includeOriginal, existing, false);
    }

    try {
      await assertServiceCreditsAvailable({ userId: user.id, cents: paid ? 0 : cost });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : '当前点数不足。' }, { status: 402 });
    }

    const generated = format === 'PDF'
      ? await (await import('@/lib/pdf-renderer')).renderPdfExport(report)
      : format === 'WORD'
        ? await (await import('@/lib/docx-renderer')).renderWordExport(report)
        : Buffer.from(renderMarkdownExport(report), 'utf8');
    const hash = sha256(generated);
    const data = {
      content: generated.toString(format === 'MARKDOWN' ? 'utf8' : 'base64'),
      contentHash: hash, fileHash: hash, fileSizeBytes: generated.byteLength, snapshotHash,
      downloadFilename: filenameFor(audit, format, includeOriginal), status: 'READY',
      language: audit.reportLanguage, templateVersion: version, errorCode: null, errorMessageSanitized: null,
    };

    // Appendix choices share one purchase. Serialize artifact writes for this
    // purchase so concurrent first downloads cannot charge twice or replace a
    // concurrently completed export of newer content.
    const chargeKey = `export:${user.id}:${id}:${audit.reportVersion}:${format}`;
    const saved = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chargeKey}))`;
      const current = await tx.exportArtifact.findUnique({ where, select: { updatedAt: true, snapshotHash: true, templateVersion: true, status: true, downloadFilename: true, content: true } });
      if (current?.status === 'READY' && current.content && current.snapshotHash === snapshotHash && current.templateVersion === version) {
        return { artifact: current, charged: false };
      }
      if (current?.updatedAt.getTime() !== existing?.updatedAt.getTime()
        || current?.snapshotHash !== existing?.snapshotHash
        || current?.templateVersion !== existing?.templateVersion) return null;

      const receipt = await tx.exportArtifact.findFirst({ where: ready, select: { pointTransactionId: true } });
      const prior = receipt ? null : await tx.pointTransaction.findFirst({
        where: { userId: user.id, idempotencyKey: chargeKey },
        select: { id: true },
      });
      const charge = receipt || prior ? null : await changeBalance(tx, user.id, -cost, {
        transactionType: `${format}_EXPORT`, description: `首次导出 ${format === 'WORD' ? 'Word' : format === 'MARKDOWN' ? 'Markdown' : 'PDF'} 消耗 1 点`,
        auditId: id, relatedReportVersion: audit.reportVersion, idempotencyKey: chargeKey,
      });
      const pointTransactionId = charge?.transaction.id ?? receipt?.pointTransactionId ?? prior?.id;
      const artifact = await tx.exportArtifact.upsert({
        where,
        update: { ...data, pointTransactionId },
        create: { ...scope, includeOriginal, ...data, pointTransactionId },
      });
      return { artifact, charged: Boolean(charge && !charge.repeated) };
    }, { maxWait: 5_000, timeout: 30_000 });
    if (!saved) return NextResponse.json({ error: '导出内容已更新，请重试。' }, { status: 409 });
    return downloadResponse(scope, includeOriginal, saved.artifact, saved.charged);
  } catch (error) {
    console.error('Report export failed', { auditId: id, format, error: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: '报告导出失败，请稍后重试。' }, { status: 500 });
  }
}
