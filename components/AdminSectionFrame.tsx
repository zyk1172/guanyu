'use client';

import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';
import { ButtonLink } from '@/components/ui/controls';

const titles = {
  models: ['平台模型管理', 'Platform models'],
  search: ['搜索设置', 'Search settings'],
  traffic: ['访问统计', 'Site traffic'],
  mail: ['邮件投递记录', 'Email delivery records'],
  audits: ['全站报告管理', 'Site reports'],
} as const;

export function AdminSectionHeader({ section }: { section: keyof typeof titles }) {
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  return <header className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
    <h1 className="ui-page-title self-center [overflow-wrap:anywhere]">{titles[section][zh ? 0 : 1]}</h1>
    <ButtonLink href="/admin">
      <ArrowLeft aria-hidden="true" />
      {zh ? '返回系统管理' : 'Back to system management'}
    </ButtonLink>
  </header>;
}

export default function AdminSectionFrame({ section, children }: { section: keyof typeof titles; children: ReactNode }) {
  return <main className="workspace-page pb-12">
    <Header />
    <div id="main-content" tabIndex={-1} className="workspace-container workspace-content space-y-4">
      <AdminSectionHeader section={section} />
      {children}
    </div>
  </main>;
}
