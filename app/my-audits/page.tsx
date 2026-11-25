import { redirect } from 'next/navigation';

export default async function LegacyMyAuditsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const incoming = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['search', 'jobId']) {
    const value = incoming[key];
    if (typeof value === 'string') query.set(key, value);
  }
  redirect(`/account/audits${query.size ? `?${query}` : ''}`);
}
