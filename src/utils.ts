/**
 * Shared utilities for crawlee-mcp
 */

import TurndownService from 'turndown';
import * as cheerio from 'cheerio';
import { ProxyConfiguration } from 'crawlee';

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

// Remove noise elements from markdown output
td.remove(['script', 'style', 'noscript', 'iframe']);

/**
 * Convert raw HTML to clean markdown.
 */
export function htmlToMarkdown(html: string): string {
  return td.turndown(html).trim();
}

/**
 * Strip navigation, footer, sidebar and ad elements from HTML, returning
 * only the main content area. Uses cheerio for proper DOM-based extraction.
 * Falls back to the full body if no main content element is found.
 */
export function extractMainContent(html: string): string {
  const $ = cheerio.load(html);

  // Remove noise elements
  $('nav, header, footer, aside, script, style, noscript, iframe, svg').remove();
  // Remove comments
  $('*').contents().filter(function () { return this.type === 'comment'; }).remove();
  // Remove ad/tracking elements by class or id
  const adPatterns = /\b(ad|banner|sidebar|cookie|popup|modal|overlay|promo)\b/i;
  $('[class], [id]').each(function () {
    const el = $(this);
    const cls = el.attr('class') || '';
    const id = el.attr('id') || '';
    if (adPatterns.test(cls) || adPatterns.test(id)) {
      el.remove();
    }
  });

  // Try to isolate main content element (priority order)
  const mainSelectors = [
    'main',
    'article',
    '[role="main"]',
    '#content',
    '.content',
    '#main-content',
    '.main-content',
    '.post',
    '.entry',
    '.article-body',
  ];

  for (const selector of mainSelectors) {
    const el = $(selector);
    if (el.length && (el.html()?.trim().length ?? 0) > 100) {
      return el.html()!;
    }
  }

  // Fallback: return the cleaned body
  return $('body').html() || $.html();
}

/**
 * Parse proxy URLs from the CRAWLEE_PROXY_URLS env variable.
 * Returns undefined if not set.
 */
