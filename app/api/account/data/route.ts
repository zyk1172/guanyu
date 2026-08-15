import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { exportUserData } from '@/lib/privacy';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: '请先登录。' }, { status: 401 });
  try {
    const data = await exportUserData(user.id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: '导出数据失败，请稍后重试。' }, { status: 500 });
  }
}
