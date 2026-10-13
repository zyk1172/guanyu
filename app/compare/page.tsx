import type { Metadata } from 'next';
import ComparisonWorkbench from '@/components/ComparisonWorkbench';

export const metadata: Metadata = { title: '多报道对比', robots: { index: false, follow: false } };
export default function ComparisonPage() { return <ComparisonWorkbench />; }
