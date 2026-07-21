import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { withHistoricalAuditModelName } from '@/lib/audit-model-display';

export async function GET(request: Request) {
  try {
    await ensureRuntimeSchema();
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '未授权，请先登录' }, { status: 401 });
    }

    const userId = user.id;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const mode = searchParams.get('mode') || '';
    const depth = searchParams.get('depth') || '';
    const isPublicParam = searchParams.get('isPublic');

    const whereClause: any = {
      userId,
    };

    if (search) {
      whereClause.title = { contains: search };
    }

    if (mode) {
      whereClause.analysisMode = mode;
    }

    if (depth) {
      whereClause.reasoningDepth = depth;
    }

    if (isPublicParam !== null && isPublicParam !== undefined && isPublicParam !== '') {
      whereClause.isPublic = isPublicParam === 'true';
    }

    // 列表页不需要 originalContent / auditResultJson 两个大字段，避免返回超大响应
    const myAudits = await prisma.audit.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        title: true,
        source: true,
        publishedAt: true,
        publishedAtSource: true,
        publishedAtConfidence: true,
        reportType: true,
        readingValue: true,
        focus: true,
        analysisMode: true,
        reasoningDepth: true,
        reportLanguage: true,
        modelName: true,
        modelDisplayNameSnapshot: true,
        newsSummary: true,
        credibilityScore: true,
        informationCompletenessScore: true,
        narrativeBiasScore: true,
        evidenceStrengthScore: true,
        speculationRiskScore: true,
        isPublic: true,
        viewCount: true,
        heatScore: true,
        createdAt: true,
      },
    });

    return NextResponse.json(myAudits.map(withHistoricalAuditModelName));
  } catch (error: any) {
    console.error('GET my audits error:', error);
    return NextResponse.json({ error: '获取我的审视记录失败' }, { status: 500 });
  }
}
