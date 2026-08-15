import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    assertSecureAccountTransport(request);
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录后再退出所有设备。' }, { status: 401 });
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { sessionVersion: { increment: 1 } },
      }),
      prisma.extensionSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return NextResponse.json({ ok: true, message: '所有设备已退出，请重新登录。' });
  } catch {
    return NextResponse.json({ error: '退出所有设备失败，请稍后重试。' }, { status: 500 });
  }
}
