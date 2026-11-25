import { NextResponse } from 'next/server';
import { accessError, guardAccountRequest, readAccessJson } from '@/lib/access';
import { applyAuditBatch, batchSchema, requireAuditManagement } from '@/lib/audit-management';

export async function POST(request: Request) {
  try {
    guardAccountRequest(request);
    const input = batchSchema.parse(await readAccessJson(request));
    const user = await requireAuditManagement(request, input.scope);
    return NextResponse.json(await applyAuditBatch(user.id, input));
  } catch (error) {
    return accessError(error);
  }
}
