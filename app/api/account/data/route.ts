import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { exportUserData } from '@/lib/privacy';
import { verifyStepUp } from '@/lib/step-up';
import { assertSameOrigin, assertSecureAccountTransport } from '@/lib/request-security';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  try {
    assertSameOrigin(request);
    assertSecureAccountTransport(request);
    const body = await request.json().catch(() => ({}));
    const confirmed = await verifyStepUp(user.id, { password: body.password, emailCode: body.emailCode });
    if (!confirmed) return NextResponse.json({ error: '需要输入当前密码或邮箱验证码。' }, { status: 400 });
    const data = await exportUserData(user.id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: '导出数据失败，请稍后重试。' }, { status: 500 });
  }
}
