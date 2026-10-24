# Crawlee MCP

A local [Model Context Protocol](https://modelcontextprotocol.io/) server for web fetching, crawling, and screenshots with [Crawlee](https://crawlee.dev). It runs over stdio, so it works with Claude Code, Claude Desktop, Codex, Cursor, and any MCP-compatible client.

## Tools

| Tool | Description |
|------|-------------|
| `fetch_url` | Fetch a single URL and return clean markdown |
| `fetch_multiple` | Fetch multiple URLs in parallel |
| `crawl` | Crawl a site, discover links, and return page content |
| `screenshot` | Take a PNG screenshot of a page |
| `ping` | Health check |

## Install

Requires Node.js 26 or newer. Development uses Node 26.12.1 and pnpm 12.15.0 from `mise.toml`. The first use of JavaScript rendering or screenshots also requires the Chromium browser:

```bash
npx playwright install chromium
```

Once published to npm, every client can start it with:

```bash
npx -y @patrikmichi/crawlee-mcp
```

Until the npm package is published, install directly from GitHub:

```bash
npx -y github:patrikmichi/crawlee-mcp
```

## Client configuration

### Claude Code

```bash
claude mcp add --transport stdio crawlee -- npx -y @patrikmichi/crawlee-mcp
```

### Claude Desktop

Add this to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "crawlee": {
      "command": "npx",
      "args": ["-y", "@patrikmichi/crawlee-mcp"]
    }
  }
}
```

### Codex

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.crawlee]
command = "npx"
args = ["-y", "@patrikmichi/crawlee-mcp"]
```

### Other MCP clients

Use the same command and arguments: `npx -y @patrikmichi/crawlee-mcp`.

## Configuration

```bash
cp env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `CRAWLEE_PROXY_URLS` | No | Comma-separated proxy URLs for rotation |
| `CRAWLEE_TIMEOUT_MS` | No | Request timeout in ms (default: `30000`) |
| `CRAWLEE_STEALTH` | No | Set to `false` to disable stealth mode (default: `true`) |

## Development

```bash
npm install
npm start          # Run with tsx (no build needed)
npm run build      # Compile TypeScript
npm run typecheck  # Type check only
```

This server is intentionally local and stdio-only because JavaScript rendering and screenshots require a local Playwright browser.
