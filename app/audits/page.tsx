import Link from 'next/link';
import Header from '@/components/Header';
import { prisma } from '@/lib/prisma';
import { getThinkingDepthLabel } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PublicAuditsPage() {
  const audits = await prisma.audit.findMany({
    where: { isPublic: true },
    orderBy: [
      { heatScore: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 60,
    select: {
      id: true,
      title: true,
      source: true,
      newsSummary: true,
      modelName: true,
      reasoningDepth: true,
      credibilityScore: true,
      speculationRiskScore: true,
      viewCount: true,
      createdAt: true,
    },
  });

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950 dark:bg-gray-980 dark:text-white">
      <Header />
      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-black sm:text-2xl">公开审视报告</h1>
            <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              按点击热度排序；这里只展示用户公开分享的报告。
            </p>
          </div>
          <Link href="/" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-white dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900">
            返回首页
          </Link>
        </div>

        {audits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm font-semibold text-gray-400 dark:border-gray-800 dark:bg-gray-950">
            暂无公开审视报告。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {audits.map((audit) => (
              <article key={audit.id} className="rounded-xl border border-gray-150 bg-white p-4 shadow-sm transition hover:border-gray-300 dark:border-gray-850 dark:bg-gray-950 dark:hover:border-gray-700">
                <div className="flex flex-wrap items-center gap-1.5 text-xxs font-bold text-gray-400">
                  <span>{audit.source || '未知来源'}</span>
                  <span>·</span>
                  <span>{new Date(audit.createdAt).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>{audit.viewCount} 次点击</span>
                </div>
                <h2 className="mt-2 line-clamp-2 text-base font-black leading-snug text-gray-950 dark:text-white">
                  {audit.title}
                </h2>
                <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {audit.newsSummary}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xxs font-bold">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{audit.modelName}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-850 dark:text-gray-300">{getThinkingDepthLabel(audit.reasoningDepth)}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-900 dark:text-slate-300">可信度 {audit.credibilityScore}</span>
                  <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950/30 dark:text-red-300">不确定性 {audit.speculationRiskScore}</span>
                </div>
                <Link href={`/audits/${audit.id}`} className="mt-4 inline-flex rounded-lg bg-gray-950 px-3 py-2 text-xs font-bold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
                  查看详情
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
