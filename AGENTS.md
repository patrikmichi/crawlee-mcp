# crawlee-mcp — Agent Reference

MCP server wrapping the Crawlee Node.js library for web fetching and scraping (stdio only). See `CLAUDE.md` for commands and constraints.

## Project Structure

```
crawlee-mcp/
+-- src/
|   +-- server.ts             — Entry point, MCP server setup
|   +-- utils.ts              — Shared helpers (HTML->MD, proxy, timeout)
|   +-- tools/
|       +-- fetch-url.ts      — fetch_url tool
|       +-- fetch-multiple.ts — fetch_multiple tool
|       +-- screenshot.ts     — screenshot tool
+-- env.example               — Optional env vars
+-- package.json
+-- tsconfig.json
```

## Tools Exposed

| Tool | Description |
|------|-------------|
| `fetch_url` | Fetch a single URL -> clean markdown. render_js=true uses Playwright. |
| `fetch_multiple` | Fetch multiple URLs in parallel -> array of {url, content, error} |
| `screenshot` | Take a PNG screenshot of a page -> base64 image |
| `ping` | Health check |

## Environment Variables

See `env.example`. All optional:
- `CRAWLEE_PROXY_URLS` — comma-separated proxy URLs
- `CRAWLEE_TIMEOUT_MS` — request timeout in ms (default: 30000)
- `CRAWLEE_STEALTH` — set to `"false"` to disable stealth mode

## .mcp.json Entry

```json
{
  "crawlee": {
    "command": "npx",
    "args": ["tsx", "src/server.ts"],
    "cwd": "/absolute/path/to/crawlee-mcp"
  }
}
```

## Key Commands

| Command | What it does |
|---------|--------------|
| `npm start` | Run with tsx (no build needed) |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | TypeScript check |

## Detailed References

| Topic | Where to look |
|-------|---------------|
| Tool implementations | `src/tools/` |
| Shared helpers | `src/utils.ts` |
| Environment variables | `env.example` |
| Dependencies | `package.json` |
| MCP SDK docs | https://modelcontextprotocol.io/docs |
| Crawlee docs | https://crawlee.dev/docs |
