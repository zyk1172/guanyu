const MAX_REMOVAL_LINES = 200;
const MAX_REMOVAL_FRAGMENTS = 12;
const MIN_RETAINED_RATIO = 0.55;
const MIN_CLEANED_LENGTH = 50;

export function normalizeSourceContent(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\u00a0]+/g, ' ').replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function numberSourceLines(value) {
  return normalizeSourceContent(value)
    .split('\n')
    .map((line, index) => `[L${index + 1}] ${line}`)
    .join('\n');
}

function validLineNumbers(value, lineCount) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => Number.parseInt(String(item), 10))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= lineCount))]
    .slice(0, MAX_REMOVAL_LINES);
}

function validExactFragments(value, source) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => normalizeSourceContent(item))
    .filter((item) => item.length >= 4 && item.length <= 800 && source.includes(item)))]
    .slice(0, MAX_REMOVAL_FRAGMENTS);
}

export function applyModelSourceCleanup(value, cleanup, enabled = false) {
  const original = normalizeSourceContent(value);
  const unchanged = {
    content: original,
    applied: false,
    removedLineCount: 0,
    removedFragmentCount: 0,
    retainedRatio: 1,
  };

  if (!enabled || !cleanup || cleanup.applied !== true || original.length < MIN_CLEANED_LENGTH) {
    return unchanged;
  }

  const lines = original.split('\n');
  const removeLineNumbers = validLineNumbers(cleanup.removeLineNumbers, lines.length);
  const lineNumberSet = new Set(removeLineNumbers);
  let cleaned = lines.filter((_, index) => !lineNumberSet.has(index + 1)).join('\n');

  const fragments = validExactFragments(cleanup.removeExactFragments, cleaned);
  for (const fragment of fragments) cleaned = cleaned.replaceAll(fragment, '');
  cleaned = normalizeSourceContent(cleaned);

  const retainedRatio = original.length > 0 ? cleaned.length / original.length : 1;
  if (cleaned.length < MIN_CLEANED_LENGTH || retainedRatio < MIN_RETAINED_RATIO) return unchanged;
  if (cleaned === original) return unchanged;

  return {
    content: cleaned,
    applied: true,
    removedLineCount: removeLineNumbers.length,
    removedFragmentCount: fragments.length,
    retainedRatio: Number(retainedRatio.toFixed(3)),
  };
}
