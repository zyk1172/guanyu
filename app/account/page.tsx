'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Header from '@/components/Header';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  THINKING_DEPTH_OPTIONS,
  getReportLanguageLabel,
  getThinkingDepthLabel,
  normalizeThinkingDepthValue,
  REPORT_LANGUAGE_OPTIONS,
  ReportLanguage,
  normalizeReportLanguage,
} from '@/lib/types';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useUiLanguage } from '@/components/LanguageProvider';

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { language, t } = useUiLanguage();

  const [activeTab, setActiveTab] = useState<'info' | 'settings' | 'history'>('info');

  // 模型与偏好设置
  const [modelName, setModelName] = useState('gpt-4o');
  const [llmBaseUrl, setLlmBaseUrl] = useState('https://api.openai.com/v1');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [hasLlmApiKey, setHasLlmApiKey] = useState(false);
  const [enableTavilySearch, setEnableTavilySearch] = useState(false);
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [hasTavilyApiKey, setHasTavilyApiKey] = useState(false);
  const [tavilySearchDepth, setTavilySearchDepth] = useState('basic');
  const [enableSerperSearch, setEnableSerperSearch] = useState(false);
  const [serperApiKey, setSerperApiKey] = useState('');
  const [hasSerperApiKey, setHasSerperApiKey] = useState(false);
  const [reasoningDepth, setReasoningDepth] = useState('medium');
  const [reportLanguage, setReportLanguage] = useState<ReportLanguage>('zh-CN');
  const [isPublic, setIsPublic] = useState(true);
  const [saveResult, setSaveResult] = useState(true);
  const [enableCharts, setEnableCharts] = useState(true);

  const [myAudits, setMyAudits] = useState<any[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showAllAudits, setShowAllAudits] = useState(false);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [isFetchingAudits, setIsFetchingAudits] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsSettingsMessage] = useState<string | null>(null);
  const [billing, setBilling] = useState<any>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [paymentNote, setPaymentNote] = useState('');
  const [adminBilling, setAdminBilling] = useState<any>(null);
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [adminUserMessage, setAdminUserMessage] = useState<string | null>(null);
  const [adminEmailDraft, setAdminEmailDraft] = useState<Record<string, string>>({});
  const [adminGrantDraft, setAdminGrantDraft] = useState<Record<string, string>>({});
  const [canUseOwnApi, setCanUseOwnApi] = useState(false);
  const [selectedPackageType, setSelectedPackageType] = useState<'points_30' | 'byok_lifetime'>('points_30');
  const hasByokPlan = billing?.planType === 'byok';

  // 1. 登录路由守卫
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchMyAudits = useCallback(async () => {
    setIsFetchingAudits(true);
    try {
      const res = await fetch(showAllAudits ? '/api/audits/admin' : '/api/audits/my');
      if (res.ok) {
        const data = await res.json();
        setMyAudits(data);
      }
    } catch (err) {
      console.error('获取我的审视历史失败:', err);
    } finally {
      setIsFetchingAudits(false);
    }
  }, [showAllAudits]);

  const fetchBilling = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/status');
      if (res.ok) setBilling(await res.json());
    } catch (err) {
      console.error('获取额度信息失败:', err);
    }
  }, []);

  const fetchAdminBilling = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/admin');
      if (res.ok) setAdminBilling(await res.json());
    } catch (err) {
      console.error('获取管理员计费信息失败:', err);
    }
  }, []);

  // 2. 加载设置与审视记录
  useEffect(() => {
    if (session) {
      // 获取用户偏好设置
      fetch('/api/account/settings')
        .then((res) => res.json())
        .then((data) => {
          if (data && !data.error) {
            setModelName(data.defaultModelName);
            setLlmBaseUrl(data.llmBaseUrl || 'https://api.openai.com/v1');
            setHasLlmApiKey(Boolean(data.hasLlmApiKey));
            setEnableTavilySearch(Boolean(data.enableTavilySearch));
            setHasTavilyApiKey(Boolean(data.hasTavilyApiKey));
            setTavilySearchDepth(data.tavilySearchDepth || 'basic');
            setEnableSerperSearch(Boolean(data.enableSerperSearch));
            setHasSerperApiKey(Boolean(data.hasSerperApiKey));
            setReasoningDepth(normalizeThinkingDepthValue(data.defaultReasoningDepth));
            setReportLanguage(normalizeReportLanguage(data.defaultReportLanguage));
            setIsPublic(data.defaultIsPublic);
            setSaveResult(data.defaultSaveResult);
            setEnableCharts(data.defaultEnableCharts);
            setAccountCreatedAt(data.account?.createdAt || null);
            setIsSuperAdmin(Boolean(data.isSuperAdmin));
            setCanUseOwnApi(Boolean(data.canUseOwnApi));
          }
        });

      // 获取当前用户审视记录
      fetchMyAudits();
      fetchBilling();
    }
  }, [session, fetchMyAudits, fetchBilling]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAdminBilling();
    }
  }, [isSuperAdmin, fetchAdminBilling]);

  useEffect(() => {
    if (session && activeTab === 'history') {
      fetchMyAudits();
    }
  }, [session, activeTab, fetchMyAudits]);

  useEffect(() => {
    if (hasByokPlan && selectedPackageType === 'byok_lifetime') {
      setSelectedPackageType('points_30');
    }
  }, [hasByokPlan, selectedPackageType]);

  // 3. 保存设置逻辑
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSettingsMessage(null);

    try {
      const res = await fetch('/api/account/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultModelName: modelName.trim(),
          llmBaseUrl: llmBaseUrl.trim(),
          llmApiKey: llmApiKey.trim(),
          enableTavilySearch,
          tavilyApiKey: tavilyApiKey.trim(),
          tavilySearchDepth,
          enableSerperSearch,
          serperApiKey: serperApiKey.trim(),
          defaultReasoningDepth: reasoningDepth,
          defaultReportLanguage: reportLanguage,
          defaultIsPublic: isPublic,
          defaultSaveResult: saveResult,
          defaultEnableCharts: enableCharts,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLlmApiKey('');
        setTavilyApiKey('');
        setSerperApiKey('');
        setHasLlmApiKey(Boolean(data.hasLlmApiKey));
        setHasTavilyApiKey(Boolean(data.hasTavilyApiKey));
        setHasSerperApiKey(Boolean(data.hasSerperApiKey));
        setEnableTavilySearch(Boolean(data.enableTavilySearch));
        setEnableSerperSearch(Boolean(data.enableSerperSearch));
        setTavilySearchDepth(data.tavilySearchDepth || 'basic');
        setCanUseOwnApi(Boolean(data.canUseOwnApi));
        setSettingsSettingsMessage('✅ 设置已成功保存并同步！');
        setTimeout(() => setSettingsSettingsMessage(null), 3000);
      } else {
        setSettingsSettingsMessage(`❌ 保存失败: ${data.error}`);
      }
    } catch {
      setSettingsSettingsMessage('❌ 发生异常，请检查网络');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCreateOrder = async () => {
    setBillingMessage(null);
    if (hasByokPlan && selectedPackageType === 'byok_lifetime') {
      setBillingMessage('你已经是买断账号，无需重复购买。');
      return;
    }
    try {
      const res = await fetch('/api/billing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageType: selectedPackageType, paymentNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBillingMessage(data.error || '创建订单失败');
        return;
      }
      setPaymentNote('');
      setBillingMessage(`订单已创建：${data.id}。付款后等待管理员确认。`);
      await fetchBilling();
    } catch {
      setBillingMessage('创建订单失败，请稍后重试。');
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    try {
      const res = await fetch('/api/billing/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirmOrder', orderId }),
      });
      if (res.ok) {
        await fetchAdminBilling();
        await fetchBilling();
      }
    } catch (err) {
      console.error('确认订单失败:', err);
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    if (!window.confirm('确定取消这笔待确认订单吗？')) return;
    try {
      const res = await fetch('/api/billing/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rejectOrder', orderId, adminNote: '管理员取消订单' }),
      });
      if (res.ok) {
        await fetchAdminBilling();
        await fetchBilling();
      }
    } catch (err) {
      console.error('取消订单失败:', err);
    }
  };

  const handleAdminUserAction = async (action: string, payload: Record<string, any>) => {
    setAdminUserMessage(null);
    try {
      const res = await fetch('/api/billing/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdminUserMessage(data.error || '管理员操作失败。');
        return false;
      }
      await fetchAdminBilling();
      await fetchBilling();
      setAdminUserMessage('操作已完成。');
      return true;
    } catch {
      setAdminUserMessage('管理员操作失败，请稍后重试。');
      return false;
    }
  };

  const exportUsersCsv = () => {
    const users = adminBilling?.users || [];
    const rows: Array<Array<string | number>> = [
      ['邮箱', '用户ID', '角色', '封禁', '套餐', '点数', '免费已用', '报告数', '订单数', '注册时间'],
      ...users.map((user: any) => [
        user.email,
        user.id,
        user.role,
        user.isBanned ? '已封禁' : '正常',
        user.planType === 'byok' ? '已解锁高级功能' : user.planType,
        ((user.creditBalanceCents || user.creditBalance * 100 || 0) / 100).toFixed(1),
        user.freeQuotaUsed,
        user._count?.audits || 0,
        user._count?.purchaseOrders || 0,
        new Date(user.createdAt).toLocaleString(),
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guanyu-users-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 4. 修改单个审视记录公开状态
  const toggleAuditPublic = async (id: string, currentPublic: boolean) => {
    try {
      const res = await fetch(`/api/audits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !currentPublic }),
      });
      if (res.ok) {
        setMyAudits((prev) =>
          prev.map((audit) =>
            audit.id === id ? { ...audit, isPublic: !currentPublic } : audit
          )
        );
      }
    } catch (err) {
      console.error('修改公开状态失败:', err);
    }
  };

  // 5. 删除审视记录
  const handleDeleteAudit = async (id: string) => {
    if (!window.confirm('确定要永久删除此条审视记录吗？此操作无法撤销。')) return;

    try {
      const res = await fetch(`/api/audits/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setMyAudits((prev) => prev.filter((audit) => audit.id !== id));
      }
    } catch (err) {
      console.error('删除审视失败:', err);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black flex items-center justify-center">
        <div className="text-sm font-semibold text-gray-500 animate-pulse">{t('account.loading')}</div>
      </div>
    );
  }

  const getDepthLabel = getThinkingDepthLabel;
  const apiSettingsLocked = !canUseOwnApi;

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'quick': return '历史快速分析';
      case 'deep': return '观隅分析';
      default: return mode;
    }
  };
  const adminUsers = (adminBilling?.users || []).filter((user: any) => {
    const keyword = adminUserSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [user.email, user.id, user.name, user.role, user.planType]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black font-sans text-gray-900 dark:text-gray-100 selection:bg-indigo-500/20 pb-12">
      <Header />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-150 dark:border-gray-900 pb-4">
          <div>
            <h2 className="text-lg font-black text-gray-950 dark:text-white leading-tight">{t('account.title')}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-gray-900 p-0.5 rounded-lg border border-gray-150 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'info' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t('account.infoTab')}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'settings' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t('account.settingsTab')}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'history' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t('account.historyTab')}
            </button>
          </div>
          <Link href="/account/extensions" className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 transition hover:bg-white dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
            {t('account.extensions')}
          </Link>
          </div>
        </div>

        {/* 1. 基本信息面板 */}
        {activeTab === 'info' && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-900 pb-2 flex items-center gap-1.5">
              <span>{t('account.infoTab')}</span>
            </h3>
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">{t('account.email')}</span>
                <span className="font-bold text-gray-900 dark:text-white">{session?.user?.email}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">{t('account.userId')}</span>
                <span className="font-mono text-gray-600 dark:text-gray-300">{session?.user ? (session.user as any).id : t('common.unknown')}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">{t('account.joined')}</span>
                <span className="font-bold text-gray-900 dark:text-white">{accountCreatedAt ? new Date(accountCreatedAt).toLocaleString(language) : t('common.unknown')}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">{t('account.status')}</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">🟢 {t('account.online')}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">{t('account.role')}</span>
                <span className={isSuperAdmin ? 'font-bold text-amber-600 dark:text-amber-300' : 'font-bold text-gray-600 dark:text-gray-300'}>
                  {isSuperAdmin ? t('account.superAdmin') : t('account.user')}
                </span>
              </div>
            </div>
            {isSuperAdmin && adminBilling && (
              <div className="mt-5 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-black text-[var(--color-text)]">超级管理员 · 注册用户管理</h4>
                    <p className="mt-1 text-xxs font-semibold text-[var(--color-text-muted)]">
                      搜索用户、导出注册信息、查看最近活动、加点、解锁高级功能、封禁、删除账号和发送邮件。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportUsersCsv}
                    className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xxs font-black text-white transition hover:bg-[var(--color-primary-hover)]"
                  >
                    导出 CSV
                  </button>
                </div>
                <input
                  value={adminUserSearch}
                  onChange={(event) => setAdminUserSearch(event.target.value)}
                  placeholder="搜索邮箱、用户 ID、套餐或角色..."
                  className="mt-3 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                />
                {adminUserMessage && (
                  <p className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-bold text-[var(--color-link)]">
                    {adminUserMessage}
                  </p>
                )}
                <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {adminUsers.map((user: any) => {
                    const credit = ((user.creditBalanceCents || user.creditBalance * 100 || 0) / 100).toFixed(1);
                    const activities = [
                      ...(user.audits || []).map((audit: any) => ({ type: '报告', text: audit.title, date: audit.createdAt })),
                      ...(user.purchaseOrders || []).map((order: any) => ({ type: '订单', text: `${order.packageName} · ${order.status} · ${(order.amountCents / 100).toFixed(2)} 元`, date: order.createdAt })),
                      ...(user.pointTransactions || []).map((tx: any) => ({ type: '点数', text: `${tx.reason} · ${(tx.deltaCents || tx.delta * 100 || 0) / 100} 点`, date: tx.createdAt })),
                    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const isExpanded = Boolean(expandedUserIds[user.id]);
                    const visibleActivities = isExpanded ? activities : activities.slice(0, 3);
                    return (
                      <article key={user.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs shadow-[var(--shadow-card)]">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-[var(--color-text)]">{user.email}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-xxs font-bold">
                              <span className="rounded bg-[var(--color-primary-soft)] px-2 py-0.5 text-[var(--color-link)]">{user.role === 'super_admin' ? '超级管理员' : '普通用户'}</span>
                              <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-[var(--color-text-muted)]">{user.planType === 'byok' ? '已解锁高级功能' : user.planType}</span>
                              <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-[var(--color-text-muted)]">点数 {credit}</span>
                              <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-[var(--color-text-muted)]">报告 {user._count?.audits || 0}</span>
                              <span className={`rounded px-2 py-0.5 ${user.isBanned ? 'bg-[var(--color-danger)] text-white' : 'bg-[var(--color-success)] text-white'}`}>
                                {user.isBanned ? '已封禁' : '正常'}
                              </span>
                            </div>
                            <div className="mt-1 break-all font-mono text-xxs text-[var(--color-text-subtle)]">ID: {user.id}</div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <input
                              value={adminGrantDraft[user.id] || ''}
                              onChange={(event) => setAdminGrantDraft((prev) => ({ ...prev, [user.id]: event.target.value }))}
                              placeholder="点数"
                              className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xxs text-[var(--color-text)]"
                            />
                            <button type="button" onClick={() => handleAdminUserAction('grant', { userId: user.id, points: Number.parseInt(adminGrantDraft[user.id] || '0', 10), reason: '超级管理员手动加点' })} className="rounded bg-[var(--color-primary)] px-2 py-1 text-xxs font-black text-white">加点</button>
                            <button type="button" onClick={() => handleAdminUserAction('unlockByok', { userId: user.id })} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-1 text-xxs font-black text-[var(--color-text)]">解锁</button>
                            <button type="button" onClick={() => handleAdminUserAction('setUserBanned', { userId: user.id, isBanned: !user.isBanned })} className="rounded border border-[var(--color-warning)] bg-[var(--color-surface-muted)] px-2 py-1 text-xxs font-black text-[var(--color-warning)]">{user.isBanned ? '解封' : '封禁'}</button>
                            <button type="button" onClick={() => window.confirm(`确定删除账号 ${user.email} 吗？`) && handleAdminUserAction('deleteUser', { userId: user.id })} className="rounded border border-[var(--color-danger)] bg-[var(--color-surface-muted)] px-2 py-1 text-xxs font-black text-[var(--color-danger)]">删除</button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr]">
                          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                            <div className="font-black text-[var(--color-text)]">最近活动</div>
                            <ul className="mt-2 space-y-1 text-xxs text-[var(--color-text-muted)]">
                              {visibleActivities.length ? visibleActivities.map((activity, index) => (
                                <li key={`${activity.type}-${activity.date}-${index}`} className="rounded bg-[var(--color-surface-muted)] px-2 py-1">
                                  <span className="font-black text-[var(--color-text)]">{activity.type}</span> · {activity.text} · {new Date(activity.date).toLocaleString()}
                                </li>
                              )) : <li>暂无活动。</li>}
                            </ul>
                            {activities.length > 3 && (
                              <button type="button" onClick={() => setExpandedUserIds((prev) => ({ ...prev, [user.id]: !prev[user.id] }))} className="mt-2 text-xxs font-black text-[var(--color-link)]">
                                {isExpanded ? '收起活动' : `展开全部 ${activities.length} 条活动`}
                              </button>
                            )}
                          </div>
                          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                            <div className="font-black text-[var(--color-text)]">给用户发邮件</div>
                            <textarea
                              value={adminEmailDraft[user.id] || ''}
                              onChange={(event) => setAdminEmailDraft((prev) => ({ ...prev, [user.id]: event.target.value }))}
                              rows={3}
                              placeholder="输入通知内容..."
                              className="mt-2 w-full rounded border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-1 text-xxs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                            />
                            <button
                              type="button"
                              onClick={() => handleAdminUserAction('sendUserEmail', { userId: user.id, subject: '观隅账号通知', message: adminEmailDraft[user.id] || '' })}
                              className="mt-2 rounded bg-[var(--color-primary)] px-3 py-1.5 text-xxs font-black text-white"
                            >
                              发送邮件
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  {adminUsers.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-text-muted)]">没有匹配的注册用户。</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-900 pb-2">
                {t('account.billing')}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/20">
                  <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                    {billing?.planType === 'byok' ? t('account.byok') : billing?.planType === 'points' ? t('account.points') : t('account.free')}
                  </div>
                  <div className="mt-1 font-semibold text-gray-500">{t('account.plan')}</div>
                </div>
                <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950/20">
                  <div className="text-lg font-black text-indigo-700 dark:text-indigo-300">{billing?.freeQuotaRemaining ?? '-'}</div>
                  <div className="mt-1 font-semibold text-gray-500">{t('account.freeRemaining')}</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <div className="text-lg font-black text-gray-900 dark:text-white">{billing?.freeQuotaUsed ?? '-'}</div>
                  <div className="mt-1 font-semibold text-gray-500">{t('account.freeUsed')}</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
                  <div className="text-lg font-black text-amber-700 dark:text-amber-300">{billing?.creditBalance ?? '-'}</div>
                  <div className="mt-1 font-semibold text-gray-500">{t('account.credits')}</div>
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs dark:border-gray-800">
                <div className="font-black text-gray-950 dark:text-white">{t('account.buyCredits')}</div>
                <p className="mt-1 leading-relaxed text-gray-500 dark:text-gray-400">
                  {t('account.buyDescription')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPackageType('points_30')}
                    className={`rounded-lg border px-3 py-2 text-left transition active:scale-[0.98] ${
                      selectedPackageType === 'points_30'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-300'
                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
                    }`}
                  >
                    <div className="font-black">{t('account.pointsPackage')}</div>
                    <div className="mt-0.5 text-xxs opacity-75">{t('account.useAdminServices')}</div>
                  </button>
	                  <button
	                    type="button"
	                    disabled={hasByokPlan}
	                    onClick={() => {
	                      if (!hasByokPlan) setSelectedPackageType('byok_lifetime');
	                    }}
	                    className={`rounded-lg border px-3 py-2 text-left transition active:scale-[0.98] ${
	                      hasByokPlan
	                        ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-70 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500'
	                        : selectedPackageType === 'byok_lifetime'
	                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300'
	                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
	                    }`}
	                  >
	                    <div className="font-black">{hasByokPlan ? t('account.byokUnlocked') : t('account.byokPackage')}</div>
	                    <div className="mt-0.5 text-xxs opacity-75">{hasByokPlan ? t('account.byokUnlocked') : t('account.useOwnServices')}</div>
	                  </button>
                </div>
                <div className="mt-4 flex justify-center">
                  {(selectedPackageType === 'byok_lifetime' ? billing?.alipayByokQrImageUrl : billing?.alipayPointsQrImageUrl || billing?.alipayQrImageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedPackageType === 'byok_lifetime' ? billing?.alipayByokQrImageUrl : billing?.alipayPointsQrImageUrl || billing?.alipayQrImageUrl}
                      alt={selectedPackageType === 'byok_lifetime' ? '30 元买断支付宝收款二维码' : '6 元点数支付宝收款二维码'}
                      className="h-48 w-48 rounded-xl border bg-white p-2 object-contain shadow-sm"
                    />
                  ) : (
                    <div className="flex h-48 w-48 items-center justify-center rounded-xl border bg-gray-50 text-center text-xs font-bold text-gray-400 dark:border-gray-800 dark:bg-gray-900">
                      {t('account.paymentPlaceholder')}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xxs text-gray-400">{billing?.alipayQrNote || t('account.paymentHint')}</p>
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder={t('account.paymentNote')}
                  className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                />
                <button
                  onClick={handleCreateOrder}
                  className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 active:scale-[0.98]"
                >
                  {t('account.createOrder', undefined, { package: selectedPackageType === 'byok_lifetime' ? t('account.byokPackage') : t('account.pointsPackage') })}
                </button>
                {billingMessage && <p className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-300">{billingMessage}</p>}
              </div>
            </div>

            {isSuperAdmin && adminBilling && (
              <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">超级管理员 · 待确认订单</h3>
                {adminBilling.pendingOrders?.length ? (
                  adminBilling.pendingOrders.map((order: any) => (
                    <div key={order.id} className="rounded-lg border border-gray-100 p-3 text-xs dark:border-gray-800">
                      <div className="font-bold text-gray-950 dark:text-white">{order.user?.email || order.userId}</div>
                      <div className="mt-2 grid gap-1 rounded-lg bg-gray-50 p-2 text-xxs dark:bg-gray-900">
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">订单类型：</span>{order.packageName}</div>
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">金额：</span>{(order.amountCents / 100).toFixed(2)} 元</div>
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">付款备注：</span><span className="font-black text-amber-700 dark:text-amber-300">{order.paymentNote || '无付款备注'}</span></div>
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">创建时间：</span>{new Date(order.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleConfirmOrder(order.id)}
                          className="rounded bg-amber-500 px-3 py-1.5 text-xxs font-bold text-white hover:bg-amber-600"
                        >
                          确认订单
                        </button>
                        <button
                          onClick={() => handleRejectOrder(order.id)}
                          className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xxs font-bold text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                        >
                          取消订单
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400">暂无待确认订单。</p>
                )}
              </div>
            )}
          </div>
          </div>
        )}

        {/* 2. 模型与偏好设置面板 */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-6 max-w-2xl mx-auto">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-900 pb-2">
              {t('account.modelSettings')}
            </h3>

            {apiSettingsLocked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                {t('account.modelLocked')}
              </div>
            )}

            {settingsMessage && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/30 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                {settingsMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('account.defaultModel')}
                </label>
                <input
                  type="text"
                  required
                  value={modelName}
                  disabled={apiSettingsLocked}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder={t('account.modelPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white font-mono disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="text-xxs text-gray-400">{t('account.modelHint')}</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('account.baseUrl')}
                </label>
                <input
                  type="url"
                  required
                  value={llmBaseUrl}
                  disabled={apiSettingsLocked}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white font-mono disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="text-xxs text-gray-400">OpenAI-compatible Chat Completions API Base URL。</p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('account.apiKey')}
                </label>
                <input
                  type="password"
                  value={llmApiKey}
                  disabled={apiSettingsLocked}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder={hasLlmApiKey ? t('account.apiKeySaved') : t('account.apiKeyPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white font-mono disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="text-xxs text-gray-400">
                  {hasLlmApiKey ? t('account.apiKeyOverwriteHint') : t('account.apiKeyHint')}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 dark:border-sky-900/30 dark:bg-sky-950/10 md:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-black text-gray-950 dark:text-white">{t('account.tavilyTitle')}</h4>
                    <p className="mt-1 text-xxs leading-relaxed text-gray-500 dark:text-gray-400">
                      {t('account.tavilyDescription')}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableTavilySearch}
                    disabled={apiSettingsLocked}
                    onChange={(e) => setEnableTavilySearch(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px]">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Tavily API Key
                    </label>
                    <input
                      type="password"
                      value={tavilyApiKey}
                      disabled={apiSettingsLocked}
                      onChange={(e) => setTavilyApiKey(e.target.value)}
                    placeholder={hasTavilyApiKey ? t('account.tavilySaved') : t('account.tavilyPlaceholder')}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <p className="text-xxs text-gray-400">
                      {t('account.tavilyHint')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t('account.searchDepth')}
                    </label>
                    <select
                      value={tavilySearchDepth}
                      disabled={apiSettingsLocked}
                      onChange={(e) => setTavilySearchDepth(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="basic">{t('account.basicSearch')}</option>
                      <option value="advanced">{t('account.advancedSearch')}</option>
                    </select>
                    <p className="text-xxs text-gray-400">{t('account.advancedHint')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-900/30 dark:bg-emerald-950/10 md:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-black text-gray-950 dark:text-white">{t('account.serperTitle')}</h4>
                    <p className="mt-1 text-xxs leading-relaxed text-gray-500 dark:text-gray-400">
                      {t('account.serperDescription')}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enableSerperSearch}
                    disabled={apiSettingsLocked}
                    onChange={(e) => setEnableSerperSearch(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Serper API Key
                  </label>
                  <input
                    type="password"
                    value={serperApiKey}
                    disabled={apiSettingsLocked}
                    onChange={(e) => setSerperApiKey(e.target.value)}
                    placeholder={hasSerperApiKey ? t('account.serperSaved') : t('account.serperPlaceholder')}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="text-xxs text-gray-400">{t('account.serperHint')}</p>
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('account.theme')}
                </label>
                <ThemeSwitcher variant="cards" />
                <p className="text-xxs text-gray-400">{t('account.themeHint')}</p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('language.interfaceLanguage')}
                </label>
                <LanguageSwitcher variant="cards" />
                <p className="text-xxs text-gray-400">{t('language.savedLocally')}</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('report.outputLanguage', '默认报告语言')}
                </label>
                <select
                  value={reportLanguage}
                  onChange={(e) => setReportLanguage(normalizeReportLanguage(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
                >
                  {REPORT_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value === 'en-US' ? t('report.englishOption') : t('report.chineseOption')}
                    </option>
                  ))}
                </select>
                <p className="text-xxs text-gray-400">{t('account.reportHint')}</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('account.thinkingDepth')}
                </label>
                <select
                  value={reasoningDepth}
                  onChange={(e) => setReasoningDepth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
                >
                  {THINKING_DEPTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(`thinking.${option.value}`)}
                    </option>
                  ))}
                </select>
                <p className="text-xxs text-gray-400">{t('account.thinkingDepthHint')}</p>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-900 pt-4 space-y-4 text-xs font-medium">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-gray-900 dark:text-white font-semibold">{t('account.publicDefault')}</span>
                  <p className="text-xxs text-gray-400">{t('account.publicDefaultHint')}</p>
                </div>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-900 pt-3">
                <div>
                  <span className="text-gray-900 dark:text-white font-semibold">{t('account.saveDefault')}</span>
                  <p className="text-xxs text-gray-400">{t('account.saveDefaultHint')}</p>
                </div>
                <input
                  type="checkbox"
                  checked={saveResult}
                  onChange={(e) => setSaveResult(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-900 pt-3">
                <div>
                  <span className="text-gray-900 dark:text-white font-semibold">{t('account.chartsDefault')}</span>
                  <p className="text-xxs text-gray-400">{t('account.chartsDefaultHint')}</p>
                </div>
                <input
                  type="checkbox"
                  checked={enableCharts}
                  onChange={(e) => setEnableCharts(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingSettings}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-sm transition disabled:bg-gray-300"
              >
                {isSavingSettings ? t('account.saving') : t('account.saveSettings')}
              </button>
            </div>
          </form>
        )}

        {/* 3. 我的审视历史记录面板 */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  {showAllAudits ? '全站报告管理' : '我的审视历史'} (共 {myAudits.length} 条)
                </h3>
                {isSuperAdmin && (
                  <p className="mt-1 text-xxs font-semibold text-amber-600 dark:text-amber-300">
                    超级管理员模式可删除全站报告，请谨慎操作。
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isSuperAdmin && (
                  <button
                    onClick={() => setShowAllAudits((value) => !value)}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 active:scale-[0.98] dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
                  >
                    {showAllAudits ? '只看我的' : '全站报告管理'}
                  </button>
                )}
                <button
                  onClick={fetchMyAudits}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-500 transition hover:text-indigo-600"
                >
                  刷新
                </button>
              </div>
            </div>

            {isFetchingAudits ? (
              <div className="text-center py-12 text-sm text-gray-400 animate-pulse font-semibold">{t('account.historyLoading')}</div>
            ) : myAudits.length === 0 ? (
              <div className="bg-white dark:bg-gray-950 p-12 text-center text-xs text-gray-400 dark:text-gray-500 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                {t('account.noHistory')}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {myAudits.map((audit) => (
                  <div
                    key={audit.id}
                    className="bg-white dark:bg-gray-950 p-4 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-gray-300 dark:hover:border-gray-700"
                  >
                    <div className="space-y-1 md:max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xxs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                          {getDepthLabel(audit.reasoningDepth)}
                        </span>
                        <span className="text-xxs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          {getModeLabel(audit.analysisMode)}
                        </span>
                        <span className="text-xxs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded dark:bg-sky-950/30 dark:text-sky-300">
                          {getReportLanguageLabel(audit.reportLanguage)}
                        </span>
                        <span className="text-xxs text-gray-400 font-semibold">{new Date(audit.createdAt).toLocaleDateString()}</span>
                        {showAllAudits && audit.user?.email && (
                          <span className="rounded bg-amber-50 px-2 py-0.5 text-xxs font-bold text-amber-700">
                            {audit.user.email}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{audit.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{audit.newsSummary}</p>
                    </div>

                    <div className="flex items-center gap-2.5 justify-end text-xs font-bold flex-wrap">
                      {showAllAudits ? (
                        <button
                          onClick={() => toggleAuditPublic(audit.id, audit.isPublic)}
                          className={`px-2.5 py-1 rounded text-xxs font-black border ${
                            audit.isPublic
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-gray-50 border-gray-200 text-gray-500'
                          }`}
                        >
                          {audit.isPublic ? '公开展示' : '仅自己可见'}
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleAuditPublic(audit.id, audit.isPublic)}
                          className={`px-2.5 py-1 rounded text-xxs font-black transition border ${
                            audit.isPublic
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-gray-50 border-gray-200 text-gray-500'
                          }`}
                        >
                          {audit.isPublic ? '公开展示' : '仅自己可见'}
                        </button>
                      )}

                      <Link
                        href={`/audits/${audit.id}`}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 rounded text-xxs flex items-center transition"
                      >
                        详情
                      </Link>

                      <button
                        onClick={() => handleDeleteAudit(audit.id)}
                        className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded text-xxs flex items-center transition"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
