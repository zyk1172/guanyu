'use client';
import Link from 'next/link';
import Header from './Header';
import AnalysisResultView from './AnalysisResult';
import { useUiLanguage } from './LanguageProvider';
import { getDemoReport } from '@/lib/demo-report';

export default function DemoReport() {
  const { language } = useUiLanguage();
  const zh = language.startsWith('zh');
  const { report, originalContent } = getDemoReport(language);
  return <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]"><Header /><div className="mx-auto max-w-6xl space-y-4 px-3 py-5 sm:px-4">
    <section className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4"><h1 className="text-xl font-black">{report.meta.title}</h1><p className="mt-2 text-sm leading-relaxed">{zh ? '无需注册、密钥或点数。这是一份静态虚构教学示例；分数仅演示界面，不代表真实新闻测量。查看结论、证据与核验路径后，可开始审读自己的材料。' : 'No account, key or credits required. This is a static fictional teaching case; scores illustrate the interface, not measurements of real news. Explore conclusions, evidence and verification steps before reviewing your own material.'}</p><Link href="/" className="mt-3 inline-block rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">{zh ? '开始审读自己的材料' : 'Review your own material'}</Link></section>
    <AnalysisResultView key={report.meta.reportLanguage} result={report} originalContent={originalContent} />
  </div></main>;
}
