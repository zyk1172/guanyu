import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { createDiscussionMessageWithCharge, effectiveCreditCents } from '@/lib/billing';
import { prisma } from '@/lib/prisma';
import { discussionMessageDto } from '@/lib/discussion-dto';
import { sameOriginResponse } from '@/lib/request-security';

const MAX_LENGTH = Number(process.env.DISCUSSION_MAX_LENGTH || 2000);
const MAX_LINKS = Number(process.env.DISCUSSION_MAX_LINKS || 3);
const EDIT_WINDOW_MS = Number(process.env.DISCUSSION_EDIT_WINDOW_MINUTES || 15) * 60_000;

function cleanContent(value: unknown) {
  const content = String(value || '').replace(/<[^>]*>/g, '').replace(/\u0000/g, '').trim();
  if (!content || content.length > MAX_LENGTH) throw new Error(`交流内容需在 1 至 ${MAX_LENGTH} 个字符之间。`);
  if ((content.match(/https?:\/\//gi) || []).length > MAX_LINKS) throw new Error(`交流内容最多包含 ${MAX_LINKS} 个链接。`);
  return content;
}
async function getAudit(id: string, userId?: string, isAdmin = false) {
  const audit = await prisma.audit.findUnique({ where: { id }, select: { id: true, userId: true, isPublic: true, reportVersion: true, discussionLockedAt: true } });
  if (!audit) return { error: '审视报告不存在。', status: 404 as const };
  if (!audit.isPublic && audit.userId !== userId && !isAdmin) return { error: '你没有权限查看这条审视报告。', status: 403 as const };
  return { audit };
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(request); const isAdmin = user ? await getSuperAdminStatus(user.id) : false; const { id } = await params; const result = await getAudit(id, user?.id, isAdmin);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const url = new URL(request.url); const cursor = url.searchParams.get('cursor');
  const cursorDate = cursor ? new Date(cursor) : null;
  if (cursorDate && Number.isNaN(cursorDate.getTime())) return NextResponse.json({ error: '分页参数无效。' }, { status: 400 });
  const visible = isAdmin ? {} : { status: { not: 'HIDDEN' } };
  const page = await prisma.reportDiscussionMessage.findMany({ where: { reportId: id, parentMessageId: null, ...visible, ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}) }, orderBy: { createdAt: 'desc' }, take: 20, include: { user: { select: { name: true } }, replies: { where: visible, orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } } } });
  const ordered = page.reverse();
  const messages = ordered.map((message) => discussionMessageDto(message, isAdmin));
  return NextResponse.json({ locked: Boolean(result.audit.discussionLockedAt), messages, canModerate: isAdmin, currentUserId: user?.id || null, nextCursor: ordered.length === 20 ? ordered[0].createdAt.toISOString() : null });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const user = await getCurrentUser(request); if (!user) return NextResponse.json({ error: '请登录后发布交流内容。' }, { status: 401 });
  const isAdmin = await getSuperAdminStatus(user.id);
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { isBanned: true } });
  if (account?.isBanned) return NextResponse.json({ error: '账号已被管理员暂停使用，无法发布交流内容。' }, { status: 403 });
  const { id } = await params; const found = await getAudit(id, user.id); if ('error' in found) return NextResponse.json({ error: found.error }, { status: found.status });
  if (found.audit.discussionLockedAt) return NextResponse.json({ error: '该报告的交流区已被管理员锁定。' }, { status: 403 });
  try {
    const body = await request.json(); const content = cleanContent(body.content); const parentMessageId = body.parentMessageId ? String(body.parentMessageId) : null; const idempotencyKey = String(body.idempotencyKey || '').trim();
    if (!idempotencyKey || idempotencyKey.length > 100) return NextResponse.json({ error: '请求标识无效，请重试。' }, { status: 400 });
    if (parentMessageId) { const parent = await prisma.reportDiscussionMessage.findUnique({ where: { id: parentMessageId }, select: { reportId: true, parentMessageId: true } }); if (!parent || parent.reportId !== id || parent.parentMessageId) return NextResponse.json({ error: '只能回复该报告中的顶层留言。' }, { status: 400 }); }
    const recent = await prisma.reportDiscussionMessage.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60_000) } } }); if (recent >= Number(process.env.DISCUSSION_MAX_POSTS_PER_MINUTE || 3)) return NextResponse.json({ error: '发布过于频繁，请稍后再试。' }, { status: 429 });
    const result = await createDiscussionMessageWithCharge({ userId: user.id, reportId: id, reportVersion: found.audit.reportVersion, parentMessageId, content, languageCode: String(body.languageCode || 'zh-CN').slice(0, 16), idempotencyKey });
    return NextResponse.json({ message: discussionMessageDto(result.message, isAdmin), repeated: result.repeated, balance: effectiveCreditCents(await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { creditBalance: true, creditBalanceCents: true, creditBalanceAmount: true } })) / 100 });
  } catch (error: any) { return NextResponse.json({ error: error?.message || '发布失败，未扣除点数。' }, { status: 400 }); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const user = await getCurrentUser(request); if (!user) return NextResponse.json({ error: '请登录后操作。' }, { status: 401 });
  const body = await request.json(); const { id } = await params; const action = String(body.action || 'edit'); const isAdmin = await getSuperAdminStatus(user.id);
  const found = await getAudit(id, user.id, isAdmin); if ('error' in found) return NextResponse.json({ error: found.error }, { status: found.status });

  if (action === 'lock' || action === 'unlock') {
    if (!isAdmin) return NextResponse.json({ error: '只有超级管理员可以锁定交流区。' }, { status: 403 });
    await prisma.audit.update({ where: { id }, data: action === 'lock' ? { discussionLockedAt: new Date(), discussionLockedById: user.id } : { discussionLockedAt: null, discussionLockedById: null } });
    return NextResponse.json({ ok: true, locked: action === 'lock' });
  }

  const messageId = String(body.messageId || '');
  const message = await prisma.reportDiscussionMessage.findUnique({ where: { id: messageId } });
  if (!message || message.reportId !== id) return NextResponse.json({ error: '交流内容不存在。' }, { status: 404 });

  if (action === 'report') {
    const reason = String(body.reason || '').trim().slice(0, 80);
    if (!reason) return NextResponse.json({ error: '请选择举报原因。' }, { status: 400 });
    await prisma.discussionReport.upsert({ where: { messageId_reporterUserId: { messageId, reporterUserId: user.id } }, update: { reason, description: String(body.description || '').trim().slice(0, 500), status: 'PENDING', reviewedBy: null, reviewedAt: null }, create: { messageId, reporterUserId: user.id, reason, description: String(body.description || '').trim().slice(0, 500) } });
    return NextResponse.json({ ok: true, message: '举报已提交，管理员会进行处理。' });
  }

  if (action === 'hide' || action === 'restore') {
    if (!isAdmin) return NextResponse.json({ error: '只有超级管理员可以审核交流内容。' }, { status: 403 });
    const updated = await prisma.reportDiscussionMessage.update({ where: { id: messageId }, data: action === 'hide' ? { status: 'HIDDEN' } : { status: 'VISIBLE', deletedAt: null } });
    await prisma.discussionReport.updateMany({ where: { messageId }, data: { status: action === 'hide' ? 'ACTIONED' : 'DISMISSED', reviewedBy: user.id, reviewedAt: new Date() } });
    return NextResponse.json({ message: discussionMessageDto(updated, true) });
  }

  if (message.userId !== user.id || message.deletedAt || Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) return NextResponse.json({ error: '该交流内容已超过可编辑时间。' }, { status: 403 });
  return NextResponse.json({ message: discussionMessageDto(await prisma.reportDiscussionMessage.update({ where: { id: message.id }, data: { content: cleanContent(body.content), isEdited: true, editedAt: new Date() } }), isAdmin) });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originError = sameOriginResponse(request);
  if (originError) return originError;
  const user = await getCurrentUser(request); if (!user) return NextResponse.json({ error: '请登录后删除。' }, { status: 401 }); const messageId = new URL(request.url).searchParams.get('messageId') || ''; const message = await prisma.reportDiscussionMessage.findUnique({ where: { id: messageId } }); const admin = await getSuperAdminStatus(user.id); if (!message || message.reportId !== (await params).id) return NextResponse.json({ error: '交流内容不存在。' }, { status: 404 }); if (message.userId !== user.id && !admin) return NextResponse.json({ error: '你没有权限删除该交流内容。' }, { status: 403 }); await prisma.reportDiscussionMessage.update({ where: { id: message.id }, data: { status: 'DELETED', deletedAt: new Date(), content: '该内容已删除。' } }); return NextResponse.json({ ok: true });
}
