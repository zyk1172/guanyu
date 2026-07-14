import { NextResponse } from 'next/server';
import { getSuperAdminStatus } from '@/lib/admin';
import { getCurrentUser } from '@/lib/auth';
import { cacheDel, cacheDelByPrefix, CACHE_KEYS } from '@/lib/cache';
import { applyManualVerification } from '@/lib/manual-verification-core.mjs';
import { prisma } from '@/lib/prisma';

const validOutcome = new Set(['verified', 'unverified']);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: '请登录后更新核验结果。' }, { status: 401 });

    const body = await request.json();
    const index = Number(body?.index);
    const outcome = String(body?.outcome || '');
    if (!Number.isInteger(index) || !validOutcome.has(outcome)) {
      return NextResponse.json({ error: '核验结果参数无效。' }, { status: 400 });
    }

    const isSuperAdmin = await getSuperAdminStatus(user.id);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-audit-verification:${id}`}))`;
      const audit = await tx.audit.findUnique({ where: { id } });
      if (!audit) throw new Error('NOT_FOUND');
      if (audit.userId !== user.id && !isSuperAdmin) throw new Error('FORBIDDEN');

      let report: unknown;
      try {
        report = JSON.parse(audit.auditResultJson);
      } catch {
        throw new Error('INVALID_REPORT');
      }
      const applied = applyManualVerification(report, { index, outcome } as any);
      return tx.audit.update({
        where: { id },
        data: {
          auditResultJson: JSON.stringify(applied.report),
          credibilityScore: applied.scores.credibility,
          informationCompletenessScore: applied.scores.informationCompleteness,
          narrativeBiasScore: applied.scores.narrativeBias,
          evidenceStrengthScore: applied.scores.evidenceStrength,
          speculationRiskScore: applied.scores.speculationRisk,
          readingValue: applied.readingValue,
        },
        select: {
          auditResultJson: true,
          credibilityScore: true,
          informationCompletenessScore: true,
          narrativeBiasScore: true,
          evidenceStrengthScore: true,
          speculationRiskScore: true,
          readingValue: true,
          updatedAt: true,
        },
      });
    });

    await Promise.all([cacheDel(CACHE_KEYS.audit(id)), cacheDelByPrefix(CACHE_KEYS.hotAuditsPrefix)]);
    return NextResponse.json({
      result: JSON.parse(updated.auditResultJson),
      scores: {
        credibility: updated.credibilityScore,
        informationCompleteness: updated.informationCompletenessScore,
        narrativeBias: updated.narrativeBiasScore,
        evidenceStrength: updated.evidenceStrengthScore,
        speculationRisk: updated.speculationRiskScore,
      },
      readingValue: updated.readingValue,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') return NextResponse.json({ error: '审视记录不存在。' }, { status: 404 });
      if (error.message === 'FORBIDDEN') return NextResponse.json({ error: '你没有权限更新这条审视记录。' }, { status: 403 });
      if (error.message === 'INVALID_REPORT') return NextResponse.json({ error: '审视报告数据异常，无法更新核验结果。' }, { status: 500 });
      if (error.message === '验证路线图项目不存在。' || error.message === '核验结论无效。') {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Update manual verification failed:', error);
    return NextResponse.json({ error: '更新核验结果失败，请稍后再试。' }, { status: 500 });
  }
}
