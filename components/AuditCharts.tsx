import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EvidenceGrade, MissingPerspectiveMatrixItem, InterestCostMapItem } from '../lib/types';
import { getReportText } from '../lib/report-display-core.mjs';

interface AuditChartsProps {
  credibilityScore: number;
  completenessScore: number;
  biasScore: number;
  evidenceScore: number;
  riskScore: number;
  beneficiariesCount: number;
  costBearersCount: number;
  missingPerspectivesCount: number;
  alternativeExplanationsCount: number;
  evidenceGrades?: EvidenceGrade[];
  missingPerspectiveStatuses?: MissingPerspectiveMatrixItem['status'][];
  interestCostItems?: InterestCostMapItem[];
  reportLanguage?: string;
}

const COLORS = {
  default: 'var(--color-chart-default)',
  muted: 'var(--color-text-subtle)',
  warning: 'var(--color-chart-warning)',
  risk: 'var(--color-chart-risk)',
  positive: 'var(--color-chart-positive)',
  blue: 'var(--color-info)',
  deepBlue: 'var(--color-link)',
};

const GRID_STROKE = 'color-mix(in srgb, var(--color-border) 55%, transparent)';
const AXIS_STROKE = 'var(--color-text-subtle)';
const TOOLTIP_CURSOR = 'color-mix(in srgb, var(--color-chart-default) 10%, transparent)';

const EVIDENCE_COLORS: Record<EvidenceGrade, string> = {
  A: COLORS.positive,
  B: COLORS.blue,
  C: COLORS.default,
  D: COLORS.warning,
  E: COLORS.risk,
};

