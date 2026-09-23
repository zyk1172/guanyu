'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import Header from '@/components/Header';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  THINKING_DEPTH_OPTIONS,
  getReportLanguageLabel,
  getThinkingDepthLabel,
  normalizeThinkingDepthValue,
  normalizeReportLanguage,
} from '@/lib/types';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useUiLanguage } from '@/components/LanguageProvider';
import { PlatformModelSelector } from '@/components/PlatformModelSelector';
import PlatformModelAdmin from '@/components/PlatformModelAdmin';
import {
  CheckCircle2,
  DatabaseBackup,
  LayoutDashboard,
  LoaderCircle,
  MailCheck,
  MessagesSquare,
  ReceiptText,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';

function formatOrderAmount(amountCents: number, currency?: string | null) {
  const amount = (Number(amountCents || 0) / 100).toFixed(2);
  return currency === 'USD' ? `$${amount} USD` : `¥${amount} CNY`;
}

function formatCredits(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1).replace(/\.0$/, '');
}

type OrderProgressStage = 'idle' | 'submitting' | 'syncing' | 'success' | 'error';

function OrderProgress({
  stage,
  title,
  detail,
}: {
  stage: OrderProgressStage;
  title: string;
  detail: string;
}) {
  if (stage === 'idle') return null;
  const busy = stage === 'submitting' || stage === 'syncing';
  const Icon = busy ? LoaderCircle : stage === 'success' ? CheckCircle2 : XCircle;
  const activeSteps = stage === 'submitting' ? 1 : stage === 'syncing' ? 2 : stage === 'success' ? 3 : 0;

  return (
    <div
      role={stage === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`order-feedback mt-3 overflow-hidden rounded-xl border px-3 py-3 ${
        stage === 'error'
          ? 'border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_8%,var(--color-surface))]'
          : stage === 'success'
            ? 'border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_8%,var(--color-surface))]'
            : 'border-[var(--color-primary)] bg-[var(--color-primary-soft)]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm">
          <Icon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
        </span>
        <div>
          <div className="text-xs font-black text-[var(--color-text)]">{title}</div>
          <p className="mt-0.5 text-xxs leading-relaxed text-[var(--color-text-muted)]">{detail}</p>
        </div>
      </div>
      {stage !== 'error' && (
        <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step <= activeSteps
                  ? 'order-progress-segment bg-[var(--color-primary)]'
                  : 'bg-[var(--color-border)]'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type RssFeedConfig = {
  catalogIds: string[];
  customFeeds: Array<{ name: string; url: string }>;
};

type RssSourceOption = {
  id: string;
  name: string;
  nameZh: string;
  region: 'international' | 'china' | 'chinese-language' | 'custom';
  websiteUrl: string;
  rssAvailability: string;
  termsNote: string;
  termsNoteZh?: string;
};

export default function AccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { language, t } = useUiLanguage();

  const [activeTab, setActiveTab] = useState<'info' | 'settings' | 'history' | 'system'>('info');

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
  const reportLanguage = normalizeReportLanguage(language);
  const [isPublic, setIsPublic] = useState(false);
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
  const [orderProgressStage, setOrderProgressStage] = useState<OrderProgressStage>('idle');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const orderRequestLock = useRef(false);
  const orderRequestIdRef = useRef<string | null>(null);
  const [paymentNote, setPaymentNote] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState('bug');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [adminBilling, setAdminBilling] = useState<any>(null);
  const [adminOrderAction, setAdminOrderAction] = useState<{ orderId: string; action: 'confirm' | 'reject' } | null>(null);
  const adminOrderActionLock = useRef(false);
  const [adminOrderProgressStage, setAdminOrderProgressStage] = useState<OrderProgressStage>('idle');
  const [adminOrderMessage, setAdminOrderMessage] = useState<string | null>(null);
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [adminUserMessage, setAdminUserMessage] = useState<string | null>(null);
  const [adminEmailDraft, setAdminEmailDraft] = useState<Record<string, string>>({});
  const [adminGrantDraft, setAdminGrantDraft] = useState<Record<string, string>>({});
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [restoreArchive, setRestoreArchive] = useState<File | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState<'create' | 'restore' | null>(null);
  const [canUseOwnApi, setCanUseOwnApi] = useState(false);
  const [modelSource, setModelSource] = useState<'platform' | 'custom'>('platform');
  const [defaultPlatformModelConfigId, setDefaultPlatformModelConfigId] = useState('');
  const [rssFeedConfig, setRssFeedConfig] = useState<RssFeedConfig>({ catalogIds: [], customFeeds: [] });
  const [rssSourceCatalog, setRssSourceCatalog] = useState<RssSourceOption[]>([]);
  const [rssConfigSource, setRssConfigSource] = useState<'admin' | 'personal'>('admin');
  const [rssCustomName, setRssCustomName] = useState('');
  const [rssCustomUrl, setRssCustomUrl] = useState('');
  const [selectedPackageType, setSelectedPackageType] = useState<'STARTER' | 'PRO'>('STARTER');
  const [paymentMethod, setPaymentMethod] = useState<'alipay_qr' | 'paypal_qr'>('alipay_qr');
  const packageList = paymentMethod === 'paypal_qr' ? billing?.packages?.paypal : billing?.packages?.alipay;
  const pointsPackage = packageList?.find((item: any) => item.productId === 'STARTER');
  const advancedPackage = packageList?.find((item: any) => item.productId === 'PRO');
  const selectedPaymentPackage = selectedPackageType === 'PRO' ? advancedPackage : pointsPackage;
  const selectedPackageLabel = selectedPackageType === 'PRO' ? t('billing.pro') : t('billing.starter');
  const savedAlipayHint = String(billing?.alipayQrNote || '').trim();
  const alipayPaymentHint = /买断|lifetime|待激活|pending pro/i.test(savedAlipayHint)
    ? t('account.paymentHint')
    : savedAlipayHint || t('account.paymentHint');

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
            setIsPublic(data.defaultIsPublic);
            setEnableCharts(data.defaultEnableCharts);
            setAccountCreatedAt(data.account?.createdAt || null);
            setIsSuperAdmin(Boolean(data.isSuperAdmin));
            setCanUseOwnApi(Boolean(data.canUseOwnApi));
            setModelSource(data.modelSource === 'custom' ? 'custom' : 'platform');
            setDefaultPlatformModelConfigId(String(data.defaultPlatformModelConfigId || ''));
            setRssFeedConfig(data.rssFeedConfig || { catalogIds: [], customFeeds: [] });
            setRssSourceCatalog(Array.isArray(data.rssSourceCatalog) ? data.rssSourceCatalog : []);
            setRssConfigSource(data.rssConfigSource === 'personal' ? 'personal' : 'admin');
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
    if (!isSuperAdmin && activeTab === 'system') {
      setActiveTab('info');
    }
  }, [activeTab, isSuperAdmin]);

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
          defaultReasoningDepth: reasoningDepth,
          defaultReportLanguage: reportLanguage,
          defaultIsPublic: isPublic,
          defaultEnableCharts: enableCharts,
          modelSource,
          defaultPlatformModelConfigId,
          ...(canUseOwnApi ? { rssFeedConfig } : {}),
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
        setSettingsSettingsMessage(`✅ ${t('account.settingsSaved')}`);
        setTimeout(() => setSettingsSettingsMessage(null), 3000);
      } else {
        setSettingsSettingsMessage(`❌ ${t('account.settingsSaveFailed')}: ${data.error}`);
      }
    } catch {
      setSettingsSettingsMessage(`❌ ${t('account.settingsNetworkError')}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const toggleRssCatalogSource = (sourceId: string) => {
    setRssFeedConfig((current) => ({
      ...current,
      catalogIds: current.catalogIds.includes(sourceId)
        ? current.catalogIds.filter((id) => id !== sourceId)
        : [...current.catalogIds, sourceId],
    }));
  };

  const addCustomRssFeed = () => {
    const url = rssCustomUrl.trim();
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid');
      setRssFeedConfig((current) => {
        if (current.customFeeds.some((feed) => feed.url === parsed.toString()) || current.customFeeds.length >= 5) return current;
        return {
          ...current,
          customFeeds: [...current.customFeeds, {
            name: rssCustomName.trim().slice(0, 80) || parsed.hostname,
            url: parsed.toString(),
          }],
        };
      });
      setRssCustomName('');
      setRssCustomUrl('');
    } catch {
      setSettingsSettingsMessage(language === 'en-US' ? 'Please enter a public http(s) RSS URL without credentials.' : '请输入不含账号密码的公开 http(s) RSS 地址。');
    }
  };

  const removeCustomRssFeed = (url: string) => {
    setRssFeedConfig((current) => ({
      ...current,
      customFeeds: current.customFeeds.filter((feed) => feed.url !== url),
    }));
  };

  const handleCreateOrder = async () => {
    if (orderRequestLock.current) return;
    setBillingMessage(null);
    if (!paymentNote.trim()) {
      setOrderProgressStage('error');
      setBillingMessage(t('order.noteRequired'));
      return;
    }
    orderRequestLock.current = true;
    setIsCreatingOrder(true);
    setOrderProgressStage('submitting');
    setBillingMessage(t('order.creatingDetail'));
    orderRequestIdRef.current = orderRequestIdRef.current || crypto.randomUUID();
    try {
      const res = await fetch('/api/billing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedPackageType, paymentMethod, paymentNote, clientRequestId: orderRequestIdRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOrderProgressStage('error');
        setBillingMessage(data.error || '创建订单失败');
        return;
      }
      setOrderProgressStage('syncing');
      setBillingMessage(t('order.syncingDetail'));
      setPaymentNote('');
      orderRequestIdRef.current = null;
      if (selectedPaymentPackage?.paymentUrl) {
        window.open(selectedPaymentPackage.paymentUrl, '_blank', 'noopener,noreferrer');
      }
      await fetchBilling();
      setOrderProgressStage('success');
      setBillingMessage(t('order.createdDetail', undefined, { id: data.id }));
    } catch {
      setOrderProgressStage('error');
      setBillingMessage(t('order.createFailed'));
    } finally {
      orderRequestLock.current = false;
      setIsCreatingOrder(false);
    }
  };

  const handleSubmitFeedback = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedbackStatus(null);
    const message = feedbackMessage.trim();
    if (message.length < 5) {
      setFeedbackStatus(t('account.feedbackTooShort'));
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: feedbackType, message }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedbackStatus(data.error || t('account.feedbackFailed'));
        return;
      }
      setFeedbackMessage('');
      setFeedbackStatus(data.message || t('account.feedbackSent'));
    } catch {
      setFeedbackStatus(t('account.feedbackFailed'));
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage(t('auth.passwordMinEight'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage(t('auth.passwordMismatch'));
      return;
    }
    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword: confirmNewPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPasswordMessage(data.error || t('account.passwordChangeFailed'));
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordMessage(data.message || t('account.passwordChanged'));
    } catch {
      setPasswordMessage(t('account.passwordChangeFailed'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleExportData = async () => {
    setPrivacyMessage(null);
    setIsExportingData(true);
    try {
      const password = window.prompt(t('account.deleteAccountHint'));
      if (!password) return;
      const response = await fetch('/api/account/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        cache: 'no-store',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setPrivacyMessage(data.error || t('account.privacyFailed'));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'guanyu-data.json';
      link.click();
      URL.revokeObjectURL(url);
      setPrivacyMessage(t('account.dataExported'));
    } catch {
      setPrivacyMessage(t('account.privacyFailed'));
    } finally {
      setIsExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm(t('account.deleteAccountConfirm'))) return;
    const confirmation = window.prompt(t('account.deleteAccountHint'));
    if (!confirmation) return;
    setPrivacyMessage(null);
    setIsDeletingAccount(true);
    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPrivacyMessage(data.error || t('account.privacyFailed'));
        return;
      }
      setPrivacyMessage(t('account.accountDeleted'));
      window.location.href = '/login';
    } catch {
      setPrivacyMessage(t('account.privacyFailed'));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleConfirmOrder = async (orderId: string) => {
    if (adminOrderActionLock.current) return;
    adminOrderActionLock.current = true;
    setAdminOrderAction({ orderId, action: 'confirm' });
    setAdminOrderProgressStage('submitting');
    setAdminOrderMessage('正在核对订单并写入点数与 Pro 权益…');
    try {
      const res = await fetch('/api/billing/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirmOrder', orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdminOrderProgressStage('error');
        setAdminOrderMessage(data.error || '确认订单失败，请稍后重试。');
        return;
      }
      setAdminOrderProgressStage('syncing');
      setAdminOrderMessage('权益已写入，正在刷新订单与用户余额…');
      await Promise.all([fetchAdminBilling(), fetchBilling()]);
      setAdminOrderProgressStage('success');
      setAdminOrderMessage('订单确认完成。点数与 Pro 权益已到账，通知邮件正在后台发送。');
    } catch {
      setAdminOrderProgressStage('error');
      setAdminOrderMessage('确认订单失败，请稍后重试。');
    } finally {
      adminOrderActionLock.current = false;
      setAdminOrderAction(null);
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    if (!window.confirm('确定取消这笔待确认订单吗？')) return;
    if (adminOrderActionLock.current) return;
    adminOrderActionLock.current = true;
    setAdminOrderAction({ orderId, action: 'reject' });
    setAdminOrderProgressStage('submitting');
    setAdminOrderMessage('正在取消订单…');
    try {
      const res = await fetch('/api/billing/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rejectOrder', orderId, adminNote: '管理员取消订单' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdminOrderProgressStage('error');
        setAdminOrderMessage(data.error || '取消订单失败，请稍后重试。');
        return;
      }
      setAdminOrderProgressStage('syncing');
      setAdminOrderMessage('订单已取消，正在刷新待确认列表…');
      await Promise.all([fetchAdminBilling(), fetchBilling()]);
      setAdminOrderProgressStage('success');
      setAdminOrderMessage('订单已取消，用户通知邮件正在后台发送。');
    } catch {
      setAdminOrderProgressStage('error');
      setAdminOrderMessage('取消订单失败，请稍后重试。');
    } finally {
      adminOrderActionLock.current = false;
      setAdminOrderAction(null);
    }
  };

  const handleDiscussionModeration = async (reportId: string, messageId: string, action: 'hide' | 'restore') => {
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(reportId)}/discussion`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, messageId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '审核操作失败。');
      await fetchAdminBilling();
    } catch (error: any) {
      setAdminUserMessage(error?.message || '审核操作失败。');
    }
  };

  const handleAdminUserAction = async (action: string, payload: Record<string, any>) => {
    setAdminUserMessage(null);
    try {
      const sensitive = ['grant', 'grantProAccess', 'setUserBanned', 'deleteUser', 'sendUserEmail'].includes(action);
      const stepUpPassword = sensitive ? window.prompt('请输入当前密码以执行敏感操作。') : '';
      if (sensitive && !stepUpPassword) return false;
      const res = await fetch('/api/billing/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload, ...(sensitive ? { stepUpPassword } : {}) }),
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
        user.planType === 'byok' ? 'Pro 专业权益' : user.planType,
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

  const createOperationsBackup = async () => {
    setBackupMessage(null);
    if (backupPassphrase.trim().length < 12) {
      setBackupMessage(t('backup.passphraseTooShort'));
      return;
    }
    setBackupBusy('create');
    try {
      const stepUpPassword = window.prompt('请输入当前密码以创建运营备份。');
      if (!stepUpPassword) return;
      const response = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: backupPassphrase, stepUpPassword }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t('backup.createFailed'));
      }
      const blob = await response.blob();
      const name = response.headers.get('content-disposition')?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name ? decodeURIComponent(name) : `guanyu-operations-backup-${Date.now()}.guanyu-backup`;
      link.click();
      URL.revokeObjectURL(url);
      setBackupPassphrase('');
      setBackupMessage(t('backup.created'));
    } catch (error: any) {
      setBackupMessage(error?.message || t('backup.createFailed'));
    } finally {
      setBackupBusy(null);
    }
  };

  const restoreOperationsBackup = async () => {
    setBackupMessage(null);
    if (!restoreArchive) {
      setBackupMessage(t('backup.fileRequired'));
      return;
    }
    if (restorePassphrase.trim().length < 12) {
      setBackupMessage(t('backup.passphraseTooShort'));
      return;
    }
    if (!['恢复全部运营数据', 'RESTORE ALL OPERATIONS DATA'].includes(restoreConfirmation)) {
      setBackupMessage(t('backup.confirmationRequired'));
      return;
    }
    if (!window.confirm(t('backup.restoreConfirm'))) return;
    setBackupBusy('restore');
    try {
      const stepUpPassword = window.prompt('请输入当前密码以恢复运营备份。');
      if (!stepUpPassword) return;
      const form = new FormData();
      form.append('archive', restoreArchive);
      form.append('passphrase', restorePassphrase);
      form.append('confirmation', restoreConfirmation);
      form.append('stepUpPassword', stepUpPassword);
      const response = await fetch('/api/admin/backup', { method: 'PUT', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t('backup.restoreFailed'));
      setRestoreArchive(null);
      setRestorePassphrase('');
      setRestoreConfirmation('');
      setBackupMessage(data.message || t('backup.restored'));
      await Promise.all([fetchAdminBilling(), fetchBilling(), fetchMyAudits()]);
    } catch (error: any) {
      setBackupMessage(error?.message || t('backup.restoreFailed'));
    } finally {
      setBackupBusy(null);
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

      <div className={`${activeTab === 'system' ? 'max-w-7xl' : 'max-w-5xl'} mx-auto space-y-6 px-4 py-8 transition-[max-width] duration-300`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-150 dark:border-gray-900 pb-4">
          <div>
            <h2 className="text-lg font-black text-gray-950 dark:text-white leading-tight">{t('account.title')}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.description')}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="grid w-full grid-cols-2 rounded-lg border border-gray-150 bg-gray-100 p-0.5 dark:border-gray-800 dark:bg-gray-900 sm:flex sm:w-auto">
            <button
              onClick={() => setActiveTab('info')}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition ${activeTab === 'info' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t('account.infoTab')}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition ${activeTab === 'settings' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t('account.settingsTab')}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition ${activeTab === 'history' ? 'bg-white dark:bg-gray-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t('account.historyTab')}
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('system')}
                className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold transition ${activeTab === 'system' ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('admin.systemTab', '系统管理')}
              </button>
            )}
          </div>
          <Link href="/account/extensions" className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 transition hover:bg-white dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900">
            {t('account.extensions')}
          </Link>
          </div>
        </div>

        {/* 1. 基本信息面板 */}
        {(activeTab === 'info' || activeTab === 'system') && (
          <div className={`grid gap-4 ${activeTab === 'system' ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.65fr)]' : 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]'}`}>
          {activeTab === 'system' && (
            <section className="col-span-full overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card)] shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-base font-black text-[var(--color-text)]">{t('admin.systemTitle', '系统管理')}</h3>
                    <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-[var(--color-text-muted)]">{t('admin.systemDescription', '集中处理平台运营、用户权限、内容审核和数据安全。以下功能仅超级管理员可见。')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAllAudits(true);
                    setActiveTab('history');
                  }}
                  className="w-fit rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-xs font-black text-[var(--color-text)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] active:scale-[0.98]"
                >
                  {t('admin.manageReports', '管理全站报告')}
                </button>
              </div>
              {adminBilling ? (
                <div className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
                  {[
                    { icon: Users, label: t('admin.registeredUsers', '注册用户'), value: adminBilling.users?.length || 0 },
                    { icon: ReceiptText, label: t('admin.pendingOrders', '待确认订单'), value: adminBilling.pendingOrders?.length || 0 },
                    { icon: MessagesSquare, label: t('admin.pendingReports', '待审核举报'), value: adminBilling.discussionReports?.length || 0 },
                    { icon: MailCheck, label: t('admin.emailRecords', '邮件记录'), value: adminBilling.emailDeliveries?.length || 0 },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3 bg-[var(--color-card)] px-4 py-3">
                      <Icon className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-lg font-black tabular-nums text-[var(--color-text)]">{value}</div>
                        <div className="truncate text-xxs font-bold text-[var(--color-text-muted)]">{label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-5 py-4 text-xs font-semibold text-[var(--color-text-muted)]">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('admin.loading', '正在加载系统数据…')}
                </div>
              )}
            </section>
          )}
          {activeTab === 'system' && isSuperAdmin && (
            <div className="col-span-full">
              <PlatformModelAdmin />
            </div>
          )}
          <div className={activeTab === 'system' ? 'flex min-w-0 flex-col gap-4' : 'space-y-4 rounded-xl border border-gray-150 bg-white p-6 shadow-sm dark:border-gray-900 dark:bg-gray-950'}>
            {activeTab === 'info' && (
              <>
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
            <form onSubmit={handleChangePassword} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <div>
                <h4 className="text-sm font-black text-[var(--color-text)]">{t('account.passwordTitle')}</h4>
                <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.passwordDescription')}</p>
              </div>
              <div className="mt-3 grid gap-2">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder={t('account.currentPassword')}
                  autoComplete="current-password"
                  className="rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-primary)]"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={t('account.newPassword')}
                  autoComplete="new-password"
                  className="rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-primary)]"
                />
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  placeholder={t('account.confirmNewPassword')}
                  autoComplete="new-password"
                  className="rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-primary)]"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xxs text-[var(--color-text-muted)]">{t('account.passwordHint')}</p>
                <button type="submit" disabled={isChangingPassword} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-black text-white transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">
                  {isChangingPassword ? t('account.passwordChanging') : t('account.changePassword')}
                </button>
              </div>
              {passwordMessage && <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]" role="status">{passwordMessage}</p>}
            </form>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
              <h4 className="text-sm font-black text-[var(--color-text)]">{t('account.privacyTitle', '账号数据')}</h4>
              <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.deleteAccountHint')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/saved-articles" className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-black text-[var(--color-text)] transition hover:bg-[var(--color-card-hover)]">
                  {t('saved.title')}
                </Link>
                <button type="button" disabled={isExportingData} onClick={handleExportData} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-black text-white transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">
                  {isExportingData ? t('account.exportingData') : t('account.exportData')}
                </button>
                <button type="button" disabled={isDeletingAccount} onClick={handleDeleteAccount} className="rounded-lg bg-[var(--color-danger)] px-3 py-2 text-xs font-black text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
                  {isDeletingAccount ? t('account.deletingAccount') : t('account.deleteAccount')}
                </button>
              </div>
              {privacyMessage && <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]" role="status">{privacyMessage}</p>}
            </div>
              </>
            )}
            {activeTab === 'system' && isSuperAdmin && adminBilling && (
              <section className="order-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-black text-[var(--color-text)]"><DatabaseBackup className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />{t('backup.title')}</h4>
                    <p className="mt-1 max-w-3xl text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('backup.description')}</p>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--color-warning)]/15 px-2 py-1 text-xxs font-black text-[var(--color-warning)]">{t('backup.adminOnly')}</span>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                    <h5 className="text-xs font-black text-[var(--color-text)]">{t('backup.createTitle')}</h5>
                    <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('backup.createHint')}</p>
                    <input
                      type="password"
                      value={backupPassphrase}
                      onChange={(event) => setBackupPassphrase(event.target.value)}
                      autoComplete="new-password"
                      placeholder={t('backup.passphrasePlaceholder')}
                      className="mt-3 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                    />
                    <button type="button" onClick={createOperationsBackup} disabled={backupBusy !== null} className="mt-2 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-black text-white transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">
                      {backupBusy === 'create' ? t('backup.creating') : t('backup.download')}
                    </button>
                  </div>

                  <div className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 p-3">
                    <h5 className="text-xs font-black text-[var(--color-text)]">{t('backup.restoreTitle')}</h5>
                    <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('backup.restoreHint')}</p>
                    <input
                      type="file"
                      accept=".guanyu-backup,application/vnd.guanyu.operations-backup+json,application/json"
                      onChange={(event) => setRestoreArchive(event.target.files?.[0] || null)}
                      className="mt-3 block w-full text-xxs text-[var(--color-text-muted)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--color-surface)] file:px-2 file:py-1.5 file:text-xxs file:font-bold file:text-[var(--color-text)]"
                    />
                    <input
                      type="password"
                      value={restorePassphrase}
                      onChange={(event) => setRestorePassphrase(event.target.value)}
                      autoComplete="new-password"
                      placeholder={t('backup.passphrasePlaceholder')}
                      className="mt-2 w-full rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                    />
                    <input
                      value={restoreConfirmation}
                      onChange={(event) => setRestoreConfirmation(event.target.value)}
                      placeholder={t('backup.confirmationPlaceholder', undefined, { confirmation: language === 'zh-CN' || language === 'zh-TW' ? '恢复全部运营数据' : 'RESTORE ALL OPERATIONS DATA' })}
                      className="mt-2 w-full rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-danger)]"
                    />
                    <button type="button" onClick={restoreOperationsBackup} disabled={backupBusy !== null} className="mt-2 rounded-lg bg-[var(--color-danger)] px-3 py-2 text-xs font-black text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60">
                      {backupBusy === 'restore' ? t('backup.restoring') : t('backup.restore')}
                    </button>
                  </div>
                </div>
                <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('backup.securityNote')}</p>
                {backupMessage && <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]" role="status">{backupMessage}</p>}
              </section>
            )}

            {activeTab === 'system' && isSuperAdmin && adminBilling && (
              <div className="order-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-black text-[var(--color-text)]"><Users className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />注册用户与权限</h4>
                    <p className="mt-1 text-xxs font-semibold text-[var(--color-text-muted)]">
                      搜索用户、导出注册信息、查看最近活动、加点、授予 Pro 专业权益、封禁、删除账号和发送邮件。
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
                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black text-[var(--color-text)]">邮件投递记录</div>
                    <div className="text-xxs text-[var(--color-text-muted)]">成功、失败与失败原因会保留在这里。</div>
                  </div>
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xxs">
                    {(adminBilling.emailDeliveries || []).length ? adminBilling.emailDeliveries.map((delivery: any) => (
                      <div key={delivery.id} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-1.5 text-[var(--color-text-muted)]">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className={`font-black ${delivery.status === 'sent' ? 'text-[var(--color-success)]' : delivery.status === 'failed' ? 'text-[var(--color-danger)]' : 'text-[var(--color-warning)]'}`}>{delivery.status === 'sent' ? '已发送' : delivery.status === 'failed' ? '发送失败' : '待发送'}</span><span>{delivery.category}</span><span>{delivery.provider || '未选择通道'}</span><span>{new Date(delivery.createdAt).toLocaleString()}</span></div>
                        <div className="mt-0.5 break-all">{delivery.recipient} · {delivery.subject}</div>
                        {delivery.error && <div className="mt-0.5 break-all text-[var(--color-danger)]">{delivery.error}</div>}
                      </div>
                    )) : <div className="py-2 text-[var(--color-text-muted)]">暂时没有邮件投递记录。</div>}
                  </div>
                </div>
                <div className="mt-3 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {adminUsers.map((user: any) => {
                    const credit = ((user.creditBalanceCents || user.creditBalance * 100 || 0) / 100).toFixed(1);
                    const activities = [
                      ...(user.audits || []).map((audit: any) => ({ type: '报告', text: audit.title, date: audit.createdAt })),
                      ...(user.purchaseOrders || []).map((order: any) => ({ type: '订单', text: `${order.packageName} · ${order.status} · ${formatOrderAmount(order.amountCents, order.currency)}`, date: order.createdAt })),
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
                              <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-[var(--color-text-muted)]">{user.planType === 'byok' ? 'Pro 专业权益' : user.planType}</span>
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
                            <button type="button" onClick={() => handleAdminUserAction('grantProAccess', { userId: user.id })} className="rounded border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-1 text-xxs font-black text-[var(--color-text)]">授予 Pro 权益</button>
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
            {activeTab === 'info' && (
              <>
            <form onSubmit={handleSubmitFeedback} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] pb-3">
                <div>
                  <h3 className="text-sm font-black text-[var(--color-text)]">{t('account.feedbackTitle')}</h3>
                  <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.feedbackDescription')}</p>
                </div>
                <span className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2 py-1 text-xxs font-bold text-[var(--color-text-muted)]">{t('account.feedbackEmailBadge')}</span>
              </div>
              <div className="mt-3 grid gap-2.5">
                <label className="grid gap-1 text-xxs font-black text-[var(--color-text-muted)]">
                  {t('account.feedbackType')}
                  <select
                    value={feedbackType}
                    onChange={(event) => setFeedbackType(event.target.value)}
                    className="rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                  >
                    <option value="bug">{t('account.feedbackTypeBug')}</option>
                    <option value="feature">{t('account.feedbackTypeFeature')}</option>
                    <option value="report">{t('account.feedbackTypeReport')}</option>
                    <option value="billing">{t('account.feedbackTypeBilling')}</option>
                    <option value="other">{t('account.feedbackTypeOther')}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xxs font-black text-[var(--color-text-muted)]">
                  {t('account.feedbackContent')}
                  <textarea
                    value={feedbackMessage}
                    onChange={(event) => setFeedbackMessage(event.target.value)}
                    rows={4}
                    maxLength={4000}
                    placeholder={t('account.feedbackPlaceholder')}
                    className="resize-y rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                  />
                  <span className="text-right font-medium text-[var(--color-text-subtle)]">{feedbackMessage.length}/4000</span>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="max-w-[32rem] text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.feedbackHint')}</p>
                <button
                  type="submit"
                  disabled={isSubmittingFeedback}
                  className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-black text-white transition hover:bg-[var(--color-primary-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingFeedback ? t('account.feedbackSubmitting') : t('account.feedbackSubmit')}
                </button>
              </div>
              {feedbackStatus && (
                <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]" role="status">
                  {feedbackStatus}
                </p>
              )}
            </form>
            <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-gray-150 dark:border-gray-900 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-900 pb-2">
                {t('account.billing')}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <div className="truncate text-sm font-black text-[var(--color-text)]">{billing?.pro?.active ? 'Pro 专业权益' : t('billing.platformModel')}</div>
                  <div className="mt-1 text-xxs font-semibold text-[var(--color-text-muted)]">{t('account.plan')}</div>
                </div>
                <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <div className="truncate text-sm font-black text-[var(--color-primary)]">
                    {billing?.pro?.active ? t('billing.proActive') : t('billing.proInactive')}
                  </div>
                  <div className="mt-1 text-xxs font-semibold text-[var(--color-text-muted)]">
                    {billing?.pro?.active && billing?.pro?.expiresAt
                      ? `${t('billing.proExpiresAt')} ${new Date(billing.pro.expiresAt).toLocaleDateString(language)}`
                      : t('billing.proStartsImmediately')}
                  </div>
                </div>
                <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <div className="truncate text-sm font-black text-[var(--color-text)]">{billing?.modelSource === 'custom' ? t('billing.customApis') : t('billing.platformModel')}</div>
                  <div className="mt-1 text-xxs font-semibold text-[var(--color-text-muted)]">{t('billing.modelSource')}</div>
                </div>
                <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-primary-soft)] p-3">
                  <div className="text-lg font-black text-[var(--color-primary)]">{formatCredits(billing?.creditBalance)}</div>
                  <div className="mt-1 text-xxs font-semibold text-[var(--color-text-muted)]">{t('account.credits')}</div>
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-xs dark:border-gray-800">
                <div className="font-black text-gray-950 dark:text-white">{t('account.buyCredits')}</div>
                <p className="mt-1 leading-relaxed text-gray-500 dark:text-gray-400">
                  {t('billing.buyDescription')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPackageType('STARTER')}
                    className={`rounded-lg border px-3 py-2 text-left transition active:scale-[0.98] ${
                      selectedPackageType === 'STARTER'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-300'
                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
                    }`}
                  >
                    <div className="font-black">{t('billing.starter')}</div>
                    <div className="mt-0.5 text-xxs opacity-75">{t('billing.starterDesc')}</div>
                  </button>
	                  <button
	                    type="button"
	                    onClick={() => setSelectedPackageType('PRO')}
	                    className={`rounded-lg border px-3 py-2 text-left transition active:scale-[0.98] ${
	                      selectedPackageType === 'PRO'
	                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300'
	                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
	                    }`}
	                  >
                    <div className="font-black">{t('billing.pro')}</div>
                    <div className="mt-0.5 text-xxs opacity-75">{t('billing.proDesc')}</div>
                  </button>
                </div>
                <div className="mt-3">
                  <div className="text-xxs font-bold text-gray-500 dark:text-gray-400">{t('account.paymentMethod')}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('alipay_qr')}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98] ${
                        paymentMethod === 'alipay_qr'
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-300'
                          : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
                      }`}
                    >
                      {t('account.alipay')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('paypal_qr')}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition active:scale-[0.98] ${
                        paymentMethod === 'paypal_qr'
                          ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/20 dark:text-sky-300'
                          : 'border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
                      }`}
                    >
                      {t('account.paypal')}
                    </button>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xxs font-bold text-[var(--color-text-muted)]">{t('account.paymentAmount')}</span>
                    <span className="text-sm font-black text-[var(--color-primary)]">{selectedPaymentPackage ? `${selectedPaymentPackage.currency === 'USD' ? '$' : '¥'}${(selectedPaymentPackage.amountCents / 100).toFixed(2)}` : '-'}</span>
                  </div>
                  <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.payExactAmount')}</p>
                </div>
                <div className="mt-3 rounded-lg bg-[var(--color-surface-muted)] px-2.5 py-2 text-xxs font-semibold text-[var(--color-text)]">{t('billing.oneTime')}</div>
                <div className="mt-4 flex justify-center">
                  {(paymentMethod === 'paypal_qr' ? billing?.paypalQrImageUrl : billing?.alipayQrImageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={paymentMethod === 'paypal_qr' ? billing?.paypalQrImageUrl : billing?.alipayQrImageUrl}
                      alt={paymentMethod === 'paypal_qr' ? t('account.paypalQr') : t('account.alipayQr')}
                      className="h-56 w-56 rounded-xl border bg-white p-2 object-contain shadow-sm"
                    />
                  ) : (
                    <div className="flex h-56 w-56 items-center justify-center rounded-xl border bg-gray-50 text-center text-xs font-bold text-gray-400 dark:border-gray-800 dark:bg-gray-900">
                      {t('account.paymentPlaceholder')}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xxs text-gray-400">{paymentMethod === 'paypal_qr' ? t('account.paypalPaymentHint') : alipayPaymentHint}</p>
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder={t('account.paymentNote')}
                  className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleCreateOrder}
                  disabled={isCreatingOrder}
                  className="order-action-button relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-[var(--color-primary)] px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[var(--color-primary-hover)] hover:shadow-md active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
                >
                  {isCreatingOrder ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      {orderProgressStage === 'syncing' ? t('order.syncingButton') : t('order.creatingButton')}
                    </>
                  ) : (
                    <>
                      <MailCheck className="h-4 w-4" aria-hidden="true" />
                      {t('account.createOrder', undefined, { package: selectedPackageLabel })}
                    </>
                  )}
                  {isCreatingOrder && <span className="order-action-sweep" aria-hidden="true" />}
                </button>
                <OrderProgress
                  stage={orderProgressStage}
                  title={
                    orderProgressStage === 'submitting'
                      ? t('order.creatingTitle')
                      : orderProgressStage === 'syncing'
                        ? t('order.syncingTitle')
                        : orderProgressStage === 'success'
                          ? t('order.createdTitle')
                          : t('order.failedTitle')
                  }
                  detail={billingMessage || ''}
                />
              </div>
            </div>
              </>
            )}

            {activeTab === 'system' && isSuperAdmin && adminBilling && (
              <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-amber-200 dark:border-amber-900/40 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">超级管理员 · 待确认订单</h3>
                </div>
                <OrderProgress
                  stage={adminOrderProgressStage}
                  title={
                    adminOrderProgressStage === 'submitting'
                      ? '正在处理订单'
                      : adminOrderProgressStage === 'syncing'
                        ? '正在同步账户状态'
                        : adminOrderProgressStage === 'success'
                          ? '订单处理完成'
                          : '订单处理失败'
                  }
                  detail={adminOrderMessage || ''}
                />
                {adminBilling.pendingOrders?.length ? (
                  adminBilling.pendingOrders.map((order: any) => (
                    <div key={order.id} className={`rounded-lg border p-3 text-xs transition-all duration-300 dark:border-gray-800 ${adminOrderAction?.orderId === order.id ? 'border-amber-400 bg-amber-50/70 shadow-sm dark:bg-amber-950/10' : 'border-gray-100'}`}>
                      <div className="font-bold text-gray-950 dark:text-white">{order.user?.email || order.userId}</div>
                      <div className="mt-2 grid gap-1 rounded-lg bg-gray-50 p-2 text-xxs dark:bg-gray-900">
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">订单类型：</span>{order.packageName}</div>
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">金额：</span>{formatOrderAmount(order.amountCents, order.currency)}</div>
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">付款方式：</span>{order.paymentMethod === 'paypal_qr' ? 'PayPal 收款码' : '支付宝收款码'}</div>
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">付款备注：</span><span className="font-black text-amber-700 dark:text-amber-300">{order.paymentNote || '无付款备注'}</span></div>
                        <div><span className="font-bold text-gray-600 dark:text-gray-300">创建时间：</span>{new Date(order.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleConfirmOrder(order.id)}
                          disabled={Boolean(adminOrderAction)}
                          className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded bg-amber-500 px-3 py-1.5 text-xxs font-bold text-white transition hover:bg-amber-600 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
                        >
                          {adminOrderAction?.orderId === order.id && adminOrderAction?.action === 'confirm' ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />确认中…</> : <><CheckCircle2 className="h-3.5 w-3.5" />确认订单</>}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectOrder(order.id)}
                          disabled={Boolean(adminOrderAction)}
                          className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xxs font-bold text-gray-600 transition hover:bg-gray-50 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                        >
                          {adminOrderAction?.orderId === order.id && adminOrderAction?.action === 'reject' ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />取消中…</> : <><XCircle className="h-3.5 w-3.5" />取消订单</>}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-400">暂无待确认订单。</p>
                )}
              </div>
            )}

            {activeTab === 'system' && isSuperAdmin && adminBilling && (
              <div className="bg-white dark:bg-gray-950 p-6 rounded-xl border border-[var(--color-border-strong)] shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-[var(--color-text)]">{t('discussion.moderation')}</h3>
                {(adminBilling.discussionReports || []).length ? adminBilling.discussionReports.map((item: any) => (
                  <article key={item.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs">
                    <div className="font-black text-[var(--color-text)]">{item.message?.report?.title || t('common.unknown')}</div>
                    <p className="mt-1 break-words text-[var(--color-text-muted)]">{item.message?.content}</p>
                    <div className="mt-2 text-xxs text-[var(--color-text-subtle)]">{t('discussion.reportedBy')}: {item.reporter?.name || item.reporter?.email || t('discussion.reader')} · {t('discussion.reason')}: {item.reason}</div>
                    <div className="mt-2 flex gap-2"><button type="button" onClick={() => handleDiscussionModeration(item.message.reportId, item.message.id, 'hide')} className="rounded border border-[var(--color-warning)] px-2 py-1 text-xxs font-bold text-[var(--color-warning)]">{t('discussion.hide')}</button><button type="button" onClick={() => handleDiscussionModeration(item.message.reportId, item.message.id, 'restore')} className="rounded border border-[var(--color-border-strong)] px-2 py-1 text-xxs font-bold text-[var(--color-text)]">{t('discussion.restore')}</button></div>
                  </article>
                )) : <p className="text-xs text-[var(--color-text-muted)]">{t('discussion.noReports')}</p>}
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
                {t('billing.modelLocked')}
              </div>
            )}

            {settingsMessage && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/30 rounded-lg text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                {settingsMessage}
              </div>
            )}

            <PlatformModelSelector
              operation="analysis"
              source={modelSource}
              onSourceChange={setModelSource}
              selectedId={defaultPlatformModelConfigId}
              onSelectedIdChange={setDefaultPlatformModelConfigId}
              allowCustomOverride={canUseOwnApi}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modelSource === 'custom' && (
                <>
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

                </>
              )}

              <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 md:col-span-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-xs font-black text-[var(--color-text)]">{t('rss.settingsTitle')}</h4>
                    <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('rss.settingsDescription')}</p>
                  </div>
                  <span className="w-fit rounded-full bg-[var(--color-primary-soft)] px-2 py-1 text-xxs font-bold text-[var(--color-link)]">
                    {rssConfigSource === 'admin' ? t('rss.adminDefault') : t('rss.personalConfig')}
                  </span>
                </div>

                {apiSettingsLocked ? (
                  <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('rss.locked')}</p>
                ) : null}

                <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
                  <table className="min-w-[620px] w-full text-left text-xxs">
                    <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
                      <tr>
                        <th className="w-10 px-2 py-2" aria-label="RSS subscription" />
                        <th className="px-2 py-2 font-bold">{t('rss.source')}</th>
                        <th className="px-2 py-2 font-bold">{t('rss.region')}</th>
                        <th className="px-2 py-2 font-bold">{t('rss.availability')}</th>
                        <th className="px-2 py-2 font-bold">{t('rss.terms')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rssSourceCatalog.map((source) => (
                        <tr key={source.id} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={rssFeedConfig.catalogIds.includes(source.id)}
                              disabled={apiSettingsLocked}
                              onChange={() => toggleRssCatalogSource(source.id)}
                              className="h-3.5 w-3.5 rounded border-[var(--color-input-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-2 py-2 font-bold text-[var(--color-text)]">
                            <a href={source.websiteUrl} target="_blank" rel="noreferrer" className="hover:text-[var(--color-link)] hover:underline">
                              {language === 'zh-CN' ? source.nameZh || source.name : source.name}
                            </a>
                          </td>
                          <td className="px-2 py-2 text-[var(--color-text-muted)]">{source.region === 'china' ? t('rss.regionChina') : source.region === 'chinese-language' ? t('rss.regionChineseLanguage') : t('rss.regionInternational')}</td>
                          <td className="px-2 py-2">
                            <span className="rounded bg-[var(--color-primary-soft)] px-1.5 py-0.5 font-bold text-[var(--color-link)]">
                              {source.rssAvailability === 'official_public'
                                ? t('rss.officialPublic')
                                : source.rssAvailability === 'official_headline_fallback'
                                  ? t('rss.officialHeadlineSource')
                                  : t('rss.officialTerms')}
                            </span>
                          </td>
                          <td className="max-w-64 px-2 py-2 leading-relaxed text-[var(--color-text-muted)]">{language === 'zh-CN' ? source.termsNoteZh || source.termsNote : source.termsNote}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!apiSettingsLocked ? (
                  <div className="space-y-2 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-card)] p-3">
                    <p className="text-xs font-bold text-[var(--color-text)]">{t('rss.customTitle')}</p>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.4fr)_auto]">
                      <input
                        value={rssCustomName}
                        onChange={(event) => setRssCustomName(event.target.value)}
                        placeholder={t('rss.customName')}
                        className="min-w-0 rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                      />
                      <input
                        type="url"
                        value={rssCustomUrl}
                        onChange={(event) => setRssCustomUrl(event.target.value)}
                        placeholder={t('rss.customUrl')}
                        className="min-w-0 rounded-lg border border-[var(--color-input-border)] bg-[var(--color-input-bg)] px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                      />
                      <button type="button" onClick={addCustomRssFeed} className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--color-primary-hover)]">
                        {t('rss.add')}
                      </button>
                    </div>
                    {rssFeedConfig.customFeeds.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {rssFeedConfig.customFeeds.map((feed) => (
                          <span key={feed.url} className="inline-flex max-w-full items-center gap-1 rounded bg-[var(--color-surface-muted)] px-2 py-1 text-xxs font-semibold text-[var(--color-text-muted)]">
                            <span className="max-w-44 truncate">{feed.name}</span>
                            <button type="button" onClick={() => removeCustomRssFeed(feed.url)} className="font-black text-[var(--color-danger)]">{t('rss.remove')}</button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

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

              <div className="space-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
                <p className="text-xs font-semibold text-[var(--color-text)]">{t('report.outputLanguage', '报告输出语言')}</p>
                <p className="text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.reportFollowsInterface', '报告会始终跟随当前界面语言；切换界面语言后，下一份报告和后续追问将自动使用相同语言。')}</p>
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
