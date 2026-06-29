export interface WebSearchSource {
  title: string;
  url: string;
  snippet: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '));
}

function normalizeDuckDuckGoUrl(value: string): string {
  const decoded = decodeHtml(value);

  try {
    const url = new URL(decoded, 'https://duckduckgo.com');
    const redirected = url.searchParams.get('uddg');
    return redirected ? decodeURIComponent(redirected) : url.toString();
  } catch {
    return decoded;
  }
}

export async function searchWeb(query: string, limit = 5): Promise<WebSearchSource[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  if (!normalizedQuery) return [];

  try {
    const response = await fetch(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) return [];

    const html = await response.text();
    const blocks = html.match(/<div class="result results_links[\s\S]*?<\/div>\s*<\/div>/g) || [];

    return blocks
      .map((block) => {
        const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

        if (!titleMatch) return null;

        return {
          title: stripHtml(titleMatch[2]),
          url: normalizeDuckDuckGoUrl(titleMatch[1]),
          snippet: snippetMatch ? stripHtml(snippetMatch[1]) : '',
        };
      })
      .filter((item): item is WebSearchSource => Boolean(item?.title && item?.url))
      .slice(0, limit);
  } catch (error) {
    console.error('Web search failed:', error);
    return [];
  }
}
