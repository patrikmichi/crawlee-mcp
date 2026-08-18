/**
 * Crawlee MCP Server
 *
 * Web fetching and scraping capabilities for AI agents.
 * Wraps the crawlee library (PlaywrightCrawler + CheerioCrawler) to provide:
 *   - fetch_url      — fetch a single URL, returns clean markdown
 *   - fetch_multiple — fetch multiple URLs in parallel
 *   - crawl          — multi-page crawl with enqueueLinks and link discovery
 *   - screenshot     — take a PNG screenshot of a page
 *
 * Transport: stdio (local MCP server)
 * Run with: npx tsx src/server.ts
 *
 * Optional env vars:
 *   CRAWLEE_PROXY_URLS  — comma-separated proxy URLs
 *   CRAWLEE_TIMEOUT_MS  — request timeout in ms (default: 30000)
 *   CRAWLEE_STEALTH     — set to "false" to disable stealth mode
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerFetchUrlTool } from './tools/fetch-url.js';
import { registerFetchMultipleTool } from './tools/fetch-multiple.js';
import { registerScreenshotTool } from './tools/screenshot.js';
import { registerCrawlTool } from './tools/crawl.js';

/**
 * MCP SDK v2 migration notes (when @modelcontextprotocol/server ships):
 * 1. server.tool() → server.registerTool()
 * 2. Raw zod shapes → z.object() wrappers
 * 3. Import from '@modelcontextprotocol/server' instead of '@modelcontextprotocol/sdk/server/mcp.js'
 * 4. Consider: outputSchema + structuredContent for fetch_multiple and crawl tools
 * 5. Consider: ctx.mcpReq.log() for structured logging
 */
const server = new McpServer({
  name: 'crawlee',
  version: '1.1.0',
});

registerFetchUrlTool(server);
registerFetchMultipleTool(server);
registerScreenshotTool(server);
registerCrawlTool(server);

// Health check
server.tool('ping', 'Check that the crawlee MCP server is running.', {}, async () => ({
  content: [{ type: 'text', text: 'pong — crawlee MCP server is running' }],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Crawlee MCP server failed to start:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
