import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminStatus } from '@/lib/admin';
import { getCurrentUser } from '@/lib/auth';
import { backupSummary, createOperationsBackup, decodeOperationsBackup, encodeOperationsBackup, restoreOperationsBackup } from '@/lib/operations-backup';
import { cacheDel, cacheDelByPrefix, CACHE_KEYS } from '@/lib/cache';

export const runtime = 'nodejs';
export const maxDuration = 60;

const RESTORE_CONFIRMATIONS = ['恢复全部运营数据', 'RESTORE ALL OPERATIONS DATA'];

async function requireSuperAdmin(request: Request) {
  const user = await getCurrentUser(request);
  if (!user || !(await getSuperAdminStatus(user.id))) return null;
  return user;
}

function attachment(content: Buffer, filename: string) {
  return new NextResponse(content as any, {
    headers: {
      'Content-Type': 'application/vnd.guanyu.operations-backup+json',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return NextResponse.json({ error: '只有超级管理员可以管理运营备份。' }, { status: 403 });
  return NextResponse.json({
    ok: true,
    restoreConfirmation: RESTORE_CONFIRMATIONS,
    limits: { maxArchiveBytes: 4 * 1024 * 1024 },
    scope: ['users', 'password_hashes', 'credits', 'orders', 'audits', 'rss', 'discussions', 'exports', 'email_deliveries', 'encrypted_api_configuration'],
    excluded: ['active_sessions', 'one_time_codes', 'extension_tokens', 'in_progress_jobs'],
  });
}

export async function POST(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return NextResponse.json({ error: '只有超级管理员可以创建运营备份。' }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const passphrase = String(body.passphrase || '');
    const { snapshot, filename } = await createOperationsBackup();
    const archive = encodeOperationsBackup(snapshot, passphrase);
    return attachment(archive, filename);
  } catch (error) {
    console.error('Operations backup export failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: error instanceof Error ? error.message : '运营备份创建失败。' }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await requireSuperAdmin(request);
  if (!user) return NextResponse.json({ error: '只有超级管理员可以恢复运营备份。' }, { status: 403 });
  try {
    const form = await request.formData();
    const archive = form.get('archive');
    const passphrase = String(form.get('passphrase') || '');
    const confirmation = String(form.get('confirmation') || '');
    if (!RESTORE_CONFIRMATIONS.includes(confirmation)) return NextResponse.json({ error: '请输入恢复确认语以确认恢复。' }, { status: 400 });
    if (!(archive instanceof File)) return NextResponse.json({ error: '请选择观隅运营备份文件。' }, { status: 400 });
    const snapshot = decodeOperationsBackup(Buffer.from(await archive.arrayBuffer()), passphrase);
    const result = await restoreOperationsBackup(snapshot);
    await Promise.all([
      cacheDel(CACHE_KEYS.appSetting),
      cacheDelByPrefix(CACHE_KEYS.hotAuditsPrefix),
      cacheDelByPrefix('guanyu:cache:audit:'),
    ]);
    return NextResponse.json({ ok: true, backup: backupSummary(snapshot), ...result, message: '运营数据已恢复。所有用户需要重新登录，插件需要重新绑定。' });
  } catch (error) {
    console.error('Operations backup restore failed', { error: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: error instanceof Error ? error.message : '运营备份恢复失败。' }, { status: 400 });
  }
}
