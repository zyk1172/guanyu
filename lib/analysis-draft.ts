// A short-lived, per-tab hand-off across authentication. Never persist API keys.
export const ANALYSIS_DRAFT_KEY = 'guanyu-analysis-draft-v1';
export const ANALYSIS_DRAFT_TTL = 30 * 60 * 1000;
export type AnalysisDraft = {
  title: string; source: string; content: string; focus: string;
  urlInput: string; parsedSourceUrl: string; inputMode: 'text' | 'url';
};
const limits = { title: 500, source: 500, content: 30000, focus: 2000, urlInput: 4096, parsedSourceUrl: 4096 } as const;

export function encodeAnalysisDraft(draft: AnalysisDraft, now = Date.now()): string {
  const fields = Object.fromEntries(Object.entries(limits).map(([key, limit]) => [key, String(draft[key as keyof typeof limits] || '').slice(0, limit)]));
  return JSON.stringify({ ...fields, inputMode: draft.inputMode === 'url' ? 'url' : 'text', savedAt: now });
}

export function decodeAnalysisDraft(raw: string | null, now = Date.now()): AnalysisDraft | null {
  // JSON may expand each character into a six-character escape sequence.
  if (!raw || raw.length > 250000) return null;
  try {
    const draft = JSON.parse(raw);
    if (!Number.isFinite(draft.savedAt) || now - draft.savedAt >= ANALYSIS_DRAFT_TTL || draft.savedAt > now + 60000) return null;
    for (const [key, limit] of Object.entries(limits)) {
      if (typeof draft[key] !== 'string' || draft[key].length > limit) return null;
    }
    if (draft.inputMode !== 'text' && draft.inputMode !== 'url') return null;
    return Object.fromEntries([...Object.keys(limits), 'inputMode'].map((key) => [key, draft[key]])) as AnalysisDraft;
  } catch { return null; }
}
