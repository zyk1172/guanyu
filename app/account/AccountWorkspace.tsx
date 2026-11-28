'use client';

import { useConfirmation } from '@/components/ui/ConfirmationProvider';

import AccountProfile from '@/components/AccountProfile';
import { Button, ButtonLink, Input, Panel, Select, Textarea } from '@/components/ui/controls';

import DeepseekSearchSettings from '@/components/DeepseekSearchSettings';
import Header from '@/components/Header';
import { useUiLanguage } from '@/components/LanguageProvider';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import OrderHistory from '@/components/OrderHistory';
import { PlatformModelSelector } from '@/components/PlatformModelSelector';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { formatOrderStatus, formatPlanType } from '@/lib/account-display';
import {
  THINKING_DEPTH_OPTIONS,
  normalizeReportLanguage,
  normalizeThinkingDepthValue,
} from '@/lib/types';
import { getWorkspaceCopy } from '@/lib/workspace-copy';
import {
  CheckCircle2,
  DatabaseBackup,
  LayoutDashboard,
  LoaderCircle,
  MessagesSquare,
  ReceiptText,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useRef, useState } from 'react';

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
          <div className="text-xs font-bold text-[var(--color-text)]">{title}</div>
          <p className="mt-0.5 text-xxs leading-relaxed text-[var(--color-text-muted)]">{detail}</p>
        </div>
      </div>
      {stage !== 'error' && (
        <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={`h-1.5 rounded-full transition-colors duration-150 ${
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
  recommended?: boolean;
};

export default function AccountWorkspace({ account, isSuperAdmin, view = 'account' }: {
  account: { id: string; email?: string | null };
  isSuperAdmin: boolean;
  view?: 'account' | 'system';
}) {
  const { prompt, confirm } = useConfirmation();
  const router = useRouter();
  const { language, t } = useUiLanguage();

  const [accountTab, setAccountTab] = useState<'info' | 'settings'>('info');
  const activeTab = view === 'system' ? 'system' : accountTab;

  // 模型与偏好设置
  const [modelName, setModelName] = useState('gpt-4o');
  const [llmProvider, setLlmProvider] = useState<'openai_compatible' | 'openai' | 'anthropic'>('openai_compatible');
  const [llmBaseUrl, setLlmBaseUrl] = useState('https://api.openai.com/v1');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [hasLlmApiKey, setHasLlmApiKey] = useState(false);
  const [searchProvider, setSearchProvider] = useState('free');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [hasDeepseekApiKey, setHasDeepseekApiKey] = useState(false);
  const [clearDeepseekApiKey, setClearDeepseekApiKey] = useState(false);
  const [enableTavilySearch, setEnableTavilySearch] = useState(false);
  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [allowPaidSearch, setAllowPaidSearch] = useState(false);
  const [customToolsEnabled, setCustomToolsEnabled] = useState(true);
  const [hasTavilyApiKey, setHasTavilyApiKey] = useState(false);
  const [tavilySearchDepth, setTavilySearchDepth] = useState('basic');
  const [enableSerperSearch, setEnableSerperSearch] = useState(false);
  const [serperApiKey, setSerperApiKey] = useState('');
  const [hasSerperApiKey, setHasSerperApiKey] = useState(false);
  const [reasoningDepth, setReasoningDepth] = useState('medium');
  const reportLanguage = normalizeReportLanguage(language);
  const [isPublic, setIsPublic] = useState(false);
  const [enableCharts, setEnableCharts] = useState(true);

  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsSettingsMessage] = useState<string | null>(null);
  const [billing, setBilling] = useState<any>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const orderRequestLock = useRef(false);
  const orderRequest = useRef<{ selection: string; id: string } | null>(null);
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
  // 1. 登录路由守卫

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

  // 2. 加载账户和设置
  useEffect(() => {
    if (view === 'account') {
      // 获取用户偏好设置
      fetch('/api/account/settings')
        .then((res) => res.json())
        .then((data) => {
          if (data && !data.error) {
            setModelName(data.defaultModelName);
            setLlmProvider(data.llmProvider === 'openai' || data.llmProvider === 'anthropic' ? data.llmProvider : 'openai_compatible');
            setLlmBaseUrl(data.llmBaseUrl || 'https://api.openai.com/v1');
            setHasLlmApiKey(Boolean(data.hasLlmApiKey));
        setAllowPaidSearch(Boolean(data.paidSearchAllowed));
        setCustomToolsEnabled(data.customWebResearchEnabled !== false);
            setSearchProvider(data.searchProvider === 'deepseek' ? 'deepseek' : 'free');
            setHasDeepseekApiKey(Boolean(data.hasDeepseekApiKey));
            setEnableTavilySearch(Boolean(data.enableTavilySearch));
            setHasTavilyApiKey(Boolean(data.hasTavilyApiKey));
            setTavilySearchDepth(data.tavilySearchDepth || 'basic');
            setEnableSerperSearch(Boolean(data.enableSerperSearch));
            setHasSerperApiKey(Boolean(data.hasSerperApiKey));
            setReasoningDepth(normalizeThinkingDepthValue(data.defaultReasoningDepth));
            setIsPublic(data.defaultIsPublic);
            setEnableCharts(data.defaultEnableCharts);
            setAccountCreatedAt(data.account?.createdAt || null);
            setCanUseOwnApi(Boolean(data.canUseOwnApi));
            setModelSource(data.modelSource === 'custom' ? 'custom' : 'platform');
            setDefaultPlatformModelConfigId(String(data.defaultPlatformModelConfigId || ''));
            setRssFeedConfig(data.rssFeedConfig || { catalogIds: [], customFeeds: [] });
            setRssSourceCatalog(Array.isArray(data.rssSourceCatalog) ? data.rssSourceCatalog : []);
            setRssConfigSource(data.rssConfigSource === 'personal' ? 'personal' : 'admin');
          }
        });

      fetchBilling();
    }
  }, [view, account.id, fetchBilling]);

  useEffect(() => {
    if (isSuperAdmin && activeTab === 'system') {
      fetchAdminBilling();
    }
  }, [activeTab, isSuperAdmin, fetchAdminBilling]);

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
          llmProvider,
          llmBaseUrl: llmBaseUrl.trim(),
          llmApiKey: llmApiKey.trim(),
          ...(canUseOwnApi ? { searchProvider, deepseekApiKey: deepseekApiKey.trim(), clearDeepseekApiKey } : {}),
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
        setDeepseekApiKey('');
        setClearDeepseekApiKey(false);
        setHasDeepseekApiKey(Boolean(data.hasDeepseekApiKey));
        setSearchProvider(data.searchProvider === 'deepseek' ? 'deepseek' : 'free');
        setTavilyApiKey('');
        setSerperApiKey('');
        setHasLlmApiKey(Boolean(data.hasLlmApiKey));
        setAllowPaidSearch(Boolean(data.paidSearchAllowed));
        setCustomToolsEnabled(data.customWebResearchEnabled !== false);
        setHasTavilyApiKey(Boolean(data.hasTavilyApiKey));
        setHasSerperApiKey(Boolean(data.hasSerperApiKey));
        setEnableTavilySearch(Boolean(data.enableTavilySearch));
        setEnableSerperSearch(Boolean(data.enableSerperSearch));
        setTavilySearchDepth(data.tavilySearchDepth || 'basic');
        setCanUseOwnApi(Boolean(data.canUseOwnApi));
        setDefaultPlatformModelConfigId(String(data.defaultPlatformModelConfigId || ''));
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
    if (orderRequestLock.current || !selectedPaymentPackage?.available) return;
    setBillingMessage(null);
    orderRequestLock.current = true;
    setIsCreatingOrder(true);
    const selection = `${selectedPackageType}:${paymentMethod}`;
    try {
      if (orderRequest.current?.selection !== selection) {
        orderRequest.current = { selection, id: crypto.randomUUID() };
      }
      const response = await fetch('/api/billing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selectedPackageType, paymentMethod, clientRequestId: orderRequest.current.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setBillingMessage(data.error || t('order.createFailed'));
        return;
      }
      orderRequest.current = null;
      router.push(`/checkout/${encodeURIComponent(data.id)}`);
    } catch {
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
      const password = await prompt(language.startsWith('zh') ? '输入当前密码以下载你的账号数据。' : 'Enter your current password to download your account data.', { secret: true });
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
    if (!await confirm(t('account.deleteAccountConfirm'))) return;
    const confirmation = await prompt(t('account.deleteAccountHint'), { secret: true, label: language.startsWith('zh') ? '当前密码或邮箱验证码' : 'Current password or email code' });
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
    if (!await confirm('确定取消这笔待确认订单吗？')) return;
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
      const stepUpPassword = sensitive ? await prompt('请输入当前密码以执行敏感操作。', { secret: true }) : '';
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
        new Date(user.createdAt).toLocaleString(language),
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
      const stepUpPassword = await prompt('请输入当前密码以创建运营备份。', { secret: true });
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
    if (!await confirm(t('backup.restoreConfirm'))) return;
    setBackupBusy('restore');
    try {
      const stepUpPassword = await prompt('请输入当前密码以恢复运营备份。', { secret: true });
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
      await Promise.all([fetchAdminBilling(), fetchBilling()]);
    } catch (error: any) {
      setBackupMessage(error?.message || t('backup.restoreFailed'));
    } finally {
      setBackupBusy(null);
    }
  };

  const apiSettingsLocked = !canUseOwnApi;
  const adminUsers = (adminBilling?.users || []).filter((user: any) => {
    const keyword = adminUserSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [user.email, user.id, user.name, user.role, user.planType]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword));
  });

  return (
    <main className="workspace-page pb-12">
      <Header />

      <div id="main-content" tabIndex={-1} className="workspace-container workspace-content space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
          {view === 'system' ? <>
            <h1 className="ui-page-title">{t('admin.systemTitle', '系统管理')}</h1>
            <ButtonLink href="/account">{t('account.title')}</ButtonLink>
          </> : <>
          <div>
            <h1 className="ui-page-title">{t('account.title')}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">{t('account.description')}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="grid w-full grid-cols-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 sm:flex sm:w-auto">
            <Button variant="tab" aria-pressed={activeTab === 'info'}
              onClick={() => setAccountTab('info')}
           >
              {t('account.infoTab')}
            </Button>
            <Button variant="tab" aria-pressed={activeTab === 'settings'}
              onClick={() => setAccountTab('settings')}
           >
              {t('account.settingsTab')}
            </Button>
            <ButtonLink variant="ghost" href="/account/audits">{t('account.historyTab')}</ButtonLink>
            {isSuperAdmin && (
              <ButtonLink variant="ghost" href="/admin">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('admin.systemTab', '系统管理')}
              </ButtonLink>
            )}
          </div>
          <ButtonLink variant="secondary" href="/account/extensions">
            {t('account.extensions')}
          </ButtonLink>
          </div>
          </>}
        </div>

        {/* 1. 基本信息面板 */}
        {(activeTab === 'info' || activeTab === 'system') && (
          <div className={`motion-content-enter grid items-start ${activeTab === 'system' ? 'gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.65fr)]' : 'gap-6 lg:grid-cols-2'}`}>
          {activeTab === 'system' && (
            <Panel className="col-span-full overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="ui-panel-title text-[var(--color-text)]">{t('admin.modules', language.startsWith('zh') ? '管理模块' : 'Management modules')}</h2>
                    <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-[var(--color-text-muted)]">{t('admin.systemDescription', '集中处理平台运营、用户权限、内容审核和数据安全。以下功能仅超级管理员可见。')}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href="/admin/audits">{t('admin.manageReports', '管理全站报告')}</ButtonLink>
                  <ButtonLink href="/admin/mail">{t('admin.emailRecords', '邮件记录')}</ButtonLink>
                  <ButtonLink href="/admin/models">{language.startsWith('zh') ? '平台模型' : 'Platform models'}</ButtonLink>
                  <ButtonLink href="/admin/search">{language.startsWith('zh') ? '搜索设置' : 'Search settings'}</ButtonLink>
                  <ButtonLink href="/admin/traffic">{language.startsWith('zh') ? '访问统计' : 'Traffic'}</ButtonLink>
                </div>
              </div>
              {adminBilling ? (
                <div className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
                  {[
                    { icon: Users, label: t('admin.registeredUsers', '注册用户'), value: adminBilling.users?.length || 0 },
                    { icon: ReceiptText, label: t('admin.pendingOrders', '待确认订单'), value: adminBilling.pendingOrders?.length || 0 },
                    { icon: MessagesSquare, label: t('admin.pendingReports', '待审核举报'), value: adminBilling.discussionReports?.length || 0 },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3 bg-[var(--color-card)] px-4 py-3">
                      <Icon className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="text-lg font-bold tabular-nums text-[var(--color-text)]">{value}</div>
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
            </Panel>
          )}
          {activeTab === 'info' && <Panel as="div" className="col-span-full"><AccountProfile /></Panel>}
          <Panel as="div" className="system flex min-w-0 flex-col gap-4 space-y-4">
            {activeTab === 'info' && (
              <>
            <h2 className="ui-panel-title">{t('account.infoTab')}</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              <dt className="text-[var(--color-text-muted)]">{t('account.email')}</dt>
              <dd className="[overflow-wrap:anywhere]">{account.email}</dd>
              <dt className="text-[var(--color-text-muted)]">{t('account.userId')}</dt>
              <dd className="font-mono [overflow-wrap:anywhere]">{account.id}</dd>
              <dt className="text-[var(--color-text-muted)]">{t('account.joined')}</dt>
              <dd>{accountCreatedAt ? new Date(accountCreatedAt).toLocaleString(language) : t('common.unknown')}</dd>
              <dt className="text-[var(--color-text-muted)]">{t('account.status')}</dt>
              <dd className="text-[var(--color-success)]">{t('account.online')}</dd>
              <dt className="text-[var(--color-text-muted)]">{t('account.role')}</dt>
              <dd>{isSuperAdmin ? t('account.superAdmin') : t('account.user')}</dd>
            </dl>
            <form onSubmit={handleChangePassword} className="border-t border-[var(--color-border)] pt-4">
              <div>
                <h3 className="text-sm font-semibold">{t('account.passwordTitle')}</h3>
                <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.passwordDescription')}</p>
              </div>
              <div className="mt-3 grid gap-2">
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  aria-label={t('account.currentPassword')}
                  placeholder={t('account.currentPassword')}
                  autoComplete="current-password"
               />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  aria-label={t('account.newPassword')}
                  placeholder={t('account.newPassword')}
                  autoComplete="new-password"
               />
                <Input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  aria-label={t('account.confirmNewPassword')}
                  placeholder={t('account.confirmNewPassword')}
                  autoComplete="new-password"
               />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xxs text-[var(--color-text-muted)]">{t('account.passwordHint')}</p>
                <Button variant="primary" type="submit" disabled={isChangingPassword}>
                  {isChangingPassword ? t('account.passwordChanging') : t('account.changePassword')}
                </Button>
              </div>
              {passwordMessage && <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]" role="status">{passwordMessage}</p>}
            </form>
            <section className="border-t border-[var(--color-border)] pt-4">
              <h3 className="text-sm font-semibold">{t('account.privacyTitle', '账号数据')}</h3>
              <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.deleteAccountHint')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ButtonLink variant="secondary" href="/saved-articles">
                  {t('saved.title')}
                </ButtonLink>
                <Button variant="primary" type="button" disabled={isExportingData} onClick={handleExportData}>
                  {isExportingData ? t('account.exportingData') : t('account.exportData')}
                </Button>
                <Button variant="danger" type="button" disabled={isDeletingAccount} onClick={handleDeleteAccount}>
                  {isDeletingAccount ? t('account.deletingAccount') : t('account.deleteAccount')}
                </Button>
              </div>
              {privacyMessage && <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]" role="status">{privacyMessage}</p>}
            </section>
              </>
            )}
            {activeTab === 'system' && isSuperAdmin && adminBilling && (
              <Panel className="order-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]"><DatabaseBackup className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />{t('backup.title')}</h4>
                    <p className="mt-1 max-w-3xl text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('backup.description')}</p>
                  </div>
                  <span className="ui-badge w-fit bg-[var(--color-warning)]/15 text-[var(--color-warning)]">{t('backup.adminOnly')}</span>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                    <h5 className="text-xs font-bold text-[var(--color-text)]">{t('backup.createTitle')}</h5>
                    <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('backup.createHint')}</p>
                    <Input
                      type="password"
                      aria-label={`${t('backup.createTitle')} · ${t('backup.passphrasePlaceholder')}`}
                      value={backupPassphrase}
                      onChange={(event) => setBackupPassphrase(event.target.value)}
                      autoComplete="new-password"
                      placeholder={t('backup.passphrasePlaceholder')}
                      className="mt-3 w-full"
                   />
                    <Button variant="primary" type="button" onClick={createOperationsBackup} disabled={backupBusy !== null} className="mt-2">
                      {backupBusy === 'create' ? t('backup.creating') : t('backup.download')}
                    </Button>
                  </div>

                  <div className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/5 p-3">
                    <h5 className="text-xs font-bold text-[var(--color-text)]">{t('backup.restoreTitle')}</h5>
                    <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('backup.restoreHint')}</p>
                    <Input
                      type="file"
                      aria-label={t('backup.restoreTitle')}
                      accept=".guanyu-backup,application/vnd.guanyu.operations-backup+json,application/json"
                      onChange={(event) => setRestoreArchive(event.target.files?.[0] || null)}
                      className="mt-3 w-full"
                   />
                    <Input
                      type="password"
                      aria-label={`${t('backup.restoreTitle')} · ${t('backup.passphrasePlaceholder')}`}
                      value={restorePassphrase}
                      onChange={(event) => setRestorePassphrase(event.target.value)}
                      autoComplete="new-password"
                      placeholder={t('backup.passphrasePlaceholder')}
                      className="mt-2 w-full"
                   />
                    <Input
                      aria-label={t('backup.restoreTitle')}
                      value={restoreConfirmation}
                      onChange={(event) => setRestoreConfirmation(event.target.value)}
                      placeholder={t('backup.confirmationPlaceholder', undefined, { confirmation: language === 'zh-CN' || language === 'zh-TW' ? '恢复全部运营数据' : 'RESTORE ALL OPERATIONS DATA' })}
                      className="mt-2 w-full"
                   />
                    <Button variant="danger" type="button" onClick={restoreOperationsBackup} disabled={backupBusy !== null} className="mt-2">
                      {backupBusy === 'restore' ? t('backup.restoring') : t('backup.restore')}
                    </Button>
                  </div>
                </div>
                <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('backup.securityNote')}</p>
                {backupMessage && <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]" role="status">{backupMessage}</p>}
              </Panel>
            )}

            {activeTab === 'system' && isSuperAdmin && adminBilling && (
              <Panel as="div" className="order-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]"><Users className="h-4 w-4 text-[var(--color-primary)]" aria-hidden="true" />注册用户与权限</h4>
                    <p className="mt-1 text-xxs font-semibold text-[var(--color-text-muted)]">
                      搜索用户、导出注册信息、查看最近活动、加点、授予 Pro 专业权益、封禁、删除账号和发送邮件。
                    </p>
                  </div>
                  <Button variant="primary"
                    type="button"
                    onClick={exportUsersCsv}
                 >
                    导出 CSV
                  </Button>
                </div>
                <Input
                  aria-label={language.startsWith('zh') ? '搜索注册用户' : 'Search registered users'}
                      value={adminUserSearch}
                  onChange={(event) => setAdminUserSearch(event.target.value)}
                  placeholder="搜索邮箱、用户 ID、套餐或角色..."
                  className="mt-3 w-full"
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
                      ...(user.purchaseOrders || []).map((order: any) => ({ type: '订单', text: `${order.packageName} · ${formatOrderStatus(order.status, language)} · ${formatOrderAmount(order.amountCents, order.currency)}`, date: order.createdAt })),
                      ...(user.pointTransactions || []).map((tx: any) => ({ type: '点数', text: `${tx.reason} · ${(tx.deltaCents || tx.delta * 100 || 0) / 100} 点`, date: tx.createdAt })),
                    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    const isExpanded = Boolean(expandedUserIds[user.id]);
                    const visibleActivities = isExpanded ? activities : activities.slice(0, 3);
                    return (
                      <Panel as="article" key={user.id} className="text-xs">
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-[var(--color-text)]">{user.email}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-xxs font-bold">
                              <span className="ui-badge bg-[var(--color-primary-soft)] text-[var(--color-link)]">{user.role === 'super_admin' ? '超级管理员' : '普通用户'}</span>
                              <span className="ui-badge bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">{formatPlanType(user.planType, language)}</span>
                              <span className="ui-badge bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">点数 {credit}</span>
                              <span className="ui-badge bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">报告 {user._count?.audits || 0}</span>
                              <span className={`ui-badge ${user.isBanned ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]' : 'bg-[var(--color-success-soft)] text-[var(--color-success)]'}`}>
                                {user.isBanned ? '已封禁' : '正常'}
                              </span>
                            </div>
                            <div className="mt-1 break-all font-mono text-xxs text-[var(--color-text-subtle)]">ID: {user.id}</div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Input
                              aria-label={language.startsWith('zh') ? `为 ${user.email} 增加的点数` : `Credits to add for ${user.email}`}
                              value={adminGrantDraft[user.id] || ''}
                              onChange={(event) => setAdminGrantDraft((prev) => ({ ...prev, [user.id]: event.target.value }))}
                              placeholder="点数"
                              className="w-16"
                           />
                            <Button variant="primary" type="button" onClick={() => handleAdminUserAction('grant', { userId: user.id, points: Number.parseInt(adminGrantDraft[user.id] || '0', 10), reason: '超级管理员手动加点' })}>加点</Button>
                            <Button variant="secondary" type="button" onClick={() => handleAdminUserAction('grantProAccess', { userId: user.id })}>授予 Pro 权益</Button>
                            <Button variant="secondary" type="button" onClick={() => handleAdminUserAction('setUserBanned', { userId: user.id, isBanned: !user.isBanned })}>{user.isBanned ? '解封' : '封禁'}</Button>
                            <Button variant="danger-ghost" type="button" onClick={async () => await confirm(`确定删除账号 ${user.email} 吗？`) && handleAdminUserAction('deleteUser', { userId: user.id })}>删除</Button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_1fr]">
                          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                            <div className="font-bold text-[var(--color-text)]">最近活动</div>
                            <ul className="mt-2 space-y-1 text-xxs text-[var(--color-text-muted)]">
                              {visibleActivities.length ? visibleActivities.map((activity, index) => (
                                <li key={`${activity.type}-${activity.date}-${index}`} className="rounded bg-[var(--color-surface-muted)] px-2 py-1">
                                  <span className="font-bold text-[var(--color-text)]">{activity.type}</span> · {activity.text} · {new Date(activity.date).toLocaleString(language)}
                                </li>
                              )) : <li>暂无活动。</li>}
                            </ul>
                            {activities.length > 3 && (
                              <Button variant="ghost" type="button" onClick={() => setExpandedUserIds((prev) => ({ ...prev, [user.id]: !prev[user.id] }))} className="mt-2">
                                {isExpanded ? '收起活动' : `展开全部 ${activities.length} 条活动`}
                              </Button>
                            )}
                          </div>
                          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                            <div className="font-bold text-[var(--color-text)]">给用户发邮件</div>
                            <Textarea
                              aria-label={language.startsWith('zh') ? `发送给 ${user.email} 的邮件内容` : `Email message for ${user.email}`}
                              value={adminEmailDraft[user.id] || ''}
                              onChange={(event) => setAdminEmailDraft((prev) => ({ ...prev, [user.id]: event.target.value }))}
                              rows={3}
                              placeholder="输入通知内容..."
                              className="mt-2 w-full"
                           />
                            <Button variant="primary"
                              type="button"
                              onClick={() => handleAdminUserAction('sendUserEmail', { userId: user.id, subject: '观隅账号通知', message: adminEmailDraft[user.id] || '' })}
                              className="mt-2"
                           >
                              发送邮件
                            </Button>
                          </div>
                        </div>
                      </Panel>
                    );
                  })}
                  {adminUsers.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-text-muted)]">没有匹配的注册用户。</div>
                  )}
                </div>
              </Panel>
            )}
          </Panel>
          <div className="space-y-4">
            {activeTab === 'info' && (
            <Panel as="div" className="space-y-4">
              <h2 className="ui-panel-title">{t('account.billing')}</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-[var(--color-text-muted)]">{t('account.plan')}</dt>
                  <dd>{billing?.pro?.active ? (language.startsWith('zh') ? 'Pro 专业权益' : 'Pro') : t('billing.platformModel')}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--color-text-muted)]">{t('account.credits')}</dt>
                  <dd className="font-semibold tabular-nums">{formatCredits(billing?.creditBalance)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--color-text-muted)]">{t('billing.modelSource')}</dt>
                  <dd>{billing?.modelSource === 'custom' ? t('billing.customApis') : t('billing.platformModel')}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--color-text-muted)]">{billing?.pro?.active ? t('billing.proActive') : t('billing.proInactive')}</dt>
                  <dd>{billing?.pro?.active && billing?.pro?.expiresAt
                    ? `${t('billing.proExpiresAt')} ${new Date(billing.pro.expiresAt).toLocaleDateString(language)}`
                    : t('billing.proStartsImmediately')}</dd>
                </div>
              </dl>
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-xs">
                <div className="font-bold text-[var(--color-text)]">{t('account.buyCredits')}</div>
                <p className="mt-1 leading-relaxed text-[var(--color-text-muted)]">
                  {t('billing.buyDescription')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="choice" aria-pressed={selectedPackageType === 'STARTER'}
                    type="button"
                    onClick={() => setSelectedPackageType('STARTER')}
                 >
                    <div className="font-bold">{t('billing.starter')}</div>
                    <div className="mt-0.5 text-xxs opacity-75">{t('billing.starterDesc')}</div>
                  </Button>
	                  <Button variant="choice" aria-pressed={selectedPackageType === 'PRO'}
	                    type="button"
	                    onClick={() => setSelectedPackageType('PRO')}
	                 >
                    <div className="font-bold">{t('billing.pro')}</div>
                    <div className="mt-0.5 text-xxs opacity-75">{t('billing.proDesc')}</div>
                  </Button>
                </div>
                <div className="mt-3">
                  <div className="text-xxs font-bold text-[var(--color-text-muted)]">{t('account.paymentMethod')}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button variant="choice" aria-pressed={paymentMethod === 'alipay_qr'}
                      type="button"
                      onClick={() => setPaymentMethod('alipay_qr')}
                   >
                      {t('account.alipay')}
                    </Button>
                    <Button variant="choice" aria-pressed={paymentMethod === 'paypal_qr'}
                      type="button"
                      onClick={() => setPaymentMethod('paypal_qr')}
                   >
                      {t('account.paypal')}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xxs font-bold text-[var(--color-text-muted)]">{t('account.paymentAmount')}</span>
                    <span className="text-sm font-bold text-[var(--color-primary)]">{selectedPaymentPackage ? `${selectedPaymentPackage.currency === 'USD' ? '$' : '¥'}${(selectedPaymentPackage.amountCents / 100).toFixed(2)}` : '-'}</span>
                  </div>
                  <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{language.startsWith('zh') ? '请在收银台复核应付金额与所选付款方式。' : 'Review the amount and payment method in checkout.'}</p>
                </div>
                <div className="mt-3 rounded-lg bg-[var(--color-surface-muted)] px-2.5 py-2 text-xxs font-semibold text-[var(--color-text)]">{t('billing.oneTime')}</div>
                <Button variant="primary" onClick={handleCreateOrder} busy={isCreatingOrder} disabled={!selectedPaymentPackage?.available} className="mt-3 w-full">
                  {isCreatingOrder ? t('order.creatingButton') : language.startsWith('zh') ? '前往安全收银台' : 'Go to secure checkout'}
                </Button>
                {selectedPaymentPackage && !selectedPaymentPackage.available && <p role="status" className="mt-2 text-sm text-[var(--color-text-muted)]">{language.startsWith('zh') ? '此付款方式暂不可用，请选择其他方式。' : 'This payment method is unavailable. Choose another method.'}</p>}
                {billingMessage && <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{billingMessage}</p>}
              </div>
            </Panel>
            )}

            {activeTab === 'system' && isSuperAdmin && adminBilling && (
              <Panel as="div" className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[var(--color-warning)]" aria-hidden="true" />
                  <h3 className="ui-panel-title text-[var(--color-warning)]">超级管理员 · 待确认订单</h3>
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
                <p className="text-sm text-[var(--color-text-muted)]">请在收款平台核对流水号、实际到账金额、币种和收款账号，再确认发放权益。</p>
                {adminBilling.pendingOrders?.length ? (
                  adminBilling.pendingOrders.map((order: any) => (
                    <Panel as="div" key={order.id} className="text-xs transition-colors duration-150">
                      <div className="font-bold text-[var(--color-text)]">{order.user?.email || order.userId}</div>
                      <div className="mt-2 grid gap-1 rounded-lg bg-[var(--color-surface-muted)] p-2 text-xxs">
                        <div><span className="font-bold text-[var(--color-text-muted)]">订单类型：</span>{order.packageName}</div>
                        <div><span className="font-bold text-[var(--color-text-muted)]">金额：</span>{formatOrderAmount(order.amountCents, order.currency)}</div>
                        <div><span className="font-bold text-[var(--color-text-muted)]">付款方式：</span>{order.paymentMethod === 'paypal_qr' ? 'PayPal 收款码' : '支付宝收款码'}</div>
                        <div><span className="font-bold text-[var(--color-text-muted)]">付款备注：</span><span className="font-bold text-[var(--color-warning)]">{order.paymentNote || '无付款备注'}</span></div>
                        <div><span className="font-bold text-[var(--color-text-muted)]">创建时间：</span>{new Date(order.createdAt).toLocaleString(language)}</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="primary"
                          type="button"
                          onClick={() => handleConfirmOrder(order.id)}
                          disabled={Boolean(adminOrderAction)}
                       >
                          {adminOrderAction?.orderId === order.id && adminOrderAction?.action === 'confirm' ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />确认中…</> : <><CheckCircle2 className="h-3.5 w-3.5" />确认订单</>}
                        </Button>
                        <Button variant="primary"
                          type="button"
                          onClick={() => handleRejectOrder(order.id)}
                          disabled={Boolean(adminOrderAction)}
                       >
                          {adminOrderAction?.orderId === order.id && adminOrderAction?.action === 'reject' ? <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />取消中…</> : <><XCircle className="h-3.5 w-3.5" />取消订单</>}
                        </Button>
                      </div>
                    </Panel>
                  ))
                ) : (
                  <p className="text-xs text-[var(--color-text-subtle)]">暂无待确认订单。</p>
                )}
              </Panel>
            )}

            {activeTab === 'system' && isSuperAdmin && adminBilling && (
              <Panel as="div" className="space-y-3">
                <h3 className="ui-panel-title text-[var(--color-text)]">{t('discussion.moderation')}</h3>
                {(adminBilling.discussionReports || []).length ? adminBilling.discussionReports.map((item: any) => (
                  <article key={item.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs">
                    <div className="font-bold text-[var(--color-text)]">{item.message?.report?.title || t('common.unknown')}</div>
                    <p className="mt-1 break-words text-[var(--color-text-muted)]">{item.message?.content}</p>
                    <div className="mt-2 text-xxs text-[var(--color-text-subtle)]">{t('discussion.reportedBy')}: {item.reporter?.name || item.reporter?.email || t('discussion.reader')} · {t('discussion.reason')}: {item.reason}</div>
                    <div className="mt-2 flex gap-2"><Button variant="secondary" type="button" onClick={() => handleDiscussionModeration(item.message.reportId, item.message.id, 'hide')}>{t('discussion.hide')}</Button><Button variant="secondary" type="button" onClick={() => handleDiscussionModeration(item.message.reportId, item.message.id, 'restore')}>{t('discussion.restore')}</Button></div>
                  </article>
                )) : <p className="text-xs text-[var(--color-text-muted)]">{t('discussion.noReports')}</p>}
              </Panel>
            )}
          </div>
          {activeTab === 'info' && <>
            <OrderHistory refreshKey={billing?.recentOrders?.[0]?.id || ''} />
            <Panel className="col-span-full">
              <form onSubmit={handleSubmitFeedback}>
                <h2 className="ui-panel-title">{t('account.feedbackTitle')}</h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t('account.feedbackDescription')}</p>
                <div className="mt-3 grid gap-2.5">
                  <label className="ui-label grid gap-2 text-[var(--color-text-muted)]">
                    {t('account.feedbackType')}
                    <Select
                      value={feedbackType}
                      onChange={(event) => setFeedbackType(event.target.value)}
                   >
                      <option value="bug">{t('account.feedbackTypeBug')}</option>
                      <option value="feature">{t('account.feedbackTypeFeature')}</option>
                      <option value="report">{t('account.feedbackTypeReport')}</option>
                      <option value="billing">{t('account.feedbackTypeBilling')}</option>
                      <option value="other">{t('account.feedbackTypeOther')}</option>
                    </Select>
                  </label>
                  <label className="ui-label grid gap-2 text-[var(--color-text-muted)]">
                    {t('account.feedbackContent')}
                    <Textarea
                      value={feedbackMessage}
                      onChange={(event) => setFeedbackMessage(event.target.value)}
                      rows={4}
                      maxLength={4000}
                      placeholder={t('account.feedbackPlaceholder')}
                   />
                    <span className="text-right font-medium text-[var(--color-text-subtle)]">{feedbackMessage.length}/4000</span>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="max-w-[32rem] text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.feedbackHint')}</p>
                  <Button variant="primary"
                    type="submit"
                    disabled={isSubmittingFeedback}
                 >
                    {isSubmittingFeedback ? t('account.feedbackSubmitting') : t('account.feedbackSubmit')}
                  </Button>
                </div>
                {feedbackStatus && (
                  <p className="mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--color-text)]" role="status">
                    {feedbackStatus}
                  </p>
                )}
              </form>
            </Panel>
          </>}
          </div>
        )}

        {/* 2. 模型与偏好设置面板 */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="motion-content-enter settings-form bg-[var(--color-surface)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm space-y-6">
            <h3 className="ui-panel-title text-[var(--color-text)] border-b border-[var(--color-border)] pb-2">
              {t('account.modelSettings')}
            </h3>

            {apiSettingsLocked && (
              <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-xs font-semibold leading-relaxed text-[var(--color-text)]">
                {t('billing.modelLocked')}
              </div>
            )}

            {settingsMessage && (
              <div className="p-3 bg-[var(--color-primary-soft)] border border-[var(--color-primary)] rounded-lg text-xs font-semibold text-[var(--color-link)]">
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
                <details open className="rounded-xl border border-[var(--color-border)] p-3 md:col-span-2">
                <summary className="cursor-pointer text-sm font-bold">{language.startsWith('zh-') ? '高级设置：个人模型' : 'Advanced: personal model'}</summary>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="account-modelName" className="ui-label block text-[var(--color-text-muted)]">
                  {t('account.defaultModel')}
                </label>
                <Input
                  id="account-modelName"
                  type="text"
                  required
                  value={modelName}
                  disabled={apiSettingsLocked}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder={t('account.modelPlaceholder')}
                  className="w-full"
               />
                <p className="text-xxs text-[var(--color-text-subtle)]">{t('account.modelHint')}</p>
              </div>

              <label className="ui-label settings-field">
                <span>{language.startsWith('zh') ? '模型协议' : 'Model protocol'}</span>
                <Select value={llmProvider} disabled={apiSettingsLocked} onChange={event => {
                  const provider = event.target.value as typeof llmProvider;
                  setLlmProvider(provider);
                  setLlmApiKey('');
                  if (provider === 'openai') setLlmBaseUrl('https://api.openai.com/v1');
                  if (provider === 'anthropic') setLlmBaseUrl('https://api.anthropic.com/v1');
                }}>
                  <option value="openai_compatible">OpenAI-compatible Chat Completions</option>
                  <option value="openai">OpenAI Responses</option>
                  <option value="anthropic">Anthropic Messages</option>
                </Select>
              </label>

              <div className="space-y-1">
                <label htmlFor="account-llmBaseUrl" className="ui-label block text-[var(--color-text-muted)]">
                  {t('account.baseUrl')}
                </label>
                <Input
                  id="account-llmBaseUrl"
                  type="url"
                  required
                  value={llmBaseUrl}
                  disabled={apiSettingsLocked}
                  onChange={(e) => setLlmBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full"
               />
                <p className="text-xxs text-[var(--color-text-subtle)]">{language.startsWith('zh') ? '更换协议或地址后需重新填写密钥。' : 'Enter a new API key when changing protocol or URL.'}</p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label htmlFor="account-llmApiKey" className="ui-label block text-[var(--color-text-muted)]">
                  {t('account.apiKey')}
                </label>
                <Input
                  id="account-llmApiKey"
                  type="password"
                  value={llmApiKey}
                  disabled={apiSettingsLocked}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder={hasLlmApiKey ? t('account.apiKeySaved') : t('account.apiKeyPlaceholder')}
                  className="w-full"
               />
                <p className="text-xxs text-[var(--color-text-subtle)]">
                  {hasLlmApiKey ? t('account.apiKeyOverwriteHint') : t('account.apiKeyHint')}
                </p>
              </div>

              <p className="text-xs leading-relaxed text-[var(--color-text-muted)] md:col-span-2">{language.startsWith('zh-') ? `${customToolsEnabled ? '支持工具调用的个人模型默认可以自主搜索和读取网页；也可在下方选择 DeepSeek 搜索 API。' : '当前部署使用免费固定搜索。'}默认免费搜索无需搜索 API Key；选择 DeepSeek 需填写下方搜索 Key，模型服务仍可能收费。${allowPaidSearch ? '下方付费搜索为可选配置。' : '当前部署的报告分析使用免费联网；首页搜索单独设置。'}` : `${customToolsEnabled ? 'Personal models with tool support can search and read web pages; DeepSeek Search API is an optional source below.' : 'This deployment uses free fixed search.'} Default free search needs no search API key; DeepSeek requires the search key below. Model service fees may still apply. ${allowPaidSearch ? 'Paid search below is optional.' : 'Report analysis uses free web search. Homepage search has its own settings.'}`}</p>
              <div className="md:col-span-2"><DeepseekSearchSettings provider={searchProvider} apiKey={deepseekApiKey} hasApiKey={hasDeepseekApiKey} clearKey={clearDeepseekApiKey} disabled={apiSettingsLocked} paidAllowed={allowPaidSearch} onProviderChange={setSearchProvider} onKeyChange={(key) => { setDeepseekApiKey(key); setClearDeepseekApiKey(false); }} onClear={() => { setClearDeepseekApiKey(true); setDeepseekApiKey(''); setSearchProvider('free'); }} /></div>
              {allowPaidSearch && <>
              <div className="space-y-3 rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-3 md:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text)]">{t('account.tavilyTitle')}</h4>
                    <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">
                      {t('account.tavilyDescription')}
                    </p>
                  </div>
                  <Input
                    type="checkbox"
                    aria-label={t('account.tavilyTitle')}
                    checked={enableTavilySearch}
                    disabled={apiSettingsLocked}
                    onChange={(e) => setEnableTavilySearch(e.target.checked)}
                    className="mt-1 w-4"
                 />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_160px]">
                  <div className="space-y-1">
                    <label className="ui-label block text-[var(--color-text-muted)]">
                      Tavily API Key
                    </label>
                    <Input
                      type="password"
                      aria-label="Tavily API Key"
                      value={tavilyApiKey}
                      disabled={apiSettingsLocked}
                      onChange={(e) => setTavilyApiKey(e.target.value)}
                    placeholder={hasTavilyApiKey ? t('account.tavilySaved') : t('account.tavilyPlaceholder')}
                      className="w-full"
                   />
                    <p className="text-xxs text-[var(--color-text-subtle)]">
                      {t('account.tavilyHint')}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="account-tavilySearchDepth" className="ui-label block text-[var(--color-text-muted)]">
                      {t('account.searchDepth')}
                    </label>
                    <Select
                      id="account-tavilySearchDepth"
                  value={tavilySearchDepth}
                      disabled={apiSettingsLocked}
                      onChange={(e) => setTavilySearchDepth(e.target.value)}
                      className="w-full"
                   >
                      <option value="basic">{t('account.basicSearch')}</option>
                      <option value="advanced">{t('account.advancedSearch')}</option>
                    </Select>
                    <p className="text-xxs text-[var(--color-text-subtle)]">{t('account.advancedHint')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-[var(--color-success)] bg-[var(--color-success-soft)] p-3 md:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text)]">{t('account.serperTitle')}</h4>
                    <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">
                      {t('account.serperDescription')}
                    </p>
                  </div>
                  <Input
                    type="checkbox"
                    aria-label={t('account.serperTitle')}
                    checked={enableSerperSearch}
                    disabled={apiSettingsLocked}
                    onChange={(e) => setEnableSerperSearch(e.target.checked)}
                    className="mt-1 w-4"
                 />
                </div>

                <div className="space-y-1">
                  <label className="ui-label block text-[var(--color-text-muted)]">
                    Serper API Key
                  </label>
                  <Input
                    type="password"
                    aria-label="Serper API Key"
                    value={serperApiKey}
                    disabled={apiSettingsLocked}
                    onChange={(e) => setSerperApiKey(e.target.value)}
                    placeholder={hasSerperApiKey ? t('account.serperSaved') : t('account.serperPlaceholder')}
                    className="w-full"
                 />
                  <p className="text-xxs text-[var(--color-text-subtle)]">{t('account.serperHint')}</p>
                </div>
              </div>

              </>}
                </div>
                </details>
              )}

              <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 md:col-span-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-[var(--color-text)]">{t('rss.settingsTitle')}</h4>
                    <p className="mt-1 text-xxs leading-relaxed text-[var(--color-text-muted)]">{getWorkspaceCopy(language).rssDescription}</p>
                  </div>
                  <span className="ui-badge w-fit bg-[var(--color-primary-soft)] text-[var(--color-link)]">
                    {rssConfigSource === 'admin' ? t('rss.adminDefault') : t('rss.personalConfig')}
                  </span>
                </div>

                {!apiSettingsLocked && rssSourceCatalog.some(source => source.recommended) && (
                  <Button onClick={() => setRssFeedConfig(current => ({
                    ...current,
                    catalogIds: rssSourceCatalog.filter(source => source.recommended).map(source => source.id),
                  }))}>
                    {language.startsWith('zh') ? '套用推荐来源' : 'Use recommended sources'}
                  </Button>
                )}

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
                            <Input
                              type="checkbox"
                              aria-label={`${t('rss.source')}: ${language === 'zh-CN' ? source.nameZh || source.name : source.name}`}
                              checked={rssFeedConfig.catalogIds.includes(source.id)}
                              disabled={apiSettingsLocked}
                              onChange={() => toggleRssCatalogSource(source.id)}
                              className="w-3.5"
                           />
                          </td>
                          <td className="px-2 py-2 font-bold text-[var(--color-text)]">
                            <a href={source.websiteUrl} target="_blank" rel="noreferrer" className="hover:text-[var(--color-link)] hover:underline">
                              {language === 'zh-CN' ? source.nameZh || source.name : source.name}
                            </a>
                          </td>
                          <td className="px-2 py-2 text-[var(--color-text-muted)]">{source.region === 'china' ? t('rss.regionChina') : source.region === 'chinese-language' ? t('rss.regionChineseLanguage') : t('rss.regionInternational')}</td>
                          <td className="px-2 py-2">
                            <span className="ui-badge bg-[var(--color-primary-soft)] text-[var(--color-link)]">
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
                      <Input
                        value={rssCustomName}
                        onChange={(event) => setRssCustomName(event.target.value)}
                        aria-label={t('rss.customName')}
                        placeholder={t('rss.customName')}
                        className="min-w-0"
                     />
                      <Input
                        type="url"
                        value={rssCustomUrl}
                        onChange={(event) => setRssCustomUrl(event.target.value)}
                        aria-label={t('rss.customUrl')}
                        placeholder={t('rss.customUrl')}
                        className="min-w-0"
                     />
                      <Button variant="primary" type="button" onClick={addCustomRssFeed}>
                        {t('rss.add')}
                      </Button>
                    </div>
                    {rssFeedConfig.customFeeds.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {rssFeedConfig.customFeeds.map((feed) => (
                          <span key={feed.url} className="ui-badge inline-flex max-w-full items-center gap-1 bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]">
                            <span className="max-w-44 truncate">{feed.name}</span>
                            <Button variant="danger-ghost" type="button" onClick={() => removeCustomRssFeed(feed.url)}>{t('rss.remove')}</Button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <div className="space-y-1 md:col-span-2">
                <label className="ui-label block text-[var(--color-text-muted)]">
                  {t('account.theme')}
                </label>
                <ThemeSwitcher variant="cards" />
                <p className="text-xxs text-[var(--color-text-subtle)]">{t('account.themeHint')}</p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="ui-label block text-[var(--color-text-muted)]">
                  {t('language.interfaceLanguage')}
                </label>
                <LanguageSwitcher variant="cards" />
                <p className="text-xxs text-[var(--color-text-subtle)]">{t('language.savedLocally')}</p>
              </div>

              <div className="space-y-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2">
                <p className="text-xs font-semibold text-[var(--color-text)]">{t('report.outputLanguage', '报告输出语言')}</p>
                <p className="text-xxs leading-relaxed text-[var(--color-text-muted)]">{t('account.reportFollowsInterface', '报告会始终跟随当前界面语言；切换界面语言后，下一份报告和后续追问将自动使用相同语言。')}</p>
              </div>

              <div className="space-y-1">
                <label htmlFor="account-reasoningDepth" className="ui-label block text-[var(--color-text-muted)]">
                  {t('account.thinkingDepth')}
                </label>
                <Select
                  id="account-reasoningDepth"
                  value={reasoningDepth}
                  onChange={(e) => setReasoningDepth(e.target.value)}
                  className="w-full"
               >
                  {THINKING_DEPTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(`thinking.${option.value}`)}
                    </option>
                  ))}
                </Select>
                <p className="text-xxs text-[var(--color-text-subtle)]">{t('account.thinkingDepthHint')}</p>
              </div>
            </div>

            <div className="border-t border-[var(--color-border)] pt-4 space-y-4 text-xs font-medium">
              <label className="ui-label flex items-center justify-between gap-4">
                <span>
                  <span className="text-[var(--color-text)] font-semibold">{t('account.publicDefault')}</span>
                  <span className="block text-xxs text-[var(--color-text-subtle)]">{t('account.publicDefaultHint')}</span>
                </span>
                <Input
                  type="checkbox"
                  aria-label={t('account.publicDefault')}
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
               />
              </label>

              <label className="ui-label flex items-center justify-between gap-4 border-t border-[var(--color-border)] pt-3">
                <span>
                  <span className="text-[var(--color-text)] font-semibold">{t('account.chartsDefault')}</span>
                  <span className="block text-xxs text-[var(--color-text-subtle)]">{t('account.chartsDefaultHint')}</span>
                </span>
                <Input
                  type="checkbox"
                  aria-label={t('account.chartsDefault')}
                  checked={enableCharts}
                  onChange={(e) => setEnableCharts(e.target.checked)}
               />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary"
                type="submit"
                disabled={isSavingSettings}
             >
                {isSavingSettings ? t('account.saving') : t('account.saveSettings')}
              </Button>
            </div>
          </form>
        )}

      </div >
    </main >
  );
}
