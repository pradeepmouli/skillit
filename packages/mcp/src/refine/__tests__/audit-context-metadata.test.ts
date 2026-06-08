// Tests that the MCP RefineSources populate `auditContext` with package.json +
// README metadata after `extract()`, mirroring the CliRefineSource fix.
//
// Strategy: vi.mock `../../extract.js` so `extract()` never spawns a real MCP
// server (the build source calls `extractMcpSkill`; the runtime source is
// driven by an injected `extract` thunk). Both sources are pointed at a temp
// package dir containing a `package.json` (with a description) and a
// `README.md`; after `extract()` their `auditContext()` must surface that
// metadata synchronously.

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtractedSkill } from '@skillit/core';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../extract.js', () => ({
  extractMcpSkill: vi.fn(
    async (): Promise<ExtractedSkill> => ({
      name: 'srv',
      description: 'mock server',
      functions: [],
      classes: [],
      types: [],
      enums: [],
      variables: [],
      examples: []
    })
  )
}));

// Import AFTER the mock is declared so the build source binds the mocked extract.
const { TypeScriptMcpRefineSource } = await import('../build/ts-mcp-source.js');
const { McpRefineSource } = await import('../runtime/mcp-source.js');

const minimalSkill: ExtractedSkill = {
  name: 'srv',
  description: 'mock server',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

async function makePkgDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-meta-'));
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: '@acme/widget',
      description: 'Widget MCP server for acme.',
      keywords: ['mcp', 'widget'],
      repository: 'https://github.com/acme/widget'
    }),
    'utf8'
  );
  await writeFile(join(dir, 'README.md'), '# Widget\n\nDoes widget things.\n', 'utf8');
  return dir;
}

describe('TypeScriptMcpRefineSource auditContext', () => {
  it('returns package.json + README metadata after extract()', async () => {
    const dir = await makePkgDir();
    try {
      const source = new TypeScriptMcpRefineSource({
        transport: { type: 'stdio', command: 'node', args: ['server.js'] },
        sourceGlob: join(dir, '**', '*.ts'),
        cwd: dir
      });
      await source.extract();
      const ctx = source.auditContext(minimalSkill);
      expect(ctx.packageDescription).toBe('Widget MCP server for acme.');
      expect(ctx.keywords).toEqual(['mcp', 'widget']);
      expect(ctx.repository).toBe('https://github.com/acme/widget');
      expect(ctx.readme).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty context before extract()', () => {
    const source = new TypeScriptMcpRefineSource({
      transport: { type: 'stdio', command: 'node', args: ['server.js'] },
      sourceGlob: '/nonexistent/**/*.ts',
      cwd: '/nonexistent'
    });
    expect(source.auditContext(minimalSkill)).toEqual({});
  });
});

describe('McpRefineSource auditContext', () => {
  it('returns package.json + README metadata after extract()', async () => {
    const dir = await makePkgDir();
    try {
      const source = new McpRefineSource({
        overlayPath: join(dir, '.skillit-overlay.json'),
        extract: async () => minimalSkill,
        cwd: dir
      });
      await source.extract();
      const ctx = source.auditContext(minimalSkill);
      expect(ctx.packageDescription).toBe('Widget MCP server for acme.');
      expect(ctx.keywords).toEqual(['mcp', 'widget']);
      expect(ctx.repository).toBe('https://github.com/acme/widget');
      expect(ctx.readme).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
