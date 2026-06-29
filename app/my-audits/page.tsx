'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { THINKING_DEPTH_OPTIONS, getThinkingDepthLabel } from '@/lib/types';

export default function MyAuditsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [myAudits, setMyAudits] = useState<any[]>([]);
  const [isFetchingAudits, setIsFetchingAudits] = useState(false);

  // 搜索和筛选状态
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [depthFilter, setDepthFilter] = useState('');
  const [publicFilter, setPublicFilter] = useState('');

  // 1. 登录守卫
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // 2. 加载记录
  const fetchMyAudits = async () => {
    if (!session) return;
    setIsFetchingAudits(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (modeFilter) params.append('mode', modeFilter);
      if (depthFilter) params.append('depth', depthFilter);
      if (publicFilter) params.append('isPublic', publicFilter);

      const res = await fetch(`/api/audits/my?${params.toString()}`);
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

  useEffect(() => {
    fetchMyAudits();
  }, [session, modeFilter, depthFilter, publicFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMyAudits();
  };

  // 3. 修改公开状态
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

  // 4. 删除审视
  const handleDeleteAudit = async (id: string) => {
    if (!window.confirm('确定要永久删除此条审视记录吗？')) return;

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

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h2 className="text-lg font-black text-gray-950 dark:text-white leading-tight">🕵️‍♂️ 我的审视记录 (私有管理面板)</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">仅展示您名下生成的审视记录。您可以在此管理它们的公开状态，或对其进行永久清除。</p>
        </div>

        {/* 紧凑型筛选工具栏 */}
        <div className="bg-white dark:bg-gray-950 p-4 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="按审视标题关键字搜索..."
              className="flex-1 px-3 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-sm transition"
            >
              检索
            </button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-xs">
            <div className="space-y-1">
              <label className="block text-xxs font-bold text-gray-500 uppercase">分析模式</label>
              <select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none"
              >
                <option value="">全部模式</option>
                <option value="quick">快速分析</option>
                <option value="deep">深度分析</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xxs font-bold text-gray-500 uppercase">思考深度</label>
              <select
                value={depthFilter}
                onChange={(e) => setDepthFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none"
              >
                <option value="">全部强度</option>
                <option value="quick">快速</option>
                {THINKING_DEPTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xxs font-bold text-gray-500 uppercase">公开偏好</label>
              <select
                value={publicFilter}
                onChange={(e) => setPublicFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50 dark:bg-gray-900 focus:outline-none"
              >
                <option value="">全部状态</option>
                <option value="true">公开展示</option>
                <option value="false">仅自己可见</option>
              </select>
            </div>
          </div>
        </div>

        {/* 审视历史列表 */}
        {isFetchingAudits ? (
          <div className="text-center py-16 text-sm text-gray-400 animate-pulse font-semibold">正在同步您的审视记录历史...</div>
        ) : myAudits.length === 0 ? (
          <div className="bg-white dark:bg-gray-950 p-12 text-center text-xs text-gray-400 dark:text-gray-500 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
            未发现匹配您当前过滤条件的审视记录。
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
                      思考强度 {getDepthLabel(audit.reasoningDepth)}
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
                    className="px-2.5 py-1 bg-indigo-550 hover:bg-indigo-600 text-white rounded text-xxs flex items-center transition"
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
    </main>
  );
}
