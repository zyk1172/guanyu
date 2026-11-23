'use client';

import { ButtonLink } from '@/components/ui/controls';
import { getDemoReport } from '@/lib/demo-report';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import AnalysisResultView from './AnalysisResult';
import Header from './Header';
import { useUiLanguage } from './LanguageProvider';

export default function DemoReport() {
  const { language } = useUiLanguage();
  const c = getWorkspaceCopy(language);
  const zh = language.startsWith('zh');
  const { report, originalContent } = getDemoReport(language);
  return <main className="workspace-page"><Header /><div id="main-content" tabIndex={-1} className="reading-container">
    <section className="reading-heading">
      <ButtonLink variant="ghost" href="/" className="mb-3">{zh ? '首页' : 'Home'}</ButtonLink>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl"><h1>{report.meta.title}</h1><p className="mt-3 text-sm">{zh ? '无需注册、密钥或点数。这是一份静态虚构教学示例；分数仅演示界面，不代表真实新闻测量。' : 'No account, key or credits required. This is a static fictional teaching example; scores illustrate the interface, not measurements of real news.'}</p></div>
        <ButtonLink variant="primary" href="/#analysis">{c.own}</ButtonLink>
      </div>
    </section>
    <AnalysisResultView key={report.meta.reportLanguage} result={report} originalContent={originalContent} />
  </div></main>;
}
