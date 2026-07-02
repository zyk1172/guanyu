chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'guanyu-analyze-selection',
    title: '用观隅审视选中文本',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'guanyu-analyze-page',
    title: '用观隅审视当前页面',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'guanyu-save-page',
    title: '保存到观隅',
    contexts: ['page', 'selection'],
  });
});

async function getActiveTab(tab) {
  if (tab?.id) return tab;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function extractPage(tab) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['contentScript.js'],
  });
  return chrome.tabs.sendMessage(tab.id, { type: 'GUANYU_EXTRACT_PAGE' });
}

async function sendToGuanyu(tab, action) {
  const { extensionToken, guanyuBaseUrl = 'https://guanyu-seven.vercel.app' } = await chrome.storage.local.get(['extensionToken', 'guanyuBaseUrl']);
  if (!extensionToken) throw new Error('未连接观隅账号。');
  const payload = await extractPage(tab);
  const response = await fetch(`${guanyuBaseUrl.replace(/\/$/, '')}/api/extension/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${extensionToken}`,
    },
    body: JSON.stringify({
      ...payload,
      source: 'extension',
      action,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '发送到观隅失败。');
  if (data.reportUrl || data.savedUrl) {
    await chrome.tabs.create({ url: new URL(data.reportUrl || data.savedUrl, guanyuBaseUrl).toString() });
  }
  return data;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const activeTab = await getActiveTab(tab);
    const action = info.menuItemId === 'guanyu-save-page' ? 'save' : 'analyze';
    await sendToGuanyu(activeTab, action);
  } catch (error) {
    console.warn('Guanyu extension action failed:', error?.message || error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'GUANYU_SEND_ACTIVE_TAB') return false;
  (async () => {
    const tab = await getActiveTab();
    const data = await sendToGuanyu(tab, message.action || 'save');
    sendResponse({ ok: true, data });
  })().catch((error) => sendResponse({ ok: false, error: error?.message || '发送失败。' }));
  return true;
});
