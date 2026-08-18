# CLAUDE.md — crawlee-mcp

## What
MCP server wrapping the Crawlee Node.js library for web fetching and scraping. Exposes 4 tools (fetch_url, fetch_multiple, screenshot, ping) via stdio. Playwright handles JS rendering. See [AGENTS.md](./AGENTS.md) for agent reference.

## How
```bash
npm install
cp env.example .env   # All vars optional (proxy, timeout, stealth)
npm start             # Run with tsx (no build needed)
npm run build         # Compile TypeScript
npm run typecheck     # TypeScript check
```

## Key Constraints
- Stdio only — not deployable to Vercel (requires local Node process)
- `render_js=true` on fetch_url spawns a Playwright browser (slower, more memory)
- Playwright must be installed separately: `npx playwright install`

## Status: active
