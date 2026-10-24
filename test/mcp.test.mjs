import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('built server negotiates MCP and exposes usable tool schemas', { timeout: 15_000 }, async () => {
  const client = new Client({ name: 'protocol-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/server.js', import.meta.url))],
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.ok(tools.some((tool) => tool.name === 'fetch_url' && tool.inputSchema.properties?.url));
    assert.ok(tools.every((tool) => tool.inputSchema.type === 'object'));
    const result = await client.callTool({ name: 'ping', arguments: {} });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /pong/);
  } finally {
    await client.close();
  }
});
