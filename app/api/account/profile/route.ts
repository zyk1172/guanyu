import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { profileSchema, profileSelect } from '@/lib/profile';
import { accessError, guardAccountRequest, readAccessJson, requireAccount, reserveAccessAttempt } from '@/lib/access';

export async function GET(request: Request) {
  try {
    const user = await requireAccount(request);
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: profileSelect });
    return NextResponse.json({ profile }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accessError(error); }
}
export async function PATCH(request: Request) {
  try {
    guardAccountRequest(request);
    const user = await requireAccount(request);
    await reserveAccessAttempt('profile', user.id, 20);
    const input = profileSchema.parse(await readAccessJson(request));
    const profile = await prisma.user.update({ where: { id: user.id }, data: { name: input.name || null, gender: input.gender || null, country: input.country || null }, select: profileSelect });
    return NextResponse.json({ profile });
  } catch (error) { return accessError(error); }
}
