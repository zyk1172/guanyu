import { NextResponse } from 'next/server';
import { authenticateExtensionRequest } from '@/lib/extension-auth';
import { POST as analyzeNews } from '@/app/api/analyze/route';

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
    const internalSecret = process.env.INTERNAL_API_SECRET || process.env.NEXTAUTH_SECRET;
    if (!internalSecret) {
      return NextResponse.json({ error: '服务端内部审视通道未配置，请联系管理员。' }, { status: 500 });
    }

    const sourceHost = new URL(url).hostname;
    const analyzeRequest = new Request(request.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guanyu-internal-auth': internalSecret,
        'x-guanyu-internal-user-id': session.userId,
        'x-guanyu-force-save': 'true',
      },
      body: JSON.stringify({
        title,
        source: sourceHost || url,
        content,
        focus: `来自浏览器插件。原始链接：${url}`,
      }),
    });

    const analyzeResponse = await analyzeNews(analyzeRequest);
    const analyzeData = await analyzeResponse.json().catch(() => ({}));
    if (!analyzeResponse.ok) {
      return NextResponse.json(
        { error: analyzeData.error || '插件发送后生成审视报告失败，请稍后重试。' },
        { status: analyzeResponse.status || 500 }
      );
    }

    if (!analyzeData.auditId) {
      return NextResponse.json({ error: '审视已生成但没有保存详情页，请检查账号保存设置或稍后重试。' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reportId: analyzeData.auditId,
      reportUrl: `/audits/${analyzeData.auditId}`,
      message: '已生成观隅审视报告。',
    });
  }

  return NextResponse.json({
    ok: true,
    savedUrl: `/my-audits?importTitle=${encodeURIComponent(title)}&sourceUrl=${encodeURIComponent(url)}`,
    message: '内容已通过插件读取。当前版本请打开观隅后粘贴正文创建审视。',
  });
}