export default function AuditCharts({
  credibilityScore,
  completenessScore,
  biasScore,
  evidenceScore,
  riskScore,
  beneficiariesCount,
  costBearersCount,
  missingPerspectivesCount,
  alternativeExplanationsCount,
  evidenceGrades = [],
  missingPerspectiveStatuses = [],
  interestCostItems = [],
  reportLanguage = 'zh-CN',
}: AuditChartsProps) {
  const text = (key: string) => getReportText(key, reportLanguage);
  const auditMetrics = [
    { name: text('credibility'), value: credibilityScore, fill: COLORS.default },
    { name: text('informationCompleteness'), value: completenessScore, fill: COLORS.default },
    { name: text('evidenceStrength'), value: evidenceScore, fill: COLORS.default },
    { name: text('narrativeBias'), value: biasScore, fill: COLORS.warning },
    { name: text('speculationUncertainty'), value: riskScore, fill: COLORS.risk },
  ];

  const rawCountsData = [
    { name: text('beneficiaries'), value: beneficiariesCount },
    { name: text('costBearers'), value: costBearersCount },
    { name: text('missingPerspectives'), value: missingPerspectivesCount },
    { name: text('alternativeExplanations'), value: alternativeExplanationsCount },
  ];
  const maxCount = Math.max(...rawCountsData.map((item) => item.value));
  const shouldHighlightCount = rawCountsData.filter((item) => item.value === maxCount).length === 1 && maxCount > 0;
  const countsData = rawCountsData.map((item) => ({
    ...item,
    fill: shouldHighlightCount && item.value === maxCount ? COLORS.warning : COLORS.default,
  }));

  const evidenceData = (['A', 'B', 'C', 'D', 'E'] as EvidenceGrade[]).map((grade) => ({
    name: !reportLanguage.startsWith('zh-') ? `Evidence ${grade}` : `${grade}级`,
    value: evidenceGrades.filter((item) => item === grade).length,
    fill: EVIDENCE_COLORS[grade],
  }));

  const statusData = ([
    { value: '已呈现', label: text('present') },
    { value: '弱呈现', label: text('weak') },
    { value: '缺席', label: text('missing') },
  ] as const).map(({ value, label }) => ({
    name: label,
    value: missingPerspectiveStatuses.filter((item) => item === value).length,
    fill: value === '已呈现' ? COLORS.positive : value === '弱呈现' ? COLORS.warning : COLORS.risk,
  }));

  const roleData = ([
    { value: '决策者', label: text('decisionMaker') },
    { value: '受益者', label: text('beneficiaries') },
    { value: '成本承担者', label: text('costBearers') },
    { value: '沉默者', label: text('silentParty') },
    { value: '中介者', label: text('intermediary') },
  ] as const).map(({ value, label }) => ({
    role: label,
    count: interestCostItems.filter((item) => item.role === value).length,
    actors: interestCostItems.filter((item) => item.role === value).slice(0, 3).map((item) => item.actor),
  }));

  return (
    <div data-gsap-reveal className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <ChartCard
        title={text('chartCoreMetrics')}
        note={text('chartStructureScore')}
      >
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={auditMetrics} layout="vertical" margin={{ top: 6, right: 20, left: 8, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis dataKey="name" type="category" fontSize={11} stroke={AXIS_STROKE} width={86} tickLine={false} axisLine={false} />
              <Tooltip content={<MetricTooltip reportLanguage={reportLanguage} />} cursor={{ fill: TOOLTIP_CURSOR }} />
              <Bar dataKey="value" radius={[0, 5, 5, 0]} barSize={13} isAnimationActive animationDuration={620}>
                {auditMetrics.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
                <LabelList dataKey="value" position="right" className="fill-gray-500 text-[10px] font-bold" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xxs font-semibold text-gray-400">{text('scoreDisclaimer')}</p>
      </ChartCard>

      <ChartCard title={text('chartElementCounts')} note={text('chartCoverage')}>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={countsData} margin={{ top: 14, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="name" fontSize={11} stroke={AXIS_STROKE} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} stroke={AXIS_STROKE} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip content={<CountTooltip reportLanguage={reportLanguage} />} cursor={{ fill: TOOLTIP_CURSOR }} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={22} isAnimationActive animationDuration={560}>
                {countsData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
                <LabelList dataKey="value" position="top" className="fill-gray-500 text-[10px] font-bold" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title={text('chartEvidenceDistribution')} note={text('chartEvidenceNote')}>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evidenceData} margin={{ top: 12, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="name" fontSize={11} stroke={AXIS_STROKE} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} stroke={AXIS_STROKE} allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip content={<CountTooltip reportLanguage={reportLanguage} />} cursor={{ fill: TOOLTIP_CURSOR }} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={22} isAnimationActive animationDuration={520}>
                {evidenceData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
                <LabelList dataKey="value" position="top" className="fill-gray-500 text-[10px] font-bold" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title={text('chartMissingStatus')} note={text('chartCoverageLevel')}>
        <div className="grid grid-cols-3 gap-2">
          {statusData.map((item) => (
            <div key={item.name} className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center dark:border-gray-850 dark:bg-gray-900">
              <div className="mx-auto mb-2 h-1.5 w-8 rounded-full" style={{ backgroundColor: item.fill }} />
              <div className="text-lg font-black text-gray-950 dark:text-white">{item.value}</div>
              <div className="mt-1 text-xxs font-bold text-gray-500">{item.name}</div>
            </div>
          ))}
        </div>
      </ChartCard>

      <div className="rounded-xl border border-gray-150 bg-white p-4 shadow-sm dark:border-gray-900 dark:bg-gray-950 md:col-span-2">
        <div className="mb-3 flex flex-col gap-1 border-b border-gray-100 pb-2 dark:border-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-xs font-black uppercase tracking-wide text-gray-800 dark:text-gray-200">{text('chartInterestCost')}</h4>
          <span className="text-xxs font-semibold text-gray-400">{text('chartInterestCostNote')}</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {roleData.map((item) => (
            <div key={item.role} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-gray-900 dark:text-white">{item.role}</span>
                <span className="rounded bg-white px-2 py-0.5 text-xxs font-bold text-gray-600 dark:bg-gray-950 dark:text-gray-300">{item.count}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-xxs leading-relaxed text-gray-500 dark:text-gray-400">
                {item.actors.length > 0 ? item.actors.join(!reportLanguage.startsWith('zh-') ? ', ' : '、') : text('noItems')}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-150 bg-white p-4 shadow-sm dark:border-gray-900 dark:bg-gray-950">
      <div className="mb-3 flex flex-col gap-1 border-b border-gray-100 pb-2 dark:border-gray-900 sm:flex-row sm:items-center sm:justify-between">
        <h4 className="text-xs font-black uppercase tracking-wide text-gray-800 dark:text-gray-200">{title}</h4>
        <span className="text-xxs font-semibold text-gray-400">{note}</span>
      </div>
      {children}
    </div>
  );
}

function MetricTooltip({ active, payload, label, reportLanguage = 'zh-CN' }: any) {
  if (!active || !payload?.length) return null;
  const text = (key: string) => getReportText(key, reportLanguage);
  const helper = label === text('credibility')
    ? text('scoreHelpCredibility')
    : label === text('informationCompleteness')
      ? text('scoreHelpCompleteness')
      : label === text('evidenceStrength')
        ? text('scoreHelpEvidence')
        : label === text('narrativeBias')
          ? text('scoreHelpBias')
          : text('scoreHelpRisk');
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)] shadow-sm">
      <div className="font-bold">{label}</div>
      <div className="mt-1 text-[var(--color-text-muted)]">{payload[0].value}/100</div>
      <div className="mt-1 max-w-48 text-xxs text-[var(--color-text-muted)]">{helper}</div>
    </div>
  );
}

function CountTooltip({ active, payload, label, reportLanguage = 'zh-CN' }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text)] shadow-sm">
      <div className="font-bold">{label}</div>
      <div className="mt-1 text-[var(--color-text-muted)]">{!reportLanguage.startsWith('zh-') ? `${payload[0].value} items` : `${payload[0].value} 项`}</div>
    </div>
  );
}
