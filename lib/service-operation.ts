import { createHash } from 'crypto';
import type { Prisma, ServiceOperation } from '@/lib/generated/prisma/client';
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
  const prior = await tx.pointTransaction.findFirst({
    where: { userId: operation.userId, idempotencyKey },
  });
  if (prior) return prior;
  return changeBalance(tx, operation.userId, operation.reservedCredits, {
    transactionType: 'FAILED_TASK_REFUND',
    description: '操作失败，释放预扣点数',
    auditId: operation.resultId || undefined,
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
  modelSnapshot?: BillingModelSnapshot;
};

export async function beginServiceOperation(params: BeginServiceOperationParams) {
  return prisma.$transaction(async (tx) => {
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

    if (existing?.status === 'RUNNING' && existing.reservedCredits > 0) {
      await refundServiceOperationCharge(tx, existing, existing.currentAttempt);
    }

    const currentAttempt = existing ? existing.currentAttempt + 1 : 1;
    const data = {
      status: 'RUNNING' as const,
      operation: params.operation,
      currentAttempt,
      reservedCredits: params.reservedCredits,
      resultId: null,
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
    if (!operation || operation.status !== 'RUNNING' || operation.currentAttempt !== expectedAttempt) return operation;
    await tx.serviceOperation.update({
      where: { id: operationId },
      data: { status: 'FAILED', errorCode },
    });
    if (operation.reservedCredits > 0) {
      await refundServiceOperationCharge(tx, operation, expectedAttempt);
    }
    return operation;
  });
}
