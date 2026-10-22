import type { ReadWorthLabel } from '../lib/types';
import { getReportText } from '../lib/report-display-core.mjs';

interface ReadWorthVerdictProps {
  label: ReadWorthLabel;
  displayLabel?: string;
  reportLanguage?: string;
}

export default function ReadWorthVerdict({ label, displayLabel, reportLanguage = 'zh-CN' }: ReadWorthVerdictProps) {
  const labelText = displayLabel || label;
  return <div aria-label={`${getReportText('readingValue', reportLanguage)}: ${labelText}`} className="flex min-h-28 items-center justify-center rounded-lg border-l-4 border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-5 py-6 text-center">
    <span className="text-2xl font-bold leading-relaxed text-[var(--color-text)]">{labelText}</span>
  </div>;
}
