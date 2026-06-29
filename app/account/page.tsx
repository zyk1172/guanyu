'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { THINKING_DEPTH_OPTIONS, getThinkingDepthLabel, normalizeThinkingDepthValue } from '@/lib/types';

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'info' | 'settings' | 'history'>('info');

  // 模型与偏好设置
  const [modelName, setModelName] = useState('gpt-4o');
  const [llmBaseUrl, setLlmBaseUrl] = useState('https://api.openai.com/v1');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [hasLlmApiKey, setHasLlmApiKey] = useState(false);
  const [reasoningDepth, setReasoningDepth] = useState('medium');
  const [isPublic, setIsPublic] = useState(true);
  const [saveResult, setSaveResult] = useState(true);
  const [enableCharts, setEnableCharts] = useState(true);

  const [myAudits, setMyAudits] = useState<any[]>([]);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [isFetchingAudits, setIsFetchingAudits] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsSettingsMessage] = useState<string | null>(null);

  // 1. 登录路由守卫
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

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
            setReasoningDepth(normalizeThinkingDepthValue(data.defaultReasoningDepth));
            setIsPublic(data.defaultIsPublic);
            setSaveResult(data.defaultSaveResult);
            setEnableCharts(data.defaultEnableCharts);
            setAccountCreatedAt(data.account?.createdAt || null);
          }
        });

      // 获取当前用户审视记录
      fetchMyAudits();
    }
  }, [session]);

  const fetchMyAudits = async () => {
    setIsFetchingAudits(true);
    try {
      const res = await fetch('/api/audits/my');
      if (res.ok) {
        const data = await res.json();
        setMyAudits(data);
      }
    } catch (err) {
      console.error('获取我的审视历史失败:', err);
    } finally {
      setIsFetchingAudits(false);
    }
  };

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
          defaultReasoningDepth: reasoningDepth,
          defaultIsPublic: isPublic,
          defaultSaveResult: saveResult,
          defaultEnableCharts: enableCharts,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLlmApiKey('');
        setHasLlmApiKey(Boolean(data.hasLlmApiKey));
        setSettingsSettingsMessage('✅ 设置已成功保存并同步！');
        setTimeout(() => setSettingsSettingsMessage(null), 3000);
      } else {
        setSettingsSettingsMessage(`❌ 保存失败: ${data.error}`);
      }
    } catch (err) {
      setSettingsSettingsMessage('❌ 发生异常，请检查网络');
    } finally {
      setIsSavingSettings(false);
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
          <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm max-w-xl mx-auto space-y-4">
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
            </div>
          </div>
        )}

        {/* 2. 模型与偏好设置面板 */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-6 max-w-2xl mx-auto">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-900 pb-2">
              模型设置
            </h3>

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
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="例: gpt-4o 或 deepseek-chat"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white font-mono"
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
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white font-mono"
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
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder={hasLlmApiKey ? '已保存密钥；留空表示不修改' : '请输入 API Key'}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white font-mono"
                />
                <p className="text-xxs text-gray-400">
                  {hasLlmApiKey ? '数据库中已保存加密密钥；再次输入会覆盖旧密钥。' : '密钥会加密保存到数据库，前端不会回显明文。'}
                </p>
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
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                我的审视历史 (共 {myAudits.length} 条)
              </h3>
              <button
                onClick={fetchMyAudits}
                className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1 transition"
              >
                🔄 刷新
              </button>
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
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">{audit.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{audit.newsSummary}</p>
                    </div>

                    <div className="flex items-center gap-2.5 justify-end text-xs font-bold flex-wrap">
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
