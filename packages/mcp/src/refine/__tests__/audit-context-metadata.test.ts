// Tests that the MCP RefineSources write package.json + README metadata onto
// the skill IR during `extract()`, mirroring the other sources. The audit reads
// this metadata directly from the skill — there is no separate auditContext.
//
// Strategy: vi.mock `../../extract.js` so `extract()` never spawns a real MCP
// server (the build source calls `extractMcpSkill`; the runtime source is
// driven by an injected `extract` thunk). Both sources are pointed at a temp
// package dir containing a `package.json` (with a description) and a
// `README.md`; after `extract()` the returned skill must carry that metadata.

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

describe('TypeScriptMcpRefineSource metadata on the IR', () => {
  it('writes package.json + README metadata onto the skill after extract()', async () => {
    const dir = await makePkgDir();
    try {
      const source = new TypeScriptMcpRefineSource({
        transport: { type: 'stdio', command: 'node', args: ['server.js'] },
        sourceGlob: join(dir, '**', '*.ts'),
        cwd: dir
      });
      const skill = await source.extract();
      expect(skill.packageDescription).toBe('Widget MCP server for acme.');
      expect(skill.keywords).toEqual(['mcp', 'widget']);
      expect(skill.repository).toBe('https://github.com/acme/widget');
      expect(skill.readme).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('leaves metadata unset when no package.json is discoverable', async () => {
    const source = new TypeScriptMcpRefineSource({
      transport: { type: 'stdio', command: 'node', args: ['server.js'] },
      sourceGlob: '/nonexistent/**/*.ts',
      cwd: '/nonexistent'
    });
    const skill = await source.extract();
    expect(skill.packageDescription).toBeUndefined();
    expect(skill.readme).toBeUndefined();
  });
});

describe('McpRefineSource metadata on the IR', () => {
  it('writes package.json + README metadata onto the skill after extract()', async () => {
    const dir = await makePkgDir();
    try {
      const source = new McpRefineSource({
        overlayPath: join(dir, '.skillit-overlay.json'),
        extract: async () => minimalSkill,
        cwd: dir
      });
      const skill = await source.extract();
      expect(skill.packageDescription).toBe('Widget MCP server for acme.');
      expect(skill.keywords).toEqual(['mcp', 'widget']);
      expect(skill.repository).toBe('https://github.com/acme/widget');
      expect(skill.readme).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
