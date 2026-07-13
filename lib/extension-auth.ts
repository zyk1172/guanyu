import crypto from 'crypto';
import { ensureRuntimeSchema } from '@/lib/db-bootstrap';
import { prisma } from '@/lib/prisma';

const TOKEN_PREFIX = 'gy_ext_';

export function hashExtensionSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createExtensionLinkCode() {
  const raw = crypto.randomBytes(16).toString('hex').toUpperCase();
  return raw.match(/.{1,4}/g)?.join('-') || raw;
}

export function createExtensionToken() {
  return `${TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

export function normalizeExtensionCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-F0-9]/g, '');
}

export async function authenticateExtensionRequest(request: Request) {
  await ensureRuntimeSchema();
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashExtensionSecret(token);
  const session = await prisma.extensionSession.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          creditBalance: true,
          creditBalanceCents: true,
          freeQuotaDate: true,
          freeQuotaUsed: true,
          planType: true,
        },
      },
    },
  });

  if (!session || session.revokedAt) return null;
  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) return null;

  await prisma.extensionSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() },
  });

  return session;
}
