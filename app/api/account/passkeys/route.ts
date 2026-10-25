import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { accessError, guardAccountRequest, readAccessJson, requireAccount, requireRecentAuth, reserveAccessAttempt, AccessError } from '@/lib/access';

export async function GET(request: Request) {
  try {
    const user = await requireAccount(request);
    const keys = await prisma.passkey.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, createdAt: true, lastUsedAt: true } });
    return NextResponse.json({ keys }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accessError(error); }
}
export async function DELETE(request: Request) {
  try {
    guardAccountRequest(request);
    const user = await requireAccount(request);
    await reserveAccessAttempt('passkey-remove', user.id, 10);
    const input = z.object({ id: z.string().max(100), password: z.string().max(1024).optional(), emailCode: z.string().max(6).optional() }).parse(await readAccessJson(request));
    await requireRecentAuth(user, input);
    const deleted = await prisma.passkey.deleteMany({ where: { id: input.id, userId: user.id } });
    if (!deleted.count) throw new AccessError('通行密钥不存在。', 404);
    return NextResponse.json({ ok: true });
  } catch (error) { return accessError(error); }
}
