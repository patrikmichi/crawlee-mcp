/**
 * fetch_url tool — fetch a single URL and return clean markdown content.
 *
 * - render_js=true  → PlaywrightCrawler (handles SPA / JS-heavy pages)
 * - render_js=false → CheerioCrawler   (fast, lightweight, HTML-only)
 * - extract_content=true → strips nav/footer/ads before conversion
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PlaywrightCrawler, CheerioCrawler, Configuration } from 'crawlee';
import { z } from 'zod';
import {
  htmlToMarkdown,
  extractMainContent,
  getTimeoutMs,
  truncateContent,
  parseTwitterUrl,
  fetchTweetViaApi,
  isPrivateUrl,
  getPlaywrightCrawlerDefaults,
  getCheerioCrawlerDefaults,
} from '../utils.js';

export function registerFetchUrlTool(server: McpServer): void {
  server.tool(
    'fetch_url',
    'Fetch a web page and return its content as clean markdown. Use render_js=true for JavaScript-heavy pages (SPAs, Twitter/X, etc). Use render_js=false for fast HTML-only fetching.',
    {
      url: z.string().url().describe('The URL to fetch'),
      render_js: z
        .boolean()
        .default(true)
        .optional()
        .describe('Whether to render JavaScript before extracting content. Default: true'),
      extract_content: z
        .boolean()
        .default(true)
        .optional()
        .describe('Strip navigation, footer, and ads — return main content only. Default: true'),
    },
    async ({ url, render_js = true, extract_content = true }) => {
      try {
        // SSRF protection: block private/internal network URLs
        if (isPrivateUrl(url)) {
          return {
            content: [{ type: 'text' as const, text: `Error: URL is not allowed (private or internal network address): ${url}` }],
            isError: true,
          };
        }

        // Twitter/X: use fxtwitter JSON API (no scraping needed)
        const twitter = parseTwitterUrl(url);
        if (twitter.isTwitter) {
          const content = await fetchTweetViaApi(twitter.path);
          return {
            content: [{ type: 'text' as const, text: truncateContent(content) }],
          };
        }

        const content = render_js
          ? await fetchWithPlaywright(url, extract_content)
          : await fetchWithCheerio(url, extract_content);

        return {
          content: [
            {
              type: 'text' as const,
              text: truncateContent(content),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error fetching ${url}: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

async function fetchWithPlaywright(url: string, extractContent: boolean): Promise<string> {
  let result = '';
  const timeout = getTimeoutMs();

  const crawler = new PlaywrightCrawler(
    {
      ...getPlaywrightCrawlerDefaults(),
      maxRequestsPerCrawl: 1,
      async requestHandler({ page, parseWithCheerio, handleCloudflareChallenge }) {
        // Wait for page to be ready (fallback if networkidle never fires)
        await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
        await handleCloudflareChallenge().catch(() => {});

        if (extractContent) {
          // Use crawlee's built-in parseWithCheerio for clean DOM access
          const $ = await parseWithCheerio();
          const html = extractMainContent($.html() ?? '');
          result = htmlToMarkdown(html);
        } else {
          const html = await page.content();
          result = htmlToMarkdown(html);
        }
      },
    },
    new Configuration({ persistStorage: false }),
  );

  await crawler.run([url]);

  if (!result) throw new Error('No content extracted from page');
  return result;
}

async function fetchWithCheerio(url: string, extractContent: boolean): Promise<string> {
  let result = '';

  const crawler = new CheerioCrawler(
    {
      ...getCheerioCrawlerDefaults(),
      maxRequestsPerCrawl: 1,
      async requestHandler({ $ }) {
        const html = extractContent
          ? extractMainContent($.html() ?? '')
          : $.html() ?? '';
        result = htmlToMarkdown(html);
      },
    },
    new Configuration({ persistStorage: false }),
  );

  await crawler.run([url]);

  if (!result) throw new Error('No content extracted from page');
  return result;
}
