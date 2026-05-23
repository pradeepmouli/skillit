// packages/core/src/refine/__tests__/select-targets.test.ts
import { describe, it, expect } from 'vitest';
import { parseTag, selectWorkItems } from '../select-targets.js';
import type { ActionableImprovement } from '../../index.js';

describe('parseTag', () => {
  it('extracts @useWhen', () => expect(parseTag('Add @useWhen annotation')).toBe('useWhen'));
  it('extracts @avoidWhen', () => expect(parseTag('Missing @avoidWhen')).toBe('avoidWhen'));
  it('extracts @pitfalls', () => expect(parseTag('@pitfalls missing')).toBe('pitfalls'));
  it('returns undefined for unknown', () =>
    expect(parseTag('general improvement')).toBeUndefined());
});

describe('selectWorkItems', () => {
  const imp = (suggestion: string, points: number, toolName = 'tool_a'): ActionableImprovement => ({
    suggestion,
    points,
    dimension: 'D2',
    targets: [{ file: 'f.ts', name: toolName, kind: 'function' }]
  });

  it('ranks by points descending and caps at limit', () => {
    const items = [
      imp('Add @useWhen annotation', 5, 'tool_a'),
      imp('Add @pitfalls annotation', 10, 'tool_b'),
      imp('Add @avoidWhen annotation', 3, 'tool_c')
    ];
    const result = selectWorkItems(items, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.improvement.points).toBe(10);
    expect(result[0]!.tag).toBe('pitfalls');
    expect(result[1]!.improvement.points).toBe(5);
    expect(result[1]!.tag).toBe('useWhen');
  });

  it('skips improvements without parseable tags', () => {
    const items = [
      imp('General quality improvement', 5, 'tool_a'),
      imp('Add @useWhen annotation', 8, 'tool_b')
    ];
    const result = selectWorkItems(items, 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.toolName).toBe('tool_b');
  });

  it('expands multi-target improvements into one item per target', () => {
    const multi: ActionableImprovement = {
      suggestion: 'Add @useWhen annotation',
      points: 5,
      dimension: 'D2',
      targets: [
        { file: 'f.ts', name: 'tool_a', kind: 'function' },
        { file: 'f.ts', name: 'tool_b', kind: 'function' }
      ]
    };
    const result = selectWorkItems([multi], 10);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.toolName)).toEqual(['tool_a', 'tool_b']);
  });
});
