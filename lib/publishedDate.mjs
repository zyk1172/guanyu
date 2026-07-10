import * as cheerio from 'cheerio';

const UNKNOWN_DATE = {
  publishedAt: '',
  publishedAtSource: 'unknown',
  publishedAtConfidence: 'unknown',
};

function pad2(value) {
  return String(value).padStart(2, '0');
}

const MONTHS = new Map([
  ['january', 1], ['jan', 1], ['janvier', 1], ['januar', 1], ['enero', 1], ['gennaio', 1],
  ['february', 2], ['feb', 2], ['fevrier', 2], ['februar', 2], ['febrero', 2], ['febbraio', 2],
  ['march', 3], ['mar', 3], ['mars', 3], ['marz', 3], ['maerz', 3], ['marzo', 3],
  ['april', 4], ['apr', 4], ['avril', 4], ['abril', 4], ['aprile', 4],
  ['may', 5], ['mai', 5], ['mayo', 5], ['maggio', 5],
  ['june', 6], ['jun', 6], ['juin', 6], ['juni', 6], ['junio', 6], ['giugno', 6],
  ['july', 7], ['jul', 7], ['juillet', 7], ['juli', 7], ['julio', 7], ['luglio', 7],
  ['august', 8], ['aug', 8], ['aout', 8], ['agosto', 8],
  ['september', 9], ['sep', 9], ['sept', 9], ['septembre', 9], ['september', 9], ['septiembre', 9], ['settembre', 9],
  ['october', 10], ['oct', 10], ['octobre', 10], ['oktober', 10], ['octubre', 10], ['ottobre', 10],
  ['november', 11], ['nov', 11], ['novembre', 11], ['noviembre', 11],
  ['december', 12], ['dec', 12], ['decembre', 12], ['dezember', 12], ['diciembre', 12], ['dicembre', 12],
]);

function normalizedMonth(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f.]/g, '')
    .trim();
}

function normalizeWordDate(value) {
  const dayFirst = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\.?\s*(?:de\s+)?([\p{L}.]+)\s*(?:de\s+)?[,]?\s*(19\d{2}|20\d{2})\b/iu);
  if (dayFirst) {
    const month = MONTHS.get(normalizedMonth(dayFirst[2]));
    if (month) return `${dayFirst[3]}-${pad2(month)}-${pad2(dayFirst[1])}`;
  }

  const monthFirst = value.match(/\b([\p{L}.]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(19\d{2}|20\d{2})\b/iu);
  if (monthFirst) {
    const month = MONTHS.get(normalizedMonth(monthFirst[1]));
    if (month) return `${monthFirst[3]}-${pad2(month)}-${pad2(monthFirst[2])}`;
  }

  return '';
}

