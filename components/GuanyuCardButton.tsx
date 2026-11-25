'use client';

import Dialog from '@/components/ui/Dialog';

import { Button } from '@/components/ui/controls';
import { reportFilename } from '@/lib/report-filename.mjs';
import { getReadWorthDisplayLabel, normalizeReportLanguage, type ReadWorthLabel, type ReportLanguage } from '@/lib/types';
import { Download, ImageDown, LoaderCircle, Share2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useState } from 'react';

interface GuanyuCardContent {
  oneSentenceView: string;
  mostCredible: string;
  largestInformationGap: string;
  mostWorthAsking: string;
  readingValue: ReadWorthLabel;
}

const COPY = {
  'zh-CN': { generate: '生成观隅卡', generating: '正在生成观隅卡...', title: '观隅卡', preview: '观隅卡预览', download: '下载 PNG', share: '系统分享', close: '关闭', view: '一句话观隅', credible: '最可信', gap: '最大信息缺口', question: '最值得追问', reading: '阅读价值', scan: '扫码查看完整报告', unavailable: '当前设备不支持系统分享，请下载 PNG 后分享。', failed: '观隅卡暂时无法生成。' },
  'en-US': { generate: 'Generate Guanyu Card', generating: 'Generating card...', title: 'Guanyu Card', preview: 'Guanyu Card Preview', download: 'Download PNG', share: 'Share', close: 'Close', view: 'Guanyu view', credible: 'Most credible', gap: 'Largest information gap', question: 'Most worth asking', reading: 'Reading value', scan: 'SCAN FOR FULL REPORT', unavailable: 'System sharing is unavailable on this device. Download the PNG to share it.', failed: 'The Guanyu Card could not be generated right now.' },
} as const;

function textFor(language: ReportLanguage) {
  return COPY[language === 'zh-CN' || language === 'zh-TW' ? 'zh-CN' : 'en-US'];
}

function cardSignals(card: GuanyuCardContent, copy: ReturnType<typeof textFor>) {
  return [
    { label: copy.credible, text: card.mostCredible, color: '--color-success' },
    { label: copy.gap, text: card.largestInformationGap, color: '--color-warning' },
    { label: copy.question, text: card.mostWorthAsking, color: '--color-primary' },
  ];
}

function wrapText(context: CanvasRenderingContext2D, text: string, width: number, language: string) {
  const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
  const lines: string[] = [];
  let line = '';
  for (const { segment } of segmenter.segment(text.replace(/\s+/g, ' ').trim())) {
    if (context.measureText(line + segment).width <= width) {
      line += segment;
      continue;
    }
    if (line.trim()) lines.push(line.trimEnd());
    line = segment.trimStart();
    if (context.measureText(line).width > width) {
      const longWord = line;
      line = '';
      for (const letter of longWord) {
        if (line && context.measureText(line + letter).width > width) {
          lines.push(line);
          line = '';
        }
        line += letter;
      }
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

async function createCardPng(title: string, card: GuanyuCardContent, language: ReportLanguage, qrUrl: string) {
  await document.fonts.ready;
  const image = new Image();
  image.src = qrUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error(textFor(language).failed);
  const context = drawing;
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string) => styles.getPropertyValue(name).trim();
  const family = styles.getPropertyValue('--font-ui').trim() || 'system-ui, sans-serif';
  const copy = textFor(language);
  const width = canvas.width;
  const inset = 64;
  const col = width - inset * 2;
  let y = 60;
  const layers: Array<() => void> = [];
  const rectangle = (x: number, top: number, w: number, h: number, fill: string) => {
    layers.push(() => { context.fillStyle = fill; context.fillRect(x, top, w, h); });
  };
  function write(text: string, size: number, leading: number, weight: number, fill: string, x = inset, w = col) {
    const font = `${weight} ${size}px ${family}`;
    context.font = font;
    const lines = wrapText(context, text, w, language);
    const top = y;
    layers.push(() => {
      context.font = font;
      context.textBaseline = 'top';
      context.fillStyle = fill;
      lines.forEach((line, i) => context.fillText(line, x, top + i * leading));
    });
    y += lines.length * leading;
  }

  rectangle(0, 0, width, 14, color('--color-primary'));
  const verdict = getReadWorthDisplayLabel(card.readingValue, language);
  write(`${copy.title} · ${copy.reading} ${verdict}`, 32, 44, 650, color('--color-primary'));
  y += 24;
  write(title, 60, 76, 750, color('--color-text'));
  y += 30;
  const heroY = y;
  const hero = layers.length;
  y += 26;
  write(copy.view, 32, 44, 650, color('--color-primary'), inset + 28, col - 56);
  y += 10;
  write(card.oneSentenceView, 48, 64, 650, color('--color-text'), inset + 28, col - 56);
  y += 28;
  const heroHeight = y - heroY;
  layers.splice(hero, 0, () => {
    context.fillStyle = color('--color-primary-soft');
    context.beginPath();
    context.roundRect(inset, heroY, col, heroHeight, 20);
    context.fill();
  });

  for (const signal of cardSignals(card, copy)) {
    y += 28;
    rectangle(inset, y + 4, 6, 39, color(signal.color));
    write(signal.label, 33, 46, 680, color('--color-text'), inset + 22, col - 22);
    y += 6;
    write(signal.text, 42, 58, 450, color('--color-text'), inset + 22, col - 22);
    y += 18;
    rectangle(inset, y, col, 2, color('--color-border'));
  }
  y += 28;
  const qrY = y;
  const qrSize = 155;
  write(copy.scan, 30, 42, 600, color('--color-text-muted'), inset, col - qrSize - 28);
  layers.push(() => context.drawImage(image, width - inset - qrSize, qrY, qrSize, qrSize));
  canvas.height = Math.max(y, qrY + qrSize) + 56;
  context.fillStyle = color('--color-surface');
  context.fillRect(0, 0, canvas.width, canvas.height);
  layers.forEach(draw => draw());
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(copy.failed)), 'image/png'));
}

