import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cacheGet, cacheSet, CACHE_KEYS, CACHE_TTL } from '@/lib/cache';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';

export async function GET(request: Request) {
  try {
    await ensureRuntimeSchema();
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 60) : 20;

    const cacheKey = CACHE_KEYS.hotAudits(limit);
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const hotAudits = await prisma.audit.findMany({
      where: {
        isPublic: true,
      },
      orderBy: [
        { heatScore: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
      select: {
        id: true,
        title: true,
        source: true,
        publishedAt: true,
        newsSummary: true,
        modelName: true,
        reasoningDepth: true,
        reportLanguage: true,
        analysisMode: true,
        credibilityScore: true,
        speculationRiskScore: true,
        viewCount: true,
        createdAt: true,
      },
    });

    await cacheSet(cacheKey, hotAudits, CACHE_TTL.hotAudits);
    return NextResponse.json(hotAudits);
  } catch (error: any) {
    console.error('GET hot audits error:', error);
    return NextResponse.json({ error: '获取热门审视记录失败' }, { status: 500 });
  }
}
