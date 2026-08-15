import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/rate-limit';
import { authenticatePassword } from '@/lib/auth-service';
import { hashPassword, verifyPassword } from '@/lib/password-core.mjs';

export { hashPassword, verifyPassword };

export interface CurrentUser {
  id: string;
  email?: string | null;
  sessionVersion: number;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: '邮箱', type: 'email', placeholder: 'your@email.com' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('请输入邮箱和密码');
        }
        const ip = req?.headers && typeof req.headers.get === 'function'
          ? getClientIp(req as unknown as Request)
          : undefined;
        return authenticatePassword(credentials.email, credentials.password, ip);
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
        token.sessionVersion = (user as any).sessionVersion;
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
  const token = await getToken({
    req: request as NextRequest,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token?.id) {
    return null;
  }

  const account = await prisma.user.findUnique({
    where: { id: String(token.id) },
    select: { id: true, email: true, isBanned: true, sessionVersion: true },
  });
  if (!account || account.isBanned) return null;
  const tokenSessionVersion = Number(token.sessionVersion || 1);
  if (account.sessionVersion !== tokenSessionVersion) return null;

  return {
    id: account.id,
    email: account.email,
    sessionVersion: account.sessionVersion,
  };
}
