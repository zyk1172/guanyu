import { NextResponse } from 'next/server';
import { accessError } from '@/lib/access';
import { listManagedAudits } from '@/lib/audit-management';

export async function GET(request: Request) {
  try {
    const result = await listManagedAudits(request, 'own');
    return NextResponse.json(result.items);
  } catch (error) {
    return accessError(error);
  }
}