function normalizeDate(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';

  const chinese = value.match(/(20\d{2}|19\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (chinese) return `${chinese[1]}-${pad2(chinese[2])}-${pad2(chinese[3])}`;

  const numeric = value.match(/(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (numeric) return `${numeric[1]}-${pad2(numeric[2])}-${pad2(numeric[3])}`;

  const wordDate = normalizeWordDate(value);
  if (wordDate) return wordDate;

  const iso = value.match(/(20\d{2}|19\d{2})-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d(?::[0-5]\d)?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/);
  if (iso) return iso[0].replace('T', ' ').replace(/Z$/, '').slice(0, 16);

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return '';
}

function compactText(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function collectJsonLdDates($) {
  const dates = [];

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.datePublished) {
      dates.push({ value: String(node.datePublished), source: 'json_ld', confidence: 'high', rank: 0 });
    }
    if (node.dateModified) {
      dates.push({ value: String(node.dateModified), source: 'json_ld', confidence: 'high', rank: 1 });
    }
    if (Array.isArray(node['@graph'])) visit(node['@graph']);
  }

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    try {
      visit(JSON.parse(raw));
    } catch {
      const jsonCandidate = raw.match(/\{[\s\S]*\}/)?.[0];
      if (!jsonCandidate) return;
      try {
        visit(JSON.parse(jsonCandidate));
      } catch {
        // Ignore malformed JSON-LD.
      }
    }
  });

  return dates.sort((a, b) => a.rank - b.rank);
}

function firstMeta($, selectors) {
  for (const selector of selectors) {
    const value = $(selector).first().attr('content');
    if (value) return value;
  }
  return '';
}

function fromBodyText(text) {
  const peopleDaily = text.match(/《人民日报》\s*[（(]\s*((?:20\d{2}|19\d{2})\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)\s*第\s*\d+\s*版\s*[）)]/);
  if (peopleDaily) {
    const publishedAt = normalizeDate(peopleDaily[1]);
    if (publishedAt) {
      return {
        publishedAt,
        publishedAtSource: 'body_people_daily_format',
        publishedAtConfidence: 'high',
      };
    }
  }

  const standard = text.match(/(?:发布日期|发布时间|时间|日期|来源)[:：\s]{0,8}((?:20\d{2}|19\d{2})[年\-/.]\d{1,2}[月\-/.]\d{1,2}日?)/);
  if (standard) {
    const publishedAt = normalizeDate(standard[1]);
    if (publishedAt) {
      return {
        publishedAt,
        publishedAtSource: 'body_regex',
        publishedAtConfidence: 'low',
      };
    }
  }

  const international = text.match(/(?:published|publication date|published on|published:|date published|publi(?:é|e)(?:e)?(?: le)?|ver(?:ö|o)ffentlicht(?: am)?|publicado(?: el)?|pubblicato(?: il)?|gepubliceerd(?: op)?)\s*[:：,\-]?\s*([^|]{1,48})/i);
  if (international) {
    const publishedAt = normalizeDate(international[1]);
    if (publishedAt) {
      return {
        publishedAt,
        publishedAtSource: 'body_regex',
        publishedAtConfidence: 'low',
      };
    }
  }

  return null;
}

function makeResult(value, source, confidence) {
  const publishedAt = normalizeDate(value);
  if (!publishedAt) return null;
  return { publishedAt, publishedAtSource: source, publishedAtConfidence: confidence };
}

function extractPublishedDate(html, _sourceName = '', userInput = '') {
  void _sourceName;
  const manual = makeResult(userInput, 'user_input', 'high');
  if (manual) return manual;

  const $ = cheerio.load(html || '');

  for (const item of collectJsonLdDates($)) {
    const result = makeResult(item.value, item.source, item.confidence);
    if (result) return result;
  }

  const metaCandidates = [
    [firstMeta($, ['meta[property="article:published_time"]']), 'meta_article', 'high'],
    [firstMeta($, ['meta[property="og:published_time"]']), 'meta_og', 'high'],
    [firstMeta($, [
      'meta[name="pubdate"]',
      'meta[name="publishdate"]',
      'meta[name="publishDate"]',
      'meta[name="publish_date"]',
      'meta[name="parsely-pub-date"]',
      'meta[name="sailthru.date"]',
      'meta[itemprop="datePublished"]',
    ]), 'meta_pubdate', 'medium'],
  ];
  for (const [value, source, confidence] of metaCandidates) {
    const result = makeResult(value, source, confidence);
    if (result) return result;
  }

  const timeResult = makeResult($('time[datetime]').first().attr('datetime') || '', 'time_tag', 'medium');
  if (timeResult) return timeResult;

  const body = compactText($('body').text());
  const bodyResult = fromBodyText(body);
  if (bodyResult) return bodyResult;

  const genericMetaResult = makeResult(firstMeta($, [
    'meta[name="date"]',
    'meta[name="DC.date"]',
    'meta[name="dc.date"]',
  ]), 'meta_pubdate', 'low');
  if (genericMetaResult) return genericMetaResult;

  return { ...UNKNOWN_DATE };
}

export {
  extractPublishedDate,
  normalizeDate,
};