export function getProxyUrls(): string[] | undefined {
  const raw = process.env.CRAWLEE_PROXY_URLS;
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * Default request timeout in ms (30s unless overridden).
 */
export function getTimeoutMs(): number {
  const raw = process.env.CRAWLEE_TIMEOUT_MS;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 30_000;
}

/**
 * Whether stealth mode should be enabled (default: true).
 */
export function isStealthEnabled(): boolean {
  return process.env.CRAWLEE_STEALTH !== 'false';
}

/**
 * Detect Twitter/X URLs and extract the path for API fetching.
 */
export function parseTwitterUrl(url: string): { path: string; isTwitter: boolean } {
  const twitterPattern = /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/([\w]+\/status\/\d+)/i;
  const match = twitterPattern.exec(url);
  if (match) {
    return { path: match[3], isTwitter: true };
  }
  return { path: '', isTwitter: false };
}

/**
 * Fetch tweet content via fxtwitter JSON API.
 * Returns formatted markdown with author, text, article content, media, and engagement stats.
 */
export async function fetchTweetViaApi(path: string): Promise<string> {
  const res = await fetch(`https://api.fxtwitter.com/${path}`);
  if (!res.ok) throw new Error(`fxtwitter API returned ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  const tweet = data.tweet as Record<string, unknown> | undefined;
  if (!tweet) throw new Error('No tweet data in API response');

  const author = tweet.author as Record<string, unknown> | undefined;
  const article = tweet.article as Record<string, unknown> | undefined;
  const quote = tweet.quote as Record<string, unknown> | undefined;
  const media = tweet.media as Record<string, unknown> | undefined;

  const lines: string[] = [];

  // Author
  const name = author?.name ?? 'Unknown';
  const handle = author?.screen_name ?? '';
  lines.push(`# ${name} (@${handle})`);
  lines.push('');

  // Article (long-form X post)
  if (article) {
    const title = article.title as string | undefined;
    const preview = article.preview_text as string | undefined;
    if (title) lines.push(`## ${title}`);
    if (preview) {
      lines.push('');
      lines.push(preview);
    }
    lines.push('');
  }

  // Tweet text
  const text = (tweet.text as string) || '';
  if (text) {
    lines.push(text);
    lines.push('');
  }

  // Media (images)
  if (media) {
    const photos = (media.photos as Array<Record<string, unknown>>) ?? [];
    for (const photo of photos) {
      const imgUrl = photo.url as string;
      if (imgUrl) lines.push(`![image](${imgUrl})`);
    }
    const videos = (media.videos as Array<Record<string, unknown>>) ?? [];
    for (const video of videos) {
      const thumbUrl = video.thumbnail_url as string;
      if (thumbUrl) lines.push(`![video thumbnail](${thumbUrl})`);
    }
  }

  // Quote tweet
  if (quote) {
    const qAuthor = quote.author as Record<string, unknown> | undefined;
    const qName = qAuthor?.name ?? 'Unknown';
    const qHandle = qAuthor?.screen_name ?? '';
    const qText = (quote.text as string) || '';
    lines.push(`> **${qName} (@${qHandle}):** ${qText}`);
    lines.push('');
  }

  // Engagement stats
  const stats = [
    tweet.replies != null ? `${tweet.replies} replies` : null,
    tweet.retweets != null ? `${tweet.retweets} retweets` : null,
    tweet.likes != null ? `${tweet.likes} likes` : null,
    tweet.views != null ? `${tweet.views} views` : null,
  ].filter(Boolean);
  if (stats.length) lines.push(`*${stats.join(' · ')}*`);

  const result = lines.join('\n').trim();
  if (!result || result.length < 10) throw new Error('No meaningful content in tweet');
  return result;
}

/**
 * Truncate content to a reasonable size to avoid overwhelming the model context.
 */
export function truncateContent(content: string, maxChars = 100_000): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + '\n\n[Content truncated — exceeded ' + maxChars + ' characters]';
}

/**
 * SSRF protection — returns true if the URL targets a private/internal network address.
 * Block before fetching to prevent server-side request forgery attacks.
 */
export function isPrivateUrl(urlString: string): boolean {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return true; // Treat unparseable URLs as blocked
  }

  // Only allow http and https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

  const hostname = url.hostname.toLowerCase();

  // Block common private/internal hostnames
  const blockedHostnames = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254'];
  if (blockedHostnames.includes(hostname)) return true;

  // Block .local domains
  if (hostname.endsWith('.local')) return true;

  // Block private IPv4 ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    if (parts[0] === 10) return true;                                    // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true;               // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true;               // 169.254.0.0/16 (link-local)
    if (parts[0] === 127) return true;                                   // 127.0.0.0/8 (loopback)
  }

  // Block IPv6 loopback and link-local
  if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('[fe80:')) return true;

  return false;
}

/**
 * Shared PlaywrightCrawler configuration — timeout, proxy, stealth, fingerprints.
 * Spread into crawler constructor and override per-tool options after.
 */
export function getPlaywrightCrawlerDefaults() {
  const timeout = getTimeoutMs();
  const proxyUrls = getProxyUrls();
  const stealth = isStealthEnabled();

  return {
    requestHandlerTimeoutSecs: Math.ceil(timeout / 1000),
    navigationTimeoutSecs: Math.ceil(timeout / 1000),
    headless: true as const,
    proxyConfiguration: proxyUrls ? new ProxyConfiguration({ proxyUrls }) : undefined,
    launchContext: {
      launchOptions: {
        args: stealth
          ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
          : ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    },
    browserPoolOptions: {
      useFingerprints: stealth,
    },
  };
}

/**
 * Shared CheerioCrawler configuration — timeout and proxy.
 * Spread into crawler constructor and override per-tool options after.
 */
export function getCheerioCrawlerDefaults() {
  const timeout = getTimeoutMs();
  const proxyUrls = getProxyUrls();

  return {
    requestHandlerTimeoutSecs: Math.ceil(timeout / 1000),
    navigationTimeoutSecs: Math.ceil(timeout / 1000),
    proxyConfiguration: proxyUrls ? new ProxyConfiguration({ proxyUrls }) : undefined,
  };
}
