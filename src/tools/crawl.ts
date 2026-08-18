/**
 * crawl tool — multi-page crawl starting from a seed URL.
 *
 * Uses Crawlee properly with enqueueLinks, request queues, and labels to
 * discover and follow links across multiple pages.
 *
 * - render_js=true  → PlaywrightCrawler (handles SPA / JS-heavy sites)
 * - render_js=false → CheerioCrawler   (fast, lightweight, HTML-only)
 * - link_selector   → CSS selector for links to enqueue (default: "a")
 * - link_pattern    → Glob pattern to filter discovered URLs
 * - max_pages       → Maximum pages to crawl (default: 10, max: 50)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PlaywrightCrawler, CheerioCrawler, Configuration } from 'crawlee';
import { z } from 'zod';
import {
  htmlToMarkdown,
  extractMainContent,
  getTimeoutMs,
  truncateContent,
  isPrivateUrl,
  getPlaywrightCrawlerDefaults,
  getCheerioCrawlerDefaults,
} from '../utils.js';

interface CrawlPageResult {
  url: string;
  title: string;
  content: string;
}

interface CrawlOutput {
  pages_crawled: number;
  pages_found: number;
  results: CrawlPageResult[];
}

const MAX_PAGES_HARD_LIMIT = 50;
const PER_PAGE_CONTENT_LIMIT = 20_000;

export function registerCrawlTool(server: McpServer): void {
  server.tool(
    'crawl',
    'Crawl a website starting from a seed URL, following discovered links across multiple pages. Returns an array of {url, title, content} objects. Use link_pattern to restrict crawling to specific URL patterns (e.g. "https://example.com/blog/**").',
    {
      url: z.string().url().describe('Starting URL to crawl from'),
      link_selector: z
        .string()
        .default('a')
        .optional()
        .describe('CSS selector for links to follow. Default: "a"'),
      link_pattern: z
        .string()
        .optional()
        .describe(
          'Glob pattern to filter discovered URLs (e.g. "https://example.com/blog/**"). Only URLs matching this pattern will be enqueued.',
        ),
      max_pages: z
        .number()
        .int()
        .min(1)
        .max(MAX_PAGES_HARD_LIMIT)
        .default(10)
        .optional()
        .describe(`Maximum number of pages to crawl. Default: 10, max: ${MAX_PAGES_HARD_LIMIT}`),
      render_js: z
        .boolean()
        .default(true)
        .optional()
        .describe('Whether to use Playwright (JS rendering) or Cheerio (fast HTML-only). Default: true'),
      extract_content: z
        .boolean()
        .default(true)
        .optional()
        .describe('Strip navigation, footer, and ads — return main content only. Default: true'),
      label: z
        .string()
        .optional()
        .describe('Label to attach to the initial request for categorising discovered links'),
    },
    async ({
      url,
      link_selector = 'a',
      link_pattern,
      max_pages = 10,
      render_js = true,
      extract_content = true,
      label,
    }) => {
      try {
        if (isPrivateUrl(url)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: URL is not allowed (private or internal network address): ${url}`,
              },
            ],
            isError: true,
          };
        }

        const clampedMaxPages = Math.min(Math.max(1, max_pages), MAX_PAGES_HARD_LIMIT);

        const output = render_js
          ? await crawlWithPlaywright(url, {
              linkSelector: link_selector,
              linkPattern: link_pattern,
              maxPages: clampedMaxPages,
              extractContent: extract_content,
              label,
            })
          : await crawlWithCheerio(url, {
              linkSelector: link_selector,
              linkPattern: link_pattern,
              maxPages: clampedMaxPages,
              extractContent: extract_content,
              label,
            });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(output, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error crawling ${url}: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

interface CrawlOptions {
  linkSelector: string;
  linkPattern?: string;
  maxPages: number;
  extractContent: boolean;
  label?: string;
}

async function crawlWithPlaywright(startUrl: string, opts: CrawlOptions): Promise<CrawlOutput> {
  const results: CrawlPageResult[] = [];
  let pagesFound = 0;
  const timeout = getTimeoutMs();
  const globs = opts.linkPattern ? [opts.linkPattern] : undefined;

  const crawler = new PlaywrightCrawler(
    {
      ...getPlaywrightCrawlerDefaults(),
      maxRequestsPerCrawl: opts.maxPages,
      maxConcurrency: 3,
      respectRobotsTxtFile: true,
      async requestHandler({ request, page, enqueueLinks, parseWithCheerio, handleCloudflareChallenge }) {
        await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
        await handleCloudflareChallenge().catch(() => {});

        const title = await page.title().catch(() => '');

        // Use parseWithCheerio for content extraction after JS rendering
        const $ = await parseWithCheerio();
        const rawHtml = $.html() ?? '';
        const processedHtml = opts.extractContent ? extractMainContent(rawHtml) : rawHtml;
        const content = truncateContent(htmlToMarkdown(processedHtml), PER_PAGE_CONTENT_LIMIT);

        results.push({ url: request.url, title, content });

        // Discover and enqueue links — core Crawlee usage
        const enqueueResult = await enqueueLinks({
          selector: opts.linkSelector,
          ...(globs ? { globs } : {}),
          ...(opts.label ? { label: opts.label } : {}),
          transformRequestFunction: (req) => (isPrivateUrl(req.url) ? false : req),
        });

        pagesFound += enqueueResult.processedRequests.length;
      },
      async failedRequestHandler({ request }) {
        // Record failed pages so the caller knows they were attempted
        results.push({ url: request.url, title: '', content: `[Failed to fetch page]` });
      },
    },
    new Configuration({ persistStorage: false }),
  );

  const initialRequest = opts.label ? { url: startUrl, label: opts.label } : startUrl;
  await crawler.run([initialRequest]);

  return {
    pages_crawled: results.length,
    pages_found: results.length + pagesFound,
    results,
  };
}

async function crawlWithCheerio(startUrl: string, opts: CrawlOptions): Promise<CrawlOutput> {
  const results: CrawlPageResult[] = [];
  let pagesFound = 0;
  const globs = opts.linkPattern ? [opts.linkPattern] : undefined;

  const crawler = new CheerioCrawler(
    {
      ...getCheerioCrawlerDefaults(),
      maxRequestsPerCrawl: opts.maxPages,
      maxConcurrency: 5,
      respectRobotsTxtFile: true,
      async requestHandler({ request, $, enqueueLinks }) {
        const html = opts.extractContent ? extractMainContent($.html() ?? '') : $.html() ?? '';
        const title = $('title').first().text().trim();
        const content = truncateContent(htmlToMarkdown(html), PER_PAGE_CONTENT_LIMIT);

        results.push({ url: request.url, title, content });

        // Discover and enqueue links — core Crawlee usage
        const enqueueResult = await enqueueLinks({
          selector: opts.linkSelector,
          ...(globs ? { globs } : {}),
          ...(opts.label ? { label: opts.label } : {}),
          transformRequestFunction: (req) => (isPrivateUrl(req.url) ? false : req),
        });

        pagesFound += enqueueResult.processedRequests.length;
      },
      async failedRequestHandler({ request }) {
        results.push({ url: request.url, title: '', content: `[Failed to fetch page]` });
      },
    },
    new Configuration({ persistStorage: false }),
  );

  const initialRequest = opts.label ? { url: startUrl, label: opts.label } : startUrl;
  await crawler.run([initialRequest]);

  return {
    pages_crawled: results.length,
    pages_found: results.length + pagesFound,
    results,
  };
}
