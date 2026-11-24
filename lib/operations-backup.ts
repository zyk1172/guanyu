import crypto from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptSecret, encryptSecret } from '@/lib/secret';
import { passkeyRelyingParty } from '@/lib/passkeys';

const FORMAT = 'GUANYU_OPERATIONS_BACKUP';
const VERSION = 2;
type BackupVersion = 1 | typeof VERSION;
const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 24 * 1024 * 1024;
const KDF = { name: 'scrypt', N: 16_384, r: 8, p: 1 } as const;

type BackupRecord = Record<string, unknown>;
type BackupTables = Record<string, BackupRecord[]>;

export type OperationsBackupSnapshot = {
  format: typeof FORMAT;
  version: BackupVersion;
  createdAt: string;
  notes: string[];
  counts: Record<string, number>;
  tables: BackupTables;
  passkeyRelyingParty?: { origin: string; rpID: string };
  portableSecrets: {
    appSettings: Array<{ id: string; adminLlmApiKey?: string; adminTavilyApiKey?: string; adminSerperApiKey?: string; newsSearchDeepseekKey?: string }>;
    userSettings: Array<{ id: string; llmApiKey?: string; tavilyApiKey?: string; serperApiKey?: string; deepseekApiKey?: string }>;
    platformModels?: Array<{ id: string; apiKey?: string; deepseekApiKey?: string }>;
  };
};

type BackupEnvelope = {
  format: typeof FORMAT;
  version: BackupVersion;
  encryption: 'AES-256-GCM';
  compression: 'gzip';
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  iv: string;
  authTag: string;
  payload: string;
  checksum: string;
  createdAt: string;
};

function assertPassphrase(passphrase: string) {
  if (passphrase.trim().length < 12) throw new Error('备份口令至少需要 12 个字符。');
}

function keyFor(passphrase: string, salt: Buffer) {
  return crypto.scryptSync(passphrase, salt, 32, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 });
}

function filenameDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function safeRows(value: unknown): BackupRecord[] {
  return Array.isArray(value) ? value as BackupRecord[] : [];
}

function secretValue(value?: string | null) {
  const result = decryptSecret(value);
  return result || undefined;
}

function removeSecretFields(row: BackupRecord, keys: string[]) {
  const next = { ...row };
  keys.forEach((key) => { next[key] = null; });
  return next;
}

