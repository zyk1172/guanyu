export const ARTICLE_CRAWLER_AGENT = 'GuanyuArticleCrawler';

export function crawlUrl(input: string, allowedHosts: Set<string>) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !allowedHosts.has(url.hostname)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

export function robotsAllows(robots: string, url: URL) {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; pattern: string }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; pattern: string }> };
  for (const line of robots.split(/\r?\n/)) {
    const [match, directive, value] = line.match(/^\s*(user-agent|allow|disallow)\s*:\s*([^#]*)/i) || [];
    if (!match) continue;
    const key = directive.toLowerCase();
    const text = value.trim();
    if (key === 'user-agent') {
      if (group.rules.length) {
        groups.push(group);
        group = { agents: [], rules: [] };
      }
      group.agents.push(text.toLowerCase());
    } else if (group.agents.length) {
      group.rules.push({ allow: key === 'allow', pattern: text });
    }
  }
  if (group.agents.length) groups.push(group);
  const userAgent = ARTICLE_CRAWLER_AGENT.toLowerCase();
  const matches = groups.map(candidate => ({
    ...candidate,
    specificity: Math.max(-1, ...candidate.agents.map(agent => agent === '*' ? 0 : agent && userAgent.startsWith(agent) ? agent.length : -1)),
  }));
  const specificity = Math.max(-1, ...matches.map(candidate => candidate.specificity));
  if (specificity < 0) return true;
  const clean = (path: string) => path.replace(/%([a-f\d]{2})/gi, (match, hex: string) => {
    const char = String.fromCharCode(Number.parseInt(hex, 16));
    return /^[a-z\d._~-]$/i.test(char) ? char : match.toUpperCase();
  });
  const path = clean(url.pathname + url.search);
  let bestLength = -1;
  let allowed = true;

  for (const { rules } of matches.filter(candidate => candidate.specificity === specificity)) {
    for (const rule of rules) {
      if (!rule.pattern.startsWith('/')) continue;
      const exact = rule.pattern.endsWith('$');
      const pattern = clean(exact ? rule.pattern.slice(0, -1) : rule.pattern);
      if (pattern.length > 2000) continue;
      // Match wildcard chunks in order. Avoid a backtracking regex for publisher input.
      const chunks = pattern.split('*');
      if (!path.startsWith(chunks[0])) continue;
      let offset = chunks[0].length;
      const end = exact ? chunks.slice(-1)[0] : '';
      if (exact && !path.endsWith(end)) continue;
      const rest = exact ? chunks.slice(1, -1) : chunks.slice(1);
      const matched = rest.every(chunk => {
        const at = path.indexOf(chunk, offset);
        if (at < 0) return false;
        offset = at + chunk.length;
        return true;
      });
      if (!matched || (exact && (chunks.length === 1 ? path !== pattern : offset > path.length - end.length))) continue;
      if (pattern.length > bestLength || (pattern.length === bestLength && rule.allow)) {
        bestLength = pattern.length;
        allowed = rule.allow;
      }
    }
  }
  return allowed;
}
