import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { accessError, guardAccountRequest, readAccessJson, requireAccount, reserveAccessAttempt, AccessError } from '@/lib/access';
import { clearPasskeyChallenge, consumePasskeyChallenge, passkeyRelyingParty } from '@/lib/passkeys';
import { requireClientIp } from '@/lib/rate-limit';
import { setSessionCookie } from '@/lib/session-cookie';

const schema = z.object({ mode: z.enum(['register', 'login']), response: z.object({ id: z.string().max(2048) }).passthrough(), name: z.string().trim().min(1).max(60).default('我的通行密钥') });
export async function POST(request: NextRequest) {
  try {
    guardAccountRequest(request);
    const input = schema.parse(await readAccessJson(request));
    await reserveAccessAttempt('passkey-verify', requireClientIp(request), 30);
    const challenge = await consumePasskeyChallenge(request, input.mode);
    const { origin, rpID } = passkeyRelyingParty();
    if (input.mode === 'register') {
      const user = await requireAccount(request);
      if (challenge.userId !== user.id || challenge.sessionVersion !== user.sessionVersion) throw new AccessError('会话已变更，请重新添加通行密钥。', 401);
      const verified = await verifyRegistrationResponse({ response: input.response as unknown as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true }).catch(() => null);
      if (!verified?.verified) throw new AccessError('通行密钥验证失败，请重新操作。', 401);
      const { credential } = verified.registrationInfo;
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
        const account = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        if (account.isBanned || account.sessionVersion !== user.sessionVersion) throw new AccessError('会话已过期。', 401);
        if (await tx.passkey.count({ where: { userId: user.id } }) >= 10) throw new AccessError('通行密钥数量已达上限。');
        await tx.passkey.create({ data: { userId: user.id, credentialId: credential.id, publicKey: credential.publicKey, counter: BigInt(credential.counter), transports: credential.transports || [], name: input.name } });
      });
      const response = NextResponse.json({ ok: true });
      clearPasskeyChallenge(response, 'register');
      return response;
    }
    const key = await prisma.passkey.findUnique({ where: { credentialId: input.response.id }, include: { user: true } });
    if (!key || key.user.isBanned) throw new AccessError('通行密钥不可用，请使用邮箱登录。', 401);
    const assertion = input.response as unknown as AuthenticationResponseJSON;
    if (!assertion.response?.userHandle || assertion.response.userHandle !== Buffer.from(key.userId).toString('base64url')) throw new AccessError('通行密钥验证失败。', 401);
    const verified = await verifyAuthenticationResponse({ response: assertion, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.credentialId, publicKey: key.publicKey, counter: Number(key.counter), transports: key.transports },
    }).catch(() => null);
    if (!verified?.verified) throw new AccessError('通行密钥验证失败，请重试或使用邮箱登录。', 401);
    const updated = await prisma.passkey.updateMany({ where: { id: key.id, counter: key.counter, user: { isBanned: false, sessionVersion: key.user.sessionVersion } }, data: { counter: BigInt(verified.authenticationInfo.newCounter), lastUsedAt: new Date() } });
    if (updated.count !== 1) throw new AccessError('通行密钥或会话已变更，请重新登录。', 401);
    const response = NextResponse.json({ ok: true, url: '/' });
    clearPasskeyChallenge(response, 'login');
    await setSessionCookie(response, key.user);
    return response;
  } catch (error) { return accessError(error); }
}
