import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { isSuperAdminIdentity } from './admin-core.mjs';

export interface CurrentUser {
  id: string;
  email?: string | null;
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
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
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          const newUser = await prisma.user.create({
            data: {
              email,
              password: hashPassword(credentials.password),
              role: isSuperAdminIdentity({ email }, {
                SUPER_ADMIN_EMAILS: process.env.SUPER_ADMIN_EMAILS,
                SUPER_ADMIN_IDS: process.env.SUPER_ADMIN_IDS,
              }) ? 'super_admin' : 'user',
              settings: {
                create: {
                  defaultModelName: process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
                  llmBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
                  defaultReasoningDepth: 'medium',
                  defaultAnalysisMode: 'deep',
                  defaultIsPublic: true,
                  defaultSaveResult: true,
                  defaultEnableCharts: true,
                },
              },
            },
          });
          return { id: newUser.id, email: newUser.email };
        }

        if (user.isBanned) {
          throw new Error('账号已被管理员暂停使用，请联系管理员。');
        }

        const hashedInput = hashPassword(credentials.password);
        if (user.password !== hashedInput) {
          throw new Error('密码错误');
        }

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
