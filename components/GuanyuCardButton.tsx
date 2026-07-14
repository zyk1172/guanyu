'use client';

import { Download, LoaderCircle, Share2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getReadWorthDisplayLabel, normalizeReportLanguage, type ReadWorthLabel, type ReportLanguage } from '@/lib/types';

interface GuanyuCardContent {
  oneSentenceView: string;
  mostCredible: string;
  largestInformationGap: string;
  mostWorthAsking: string;
  readingValue: ReadWorthLabel;
}

interface ThemePalette {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
}

const COPY = {
  'zh-CN': { generate: '生成观隅卡', generating: '正在生成观隅卡...', title: '观隅卡', preview: '观隅卡预览', download: '下载 PNG', share: '系统分享', close: '关闭', view: '一句话观隅', credible: '最可信', gap: '最大信息缺口', question: '最值得追问', reading: '阅读价值', unavailable: '当前设备不支持系统分享，请下载 PNG 后分享。', failed: '观隅卡暂时无法生成。' },
  'en-US': { generate: 'Generate Guanyu Card', generating: 'Generating card...', title: 'Guanyu Card', preview: 'Guanyu Card Preview', download: 'Download PNG', share: 'Share', close: 'Close', view: 'Guanyu view', credible: 'Most credible', gap: 'Largest information gap', question: 'Most worth asking', reading: 'Reading value', unavailable: 'System sharing is unavailable on this device. Download the PNG to share it.', failed: 'The Guanyu Card could not be generated right now.' },
} as const;

function textFor(language: ReportLanguage) {
  return COPY[language === 'zh-CN' || language === 'zh-TW' ? 'zh-CN' : 'en-US'];
}

function escaped(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] || character));
}

function wrap(value: string, maxChars: number, maxLines: number) {
  const source = String(value || '').replace(/\s+/g, ' ').trim();
  const lines: string[] = [];
  let line = '';
  for (const token of Array.from(source)) {
    const isSpace = token === ' ';
    if (line.length >= maxChars && !isSpace) {
      lines.push(line.trim());
      line = token;
      if (lines.length === maxLines - 1) break;
    } else {
      line += token;
    }
  }
  if (lines.length < maxLines && line.trim()) lines.push(line.trim());
  const used = lines.join('').length;
  if (used < source.replace(/\s/g, '').length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[…。,.!?]$/, '')}…`;
  return lines.slice(0, maxLines);
}

function svgText(lines: string[], x: number, y: number, options: { size: number; lineHeight: number; fill: string; weight?: number; anchor?: string }) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * options.lineHeight}" fill="${options.fill}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Noto Sans CJK SC',Arial,sans-serif" font-size="${options.size}" font-weight="${options.weight || 500}" text-anchor="${options.anchor || 'start'}">${escaped(line)}</text>`).join('');
}

function paletteFromDocument(): ThemePalette {
  const style = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: value('--color-bg', '#f4ecd8'),
    surface: value('--color-surface', '#fff8e8'),
    text: value('--color-text', '#2d251b'),
    muted: value('--color-text-muted', '#6f6252'),
    border: value('--color-border-strong', '#d8c7a8'),
    primary: value('--color-primary', '#7a4f22'),
    success: value('--color-success', '#397a57'),
    warning: value('--color-warning', '#b67d19'),
    danger: value('--color-danger', '#a64c3d'),
  };
}

function verdictColor(label: ReadWorthLabel, colors: ThemePalette) {
  if (label === '值得细读') return colors.success;
  if (label === '可以略读') return colors.warning;
  if (label === '不值一读') return colors.danger;
  return colors.muted;
}

