if (!window.__GUANYU_CONTENT_SCRIPT__) {
window.__GUANYU_CONTENT_SCRIPT__ = true;

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function removeNoise(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('script,style,noscript,iframe,nav,footer,header,aside,form,button,input,select,textarea,.ad,.ads,.advertisement,.comment,.comments,.related,.recommend,.share').forEach((node) => node.remove());
  return clone;
}

function extractCandidateText() {
  const selectedText = cleanText(window.getSelection ? window.getSelection().toString() : '', 20000);
  const selectors = [
    'article',
    'main',
    '[itemprop="articleBody"]',
    '.article',
    '.article-content',
    '.article-body',
    '.post-content',
    '.entry-content',
    '.news-content',
    '.story',
    '.content',
  ];

  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (!node) continue;
    const text = cleanText(removeNoise(node).innerText, 30000);
    if (text.length > 200) {
      return { selectedText, pageText: text };
    }
  }

  const paragraphs = Array.from(document.querySelectorAll('p'))
    .map((p) => cleanText(p.innerText, 1200))
    .filter((text) => text.length >= 30);
  return {
    selectedText,
    pageText: cleanText(paragraphs.join('\n\n'), 30000),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'GUANYU_EXTRACT_PAGE') return false;
  sendResponse({
    title: cleanText(document.title, 160),
    url: location.href,
    ...extractCandidateText(),
  });
  return true;
});
}
