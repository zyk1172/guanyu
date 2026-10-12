import type { Metadata } from 'next';
import DemoReport from '@/components/DemoReport';

export const metadata: Metadata = { title: '示例审读', robots: { index: false, follow: true } };
export default function DemoPage() { return <DemoReport />; }
