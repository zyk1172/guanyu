import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import { clearLoginAttempts, reserveLoginAttempt } from '@/lib/rate-limit';

export interface CurrentUser {
  id: string;
  email?: string | null;
}

const PASSWORD_PREFIX = 'scrypt';
const LEGACY_SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function isLegacyPasswordLoginEnabled() {
  return process.env.ALLOW_LEGACY_PASSWORD_LOGIN === 'true';
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const digest = scryptSync(password, salt, 64).toString('base64url');
  return `${PASSWORD_PREFIX}$${salt}$${digest}`;
}

export function verifyPassword(password: string, storedValue: string) {
  if (storedValue.startsWith(`${PASSWORD_PREFIX}$`)) {
    const [, salt, encodedDigest] = storedValue.split('$');
    if (!salt || !encodedDigest) return { valid: false, needsUpgrade: false };
    const expected = Buffer.from(encodedDigest, 'base64url');
    const actual = scryptSync(password, salt, 64);
    return {
      valid: expected.length === actual.length && timingSafeEqual(expected, actual),
      needsUpgrade: false,
    };
  }

  // A legacy verifier is opt-in only during a controlled password-reset or
  // migration window. New rows are always scrypt, and production defaults to
  // rejecting the fast unsalted format.
  if (!LEGACY_SHA256_PATTERN.test(storedValue) || !isLegacyPasswordLoginEnabled()) {
    return { valid: false, needsUpgrade: false };
  }
  const expected = Buffer.from(storedValue, 'hex');
  const actual = Buffer.from(createHash('sha256').update(password).digest('hex'), 'hex');
  return {
    valid: expected.length === actual.length && timingSafeEqual(expected, actual),
    needsUpgrade: true,
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: '邮箱', type: 'email', placeholder: 'your@email.com' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('请输入邮箱和密码');
        }

        const email = credentials.email.toLowerCase();
        try {
          await reserveLoginAttempt(email);
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : '登录尝试过于频繁，请稍后再试。');
        }
        const user = await prisma.user.findUnique({
          where: { email },
        });

        const invalidCredentials = '邮箱或密码不正确，或账号暂不可用。';
        if (!user || user.isBanned) throw new Error(invalidCredentials);

        const password = verifyPassword(credentials.password, user.password);
        if (!password.valid) {
          throw new Error(invalidCredentials);
        }

        if (password.needsUpgrade) {
          await prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(credentials.password) } });
        }

        await clearLoginAttempts(email);

        return { id: user.id, email: user.email };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = String(token.id);
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export async function getCurrentUser(request: Request): Promise<CurrentUser | null> {
  const internalUserId = request.headers.get('x-guanyu-internal-user-id');
  const internalSecret = request.headers.get('x-guanyu-internal-auth');
  const expectedInternalSecret = process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET;

  if (internalUserId && internalSecret && expectedInternalSecret && internalSecret === expectedInternalSecret) {
    const account = await prisma.user.findUnique({
      where: { id: internalUserId },
      select: { id: true, email: true, isBanned: true },
    });
    if (!account || account.isBanned) return null;
    return { id: account.id, email: account.email };
  }

  const token = await getToken({
    req: request as NextRequest,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token?.id) {
    return null;
  }

  const account = await prisma.user.findUnique({
    where: { id: String(token.id) },
    select: { id: true, email: true, isBanned: true },
  });
  if (!account || account.isBanned) return null;

  return {
    id: account.id,
    email: account.email,
  };
}
