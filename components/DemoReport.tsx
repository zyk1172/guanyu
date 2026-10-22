'use client';
import Link from 'next/link';
import Header from './Header';
import AnalysisResultView from './AnalysisResult';
import { useUiLanguage } from './LanguageProvider';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import { getDemoReport } from '@/lib/demo-report';

export default function DemoReport() {
  const { language } = useUiLanguage();
  const c = getWorkspaceCopy(language);
  const zh = language.startsWith('zh');
  const { report, originalContent } = getDemoReport(language);
  return <main className="workspace-page"><Header /><div className="reading-container">
    <section className="reading-heading">
      <Link href="/" className="workspace-link mb-3">{zh ? '首页' : 'Home'}</Link>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl"><h1>{report.meta.title}</h1><p className="mt-3 text-sm">{zh ? '无需注册、密钥或点数。这是一份静态虚构教学示例；分数仅演示界面，不代表真实新闻测量。' : 'No account, key or credits required. This is a static fictional teaching example; scores illustrate the interface, not measurements of real news.'}</p></div>
        <Link href="/#analysis" className="workspace-button workspace-primary">{c.own}</Link>
      </div>
    </section>
    <AnalysisResultView key={report.meta.reportLanguage} result={report} originalContent={originalContent} />
  </div></main>;
}
