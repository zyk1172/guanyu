import { NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export async function setSessionCookie(
  response: NextResponse,
  user: { id: string; email: string | null }
) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET 未配置');
  }

  const token = await encode({
    secret,
    maxAge: SESSION_MAX_AGE,
    token: {
      id: user.id,
      email: user.email,
    },
  });

  response.cookies.set('next-auth.session-token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NEXTAUTH_URL?.startsWith('https://') ?? false,
  });
}

