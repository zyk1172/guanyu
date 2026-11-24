import { NextResponse } from 'next/server';
import { accessError, AccessError } from '@/lib/access';
import { listManagedAudits } from '@/lib/audit-management';

export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get('scope') || 'own';
    if (scope !== 'own' && scope !== 'site') throw new AccessError('报告范围无效。');
    return NextResponse.json(await listManagedAudits(request, scope), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return accessError(error);
  }
}
