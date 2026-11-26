import { createHash } from 'crypto';
import type { Prisma, ServiceOperation } from '@/lib/generated/prisma/client';
import { AppError } from '@/lib/app-error';
import { prisma } from '@/lib/prisma';
import { changeBalance, type BillingModelSnapshot } from '@/lib/billing';

const SERVICE_OPERATION_TTL_MS = 10 * 60 * 1000;

function operationResultHash(json: string) {
  return createHash('sha256').update(json).digest('hex');
}

export function serviceOperationChargeKey(operationId: string, attempt: number) {
  return `service-operation:${operationId}:attempt:${attempt}`;
}

export function serviceOperationRefundKey(operationId: string, attempt: number) {
  return `service-operation-refund:${operationId}:attempt:${attempt}`;
}

async function refundServiceOperationCharge(
  tx: Prisma.TransactionClient,
  operation: ServiceOperation,
  attempt = operation.currentAttempt,
) {
  const idempotencyKey = serviceOperationRefundKey(operation.id, attempt);
  const chargeKey = serviceOperationChargeKey(operation.id, attempt);
  const entries = await tx.pointTransaction.findMany({
    where: { userId: operation.userId, idempotencyKey: { in: [chargeKey, idempotencyKey] } },
  });
  const charge = entries.find((entry) => entry.idempotencyKey === chargeKey);
  if (!charge || entries.some((entry) => entry.idempotencyKey === idempotencyKey)) return;
  return changeBalance(tx, operation.userId, operation.reservedCredits, {
    transactionType: 'FAILED_TASK_REFUND',
    description: '操作失败，释放预扣点数',
    auditId: charge.auditId || undefined,
    idempotencyKey,
  });
}

export type BeginServiceOperationParams = {
  userId: string;
  idempotencyKey: string;
  operation: 'followup' | 'completion';
  reservedCredits: number;
  transactionType: string;
  description: string;
  auditId?: string;
  expectedCompletionGeneratedAt?: string | null;
  modelSnapshot?: BillingModelSnapshot;
};

export async function beginServiceOperation(params: BeginServiceOperationParams) {
  return prisma.$transaction(async (tx) => {
    if (params.auditId) {
      const audits = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Audit" WHERE "id" = ${params.auditId} FOR KEY SHARE
      `;
      if (!audits.length) throw new AppError('AUDIT_NOT_FOUND', '目标报告已删除或不存在。', 404);
    }
    if (params.operation === 'completion' && params.auditId) {
      // All actors (including administrators) share the same report lease.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guanyu-completion-report:${params.auditId}`}))`;
    }
    const lockKey = `guanyu-service-operation:${params.userId}:${params.idempotencyKey}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existing = await tx.serviceOperation.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: params.userId,
          idempotencyKey: params.idempotencyKey,
        },
      },
    });
    const now = new Date();

    if (existing?.status === 'COMPLETED') {
      return { state: 'completed' as const, operation: existing };
    }
    if (
      existing?.status === 'RUNNING'
      && existing.expiresAt
      && existing.expiresAt > now
    ) {
      return { state: 'running' as const, operation: existing };
    }

    if (params.operation === 'completion' && params.auditId) {
      const active = await tx.serviceOperation.findFirst({
        where: {
          operation: 'completion', resultId: params.auditId,
          status: 'RUNNING', expiresAt: { gt: now },
        },
      });
      if (active) return { state: 'running' as const, operation: active };

      // Read after checking the lease: a completed operation commits its
      // report update atomically. A stale tab may not overwrite that result.
      const audit = await tx.audit.findUniqueOrThrow({
        where: { id: params.auditId },
        select: { completionGeneratedAt: true },
      });
      if ((audit.completionGeneratedAt?.toISOString() ?? null) !== (params.expectedCompletionGeneratedAt ?? null)) {
        throw new AppError('COMPLETION_VERSION_CHANGED', 'AI 补全结果已更新，请刷新页面查看后再重新生成。', 409);
      }
    }

    if (existing?.status === 'RUNNING') {
      const expired = await tx.serviceOperation.updateMany({
        where: { id: existing.id, status: 'RUNNING', currentAttempt: existing.currentAttempt },
        data: { status: 'FAILED', errorCode: 'operation_expired' },
      });
      if (!expired.count) {
        const current = await tx.serviceOperation.findUniqueOrThrow({ where: { id: existing.id } });
        if (current.status === 'COMPLETED') return { state: 'completed' as const, operation: current };
      } else if (existing.reservedCredits > 0) {
        await refundServiceOperationCharge(tx, existing);
      }
    }

    const currentAttempt = existing ? existing.currentAttempt + 1 : 1;
    const data = {
      status: 'RUNNING' as const,
      operation: params.operation,
      currentAttempt,
      reservedCredits: params.reservedCredits,
      resultId: params.auditId ?? null,
      resultHash: null,
      resultJson: null,
      errorCode: null,
      expiresAt: new Date(now.getTime() + SERVICE_OPERATION_TTL_MS),
    };
    const operation = existing
      ? await tx.serviceOperation.update({ where: { id: existing.id }, data })
      : await tx.serviceOperation.create({
          data: {
            userId: params.userId,
            idempotencyKey: params.idempotencyKey,
            ...data,
          },
        });

    const charged = params.reservedCredits > 0
      ? await changeBalance(tx, params.userId, -params.reservedCredits, {
          transactionType: params.transactionType,
          description: params.description,
          auditId: params.auditId,
          idempotencyKey: serviceOperationChargeKey(operation.id, currentAttempt),
          modelSnapshot: params.modelSnapshot,
        })
      : { before: 0, after: 0, repeated: false, transaction: null };

    return { state: 'claimed' as const, operation, charged };
  });
}

