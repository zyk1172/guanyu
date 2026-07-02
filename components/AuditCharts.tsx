import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EvidenceGrade, MissingPerspectiveMatrixItem, InterestCostMapItem } from '../lib/types';

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
}

const METRIC_HELPERS: Record<string, string> = {
  可信度: '越高表示越可信',
  信息完整度: '越高表示信息越完整',
  叙事倾向性: '越高表示引导性越强',
  证据强度: '越高表示证据越充分',
  推测不确定性: '越高表示越需要补充核验',
};

const GRID_STROKE = 'rgba(148, 163, 184, 0.18)';

const EVIDENCE_COLORS: Record<EvidenceGrade, string> = {
  A: '#059669',
  B: '#0891b2',
  C: '#d97706',
  D: '#ea580c',
  E: '#dc2626',
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
}: AuditChartsProps) {
  const auditMetrics = [
    { name: '可信度', value: credibilityScore, fill: '#4f46e5' },
    { name: '信息完整度', value: completenessScore, fill: '#10b981' },
    { name: '叙事倾向性', value: biasScore, fill: '#f59e0b' },
    { name: '证据强度', value: evidenceScore, fill: '#06b6d4' },
    { name: '推测不确定性', value: riskScore, fill: '#ef4444' },
  ];

  const countsData = [
    { name: '受益者', value: beneficiariesCount, fill: '#10b981' },
    { name: '代价方', value: costBearersCount, fill: '#ef4444' },
    { name: '缺席视角', value: missingPerspectivesCount, fill: '#f59e0b' },
    { name: '替代解释', value: alternativeExplanationsCount, fill: '#8b5cf6' },
  ];

  const evidenceData = (['A', 'B', 'C', 'D', 'E'] as EvidenceGrade[]).map((grade) => ({
    name: `${grade}级`,
    value: evidenceGrades.filter((item) => item === grade).length,
    fill: EVIDENCE_COLORS[grade],
  }));

  const statusData = (['已呈现', '弱呈现', '缺席'] as MissingPerspectiveMatrixItem['status'][]).map((status) => ({
    name: status,
    value: missingPerspectiveStatuses.filter((item) => item === status).length,
    fill: status === '已呈现' ? '#10b981' : status === '弱呈现' ? '#f59e0b' : '#ef4444',
  }));

  const roleData = (['决策者', '受益者', '成本承担者', '沉默者', '中介者'] as InterestCostMapItem['role'][]).map((role) => ({
    role,
    count: interestCostItems.filter((item) => item.role === role).length,
    actors: interestCostItems.filter((item) => item.role === role).slice(0, 3).map((item) => item.actor),
  }));

  return (
    <div data-gsap-reveal className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <ChartCard
        title="核心指数"
        note="评分用于衡量报道结构与证据状态，不等同于判断新闻真假"
      >
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={auditMetrics} layout="vertical" margin={{ top: 6, right: 20, left: 8, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={GRID_STROKE} />
              <XAxis type="number" domain={[0, 100]} fontSize={10} stroke="#888888" tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" fontSize={11} stroke="#666666" width={78} tickLine={false} axisLine={false} />
              <Tooltip content={<MetricTooltip />} cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }} />
              <Bar dataKey="value" radius={[0, 5, 5, 0]} barSize={13} isAnimationActive animationDuration={620}>
                {auditMetrics.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 gap-1.5 text-xxs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
          {Object.entries(METRIC_HELPERS).map(([name, helper]) => (
            <div key={name}><span className="font-bold text-gray-700 dark:text-gray-200">{name}</span>：{helper}</div>
          ))}
        </div>
      </ChartCard>

      <ChartCard title="审视要素数量" note="只统计模型结构化返回的条目">
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={countsData} margin={{ top: 14, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="name" fontSize={11} stroke="#666666" tickLine={false} axisLine={false} />
              <YAxis fontSize={10} stroke="#888888" allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip content={<CountTooltip />} cursor={{ fill: 'rgba(16, 185, 129, 0.05)' }} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={22} isAnimationActive animationDuration={560}>
                {countsData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="证据等级分布" note="A/B 更接近可核验材料，D/E 代表待验证推断">
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evidenceData} margin={{ top: 12, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="name" fontSize={11} stroke="#666666" tickLine={false} axisLine={false} />
              <YAxis fontSize={10} stroke="#888888" allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip content={<CountTooltip />} cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={22} isAnimationActive animationDuration={520}>
                {evidenceData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard title="缺席视角状态" note="展示原文是否覆盖关键观察角度">
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} margin={{ top: 12, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="name" fontSize={11} stroke="#666666" tickLine={false} axisLine={false} />
              <YAxis fontSize={10} stroke="#888888" allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip content={<CountTooltip />} cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={24} isAnimationActive animationDuration={520}>
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="rounded-xl border border-gray-150 bg-white p-4 shadow-sm dark:border-gray-900 dark:bg-gray-950 md:col-span-2">
        <div className="mb-3 flex flex-col gap-1 border-b border-gray-100 pb-2 dark:border-gray-900 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-xs font-black uppercase tracking-wide text-gray-800 dark:text-gray-200">利益—代价关系</h4>
          <span className="text-xxs font-semibold text-gray-400">关系卡片只展示待核验结构，不代表确定事实</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {roleData.map((item) => (
            <div key={item.role} className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-850 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-gray-900 dark:text-white">{item.role}</span>
                <span className="rounded bg-white px-2 py-0.5 text-xxs font-bold text-gray-600 dark:bg-gray-950 dark:text-gray-300">{item.count}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-xxs leading-relaxed text-gray-500 dark:text-gray-400">
                {item.actors.length > 0 ? item.actors.join('、') : '暂无结构化条目'}
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

function MetricTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-white shadow-sm">
      <div className="font-bold">{label}</div>
      <div className="mt-1 text-gray-200">分值：{payload[0].value}</div>
      <div className="mt-1 max-w-48 text-xxs text-gray-400">{METRIC_HELPERS[label] || '用于辅助阅读报告结构。'}</div>
    </div>
  );
}

function CountTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-white shadow-sm">
      <div className="font-bold">{label}</div>
      <div className="mt-1 text-gray-200">数量：{payload[0].value}</div>
    </div>
  );
}
