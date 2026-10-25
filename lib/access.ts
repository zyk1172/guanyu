import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { privacyHmacHash } from '@/lib/privacy-hash';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';
import { getCurrentUser, type CurrentUser } from '@/lib/auth';
import { verifyStepUp } from '@/lib/step-up';
import { z } from 'zod';

export class AccessError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const emailSchema = z.string().trim().toLowerCase().max(254).email();
export function guardAccountRequest(request: Request) {
  try { assertSameOrigin(request); assertSecureAccountTransport(request); }
  catch (error) { throw new AccessError((error as Error).message, 403); }
}
export async function requireAccount(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) throw new AccessError('请先登录。', 401);
  return user;
}
export async function readAccessJson(request: Request) {
  const text = await request.text();
  if (text.length > 32_768) throw new AccessError('请求内容过大。', 413);
  try { return JSON.parse(text); } catch { throw new AccessError('请求格式不正确。'); }
}
export async function requireRecentAuth(user: CurrentUser, input: { password?: string; emailCode?: string }) {
  if (user.authTime && user.authTime <= Date.now() && Date.now() - user.authTime < 5 * 60_000) return;
  if (await verifyStepUp(user.id, input)) return;
  throw new AccessError('请填写当前密码或当前邮箱验证码，确认是你本人操作。', 403);
}
export async function reserveAccessAttempt(scope: string, key: string, limit = 20, windowMs = 10 * 60_000) {
  const bucket = `access:${scope}:${privacyHmacHash(key)}`;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bucket}))`;
    const count = await tx.verificationCode.count({ where: { email: bucket, purpose: 'access_attempt', createdAt: { gte: new Date(Date.now() - windowMs) } } });
    if (count >= limit) throw new AccessError('操作过于频繁，请稍后再试。', 429);
    await tx.verificationCode.create({ data: { email: bucket, purpose: 'access_attempt', codeHash: '', expiresAt: new Date(Date.now() + windowMs) } });
  });
}
export function accessError(error: unknown) {
  if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: '请检查填写内容的格式和长度。' }, { status: 400 });
  console.error('[account-access]', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json({ error: '操作失败，请稍后重试。' }, { status: 500 });
}
