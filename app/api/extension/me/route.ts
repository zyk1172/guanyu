import { NextResponse } from 'next/server';
import { DAILY_FREE_REPORT_LIMIT, centsToDisplayPoints, effectiveCreditCents } from '@/lib/billing';
import { authenticateExtensionRequest } from '@/lib/extension-auth';

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(request: Request) {
  const session = await authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  const today = todayInShanghai();
  const used = session.user.freeQuotaDate === today ? session.user.freeQuotaUsed : 0;
  return NextResponse.json({
    authenticated: true,
    user: {
      email: session.user.email,
      name: session.user.name,
    },
    quota: {
      remainingToday: Math.max(DAILY_FREE_REPORT_LIMIT - used, 0),
      creditBalance: centsToDisplayPoints(effectiveCreditCents(session.user)),
      planType: session.user.planType,
    },
  });
}
