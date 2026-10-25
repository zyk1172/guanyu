import { NextResponse } from 'next/server';
import { generateAuthenticationOptions, generateRegistrationOptions } from '@simplewebauthn/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { accessError, guardAccountRequest, readAccessJson, requireAccount, requireRecentAuth, reserveAccessAttempt, AccessError } from '@/lib/access';
import { issuePasskeyChallenge, passkeyRelyingParty } from '@/lib/passkeys';
import { requireClientIp } from '@/lib/rate-limit';

const schema = z.object({ mode: z.enum(['register', 'login']), password: z.string().max(1024).optional(), emailCode: z.string().max(6).optional() });
export async function POST(request: Request) {
  try {
    guardAccountRequest(request);
    const input = schema.parse(await readAccessJson(request));
    await reserveAccessAttempt('passkey-options', requireClientIp(request), 30);
    const { rpID } = passkeyRelyingParty();
    if (input.mode === 'login') {
      const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
      const response = NextResponse.json(options);
      await issuePasskeyChallenge(response, options.challenge, 'login');
      return response;
    }
    const user = await requireAccount(request);
    await reserveAccessAttempt('passkey-enroll', user.id, 10);
    await requireRecentAuth(user, input);
    const [account, credentials] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, name: true } }),
      prisma.passkey.findMany({ where: { userId: user.id } }),
    ]);
    if (credentials.length >= 10) throw new AccessError('最多可添加 10 个通行密钥，请先移除不再使用的密钥。');
    const options = await generateRegistrationOptions({
      rpName: '观隅 Guanyu', rpID, userName: account.email, userDisplayName: account.name || account.email,
      userID: new TextEncoder().encode(user.id), attestationType: 'none',
      excludeCredentials: credentials.map(key => ({ id: key.credentialId, transports: key.transports })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    const response = NextResponse.json(options);
    await issuePasskeyChallenge(response, options.challenge, 'register', user);
    return response;
  } catch (error) { return accessError(error); }
}