function buildEnvelope(snapshot: OperationsBackupSnapshot, passphrase: string) {
  assertPassphrase(passphrase);
  const raw = Buffer.from(JSON.stringify(snapshot), 'utf8');
  if (raw.byteLength > MAX_UNPACKED_BYTES) throw new Error('当前运营数据过大，无法生成可通过网站恢复的备份包。请联系管理员使用数据库级恢复。');
  const packed = gzipSync(raw, { level: 9 });
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(passphrase, salt), iv);
  const encrypted = Buffer.concat([cipher.update(packed), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const envelope: BackupEnvelope = {
    format: FORMAT,
    version: snapshot.version,
    encryption: 'AES-256-GCM',
    compression: 'gzip',
    kdf: { ...KDF, salt: salt.toString('base64') },
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    payload: encrypted.toString('base64'),
    checksum: crypto.createHash('sha256').update(raw).digest('hex'),
    createdAt: snapshot.createdAt,
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8');
}

function readEnvelope(archive: Buffer, passphrase: string): OperationsBackupSnapshot {
  assertPassphrase(passphrase);
  if (!archive.byteLength || archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error('备份文件为空或超过网站恢复大小限制。');
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(archive.toString('utf8')) as BackupEnvelope;
  } catch {
    throw new Error('备份文件格式无效。');
  }
  if (envelope.format !== FORMAT || ![1, VERSION].includes(envelope.version) || envelope.encryption !== 'AES-256-GCM' || envelope.compression !== 'gzip' || envelope.kdf?.name !== 'scrypt') {
    throw new Error('该文件不是受支持的观隅运营备份。');
  }
  try {
    const salt = Buffer.from(envelope.kdf.salt, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(passphrase, salt), Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
    const packed = Buffer.concat([decipher.update(Buffer.from(envelope.payload, 'base64')), decipher.final()]);
    const raw = gunzipSync(packed, { maxOutputLength: MAX_UNPACKED_BYTES });
    if (crypto.createHash('sha256').update(raw).digest('hex') !== envelope.checksum) throw new Error('CHECKSUM');
    const snapshot = JSON.parse(raw.toString('utf8')) as OperationsBackupSnapshot;
    if (snapshot.format !== FORMAT || snapshot.version !== envelope.version || !snapshot.tables || !snapshot.portableSecrets) throw new Error('SNAPSHOT');
    return snapshot;
  } catch (error) {
    if (error instanceof Error && ['CHECKSUM', 'SNAPSHOT'].includes(error.message)) throw new Error('备份文件校验失败，无法恢复。');
    throw new Error('备份口令不正确，或备份文件已损坏。');
  }
}

export async function createOperationsBackup() {
  const [appSettings, users, userSettings, audits, pointTransactions, purchaseOrders, rssFeeds, rssItems,
    discussionMessages, discussionReports, exportArtifacts, emailDeliveries, platformModelConfigs,
    modelUsageEvents, savedArticles, reportFollowups, passkeys, serviceOperations] = await prisma.$transaction([
    prisma.appSetting.findMany(), prisma.user.findMany(), prisma.userSettings.findMany(), prisma.audit.findMany(),
    prisma.pointTransaction.findMany(), prisma.purchaseOrder.findMany(), prisma.rssFeed.findMany(), prisma.rssItem.findMany(),
    prisma.reportDiscussionMessage.findMany(), prisma.discussionReport.findMany(), prisma.exportArtifact.findMany(),
    prisma.emailDelivery.findMany({ omit: { payloadEncrypted: true } }), prisma.platformModelConfig.findMany(),
    prisma.modelUsageEvent.findMany(), prisma.savedArticle.findMany(), prisma.reportFollowup.findMany(),
    prisma.passkey.findMany(), prisma.serviceOperation.findMany(),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const appSettingsRows = appSettings.map((row) => removeSecretFields(row as unknown as BackupRecord, ['adminLlmApiKeyEncrypted', 'adminTavilyApiKeyEncrypted', 'adminSerperApiKeyEncrypted', 'newsSearchDeepseekKeyEncrypted']));
  const userSettingsRows = userSettings.map((row) => removeSecretFields(row as unknown as BackupRecord, ['llmApiKeyEncrypted', 'tavilyApiKeyEncrypted', 'serperApiKeyEncrypted', 'deepseekApiKeyEncrypted']));
  const platformModelRows = platformModelConfigs.map((row) => removeSecretFields(row as unknown as BackupRecord, ['apiKeyEncrypted', 'deepseekApiKeyEncrypted']));
  const tables: BackupTables = {
    passkeys: passkeys.map(row => ({
      ...row, publicKey: Buffer.from(row.publicKey).toString('base64'), counter: row.counter.toString(),
    })),
    serviceOperations: serviceOperations as unknown as BackupRecord[],
    appSettings: appSettingsRows,
    users: users as unknown as BackupRecord[],
    userSettings: userSettingsRows,
    audits: audits as unknown as BackupRecord[],
    pointTransactions: pointTransactions as unknown as BackupRecord[],
    purchaseOrders: purchaseOrders as unknown as BackupRecord[],
    rssFeeds: rssFeeds as unknown as BackupRecord[],
    rssItems: rssItems as unknown as BackupRecord[],
    discussionMessages: discussionMessages as unknown as BackupRecord[],
    discussionReports: discussionReports as unknown as BackupRecord[],
    exportArtifacts: exportArtifacts as unknown as BackupRecord[],
    emailDeliveries: emailDeliveries as unknown as BackupRecord[],
    platformModelConfigs: platformModelRows,
    modelUsageEvents: modelUsageEvents as unknown as BackupRecord[],
    savedArticles: savedArticles as unknown as BackupRecord[],
    reportFollowups: reportFollowups as unknown as BackupRecord[],
  };
  const snapshot: OperationsBackupSnapshot = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    ...(passkeys.length ? { passkeyRelyingParty: passkeyRelyingParty() } : {}),
    notes: [
      '包含运营数据、密码哈希、点数流水、订单、报告、RSS、交流、导出存档和邮件投递记录。',
      '恢复会使旧会话失效，同一网站配置下保留通行密钥。未完成的预扣在恢复后按流水结算，已排队的通知不会重发。',
      '密码仅以不可逆哈希保存。模型与搜索 API 密钥仅在本备份包的口令加密层内可恢复。',
    ],
    counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    tables,
    portableSecrets: {
      appSettings: appSettings.map((row) => ({ id: row.id, adminLlmApiKey: secretValue(row.adminLlmApiKeyEncrypted), adminTavilyApiKey: secretValue(row.adminTavilyApiKeyEncrypted), adminSerperApiKey: secretValue(row.adminSerperApiKeyEncrypted), newsSearchDeepseekKey: secretValue(row.newsSearchDeepseekKeyEncrypted) })),
      userSettings: userSettings.map((row) => ({ id: row.id, llmApiKey: secretValue(row.llmApiKeyEncrypted), tavilyApiKey: secretValue(row.tavilyApiKeyEncrypted), serperApiKey: secretValue(row.serperApiKeyEncrypted), deepseekApiKey: secretValue(row.deepseekApiKeyEncrypted) })),
      platformModels: platformModelConfigs.map((row) => ({ id: row.id, apiKey: secretValue(row.apiKeyEncrypted), deepseekApiKey: secretValue(row.deepseekApiKeyEncrypted) })),
    },
  };
  return { snapshot, filename: `guanyu-operations-backup-${filenameDate(new Date())}.guanyu-backup` };
}

export function encodeOperationsBackup(snapshot: OperationsBackupSnapshot, passphrase: string) {
  return buildEnvelope(snapshot, passphrase);
}

export function decodeOperationsBackup(archive: Buffer, passphrase: string) {
  return readEnvelope(archive, passphrase);
}

function hydrateSecretFields(snapshot: OperationsBackupSnapshot) {
  const appSecrets = new Map(snapshot.portableSecrets.appSettings.map((item) => [item.id, item]));
  const settingSecrets = new Map(snapshot.portableSecrets.userSettings.map((item) => [item.id, item]));
  const platformModelSecrets = new Map((snapshot.portableSecrets.platformModels || []).map((item) => [item.id, item]));
  const appSettings = safeRows(snapshot.tables.appSettings).map((row) => {
    const secret = appSecrets.get(String(row.id));
    const homepageKey = secret?.newsSearchDeepseekKey
      || (snapshot.version === 1 && row.newsSearchModelConfigId
        ? platformModelSecrets.get(String(row.newsSearchModelConfigId))?.deepseekApiKey : undefined);
    return { ...row, adminLlmApiKeyEncrypted: secret?.adminLlmApiKey ? encryptSecret(secret.adminLlmApiKey) : null, adminTavilyApiKeyEncrypted: secret?.adminTavilyApiKey ? encryptSecret(secret.adminTavilyApiKey) : null, adminSerperApiKeyEncrypted: secret?.adminSerperApiKey ? encryptSecret(secret.adminSerperApiKey) : null, newsSearchDeepseekKeyEncrypted: homepageKey ? encryptSecret(homepageKey) : null };
  });
  const userSettings = safeRows(snapshot.tables.userSettings).map((row) => {
    const secret = settingSecrets.get(String(row.id));
    return { ...row, llmApiKeyEncrypted: secret?.llmApiKey ? encryptSecret(secret.llmApiKey) : null, tavilyApiKeyEncrypted: secret?.tavilyApiKey ? encryptSecret(secret.tavilyApiKey) : null, serperApiKeyEncrypted: secret?.serperApiKey ? encryptSecret(secret.serperApiKey) : null, deepseekApiKeyEncrypted: secret?.deepseekApiKey ? encryptSecret(secret.deepseekApiKey) : null };
  });
  const platformModelConfigs = safeRows(snapshot.tables.platformModelConfigs).map((row) => {
    const secret = platformModelSecrets.get(String(row.id));
    return { ...row, apiKeyEncrypted: secret?.apiKey ? encryptSecret(secret.apiKey) : null, deepseekApiKeyEncrypted: secret?.deepseekApiKey ? encryptSecret(secret.deepseekApiKey) : null };
  });
  return { appSettings, userSettings, platformModelConfigs };
}

function requireRows(snapshot: OperationsBackupSnapshot, name: string) {
  const rows = safeRows(snapshot.tables[name]);
  if (!Array.isArray(snapshot.tables[name])) throw new Error(`备份缺少 ${name} 数据表。`);
  return rows;
}

export async function restoreOperationsBackup(snapshot: OperationsBackupSnapshot) {
  const required = ['appSettings', 'users', 'userSettings', 'audits', 'pointTransactions', 'purchaseOrders', 'rssFeeds', 'rssItems', 'discussionMessages', 'discussionReports', 'exportArtifacts', 'emailDeliveries'];
  if (snapshot.version === VERSION) required.push('passkeys', 'serviceOperations');
  required.forEach((name) => requireRows(snapshot, name));
  const total = required.reduce((sum, name) => sum + requireRows(snapshot, name).length, 0);
  if (total > 100_000) throw new Error('备份数据量超过网站恢复上限。');
  const hydrated = hydrateSecretFields(snapshot);
  const messages = requireRows(snapshot, 'discussionMessages');
  const rootMessages = messages.filter((message) => !message.parentMessageId);
  const replyMessages = messages.filter((message) => message.parentMessageId);
  const savedArticleRows = safeRows(snapshot.tables.savedArticles);
  const passkeyRows = safeRows(snapshot.tables.passkeys);
  if (passkeyRows.length) {
    const current = passkeyRelyingParty();
    if (snapshot.passkeyRelyingParty?.origin !== current.origin || snapshot.passkeyRelyingParty.rpID !== current.rpID) {
      throw new Error('备份内通行密钥绑定的网站地址与当前部署不一致。');
    }
  }
  const serviceOperations = safeRows(snapshot.tables.serviceOperations).map(row => ({
    ...row, ...(row.status === 'RUNNING' ? { expiresAt: new Date(0) } : {}),
  }));
  const emailRows = requireRows(snapshot, 'emailDeliveries').map(row => ({
    ...row, payloadEncrypted: null,
    ...(['pending', 'sending', 'temporary_failure', 'sent'].includes(String(row.status)) ? { status: 'unknown' } : {}),
  }));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(83672704);');
    const currentVersions = new Map(
      (await tx.user.findMany({ select: { email: true, sessionVersion: true } })).map((user) => [user.email.toLowerCase(), user.sessionVersion]),
    );
    await tx.discussionReport.deleteMany();
    await tx.reportDiscussionMessage.deleteMany();
    await tx.exportArtifact.deleteMany();
    await tx.emailDelivery.deleteMany();
    await tx.modelUsageEvent.deleteMany();
    await tx.rssItem.deleteMany();
    await tx.rssFeed.deleteMany();
    await tx.auditJob.deleteMany();
    await tx.serviceOperation.deleteMany();
    await tx.audit.deleteMany();
    await tx.savedArticle.deleteMany();
    await tx.accountDeletionLog.deleteMany();
    await tx.pointTransaction.deleteMany();
    await tx.purchaseOrder.deleteMany();
    await tx.rateLimitEvent.deleteMany();
    await tx.extensionLinkCode.deleteMany();
    await tx.extensionSession.deleteMany();
    await tx.verificationCode.deleteMany();
    await tx.userSettings.deleteMany();
    await tx.user.deleteMany();
    await tx.appSetting.deleteMany();
    if (Array.isArray(snapshot.tables.platformModelConfigs)) await tx.platformModelConfig.deleteMany();

    if (hydrated.appSettings.length) await tx.appSetting.createMany({ data: hydrated.appSettings as any });
    const restoredUsers = requireRows(snapshot, 'users').map((row) => {
      const email = String(row.email || '').trim().toLowerCase();
      const current = currentVersions.get(email) || 0;
      const backup = Number(row.sessionVersion || 1);
      return { ...row, sessionVersion: Math.max(current, backup) + 1 };
    });
    if (restoredUsers.length) await tx.user.createMany({ data: restoredUsers as any });
    if (passkeyRows.length) await tx.passkey.createMany({ data: passkeyRows.map(row => ({
      id: String(row.id), userId: String(row.userId), credentialId: String(row.credentialId), name: String(row.name),
      transports: Array.isArray(row.transports) ? row.transports.map(String) : [],
      publicKey: Buffer.from(String(row.publicKey), 'base64'), counter: BigInt(String(row.counter)),
      createdAt: String(row.createdAt), lastUsedAt: row.lastUsedAt ? String(row.lastUsedAt) : null,
    })) });
    if (hydrated.userSettings.length) await tx.userSettings.createMany({ data: hydrated.userSettings as any });
    if (hydrated.platformModelConfigs.length) await tx.platformModelConfig.createMany({ data: hydrated.platformModelConfigs as any });
    if (requireRows(snapshot, 'audits').length) await tx.audit.createMany({ data: requireRows(snapshot, 'audits') as any });
    if (requireRows(snapshot, 'pointTransactions').length) await tx.pointTransaction.createMany({ data: requireRows(snapshot, 'pointTransactions') as any });
    if (requireRows(snapshot, 'purchaseOrders').length) await tx.purchaseOrder.createMany({ data: requireRows(snapshot, 'purchaseOrders') as any });
    if (requireRows(snapshot, 'rssFeeds').length) await tx.rssFeed.createMany({ data: requireRows(snapshot, 'rssFeeds') as any });
    if (requireRows(snapshot, 'rssItems').length) await tx.rssItem.createMany({ data: requireRows(snapshot, 'rssItems') as any });
    if (emailRows.length) await tx.emailDelivery.createMany({ data: emailRows as Prisma.EmailDeliveryCreateManyInput[] });
    if (serviceOperations.length) await tx.serviceOperation.createMany({ data: serviceOperations as Prisma.ServiceOperationCreateManyInput[] });
    if (requireRows(snapshot, 'exportArtifacts').length) await tx.exportArtifact.createMany({ data: requireRows(snapshot, 'exportArtifacts') as any });
    if (rootMessages.length) await tx.reportDiscussionMessage.createMany({ data: rootMessages as any });
    if (replyMessages.length) await tx.reportDiscussionMessage.createMany({ data: replyMessages as any });
    if (requireRows(snapshot, 'discussionReports').length) await tx.discussionReport.createMany({ data: requireRows(snapshot, 'discussionReports') as any });
    if (safeRows(snapshot.tables.modelUsageEvents).length) await tx.modelUsageEvent.createMany({ data: safeRows(snapshot.tables.modelUsageEvents) as any });
    if (savedArticleRows.length) await tx.savedArticle.createMany({ data: savedArticleRows as any });
    const followups = safeRows(snapshot.tables.reportFollowups);
    if (followups.length) await tx.reportFollowup.createMany({
      data: followups.map(row => ({ ...row, sources: row.sources ?? undefined })) as Prisma.ReportFollowupCreateManyInput[],
    });
  }, { maxWait: 10_000, timeout: 60_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return { restoredAt: new Date().toISOString(), counts: snapshot.counts };
}

export function backupSummary(snapshot: OperationsBackupSnapshot) {
  return { createdAt: snapshot.createdAt, counts: snapshot.counts, notes: snapshot.notes, version: snapshot.version };
}
