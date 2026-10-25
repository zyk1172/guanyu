import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSuperAdminStatus } from '@/lib/admin';
import { accessError, AccessError, requireAccount } from '@/lib/access';
import { shanghaiDate, trafficWindow } from '@/lib/traffic-core';

type Counts = { pv: bigint; uv: bigint; guestPv: bigint; memberPv: bigint };
const numbers = (row: Counts) => ({ pv: Number(row.pv), uv: Number(row.uv), guestPv: Number(row.guestPv), memberPv: Number(row.memberPv) });
export async function GET(request: Request) {
  try {
    const user = await requireAccount(request);
    if (!await getSuperAdminStatus(user.id)) throw new AccessError('仅超级管理员可查看访问统计。', 403);
    const days = new URL(request.url).searchParams.get('days') === '7' ? 7 : 30;
    const { today, start } = trafficWindow(days);
    const [summary, daily, pages, first] = await Promise.all([
      prisma.$queryRaw<Counts[]>`SELECT COUNT(*) AS pv, COUNT(DISTINCT "visitorHash") AS uv,
        COUNT(*) FILTER (WHERE NOT "isLoggedIn") AS "guestPv", COUNT(*) FILTER (WHERE "isLoggedIn") AS "memberPv"
        FROM "PageView" WHERE "createdAt" >= ${start}`,
      prisma.$queryRaw<Array<Counts & { date: string }>>`SELECT TO_CHAR("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS date,
        COUNT(*) AS pv, COUNT(DISTINCT "visitorHash") AS uv,
        COUNT(*) FILTER (WHERE NOT "isLoggedIn") AS "guestPv", COUNT(*) FILTER (WHERE "isLoggedIn") AS "memberPv"
        FROM "PageView" WHERE "createdAt" >= ${start} GROUP BY date ORDER BY date`,
      prisma.$queryRaw<Array<{ path: string; pv: bigint; uv: bigint }>>`SELECT path, COUNT(*) AS pv, COUNT(DISTINCT "visitorHash") AS uv FROM "PageView"
        WHERE "createdAt" >= ${start} GROUP BY path ORDER BY pv DESC, path LIMIT 10`,
      prisma.pageView.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    const trend = Array.from({ length: days }, (_, i) => {
      const date = shanghaiDate(new Date(start.getTime() + i * 86400_000));
      const row = daily.find(item => item.date === date);
      return { date, ...(row ? numbers(row) : { pv: 0, uv: 0, guestPv: 0, memberPv: 0 }) };
    });
    return NextResponse.json({ days, timezone: 'Asia/Shanghai', today: trend.find(row => row.date === today), summary: numbers(summary[0]), trend, pages: pages.map(row => ({ path: row.path, pv: Number(row.pv), uv: Number(row.uv) })), firstRecordedAt: first?.createdAt || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accessError(error); }
}