export async function completeServiceOperation(
  operationId: string,
  expectedAttempt: number,
  result: { resultId?: string | null; resultJson: string },
  mutate?: (tx: Prisma.TransactionClient) => Promise<unknown>,
) {
  const json = typeof result.resultJson === 'string' ? result.resultJson : JSON.stringify(result.resultJson);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.serviceOperation.updateMany({
      where: {
        id: operationId,
        status: 'RUNNING',
        currentAttempt: expectedAttempt,
        expiresAt: { gt: new Date() },
      },
      data: {
        status: 'COMPLETED',
        resultId: result.resultId || null,
        resultHash: operationResultHash(json),
        resultJson: json,
        errorCode: null,
      },
    });
    if (updated.count !== 1) {
      throw new Error('操作已变更或已超时，请刷新后重试。');
    }
    const operation = await tx.serviceOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (mutate) await mutate(tx);
    return operation;
  });
}

export async function failServiceOperation(
  operationId: string,
  expectedAttempt: number,
  errorCode = 'operation_failed',
) {
  return prisma.$transaction(async (tx) => {
    const operation = await tx.serviceOperation.findUnique({
      where: { id: operationId },
    });
    if (!operation || operation.status !== 'RUNNING' || operation.currentAttempt !== expectedAttempt) return null;
    const failed = await tx.serviceOperation.updateMany({
      where: { id: operationId, status: 'RUNNING', currentAttempt: expectedAttempt },
      data: { status: 'FAILED', errorCode },
    });
    if (failed.count !== 1) return null;
    if (operation.reservedCredits > 0) {
      await refundServiceOperationCharge(tx, operation, expectedAttempt);
    }
    return operation;
  });
}

export async function recoverExpiredServiceOperations(limit = 100) {
  const expired = await prisma.serviceOperation.findMany({
    where: { status: 'RUNNING', expiresAt: { lte: new Date() } },
    orderBy: { expiresAt: 'asc' },
    take: limit,
    select: { id: true, currentAttempt: true },
  });
  let recovered = 0;
  for (const operation of expired) {
    if (await failServiceOperation(operation.id, operation.currentAttempt, 'operation_expired')) recovered++;
  }
  return recovered;
}
