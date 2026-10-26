import { getReportEmphasisRuns } from '@/lib/report-emphasis';

export default function ReportText({ children }: { children: string | number | null | undefined }) {
  return <>{getReportEmphasisRuns(String(children ?? '')).map((run, index) => run.bold
    ? <strong key={index} className="font-extrabold text-[var(--color-text)]">{run.text}</strong>
    : run.text)}</>;
}
