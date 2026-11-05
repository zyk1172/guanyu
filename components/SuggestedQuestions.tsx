'use client';

import { ArrowRight } from 'lucide-react';
import { useId } from 'react';
import { getReportEmphasisRuns } from '@/lib/report-emphasis';
import { Button } from '@/components/ui/controls';
import { useUiLanguage } from './LanguageProvider';
import ReportText from './ReportText';

export type QuestionAction = { ask: (question: string) => void; disabled: boolean; loading: boolean; cost: string; error: string };

export default function SuggestedQuestions({ questions, action, columns = 2 }: { questions: string[]; action?: QuestionAction; columns?: 2 | 3 }) {
  const { t } = useUiLanguage();
  const descriptionId = useId();
  return <>
    {action && questions.length > 0 && <p id={descriptionId} role={action.error ? 'alert' : action.loading ? 'status' : undefined} className="mb-3 text-xs text-[var(--color-text-muted)]">
      {action.loading ? t('qa.loadingPrice') : action.error || t('qa.suggestedHint', undefined, { cost: action.cost })}
    </p>}
    <ul className={`grid grid-cols-1 gap-2 ${columns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
      {questions.map((question, index) => {
        const plain = getReportEmphasisRuns(question).map(run => run.text).join('').trim();
        return <li key={`${question}-${index}`} className={action ? 'flex min-w-0' : 'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs font-semibold leading-relaxed text-[var(--color-text)]'}>
          {action ? <Button variant="choice" className="w-full" onClick={() => action.ask(plain)} disabled={action.disabled || !plain || plain.length > 2000} aria-describedby={descriptionId} aria-label={t('qa.askQuestion', undefined, { question: plain })} title={plain.length > 2000 ? t('qa.questionTooLong') : undefined}>
            <span className="flex items-start justify-between gap-3"><span className="min-w-0 flex-1"><ReportText>{question}</ReportText></span><ArrowRight aria-hidden="true" /></span>
          </Button> : <ReportText>{question}</ReportText>}
        </li>;
      })}
    </ul>
  </>;
}