function createSvg(title: string, card: GuanyuCardContent, language: ReportLanguage, colors: ThemePalette) {
  const copy = textFor(language);
  const verdict = verdictColor(card.readingValue, colors);
  const titleLines = wrap(title, language.startsWith('zh-') ? 16 : 29, 2);
  const viewLines = wrap(card.oneSentenceView, language.startsWith('zh-') ? 26 : 47, 3);
  const signals = [
    [copy.credible, card.mostCredible, colors.success, '01'],
    [copy.gap, card.largestInformationGap, colors.warning, '02'],
    [copy.question, card.mostWorthAsking, colors.danger, '03'],
  ] as const;

  const signalSvg = signals.map(([label, content, color, index], itemIndex) => {
    const y = 682 + itemIndex * 148;
    const lines = wrap(content, language.startsWith('zh-') ? 29 : 50, 2);
    return `<g>
      <line x1="74" y1="${y - 16}" x2="1006" y2="${y - 16}" stroke="${colors.border}" stroke-width="2" opacity="0.72" />
      <circle cx="103" cy="${y + 28}" r="25" fill="${color}" opacity="0.92" />
      <text x="103" y="${y + 37}" fill="#fff" font-family="Arial,sans-serif" font-size="20" font-weight="800" text-anchor="middle">${index}</text>
      ${svgText([label], 150, y + 18, { size: 30, lineHeight: 36, fill: colors.text, weight: 800 })}
      ${svgText(lines, 150, y + 57, { size: 22, lineHeight: 31, fill: colors.muted, weight: 500 })}
    </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" fill="${colors.bg}" />
    <rect x="28" y="28" width="1024" height="1294" rx="24" fill="${colors.surface}" stroke="${colors.border}" stroke-width="4" />
    <rect x="50" y="50" width="980" height="1250" rx="18" fill="none" stroke="${colors.border}" stroke-width="1.5" stroke-dasharray="8 8" opacity="0.85" />
    <text x="540" y="113" fill="${colors.text}" font-family="Georgia,'Songti SC',serif" font-size="48" font-weight="800" text-anchor="middle">观隅卡</text>
    <text x="540" y="151" fill="${colors.primary}" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="5" text-anchor="middle">GUANYU CARD</text>
    <line x1="310" y1="130" x2="410" y2="130" stroke="${colors.primary}" stroke-width="2" opacity="0.7" />
    <line x1="670" y1="130" x2="770" y2="130" stroke="${colors.primary}" stroke-width="2" opacity="0.7" />
    <rect x="70" y="190" width="940" height="176" rx="16" fill="${colors.bg}" stroke="${colors.border}" stroke-width="2" />
    <text x="101" y="232" fill="${colors.primary}" font-family="Arial,sans-serif" font-size="16" font-weight="800" letter-spacing="2">NEWS TITLE</text>
    ${svgText(titleLines, 101, 286, { size: 39, lineHeight: 51, fill: colors.text, weight: 800 })}
    <rect x="70" y="394" width="940" height="234" rx="16" fill="${colors.bg}" stroke="${colors.primary}" stroke-width="2" />
    <text x="101" y="440" fill="${colors.primary}" font-family="Arial,sans-serif" font-size="16" font-weight="800" letter-spacing="2">${escaped(copy.view.toUpperCase())}</text>
    <text x="101" y="493" fill="${colors.primary}" font-family="Georgia,'Songti SC',serif" font-size="31" font-weight="800">“</text>
    ${svgText(viewLines, 143, 493, { size: 27, lineHeight: 38, fill: colors.text, weight: 650 })}
    <text x="936" y="574" fill="${colors.primary}" font-family="Georgia,serif" font-size="96" font-weight="800" opacity="0.18">”</text>
    ${signalSvg}
    <rect x="70" y="1144" width="940" height="88" rx="14" fill="${verdict}" opacity="0.14" stroke="${verdict}" stroke-width="2" />
    <circle cx="117" cy="1188" r="20" fill="${verdict}" />
    <text x="117" y="1196" fill="#fff" font-family="Arial,sans-serif" font-size="18" font-weight="800" text-anchor="middle">✓</text>
    <text x="152" y="1180" fill="${colors.muted}" font-family="Arial,sans-serif" font-size="15" font-weight="800" letter-spacing="2">${escaped(copy.reading.toUpperCase())}</text>
    <text x="152" y="1214" fill="${colors.text}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC',Arial,sans-serif" font-size="29" font-weight="800">${escaped(getReadWorthDisplayLabel(card.readingValue, language))}</text>
    <line x1="70" y1="1261" x2="1010" y2="1261" stroke="${colors.border}" stroke-width="2" />
    <text x="540" y="1294" fill="${colors.text}" font-family="Georgia,'Songti SC',serif" font-size="34" font-weight="800" text-anchor="middle">观隅</text>
    <text x="540" y="1318" fill="${colors.primary}" font-family="Arial,sans-serif" font-size="13" font-weight="800" letter-spacing="3" text-anchor="middle">AI NARRATIVE AUDIT</text>
  </svg>`;
}

async function svgToPng(svg: string) {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('观隅卡图片渲染失败。'));
      next.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法创建观隅卡图片。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('观隅卡 PNG 导出失败。')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function GuanyuCardButton({ auditId, title, reportLanguage }: { auditId: string; title: string; reportLanguage: string }) {
  const language = normalizeReportLanguage(reportLanguage);
  const copy = textFor(language);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const pngRef = useRef<Blob | null>(null);
  const supportsSystemShare = typeof navigator !== 'undefined' && typeof (navigator as { share?: unknown }).share === 'function';

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/card`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || copy.failed);
      const colors = paletteFromDocument();
      const svg = createSvg(title, payload.card as GuanyuCardContent, language, colors);
      const png = await svgToPng(svg);
      pngRef.current = png;
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(png);
      });
    } catch (requestError: any) {
      setError(requestError?.message || copy.failed);
    } finally {
      setIsGenerating(false);
    }
  };

  const download = () => {
    if (!pngRef.current) return;
    const url = URL.createObjectURL(pngRef.current);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'guanyu-card.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const share = async () => {
    if (!pngRef.current || !supportsSystemShare) return;
    const file = new File([pngRef.current], 'guanyu-card.png', { type: 'image/png' });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      setError(copy.unavailable);
      return;
    }
    try {
      await navigator.share({ title: '观隅卡', files: [file] });
    } catch (shareError: any) {
      if (shareError?.name !== 'AbortError') setError(copy.unavailable);
    }
  };

  return (
    <>
      <button type="button" onClick={generate} disabled={isGenerating} className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-card-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
        {isGenerating ? <span className="inline-flex items-center gap-1.5"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />{copy.generating}</span> : <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />{copy.generate}</span>}
      </button>
      {error && <span className="w-full text-right text-xxs font-semibold text-[var(--color-danger)]">{error}</span>}
      {previewUrl && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={copy.preview}>
          <section className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 shadow-2xl sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-[var(--color-text)]">{copy.preview}</h3>
              <button type="button" onClick={() => setPreviewUrl(null)} className="rounded-md p-1.5 text-[var(--color-text-muted)] transition hover:bg-[var(--color-card-hover)]" aria-label={copy.close}><X className="h-4 w-4" /></button>
            </div>
            {/* Blob previews are generated in the browser and cannot use the Next image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={copy.title} className="mx-auto block w-full max-w-[360px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-xs font-bold text-[var(--color-text)] transition hover:bg-[var(--color-card-hover)]"><Download className="h-3.5 w-3.5" />{copy.download}</button>
              {supportsSystemShare && <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--color-primary-hover)]"><Share2 className="h-3.5 w-3.5" />{copy.share}</button>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
