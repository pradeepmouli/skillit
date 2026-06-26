#!/usr/bin/env node
// Editable TypeScript MCP server for testing build-mode source enrichment.
//
// Tools are intentionally left unannotated (no _meta.toSkills) so that
// TypeScriptMcpRefineSource.applyFixes() has something meaningful to add.
//
// This file is the _source surface_ for the build-mode loop:
//   1. skillit gen --source mcp --mcp mcp.json --mode build
//   2. skillit audit --source mcp --mcp mcp.json --mode build --json
//   3. applyFixes writes _meta.toSkills into the options object below
//   4. Recompile (tsc / tsx) → update dist/server.js
//   5. Go to 1 — grade should improve
//
// @ts-nocheck — intentional: the options-object calling convention
// ({ description }) is what TypeScriptMcpRefineSource/applyMetaEdit scan for.
// The compiled server (dist/server.js) uses the old Server API for spawning.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'ts-source-server',
  version: '0.0.0'
});

server.tool(
  'compute',
  { description: 'Compute a result from the given input.' },
  async (_args) => ({
    content: [{ type: 'text', text: 'computed' }]
  })
);

server.tool('list_items', { description: 'List all available items.' }, async () => ({
  content: [{ type: 'text', text: 'item-a, item-b, item-c' }]
}));

const transport = new StdioServerTransport();
await server.connect(transport);
