import { NextResponse } from 'next/server';
import { centsToDisplayPoints, effectiveCreditCents } from '@/lib/billing';
import { authenticateExtensionRequest } from '@/lib/extension-auth';

export async function GET(request: Request) {
  const session = await authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      email: session.user.email,
      name: session.user.name,
    },
    quota: {
      creditBalance: centsToDisplayPoints(effectiveCreditCents(session.user)),
      planType: session.user.planType,
    },
  });
}
