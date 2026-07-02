import { describe, it, expect } from 'vitest';
import { mergeOverlay } from '../runtime/merge-overlay.js';
import type { ExtractedSkill } from '@skillit/core';

function skill(fns: Array<{ name: string }>): ExtractedSkill {
  return {
    name: 'test-server',
    functions: fns.map((f) => ({ name: f.name, description: '', parameters: [], tags: {} })),
    useWhen: [],
    avoidWhen: [],
    pitfalls: []
  } as unknown as ExtractedSkill;
}

describe('mergeOverlay', () => {
  it('does not mutate the input skill', () => {
    const s = skill([{ name: 'list_files' }]);
    const overlay = { version: 1 as const, tools: { list_files: { useWhen: 'When listing' } } };
    mergeOverlay(s, overlay);
    expect(s.functions[0]!.tags).toEqual({});
  });

  it('sets mcpMetadata.skillit on matched function', () => {
    const s = skill([{ name: 'list_files' }]);
    const overlay = {
      version: 1 as const,
      tools: {
        list_files: { useWhen: 'When listing directory contents', pitfalls: 'Avoid on Windows' }
      }
    };
    const result = mergeOverlay(s, overlay);
    const fn = result.functions.find((f) => f.name === 'list_files')!;
    expect(fn.mcpMetadata?.skillit?.useWhen).toEqual(['When listing directory contents']);
    expect(fn.mcpMetadata?.skillit?.pitfalls).toEqual(['Avoid on Windows']);
  });

  it('leaves unmatched functions unchanged', () => {
    const s = skill([{ name: 'other_tool' }]);
    const overlay = { version: 1 as const, tools: { list_files: { useWhen: 'X' } } };
    const result = mergeOverlay(s, overlay);
    expect(result.functions[0]!.mcpMetadata).toBeUndefined();
  });

  it('surfaces remarks and example via fn.tags so the refine loop can read them', () => {
    const s = skill([{ name: 'list_files' }]);
    const overlay = {
      version: 1 as const,
      tools: {
        list_files: { remarks: 'Rate-limited to 100 calls/min', example: 'list_files("/tmp")' }
      }
    };
    const result = mergeOverlay(s, overlay);
    const fn = result.functions.find((f) => f.name === 'list_files')!;
    expect(fn.tags['remarks']).toBe('Rate-limited to 100 calls/min');
    expect(fn.tags['example']).toBe('list_files("/tmp")');
  });

  it('aggregates skill-level arrays from all tool annotations', () => {
    const s = skill([{ name: 'tool_a' }, { name: 'tool_b' }]);
    const overlay = {
      version: 1 as const,
      tools: {
        tool_a: { useWhen: 'Case A', avoidWhen: 'Avoid A' },
        tool_b: { useWhen: 'Case B' }
      }
    };
    const result = mergeOverlay(s, overlay);
    expect(result.useWhen).toContain('Case A');
    expect(result.useWhen).toContain('Case B');
    expect(result.avoidWhen).toContain('Avoid A');
  });
});
