import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { sameOriginResponse } from '@/lib/request-security';
import { privacyHmacHash } from '@/lib/privacy-hash';
import { isTrafficBot, trafficPath } from '@/lib/traffic-core';

const schema = z.object({ eventId: z.uuid(), path: z.string().max(1024) });
export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1' || isTrafficBot(request.headers.get('user-agent') || '')) return response;
  try {
    const text = await request.text();
    if (text.length > 2048) return new NextResponse(null, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) return new NextResponse(null, { status: 400 });
    const path = trafficPath(parsed.data.path);
    if (!path) return response;
    const secure = process.env.NEXTAUTH_URL?.startsWith('https:') || false;
    const cookieName = `${secure ? '__Host-' : ''}guanyu-visitor`;
    let visitor = request.cookies.get(cookieName)?.value;
    if (!visitor || !/^[a-f0-9]{64}$/.test(visitor)) visitor = crypto.randomBytes(32).toString('hex');
    const visitorHash = privacyHmacHash(`visitor:${visitor}`);
    const user = await getCurrentUser(request);
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`traffic:${visitorHash}`}))`;
      const recent = await tx.pageView.count({ where: { visitorHash, createdAt: { gte: new Date(Date.now() - 60_000) } } });
      if (recent >= 30) return;
      await tx.pageView.createMany({ data: [{ id: parsed.data.eventId, path, visitorHash, isLoggedIn: Boolean(user) }], skipDuplicates: true });
    });
    response.cookies.set(cookieName, visitor, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 90 * 86400 });
    return response;
  } catch {
    // Analytics must never prevent visitors from using the product.
    return new NextResponse(null, { status: 503 });
  }
}
