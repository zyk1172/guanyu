import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import { buildGuanyuCardFallback } from '@/lib/guanyu-card-core.mjs';
import { sameOriginResponse } from '@/lib/request-security';


export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = sameOriginResponse(request);
    if (originError) return originError;
    await ensureRuntimeSchema();
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: '请登录后生成观隅卡。' }, { status: 401 });

    const { id } = await params;
    const audit = await prisma.audit.findUnique({
      where: { id },
      select: { id: true, userId: true, title: true, source: true, newsSummary: true, auditResultJson: true, reportLanguage: true },
    });
    if (!audit) return NextResponse.json({ error: '审视记录不存在。' }, { status: 404 });
    const isSuperAdmin = await getSuperAdminStatus(user.id);
    if (audit.userId !== user.id && !isSuperAdmin) {
      return NextResponse.json({ error: '你没有权限生成这条报告的观隅卡。' }, { status: 403 });
    }

    let report: Record<string, unknown> = { newsSummary: audit.newsSummary };
    try {
      const parsedReport = JSON.parse(audit.auditResultJson);
      if (parsedReport && typeof parsedReport === 'object' && !Array.isArray(parsedReport)) report = parsedReport as Record<string, unknown>;
    } catch {
      // Older or damaged report JSON must not prevent the owner from sharing a card.
    }
    const card = buildGuanyuCardFallback({ report, reportLanguage: audit.reportLanguage });
    return NextResponse.json({ card, source: 'report' });
  } catch (error) {
    console.error('Generate Guanyu Card failed:', error);
    return NextResponse.json({ error: '观隅卡暂时无法生成，请稍后再试。' }, { status: 500 });
  }
}
