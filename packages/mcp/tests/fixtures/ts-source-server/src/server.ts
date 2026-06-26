#!/usr/bin/env node
// Editable TypeScript MCP server for testing build-mode source enrichment.
//
// Tools are intentionally left unannotated (no _meta.toSkills) so that
// TypeScriptMcpRefineSource.applyFixes() has something meaningful to add.
//
// Design: `server` is a registration collector — each server.tool() call
// pushes an entry into `registeredTools`.  The setRequestHandler below
// serialises the array verbatim into the tools/list response, forwarding
// `_meta` when present.  After applyFixes() injects _meta.toSkills and the
// source is recompiled, the next extract() reads the updated annotations and
// the audit grade improves.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const sdkServer = new Server(
  { name: 'ts-source-server', version: '0.0.0' },
  { capabilities: { tools: {} } }
);

type ToolOpts = { description: string; _meta?: Record<string, unknown> };
const registeredTools: Array<{ name: string } & ToolOpts> = [];

const server = {
  tool(name: string, opts: ToolOpts, _handler: () => unknown): void {
    registeredTools.push({ name, ...opts });
  }
};

server.tool('compute', { description: 'Compute a result from the given input.' }, () => {});

server.tool('list_items', { description: 'List all available items.' }, () => {});

sdkServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: registeredTools.map(({ name, description, _meta }) => ({
    name,
    description,
    inputSchema: { type: 'object' as const, properties: {} },
    ...(_meta !== undefined ? { _meta } : {})
  }))
}));

const transport = new StdioServerTransport();
await sdkServer.connect(transport);
