/** Only a candidate filter; the server still validates DNS and every redirect. */
export function newsImageUrl(value, base) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) return '';
  try {
    const url = new URL(value, base);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !host.includes('.') || /[\[\]:]/.test(host)
      || /(?:^|\.)(?:localhost|local|internal)$/.test(host) || /^(?:0|10|127|169\.254|192\.168|192\.0|198\.(?:18|19|51)|203\.0)\./.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host) || /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
      || /^(?:22[4-9]|2[3-5]\d)\./.test(host) || /(?:tracking|rss[-_]?pixel|spacer|npr_generic|(?:^|[\/_-])logo(?:[\/_\-.]|$))/i.test(url.pathname)
      || /\.(?:svg|ico)(?:$|\/)/i.test(url.pathname)) return '';
    url.hash = '';
    return url.toString();
  } catch { return ''; }
}
