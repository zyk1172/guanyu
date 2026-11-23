import { getReportEmphasisRuns } from '@/lib/report-emphasis';
import { createContext, useContext } from 'react';

export const ReportEmphasisContext = createContext<readonly string[]>([]);

export default function ReportText({ children }: { children: string | number | null | undefined }) {
  const phrases = useContext(ReportEmphasisContext);
  return <>{getReportEmphasisRuns(String(children ?? ''), phrases).map((run, index) => run.bold
    ? <strong key={index} className="font-bold text-[var(--color-text)]">{run.text}</strong>
    : run.text)}</>;
}
