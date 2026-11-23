import { ButtonLink, Panel } from '@/components/ui/controls';

import Header from '@/components/Header';
import { UiText } from '@/components/LanguageProvider';
import { withHistoricalAuditModelName } from '@/lib/audit-model-display';
import { authOptions } from '@/lib/auth';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';
import { getReportLanguageLabel, getThinkingDepthLabel } from '@/lib/types';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PublicAuditsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');
  await ensureRuntimeSchema();
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
      modelDisplayNameSnapshot: true,
      reasoningDepth: true,
      reportLanguage: true,
      credibilityScore: true,
      speculationRiskScore: true,
      viewCount: true,
      createdAt: true,
    },
  });

  return (
    <main className="workspace-page pb-12">
      <Header />
      <section id="main-content" tabIndex={-1} className="workspace-container workspace-content">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="ui-page-title"><UiText id="publicAudits.title" /></h1>
            <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
              <UiText id="publicAudits.description" />
            </p>
          </div>
          <ButtonLink variant="secondary" href="/">
            <UiText id="common.backHome" />
          </ButtonLink>
        </div>

        {audits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center text-sm font-semibold text-[var(--color-text-subtle)]">
            <UiText id="publicAudits.empty" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {audits.map(withHistoricalAuditModelName).map((audit) => (
              <Panel as="article" key={audit.id} className="transition">
                <div className="flex flex-wrap items-center gap-1.5 text-xxs font-bold text-[var(--color-text-subtle)]">
                  <span>{audit.source || <UiText id="publicAudits.unknownSource" />}</span>
                  <span>·</span>
                  <span>{new Date(audit.createdAt).toLocaleDateString()}</span>
                  <span>·</span>
                  <span><UiText id="publicAudits.views" values={{ count: audit.viewCount }} /></span>
                </div>
                <h2 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-[var(--color-text)]">
                  {audit.title}
                </h2>
                <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {audit.newsSummary}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xxs font-bold">
                  <span className="ui-badge bg-[var(--color-primary-soft)] text-[var(--color-link)]">{audit.modelName}</span>
                  <span className="ui-badge bg-[var(--color-surface)] text-[var(--color-text-muted)]">{getThinkingDepthLabel(audit.reasoningDepth)}</span>
                  <span className="ui-badge bg-[var(--color-primary-soft)] text-[var(--color-link)]">{getReportLanguageLabel(audit.reportLanguage)}</span>
                  <span className="ui-badge bg-[var(--color-surface)] text-[var(--color-text)]"><UiText id="publicAudits.credibility" values={{ score: audit.credibilityScore }} /></span>
                  <span className="ui-badge bg-[var(--color-danger-soft)] text-[var(--color-danger)]"><UiText id="publicAudits.risk" values={{ score: audit.speculationRiskScore }} /></span>
                </div>
                <ButtonLink variant="primary" href={`/audits/${audit.id}`} className="mt-4">
                  <UiText id="common.viewDetails" />
                </ButtonLink>
              </Panel>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
