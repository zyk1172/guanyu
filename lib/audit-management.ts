import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AccessError, requireAccount } from '@/lib/access';
import { getSuperAdminStatus } from '@/lib/admin';
import { withHistoricalAuditModelName } from '@/lib/audit-model-display';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/lib/generated/prisma/client';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const cursorSchema = z.tuple([z.iso.datetime(), idSchema]);
const scopeSchema = z.enum(['own', 'site']);
export type AuditManagementScope = z.infer<typeof scopeSchema>;
export const batchSchema = z.object({
  scope: scopeSchema,
  action: z.enum(['publish', 'unpublish', 'delete']),
  requestId: z.uuid(),
  ids: z.array(idSchema).min(1).max(50),
});

export async function requireAuditManagement(request: Request, scope: AuditManagementScope) {
  const user = await requireAccount(request);
  if (scope === 'site' && !await getSuperAdminStatus(user.id)) {
    throw new AccessError('你没有权限管理全站审视记录。', 403);
  }
  return user;
}

export async function listManagedAudits(request: Request, scope: AuditManagementScope) {
  const user = await requireAuditManagement(request, scope);
  const params = new URL(request.url).searchParams;
  const search = params.get('search')?.trim().slice(0, 160);
  const mode = params.get('mode')?.slice(0, 40);
  const depth = params.get('depth')?.slice(0, 40);
  const visibility = params.get('isPublic');
  const cursor = params.get('cursor');
  const limit = 24;
  const where: Prisma.AuditWhereInput = {
    ...(scope === 'own' ? { userId: user.id } : {}),
    ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    ...(mode ? { analysisMode: mode } : {}),
    ...(depth ? { reasoningDepth: depth } : {}),
    ...(visibility === 'true' || visibility === 'false' ? { isPublic: visibility === 'true' } : {}),
  };
  if (cursor) {
    try {
      if (cursor.length > 260) throw new Error();
      const [timestamp, id] = cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
      const date = new Date(timestamp);
      where.OR = [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: id } }];
    } catch {
      throw new AccessError('分页参数无效。');
    }
  }
  const rows = await prisma.audit.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: {
      id: true, title: true, newsSummary: true, analysisMode: true, reasoningDepth: true,
      reportLanguage: true, isPublic: true, indexable: true, createdAt: true,
      modelName: true, modelDisplayNameSnapshot: true,
      user: scope === 'site' ? { select: { email: true } } : false,
    },
  });
  const last = rows[limit - 1];
  return {
    items: rows.slice(0, limit).map(withHistoricalAuditModelName),
    nextCursor: rows.length > limit ? Buffer.from(JSON.stringify([last.createdAt, last.id])).toString('base64url') : null,
  };
}

type AuditVisibility = { isPublic?: boolean; indexable?: boolean; isSourcePublic?: boolean };

function visibilityUpdate(wasPublic: boolean, patch: AuditVisibility) {
  if (patch.isPublic === false) {
    return { isPublic: false, indexable: false, isSourcePublic: false, isCompletionPublic: false };
  }
  const isPublic = patch.isPublic ?? wasPublic;
  const becomingPublic = isPublic && !wasPublic;
  return {
    ...(patch.isPublic !== undefined ? { isPublic } : {}),
    ...(patch.indexable !== undefined || becomingPublic ? { indexable: isPublic && patch.indexable === true } : {}),
    ...(patch.isSourcePublic !== undefined || becomingPublic ? { isSourcePublic: isPublic && patch.isSourcePublic === true } : {}),
    ...(becomingPublic ? { isCompletionPublic: false } : {}),
  };
}

async function lockAuditRows(tx: Prisma.TransactionClient, ids: string[], owner: string | null) {
  return tx.$queryRaw<Array<{ id: string; userId: string; isPublic: boolean }>>`
    SELECT "id", "userId", "isPublic" FROM "Audit" WHERE "id" = ANY(${ids}::text[])
    AND (${owner}::text IS NULL OR "userId" = ${owner})
    ORDER BY "id" FOR UPDATE
  `;
}

async function requireLockedAudit(tx: Prisma.TransactionClient, id: string, userId: string, isSuperAdmin: boolean) {
  const [audit] = await lockAuditRows(tx, [id], null);
  if (!audit) throw new AccessError('记录不存在', 404);
  if (audit.userId !== userId && !isSuperAdmin) throw new AccessError('你没有权限管理他人的审视记录。', 403);
  return audit;
}

async function deleteLockedAudits(tx: Prisma.TransactionClient, ids: string[]) {
  const active = await tx.serviceOperation.findFirst({
    where: {
      status: 'RUNNING',
      expiresAt: { gt: new Date() },
      OR: [
        { resultId: { in: ids } },
        // Older claims did not record their report ID until the worker started.
        ...ids.flatMap(id => ['completion', 'followup', 'related-coverage:v1'].map(scope => ({
          idempotencyKey: { startsWith: `${scope}:${id}:` },
        }))),
      ],
    },
    select: { id: true },
  });
  if (active) throw new AccessError('选中的报告仍有操作进行中，请稍后再试。', 409);
  return (await tx.audit.deleteMany({ where: { id: { in: ids } } })).count;
}

export async function updateAuditVisibility(id: string, userId: string, isSuperAdmin: boolean, patch: AuditVisibility) {
  return prisma.$transaction(async tx => {
    const audit = await requireLockedAudit(tx, id, userId, isSuperAdmin);
    return tx.audit.update({ where: { id }, data: visibilityUpdate(audit.isPublic, patch) });
  });
}

export async function deleteManagedAudit(id: string, userId: string, isSuperAdmin: boolean) {
  return prisma.$transaction(async tx => {
    await requireLockedAudit(tx, id, userId, isSuperAdmin);
    return deleteLockedAudits(tx, [id]);
  });
}

export async function applyAuditBatch(userId: string, input: z.infer<typeof batchSchema>) {
  const ids = [...new Set(input.ids)].sort();
  const fingerprint = createHash('sha256').update(JSON.stringify([input.scope, input.action, ids])).digest('hex');
  const lock = `audit-management:${userId}:${input.requestId}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
    const prior = await tx.auditManagementRequest.findUnique({
      where: { userId_requestId: { userId, requestId: input.requestId } },
    });
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AccessError('请求标识已用于其他操作。', 409);
      return { changed: prior.changed };
    }

    const rows = await lockAuditRows(tx, ids, input.scope === 'own' ? userId : null);
    if (rows.length !== ids.length) throw new AccessError('部分报告不存在或不可管理。', 404);
    const isPublic = input.action === 'publish';
    const changed = input.action === 'delete'
      ? await deleteLockedAudits(tx, ids)
      : (await tx.audit.updateMany({
        where: { id: { in: ids }, isPublic: !isPublic },
        data: visibilityUpdate(!isPublic, { isPublic }),
      })).count;
    await tx.auditManagementRequest.create({ data: { userId, requestId: input.requestId, fingerprint, changed } });
    return { changed };
  });
}
