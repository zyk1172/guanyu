import { NextResponse } from 'next/server';
import { authenticateExtensionRequest } from '@/lib/extension-auth';

const MAX_TEXT_LENGTH = 30_000;
const MAX_SELECTED_LENGTH = 20_000;

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
  const action = String(body.action || 'save');
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

  if (action === 'analyze') {
    return NextResponse.json(
      {
        error: '插件立即审视需要复用完整报告生成流水线，当前版本请先打开观隅 Web App 后创建审视。',
        openUrl: '/',
      },
      { status: 501 }
    );
  }

  return NextResponse.json({
    ok: true,
    savedUrl: `/my-audits?importTitle=${encodeURIComponent(title)}&sourceUrl=${encodeURIComponent(url)}`,
    message: '内容已通过插件读取。当前版本请打开观隅后粘贴正文创建审视。',
  });
}
