const DEFAULT_BASE_URL = 'https://guanyu-seven.vercel.app';

const $ = (id) => document.getElementById(id);

async function getConfig() {
  const config = await chrome.storage.local.get(['extensionToken', 'user', 'guanyuBaseUrl']);
  return {
    ...config,
    guanyuBaseUrl: config.guanyuBaseUrl || DEFAULT_BASE_URL,
  };
}

function setStatus(text) {
  $('statusText').textContent = text;
}

async function refreshMe() {
  const { extensionToken, guanyuBaseUrl } = await getConfig();
  if (!extensionToken) {
    $('authState').textContent = '未连接观隅账号';
    $('linkPanel').style.display = 'block';
    return;
  }

  const res = await fetch(`${guanyuBaseUrl.replace(/\/$/, '')}/api/extension/me`, {
    headers: { Authorization: `Bearer ${extensionToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.authenticated) {
    await chrome.storage.local.remove(['extensionToken', 'user']);
    $('authState').textContent = '授权已失效，请重新连接';
    $('linkPanel').style.display = 'block';
    return;
  }

  await chrome.storage.local.set({ user: data.user });
  $('authState').textContent = `已连接：${data.user?.email || data.user?.name || '观隅账号'}`;
  $('linkPanel').style.display = 'none';
  setStatus(`今日免费剩余 ${data.quota?.remainingToday ?? '-'}，点数 ${data.quota?.creditBalance ?? '-'}`);
}

async function connect() {
  const code = $('linkCode').value.trim();
  if (!code) {
    setStatus('请输入账号页面生成的插件连接码。');
    return;
  }
  const { guanyuBaseUrl } = await getConfig();
  $('connect').disabled = true;
  setStatus('正在连接观隅账号...');
  try {
    const res = await fetch(`${guanyuBaseUrl.replace(/\/$/, '')}/api/extension/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        browser: navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Chrome',
        name: '观隅浏览器助手',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '连接失败。');
    await chrome.storage.local.set({ extensionToken: data.token, user: data.user });
    $('linkCode').value = '';
    await refreshMe();
  } catch (error) {
    setStatus(error.message || '连接失败，请重试。');
  } finally {
    $('connect').disabled = false;
  }
}

async function send(action) {
  setStatus(action === 'save' ? '正在保存到观隅...' : '正在发送到观隅...');
  const result = await chrome.runtime.sendMessage({ type: 'GUANYU_SEND_ACTIVE_TAB', action });
  if (!result?.ok) {
    setStatus(result?.error || '发送失败，请重试。');
    return;
  }
  setStatus(result.data?.message || '已发送到观隅。');
}

document.addEventListener('DOMContentLoaded', () => {
  $('connect').addEventListener('click', connect);
  $('openApp').addEventListener('click', async () => {
    const { guanyuBaseUrl } = await getConfig();
    chrome.tabs.create({ url: guanyuBaseUrl });
  });
  $('analyzePage').addEventListener('click', () => send('analyze'));
  $('analyzeSelection').addEventListener('click', () => send('analyze'));
  $('savePage').addEventListener('click', () => send('save'));
  refreshMe().catch(() => {
    $('authState').textContent = '无法连接观隅';
    setStatus('请检查网络或观隅服务地址。');
  });
});
