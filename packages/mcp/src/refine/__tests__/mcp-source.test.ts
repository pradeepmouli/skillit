import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { McpRefineSource } from '../runtime/mcp-source.js';
import type { ExtractedSkill } from '@skillit/core';

let tmp = '';
afterEach(() => {
  if (tmp) {
    rmSync(tmp, { recursive: true });
    tmp = '';
  }
});

const baseSkill = (): ExtractedSkill =>
  ({
    name: 'test',
    functions: [{ name: 'list_files', description: '', parameters: [], tags: {} }],
    useWhen: [],
    avoidWhen: [],
    pitfalls: []
  }) as unknown as ExtractedSkill;

describe('McpRefineSource', () => {
  it('extract returns skill with overlay merged', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'mcp-source-'));
    const overlayPath = join(tmp, 'overlay.json');
    const rawExtract = vi.fn(async () => baseSkill());
    const source = new McpRefineSource({ overlayPath, extract: rawExtract, cwd: tmp });

    const s1 = await source.extract();
    expect(s1.functions[0]!.name).toBe('list_files');

    await source.applyFixes([{ toolName: 'list_files', tag: 'useWhen', value: 'When listing' }]);
    const s2 = await source.extract();
    expect(s2.functions[0]!.mcpMetadata?.toSkills?.useWhen).toEqual(['When listing']);
  });

  it('applyFixes writes overlay to disk', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'mcp-source-'));
    const overlayPath = join(tmp, 'overlay.json');
    const source = new McpRefineSource({ overlayPath, extract: async () => baseSkill(), cwd: tmp });
    await source.applyFixes([
      { toolName: 'tool_a', tag: 'pitfalls', value: 'Do not call in parallel' }
    ]);
    const written = JSON.parse(readFileSync(overlayPath, 'utf8'));
    expect(written.tools.tool_a.pitfalls).toBe('Do not call in parallel');
  });
});
