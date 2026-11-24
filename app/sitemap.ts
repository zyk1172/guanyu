import { prisma } from '@/lib/prisma';
import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.guanyu.dynv6.net';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const audits = await prisma.audit.findMany({
    where: { isPublic: true, indexable: true },
    select: { id: true, updatedAt: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 10_000,
  });
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...audits.map(audit => ({ url: new URL(`/audits/${encodeURIComponent(audit.id)}`, siteUrl).href, lastModified: audit.updatedAt })),
  ];
}
