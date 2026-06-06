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

  it('round-robins across tags so a target-heavy tag cannot starve lower-points tags', () => {
    // A wide config surface: @pitfalls (points 3) has many untagged options,
    // @useWhen / @avoidWhen (points 2) one each. Pure points-descending would
    // fill the whole limit with pitfalls and never reach useWhen/avoidWhen — the
    // refine loop would then plateau with those dimensions still failing.
    const targets = (...names: string[]) =>
      names.map((name) => ({ file: 'f.ts', name, kind: 'function' as const }));
    const items: ActionableImprovement[] = [
      {
        suggestion: 'Add @pitfalls …',
        points: 3,
        dimension: 'D3',
        targets: targets('a', 'b', 'c', 'd', 'e')
      },
      {
        suggestion: 'Add @useWhen …',
        points: 2,
        dimension: 'D2',
        targets: targets('a', 'b', 'c', 'd', 'e')
      },
      {
        suggestion: 'Add @avoidWhen …',
        points: 2,
        dimension: 'D2',
        targets: targets('a', 'b', 'c', 'd', 'e')
      }
    ];
    const result = selectWorkItems(items, 5);
    const tags = result.map((r) => r.tag);
    // Every tag is represented within the bounded slice (not all pitfalls).
    expect(new Set(tags)).toEqual(new Set(['pitfalls', 'useWhen', 'avoidWhen']));
    // Higher-points tag still leads each round.
    expect(tags[0]).toBe('pitfalls');
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
