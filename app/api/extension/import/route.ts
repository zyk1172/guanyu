import { randomUUID } from 'crypto';
import { after, NextResponse } from 'next/server';
import { authenticateExtensionRequest } from '@/lib/extension-auth';
import { createAnalyzeJob, runAnalyzeJob } from '@/lib/analyze-job';
import { prisma } from '@/lib/prisma';

const MAX_TEXT_LENGTH = 30_000;
const MAX_SELECTED_LENGTH = 20_000;

export const maxDuration = 300;

function cleanText(value: string, maxLength: number) {
  return value
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function assertSafeHttpUrl(value: string) {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('插件只支持导入 http 或 https 新闻链接。');
  }
  return parsed.toString();
}

export async function POST(request: Request) {
  const session = await authenticateExtensionRequest(request);
  if (!session) {
    return NextResponse.json({ error: '插件授权无效或已过期，请重新连接观隅账号。' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '').trim();
  if (action !== 'save' && action !== 'analyze') {
    return NextResponse.json({ error: '插件操作类型无效。' }, { status: 400 });
  }
  const title = cleanText(String(body.title || ''), 160);
  const selectedText = cleanText(String(body.selectedText || ''), MAX_SELECTED_LENGTH);
  const pageText = cleanText(String(body.pageText || ''), MAX_TEXT_LENGTH);
  let url = '';
  try {
    url = assertSafeHttpUrl(String(body.url || ''));
  } catch {
    return NextResponse.json({ error: '插件提交的 URL 无效。' }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ error: '页面标题为空，请在网页加载完成后重试。' }, { status: 400 });
  }

  const content = selectedText || pageText;
  if (content.length < 50) {
    return NextResponse.json({ error: '页面正文为空或过短，请选中文本后再发送。' }, { status: 400 });
  }

  const sourceHost = new URL(url).hostname;
  if (action === 'save') {
    const clientRequestId = String(body.clientRequestId || body.requestId || '').trim().slice(0, 100) || `saved-${randomUUID()}`;
    const recentCount = await prisma.savedArticle.count({
      where: { userId: session.userId, createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recentCount >= 10) {
      return NextResponse.json({ error: '保存文章过于频繁，请稍后再试。' }, { status: 429 });
    }
    const existing = await prisma.savedArticle.findUnique({
      where: { userId_clientRequestId: { userId: session.userId, clientRequestId } },
    });
    if (existing) {
      return NextResponse.json({ ok: true, savedId: existing.id, repeated: true, message: '该网页已保存，未重复写入。' });
    }
    const saved = await prisma.savedArticle.create({
      data: {
        userId: session.userId,
        title,
        source: sourceHost || url,
        url,
        content,
        selectedText: selectedText || null,
        clientRequestId,
      },
    });
    return NextResponse.json({
      ok: true,
      savedId: saved.id,
      message: '已保存到观隅，未开始分析，未消耗点数。',
    });
  }

  const job = await createAnalyzeJob(session.userId, {
    title,
    source: sourceHost || url,
    content,
    focus: `来自浏览器插件。原始链接：${url}`,
    sourceUrl: url,
  });
  after(() => runAnalyzeJob(job.id));

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    jobUrl: `/my-audits?jobId=${encodeURIComponent(job.id)}`,
    message: '已开始生成观隅审视报告。',
  });
}
