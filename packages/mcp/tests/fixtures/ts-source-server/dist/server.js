#!/usr/bin/env node
// Compiled entry for ts-source-server fixture.
// Hand-written (not built from TS) so the fixture needs no build step in CI.
// Resolves @modelcontextprotocol/sdk via the parent packages/mcp install.
//
// Exposes two unannotated tools: `compute` and `list_items`.
// The TypeScript source (../src/server.ts) uses server.tool() so that
// TypeScriptMcpRefineSource can discover and patch _meta.toSkills annotations
// during the build-mode enrichment loop.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'ts-source-server', version: '0.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'compute',
      description: 'Compute a result from the given input.',
      inputSchema: {
        type: 'object',
        properties: { input: { type: 'string', description: 'The input value to compute from.' } },
        required: ['input']
      }
    },
    {
      name: 'list_items',
      description: 'List all available items.',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}));

const transport = new StdioServerTransport();
await server.connect(transport);
