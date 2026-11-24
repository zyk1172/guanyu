import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import { ButtonLink, Panel } from '@/components/ui/controls';
import { getCurrentUser } from '@/lib/auth';
import { getSuperAdminStatus } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { formatEmailCategory } from '@/lib/account-display';

const deliveryStatus: Record<string, string> = {
  pending: '待发送',
  sending: '正在提交',
  accepted: '发信服务商已接受',
  delivered: '收件服务器已接受',
  temporary_failure: '临时失败',
  failed: '提交失败',
  unknown: '状态未知',
  bounced: '退信',
};

export default async function MailPage() {
  const request = new Request(process.env.NEXTAUTH_URL || 'http://localhost:3000', { headers: await headers() });
  const user = await getCurrentUser(request);
  if (!user) redirect('/login');
  if (!await getSuperAdminStatus(user.id)) notFound();
  const deliveries = await prisma.emailDelivery.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
    select: {
      id: true, recipient: true, status: true, category: true, provider: true, createdAt: true,
      attempts: true, error: true, providerRequestId: true, providerMessageId: true,
    },
  });

  return <main className="workspace-page pb-12">
    <Header />
    <div id="main-content" tabIndex={-1} className="workspace-container workspace-content space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="ui-page-title">邮件投递记录</h1>
        <ButtonLink href="/account">账户管理</ButtonLink>
      </div>
      {deliveries.length === 0 && <p>暂无邮件投递记录。</p>}
      {deliveries.map(item => <Panel key={item.id} className="space-y-1">
        <h2 className="ui-panel-title">{formatEmailCategory(item.category, 'zh-CN')} · {deliveryStatus[item.status] || '状态未知'}</h2>
        <p>{item.recipient.replace(/^(.).*(@.*)$/, '$1•••$2')} · {item.provider || '未选通道'} · {item.attempts} 次</p>
        <time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time>
        {item.providerRequestId && <p className="break-all">Request ID {item.providerRequestId}</p>}
        {item.providerMessageId && <p className="break-all">Message ID {item.providerMessageId}</p>}
        {item.error && <p>{item.error}</p>}
      </Panel>)}
    </div>
  </main>;
}
