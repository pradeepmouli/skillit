/**
 * Performance test (T107a / SC-006): bundle wall-clock budget assertion.
 *
 * Generates a synthetic MCP server fixture programmatically (NOT shipped as
 * a static fixture) exposing 30 tools, 10 resources, and 5 prompts, then
 * runs `skillit-mcp bundle` and asserts wall-clock < 30 seconds.
 *
 * Gating (intentionally strict — this is heavy):
 *   - RUN_INTEGRATION_TESTS=true (matches the rest of the integration suite)
 *   - RUN_PERF_TESTS=true        (opt-in; perf assertions are flaky on dev laptops)
 *   - CI=true                    (only run in actual CI environments)
 *
 * The wall-clock measurement INCLUDES server-spawn time today because
 * commander's `bundle` doesn't expose a hook to measure post-spawn time.
 * The 30 000ms budget is generous enough to absorb a typical Node spawn
 * (~150-300ms) while still flagging real regressions.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN =
  process.env.RUN_INTEGRATION_TESTS === 'true' &&
  process.env.RUN_PERF_TESTS === 'true' &&
  process.env.CI === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

/** Budget (ms) — SC-006 mandates < 30 s for a 30/10/5 surface. */
const BUDGET_MS = 30_000;

describe.skipIf(!RUN)('bundle performance: synthetic 30/10/5 server', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-perf-it-'));
    mkdirSync(join(workDir, 'dist'), { recursive: true });

    // Generate the fixture server source programmatically. We build the tool /
    // resource / prompt arrays as JSON and embed them into a hand-written
    // server scaffold so the SDK's request handlers return them verbatim.
    const tools = Array.from({ length: 30 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool ${i} performs work item ${i}.`,
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: `Input for tool ${i}` },
          flag: { type: 'boolean', description: `Optional flag ${i}` }
        },
        required: ['input']
      }
    }));
    const resources = Array.from({ length: 10 }, (_, i) => ({
      uri: `synthetic://resource/${i}`,
      name: `resource_${i}`,
      description: `Resource ${i}.`,
      mimeType: 'text/plain'
    }));
    const prompts = Array.from({ length: 5 }, (_, i) => ({
      name: `prompt_${i}`,
      description: `Prompt ${i} renders boilerplate.`,
      arguments: [{ name: 'topic', description: 'topic', required: true }]
    }));

    const serverJs = `#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'perf-server', version: '0.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ${JSON.stringify(tools)} }));
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: ${JSON.stringify(resources)} }));
server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: ${JSON.stringify(prompts)} }));

const transport = new StdioServerTransport();
await server.connect(transport);
`;
    writeFileSync(join(workDir, 'dist', 'server.js'), serverJs, 'utf8');
    writeFileSync(
      join(workDir, 'package.json'),
      JSON.stringify(
        {
          name: '@fixture/perf-mcp-server',
          version: '0.0.0',
          private: true,
          bin: './dist/server.js',
          files: ['dist', 'skills'],
          type: 'module',
          skillit: { mcp: { skillName: 'perf-server' } }
        },
        null,
        2
      ),
      'utf8'
    );
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it(
    `bundles a 30/10/5 server in under ${BUDGET_MS}ms wall-clock`,
    async () => {
      const start = Date.now();
      await exec('node', [BIN_PATH, 'bundle', '--package-root', workDir, '--out', 'skills'], {
        timeout: BUDGET_MS + 10_000
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(BUDGET_MS);
    },
    BUDGET_MS + 30_000
  );
});
