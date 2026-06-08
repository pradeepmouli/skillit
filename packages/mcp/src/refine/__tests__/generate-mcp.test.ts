// Unit test for the gen primitive `generateMcpSkill`.
//
// Strategy: vi.mock `../extract.js` so we never spawn a real MCP server. The
// mock returns a minimal valid ExtractedSkill; the real renderSkill+writeSkills
// pipeline runs against a tmpdir so we assert SKILL.md actually lands on disk.
// This mock is isolated in its own file so it can't bleed into factory.test.ts,
// which imports the real `../extract.js`.

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
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

// Import AFTER the mock is declared so the factory binds to the mocked extract.
const { generateMcpSkill } = await import('../factory.js');

describe('generateMcpSkill', () => {
  it('extracts the selected server and writes SKILL.md under outDir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gen-mcp-'));
    try {
      const mcpPath = join(dir, 'mcp.json');
      await writeFile(
        mcpPath,
        JSON.stringify({ mcpServers: { srv: { command: 'node', args: ['server.js'] } } }),
        'utf8'
      );
      const outDir = join(dir, 'out');

      await generateMcpSkill({ mcpPath, outDir });

      const written = readdirSync(outDir, { recursive: true }) as string[];
      expect(written.some((f) => String(f).endsWith('SKILL.md'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
