import { after, NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { sameOriginResponse } from '@/lib/request-security';
import { CoverageError, createRelatedCoverage, getRelatedCoverage, runRelatedCoverage } from '@/lib/related-coverage-service';

export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
  return NextResponse.json({ code: error instanceof CoverageError ? error.code : 'coverage_failed' }, { status: error instanceof CoverageError ? error.status : 503, headers });
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 'coverage_sign_in' }, { status: 401, headers });
    const { id } = await params;
    return NextResponse.json(await getRelatedCoverage(user.id, id, request.nextUrl.searchParams.get('jobId') || undefined), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  try {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 'coverage_sign_in' }, { status: 401, headers });
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ code: 'coverage_invalid_query' }, { status: 400, headers });
    const task = await createRelatedCoverage(user.id, id, body);
    if (task.state === 'claimed' && task.model) after(() => runRelatedCoverage(task.operation.id, task.operation.currentAttempt, task.model));
    return NextResponse.json({ ...task.job, cached: task.state === 'completed' }, { status: task.state === 'completed' ? 200 : 202, headers });
  } catch (error) { return failure(error); }
}
