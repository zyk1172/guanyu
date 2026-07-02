'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Header from '@/components/Header';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AUDIENCE_THEME_DESCRIPTIONS,
  AUDIENCE_THEME_LABELS,
  AudienceTheme,
  THINKING_DEPTH_OPTIONS,
  getThinkingDepthLabel,
  normalizeAudienceThemeValue,
  normalizeThinkingDepthValue,
} from '@/lib/types';

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

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
  const [audienceTheme, setAudienceTheme] = useState<AudienceTheme>('youth');
  const [reasoningDepth, setReasoningDepth] = useState('medium');
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
  const [canUseOwnApi, setCanUseOwnApi] = useState(false);
  const [selectedPackageType, setSelectedPackageType] = useState<'points_30' | 'byok_lifetime'>('points_30');

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
            setAudienceTheme(normalizeAudienceThemeValue(data.defaultAudienceTheme));
            setReasoningDepth(normalizeThinkingDepthValue(data.defaultReasoningDepth));
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
          defaultAudienceTheme: audienceTheme,
          defaultReasoningDepth: reasoningDepth,
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
        setAudienceTheme(normalizeAudienceThemeValue(data.defaultAudienceTheme));
        setCanUseOwnApi(Boolean(data.canUseOwnApi));
        window.localStorage.setItem('guanyu-audience-theme', normalizeAudienceThemeValue(data.defaultAudienceTheme));
        window.dispatchEvent(new CustomEvent('guanyu-theme-change', { detail: normalizeAudienceThemeValue(data.defaultAudienceTheme) }));
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
        <div className="text-sm font-semibold text-gray-500 animate-pulse">正在检测登录状态...</div>
      </div>
    );
  }

  const getDepthLabel = getThinkingDepthLabel;
  const apiSettingsLocked = !canUseOwnApi;

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'quick': return '快速分析';
      case 'deep': return '深度分析';
      default: return mode;
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-black font-sans text-gray-900 dark:text-gray-100 selection:bg-indigo-500/20 pb-12">
      <Header />

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-150 dark:border-gray-900 pb-4">
          <div>
            <h2 className="text-lg font-black text-gray-950 dark:text-white leading-tight">账号管理</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">管理基本信息、模型设置、审视偏好和历史生成记录。</p>
          </div>
          <div className="flex bg-gray-100 dark:bg-gray-900 p-0.5 rounded-lg border border-gray-150 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'info' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              基本信息
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'settings' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              模型设置 / 审视偏好
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition ${activeTab === 'history' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              我的审视记录
            </button>
          </div>
        </div>

        {/* 1. 基本信息面板 */}
        {activeTab === 'info' && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-900 pb-2 flex items-center gap-1.5">
              <span>基本信息</span>
            </h3>
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">账户邮箱</span>
                <span className="font-bold text-gray-900 dark:text-white">{session?.user?.email}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">用户 ID</span>
                <span className="font-mono text-gray-600 dark:text-gray-300">{session?.user ? (session.user as any).id : '未知'}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">注册时间</span>
                <span className="font-bold text-gray-900 dark:text-white">{accountCreatedAt ? new Date(accountCreatedAt).toLocaleString() : '未知'}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">登录状态</span>
                <span className="font-bold text-emerald-600 flex items-center gap-1">🟢 在线中</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded">
                <span className="text-gray-500 dark:text-gray-400 font-semibold">账号角色</span>
                <span className={isSuperAdmin ? 'font-bold text-amber-600 dark:text-amber-300' : 'font-bold text-gray-600 dark:text-gray-300'}>
                  {isSuperAdmin ? '超级管理员' : '普通用户'}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-900 pb-2">
                额度与点数
              </h3>
              <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-950/20">
                  <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                    {billing?.planType === 'byok' ? '买断' : billing?.planType === 'points' ? '点数' : '免费'}
                  </div>
                  <div className="mt-1 font-semibold text-gray-500">账号套餐</div>
                </div>
                <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950/20">
                  <div className="text-lg font-black text-indigo-700 dark:text-indigo-300">{billing?.freeQuotaRemaining ?? '-'}</div>
                  <div className="mt-1 font-semibold text-gray-500">今日免费剩余</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                  <div className="text-lg font-black text-gray-900 dark:text-white">{billing?.freeQuotaUsed ?? '-'}</div>
                  <div className="mt-1 font-semibold text-gray-500">今日已用</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
                  <div className="text-lg font-black text-amber-700 dark:text-amber-300">{billing?.creditBalance ?? '-'}</div>
                  <div className="mt-1 font-semibold text-gray-500">当前点数</div>
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs dark:border-gray-800">
                <div className="font-black text-gray-950 dark:text-white">购买额度</div>
                <p className="mt-1 leading-relaxed text-gray-500 dark:text-gray-400">
                  6 元购买 30 点，快速审视消耗 1 点，深度审视消耗 2 点；30 元买断后可填写自己的大模型和搜索 API。
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
                    <div className="font-black">6 元 / 30 点</div>
                    <div className="mt-0.5 text-xxs opacity-75">用管理员模型和搜索</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedPackageType('byok_lifetime')}
                    className={`rounded-lg border px-3 py-2 text-left transition active:scale-[0.98] ${
                      selectedPackageType === 'byok_lifetime'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300'
                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
                    }`}
                  >
                    <div className="font-black">30 元买断</div>
                    <div className="mt-0.5 text-xxs opacity-75">可自备模型和搜索 API</div>
                  </button>
                </div>
                {billing?.alipayQrImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={billing.alipayQrImageUrl} alt="支付宝收款二维码" className="mt-3 h-36 w-36 rounded-lg border object-cover" />
                ) : (
                  <div className="mt-3 flex h-36 w-36 items-center justify-center rounded-lg border bg-gray-50 text-center text-xxs font-bold text-gray-400 dark:border-gray-800 dark:bg-gray-900">
                    支付宝二维码占位
                  </div>
                )}
                <p className="mt-2 text-xxs text-gray-400">{billing?.alipayQrNote || '付款后提交备注，等待管理员确认。'}</p>
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="付款备注：账号邮箱、支付宝昵称或转账时间"
                  className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                />
                <button
                  onClick={handleCreateOrder}
                  className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 active:scale-[0.98]"
                >
                  我已付款，创建{selectedPackageType === 'byok_lifetime' ? '买断' : '30 点'}订单
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
              模型设置
            </h3>

            {apiSettingsLocked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                当前账号使用管理员统一模型与联网搜索。购买 30 元买断后，可在这里填写自己的大模型 API 和搜索 API。
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
                  默认大模型
                </label>
                <input
                  type="text"
                  required
                  value={modelName}
                  disabled={apiSettingsLocked}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="例: gpt-4o 或 deepseek-chat"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white font-mono disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="text-xxs text-gray-400">输入您的兼容 API 大模型名称，支持自定义模型输入。</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  大模型接口地址
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
                  大模型 API Key
                </label>
                <input
                  type="password"
                  value={llmApiKey}
                  disabled={apiSettingsLocked}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder={hasLlmApiKey ? '已保存密钥；留空表示不修改' : '请输入 API Key'}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white font-mono disabled:cursor-not-allowed disabled:opacity-60"
                />
                <p className="text-xxs text-gray-400">
                  {hasLlmApiKey ? '数据库中已保存加密密钥；再次输入会覆盖旧密钥。' : '密钥会加密保存到数据库，前端不会回显明文。'}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3 dark:border-sky-900/30 dark:bg-sky-950/10 md:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-black text-gray-950 dark:text-white">Tavily 联网核验</h4>
                    <p className="mt-1 text-xxs leading-relaxed text-gray-500 dark:text-gray-400">
                      按账号保存 Tavily Key。默认 basic 搜索更适合免费额度；关闭后报告只基于原文和模型判断。
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
                      placeholder={hasTavilyApiKey ? '已保存 Tavily Key；留空表示不修改' : '请输入 Tavily API Key'}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <p className="text-xxs text-gray-400">
                      密钥加密保存；Tavily 免费额度通常适合 basic 搜索，不建议默认 advanced。
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      搜索深度
                    </label>
                    <select
                      value={tavilySearchDepth}
                      disabled={apiSettingsLocked}
                      onChange={(e) => setTavilySearchDepth(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="basic">basic - 节省额度</option>
                      <option value="advanced">advanced - 更多检索</option>
                    </select>
                    <p className="text-xxs text-gray-400">advanced 可能消耗更多搜索额度。</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-900/30 dark:bg-emerald-950/10 md:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-black text-gray-950 dark:text-white">Serper.dev 联网核验</h4>
                    <p className="mt-1 text-xxs leading-relaxed text-gray-500 dark:text-gray-400">
                      可与 Tavily 同时启用。两个搜索都配置时，系统会合并去重后交给报告使用。
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
                    placeholder={hasSerperApiKey ? '已保存 Serper Key；留空表示不修改' : '请输入 Serper.dev API Key'}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="text-xxs text-gray-400">密钥加密保存；用于补充 Google 搜索来源。</p>
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  阅读主题
                </label>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  {(Object.keys(AUDIENCE_THEME_LABELS) as AudienceTheme[]).map((theme) => (
                    <button
                      key={theme}
                      type="button"
                      onClick={() => setAudienceTheme(theme)}
                      className={`rounded-lg border p-3 text-left transition active:scale-[0.98] ${
                        audienceTheme === theme
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-500/10 dark:border-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-300'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-200 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
                      }`}
                    >
                      <div className="text-xs font-black">{AUDIENCE_THEME_LABELS[theme]}</div>
                      <p className="mt-1 text-xxs leading-relaxed opacity-80">{AUDIENCE_THEME_DESCRIPTIONS[theme]}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xxs text-gray-400">主题会影响界面视觉密度、字号、动效强度和报告默认展示复杂度。</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  大模型思考深度
                </label>
                <select
                  value={reasoningDepth}
                  onChange={(e) => setReasoningDepth(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
                >
                  {THINKING_DEPTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.description}
                    </option>
                  ))}
                </select>
                <p className="text-xxs text-gray-400">控制大模型推敲强度，不要求模型输出隐藏推理过程。</p>
              </div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-900 pt-4 space-y-4 text-xs font-medium">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-gray-900 dark:text-white font-semibold">默认公开展示</span>
                  <p className="text-xxs text-gray-400">新生成的审视结果默认进入首页热门审视列表中（需公开）。</p>
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
                  <span className="text-gray-900 dark:text-white font-semibold">默认持久化结果</span>
                  <p className="text-xxs text-gray-400">每次审视完毕后，默认永久留存记录在您的历史列表中。</p>
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
                  <span className="text-gray-900 dark:text-white font-semibold">默认生成图形化展示</span>
                  <p className="text-xxs text-gray-400">开启此项后将使用 Recharts 高效渲染图形指标对比图。</p>
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
                {isSavingSettings ? '正在保存设置...' : '应用并保存账户预设'}
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
              <div className="text-center py-12 text-sm text-gray-400 animate-pulse font-semibold">正在载入您的历史生成记录...</div>
            ) : myAudits.length === 0 ? (
              <div className="bg-white dark:bg-gray-950 p-12 text-center text-xs text-gray-400 dark:text-gray-500 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                您还没有创建过审视记录。
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
                        <span
                          className={`px-2.5 py-1 rounded text-xxs font-black border ${
                            audit.isPublic
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-gray-50 border-gray-200 text-gray-500'
                          }`}
                        >
                          {audit.isPublic ? '公开展示' : '仅自己可见'}
                        </span>
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
