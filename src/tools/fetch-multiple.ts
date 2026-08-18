/**
 * fetch_multiple tool — fetch multiple URLs in parallel and return an array of results.
 *
 * Uses crawlee's built-in concurrency management.
 * Each result contains: { url, content, error }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PlaywrightCrawler, CheerioCrawler, Configuration } from 'crawlee';
import { z } from 'zod';
import {
  htmlToMarkdown,
  extractMainContent,
  truncateContent,
  parseTwitterUrl,
  fetchTweetViaApi,
  isPrivateUrl,
  getPlaywrightCrawlerDefaults,
  getCheerioCrawlerDefaults,
} from '../utils.js';

interface FetchResult {
  url: string;
  content?: string;
  error?: string;
}

export function registerFetchMultipleTool(server: McpServer): void {
  server.tool(
    'fetch_multiple',
    'Fetch multiple URLs in parallel and return an array of {url, content, error} objects. Useful for bulk research or comparison tasks.',
    {
      urls: z.array(z.string().url()).min(1).max(20).describe('Array of URLs to fetch (max 20)'),
      render_js: z
        .boolean()
        .default(true)
        .optional()
        .describe('Whether to render JavaScript before extracting content. Default: true'),
    },
    async ({ urls, render_js = true }) => {
      // SSRF protection: filter out private/internal network URLs before processing
      const blockedUrls = urls.filter(isPrivateUrl);
      const allowedUrls = urls.filter(u => !isPrivateUrl(u));

      // Split Twitter/X URLs (use JSON API) from regular URLs
      const twitterItems: { originalUrl: string; path: string }[] = [];
      const regularUrls: string[] = [];
      for (const u of allowedUrls) {
        const tw = parseTwitterUrl(u);
        if (tw.isTwitter) {
          twitterItems.push({ originalUrl: u, path: tw.path });
        } else {
          regularUrls.push(u);
        }
      }

      const results: FetchResult[] = [];

      // Add errors for blocked URLs
      for (const u of blockedUrls) {
        results.push({ url: u, error: `URL is not allowed (private or internal network address): ${u}` });
      }

      // Fetch Twitter URLs via fxtwitter JSON API
      for (const item of twitterItems) {
        try {
          const content = await fetchTweetViaApi(item.path);
          results.push({ url: item.originalUrl, content: truncateContent(content) });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ url: item.originalUrl, error: message });
        }
      }
      // Fetch regular URLs with chosen method
      if (regularUrls.length > 0) {
        const regularResults = render_js
          ? await fetchMultipleWithPlaywright(regularUrls)
          : await fetchMultipleWithCheerio(regularUrls);
        results.push(...regularResults);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    },
  );
}

async function fetchMultipleWithPlaywright(urls: string[]): Promise<FetchResult[]> {
  const results: FetchResult[] = [];

  const crawler = new PlaywrightCrawler(
    {
      ...getPlaywrightCrawlerDefaults(),
      maxConcurrency: 5,
      async requestHandler({ request, page, parseWithCheerio, handleCloudflareChallenge }) {
        await handleCloudflareChallenge().catch(() => {});
        const $ = await parseWithCheerio();
        const html = extractMainContent($.html() ?? '');
        const content = htmlToMarkdown(html);
        results.push({ url: request.url, content: truncateContent(content) });
      },
      async failedRequestHandler({ request }, error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ url: request.url, error: message });
      },
    },
    new Configuration({ persistStorage: false }),
  );

  await crawler.run(urls);
  return results;
}

async function fetchMultipleWithCheerio(urls: string[]): Promise<FetchResult[]> {
  const results: FetchResult[] = [];

  const crawler = new CheerioCrawler(
    {
      ...getCheerioCrawlerDefaults(),
      maxConcurrency: 10,
      async requestHandler({ request, $ }) {
        const html = extractMainContent($.html() ?? '');
        const content = htmlToMarkdown(html);
        results.push({ url: request.url, content: truncateContent(content) });
      },
      async failedRequestHandler({ request }, error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ url: request.url, error: message });
      },
    },
    new Configuration({ persistStorage: false }),
  );

  await crawler.run(urls);
  return results;
}
