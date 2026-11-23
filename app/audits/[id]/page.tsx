import AuditDetailsClient from '@/components/AuditDetailsClient';
import ErrorMessage from '@/components/ErrorMessage';
import Header from '@/components/Header';
import { getSuperAdminStatus } from '@/lib/admin';
import { auditDtoForAccess } from '@/lib/audit-dto';
import { withHistoricalAuditModelName } from '@/lib/audit-model-display';
import { getCurrentUser } from '@/lib/auth';
import { CACHE_KEYS, cacheDelByPrefix } from '@/lib/cache';
import { prisma } from '@/lib/prisma';
import { getClientIp, reserveAuditViewCount } from '@/lib/rate-limit';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after, NextRequest } from 'next/server';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function invalidateAuditCaches() {
  await cacheDelByPrefix(CACHE_KEYS.hotAuditsPrefix);
}

async function loadAudit(id: string) {
  const currentAudit = await prisma.audit.findUnique({ where: { id } });
  if (!currentAudit) return null;

  const incomingHeaders = await headers();
  const request = new NextRequest(new URL(`/api/audits/${encodeURIComponent(id)}`, siteUrl), { headers: incomingHeaders });
  const user = await getCurrentUser(request);
  const userId = user?.id;
  const isSuperAdmin = userId ? await getSuperAdminStatus(userId) : false;

  if (!currentAudit.isPublic && currentAudit.userId !== userId && !isSuperAdmin) {
    return { forbidden: true as const };
  }

  let shouldCountView = false;
  try {
    shouldCountView = await reserveAuditViewCount(userId ? `user:${userId}` : `ip:${getClientIp(request)}`, id);
  } catch (error) {
    console.error('Reserve audit view count failed:', id, error);
  }
  if (shouldCountView) after(async () => {
    try {
      await prisma.audit.update({ where: { id }, data: { viewCount: { increment: 1 }, heatScore: { increment: 1 } } });
      await invalidateAuditCaches();
    } catch (error) {
      console.error('Increment audit view count failed:', id, error);
    }
  });

  const canManage = currentAudit.userId === userId || isSuperAdmin;
  const dto = withHistoricalAuditModelName(auditDtoForAccess(currentAudit, canManage, isSuperAdmin));
  return {
    audit: {
      ...dto,
      viewCount: currentAudit.viewCount + (shouldCountView ? 1 : 0),
      heatScore: currentAudit.heatScore + (shouldCountView ? 1 : 0),
    },
    canManage,
    isOwner: currentAudit.userId === userId,
    isAuthor: currentAudit.userId === userId || isSuperAdmin,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const audit = await prisma.audit.findFirst({
    where: { id, isPublic: true },
    select: { title: true, newsSummary: true },
  });
  if (!audit) return { title: '审视报告' };
  return {
    title: audit.title,
    description: audit.newsSummary.slice(0, 160),
    alternates: { canonical: `/audits/${encodeURIComponent(id)}` },
  };
}

export default async function AuditDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadAudit(id);
  if (!loaded) notFound();
  if ('forbidden' in loaded) {
    return (
      <main className="min-h-screen bg-[var(--color-surface-muted)] font-sans">
        <Header />
        <div className="max-w-xl mx-auto px-3 sm:px-4 py-10">
          <ErrorMessage message="你没有权限查看这条审视记录。" />
          <div className="text-center pt-4">
            <Link href="/" className="text-xs font-bold text-[var(--color-link)] hover:underline">← 返回首页</Link>
          </div>
        </div>
      </main>
    );
  }
  return <AuditDetailsClient auditRecord={loaded.audit} canManage={loaded.canManage} isOwner={loaded.isOwner} isAuthor={loaded.isAuthor} />;
}
