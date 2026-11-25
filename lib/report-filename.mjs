export function reportFilename(title, extension, suffix = '') {
  const safe = String(title || '').toWellFormed()
    .replace(/[\\/:*?"<>|\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, ' ')
    .replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
  const encoder = new TextEncoder();
  let bytes = 0;
  let name = '';
  for (const char of safe) {
    bytes += encoder.encode(char).length;
    if (bytes > 200) break;
    name += char;
  }
  name = name.replace(/[. ]+$/g, '') || 'report';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return `${name}${suffix}.${extension}`;
}

export function encodedFilename(filename) {
  return encodeURIComponent(filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}