export default function GuanyuCardButton({ auditId, title, reportLanguage }: { auditId: string; title: string; reportLanguage: string }) {
  const language = normalizeReportLanguage(reportLanguage);
  const copy = textFor(language);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ card: GuanyuCardContent; qrUrl: string; png: Blob } | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const supportsSystemShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const filename = reportFilename(title, 'png', language.startsWith('zh') ? ' - 观隅卡' : ' - Guanyu Card');

  const generate = async () => {
    setTrigger(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}/card`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.card) throw new Error(payload.error || copy.failed);
      const reportUrl = new URL(`/audits/${encodeURIComponent(auditId)}`, window.location.origin).toString();
      const qrUrl = await QRCode.toDataURL(reportUrl, { width: 320, margin: 4, errorCorrectionLevel: 'M' });
      const card = payload.card as GuanyuCardContent;
      setPreview({ card, qrUrl, png: await createCardPng(title, card, language, qrUrl) });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : copy.failed);
    } finally {
      setIsGenerating(false);
    }
  };

  const download = () => {
    if (!preview) return;
    const url = URL.createObjectURL(preview.png);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const share = async () => {
    if (!preview || !supportsSystemShare) return;
    const file = new File([preview.png], filename, { type: 'image/png' });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      setError(copy.unavailable);
      return;
    }
    try {
      await navigator.share({ title, files: [file] });
    } catch (shareError) {
      if (!(shareError instanceof Error) || shareError.name !== 'AbortError') setError(copy.unavailable);
    }
  };

  return <>
    <Button variant="secondary" onClick={generate} disabled={isGenerating}>
      {isGenerating ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ImageDown aria-hidden="true" />}
      {isGenerating ? copy.generating : copy.generate}
    </Button>
    {!preview && error && <span role="alert" className="w-full text-sm text-[var(--color-danger)]">{error}</span>}
    {preview && <Dialog open title={copy.preview} closeLabel={copy.close} returnFocus={trigger} onClose={() => { setPreview(null); setError(null); }}>
      <article className="space-y-4 break-words" aria-label={copy.title}>
        <header className="space-y-2 border-t-4 border-[var(--color-primary)] pt-3">
          <p className="text-sm font-semibold text-[var(--color-primary)]">
            {copy.reading} · {getReadWorthDisplayLabel(preview.card.readingValue, language)}
          </p>
          <h3 className="ui-page-title">{title}</h3>
        </header>
        <div className="rounded-lg bg-[var(--color-primary-soft)] p-4">
          <h4 className="text-sm font-semibold text-[var(--color-primary)]">{copy.view}</h4>
          <p className="mt-2 text-lg font-semibold leading-relaxed">{preview.card.oneSentenceView}</p>
        </div>
        <dl className="divide-y divide-[var(--color-border)]">
          {cardSignals(preview.card, copy).map(signal => <div key={signal.label} className="py-3">
            <dt className="font-semibold" style={{ color: `var(${signal.color})` }}>{signal.label}</dt>
            <dd className="mt-1 text-base leading-relaxed">{signal.text}</dd>
          </div>)}
        </dl>
        <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
          <p className="text-sm text-[var(--color-text-muted)]">{copy.scan}</p>
          {/* Generated QR codes already fit their intrinsic size. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.qrUrl} alt="" width={64} height={64} />
        </footer>
      </article>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>}
      <div className="ui-dialog-actions">
        <Button variant="secondary" onClick={download}><Download aria-hidden="true" />{copy.download}</Button>
        {supportsSystemShare && <Button variant="primary" onClick={() => void share()}><Share2 aria-hidden="true" />{copy.share}</Button>}
      </div>
    </Dialog>}
  </>;
}
