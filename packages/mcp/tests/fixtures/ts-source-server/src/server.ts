#!/usr/bin/env node
// Editable TypeScript MCP server for testing build-mode source enrichment.
//
// Tools are intentionally left unannotated (no _meta.toSkills) so that
// TypeScriptMcpRefineSource.applyFixes() has something meaningful to add.
//
// The `server` adapter below accepts { description, _meta? } options objects —
// the shape that applyMetaEdit injects _meta.toSkills into.  At runtime,
// `_meta` is intentionally ignored and `description` is forwarded to the SDK
// as a string annotation, so the compiled server keeps working after each
// applyFixes() pass without requiring any manual dist/ update.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const mcpServer = new McpServer({
  name: 'ts-source-server',
  version: '0.0.0'
});

type ToolHandler = () => Promise<{ content: Array<{ type: 'text'; text: string }> }>;

const server = {
  tool(
    name: string,
    opts: { description: string; _meta?: Record<string, unknown> },
    handler: ToolHandler
  ): void {
    mcpServer.tool(name, opts.description, handler);
  }
};

server.tool('compute', { description: 'Compute a result from the given input.' }, async () => ({
  content: [{ type: 'text' as const, text: 'computed' }]
}));

server.tool('list_items', { description: 'List all available items.' }, async () => ({
  content: [{ type: 'text' as const, text: 'item-a, item-b, item-c' }]
}));

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
