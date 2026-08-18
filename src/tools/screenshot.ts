/**
 * screenshot tool — take a screenshot of a web page and return it as base64 PNG.
 *
 * Uses PlaywrightCrawler with full-page support.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PlaywrightCrawler, Configuration } from 'crawlee';
import { z } from 'zod';
import { getTimeoutMs, isPrivateUrl, getPlaywrightCrawlerDefaults } from '../utils.js';

export function registerScreenshotTool(server: McpServer): void {
  server.tool(
    'screenshot',
    'Take a screenshot of a web page and return it as a base64-encoded PNG image.',
    {
      url: z.string().url().describe('The URL to screenshot'),
      full_page: z
        .boolean()
        .default(false)
        .optional()
        .describe('Capture the full scrollable page instead of only the viewport. Default: false'),
    },
    async ({ url, full_page = false }) => {
      try {
        // SSRF protection: block private/internal network URLs
        if (isPrivateUrl(url)) {
          return {
            content: [{ type: 'text' as const, text: `Error: URL is not allowed (private or internal network address): ${url}` }],
            isError: true,
          };
        }

        const base64 = await takeScreenshot(url, full_page);
        return {
          content: [
            {
              type: 'image' as const,
              data: base64,
              mimeType: 'image/png',
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error taking screenshot of ${url}: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

async function takeScreenshot(url: string, fullPage: boolean): Promise<string> {
  let screenshotBase64 = '';
  const timeout = getTimeoutMs();

  const crawler = new PlaywrightCrawler(
    {
      ...getPlaywrightCrawlerDefaults(),
      maxRequestsPerCrawl: 1,
      async requestHandler({ page, handleCloudflareChallenge }) {
        await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
        await handleCloudflareChallenge().catch(() => {});
        const buffer = await page.screenshot({ fullPage, type: 'png' });
        screenshotBase64 = buffer.toString('base64');
      },
    },
    new Configuration({ persistStorage: false }),
  );

  await crawler.run([url]);

  if (!screenshotBase64) throw new Error('Failed to capture screenshot');
  return screenshotBase64;
}
