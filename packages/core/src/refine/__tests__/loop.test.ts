// packages/core/src/refine/__tests__/loop.test.ts
import { describe, it, expect, vi } from 'vitest';
import { refineSkill } from '../loop.js';
import type { RefineOptions, ModelClient, RefineSource } from '../types.js';
import type { ExtractedSkill, SkillJudgeEstimate } from '../../index.js';

const baseSkill = (): ExtractedSkill =>
  ({ name: 'test', functions: [] }) as unknown as ExtractedSkill;

const passingEstimate = (grade: SkillJudgeEstimate['grade'] = 'A'): SkillJudgeEstimate => ({
  grade,
  total: 100,
  percentage: 83.3,
  improvements: [],
  dimensions: {} as SkillJudgeEstimate['dimensions']
});

const failingEstimate = (points = 5): SkillJudgeEstimate => ({
  grade: 'C',
  total: 60,
  percentage: 50.0,
  improvements: [
    {
      suggestion: 'Add @useWhen annotation',
      points,
      dimension: 'D2',
      targets: [{ file: 'f.ts', name: 'tool_a', kind: 'function' as const }]
    }
  ],
  dimensions: {} as SkillJudgeEstimate['dimensions']
});

function makeSource(skills: ExtractedSkill[]): RefineSource {
  let call = 0;
  return {
    extract: vi.fn(async () => skills[call++] ?? skills.at(-1)!),
    applyFixes: vi.fn(async () => {})
  };
}

function makeModel(): ModelClient {
  return {
    draft: vi.fn(async () => 'Use this tool when you need to list files'),
    review: vi.fn(async () => ({ verdict: 'accepted' as const, feedback: '' }))
  };
}

function makeOptions(
  scoreSkill: (s: ExtractedSkill) => SkillJudgeEstimate,
  overrides: Partial<RefineOptions> = {}
): RefineOptions & { scoreSkill: (s: ExtractedSkill) => SkillJudgeEstimate } {
  return {
    source: makeSource([baseSkill(), baseSkill()]),
    model: makeModel(),
    ...overrides,
    scoreSkill
  };
}

describe('refineSkill', () => {
  it('stops immediately when first score already passes', async () => {
    const opts = makeOptions(() => passingEstimate());
    const result = await refineSkill(opts);
    expect(result.passed).toBe(true);
    expect(result.stoppedReason).toBe('passed');
    expect(result.iterations).toHaveLength(0);
  });

  it('runs one iteration and passes on second score', async () => {
    let call = 0;
    const opts = makeOptions(() => (call++ === 0 ? failingEstimate() : passingEstimate()));
    const result = await refineSkill(opts);
    expect(result.passed).toBe(true);
    expect(result.iterations).toHaveLength(1);
    expect(result.iterations[0]!.fixes).toHaveLength(1);
  });

  it('stops at max-iterations cap', async () => {
    const opts = makeOptions(() => failingEstimate(), { maxIterations: 2 });
    const result = await refineSkill(opts);
    expect(result.passed).toBe(false);
    expect(result.stoppedReason).toBe('max-iterations');
    expect(result.iterations).toHaveLength(2);
  });

  it('stops at no-improvements when estimate has no actionable items', async () => {
    const noItems: SkillJudgeEstimate = { ...failingEstimate(), improvements: [] };
    const opts = makeOptions(() => noItems);
    const result = await refineSkill(opts);
    expect(result.stoppedReason).toBe('no-improvements');
  });

  it('stops at plateau when score does not improve', async () => {
    const opts = makeOptions(() => failingEstimate(5), { maxIterations: 3 });
    const result = await refineSkill(opts);
    expect(result.stoppedReason).toBe('plateau');
    expect(result.iterations).toHaveLength(1);
  });

  it('does not plateau while a score-neutral coverage backlog is still shrinking', async () => {
    // Wide config surface: the score is flat (routing thresholds already pass)
    // but each iteration tags more options, so the available-work pool shrinks.
    // The loop must keep documenting options instead of stopping on plateau.
    let call = 0;
    const remainingByCall = [4, 3, 2, 1, 0]; // untagged options at each score
    const score = (): SkillJudgeEstimate => {
      const remaining = remainingByCall[Math.min(call++, remainingByCall.length - 1)]!;
      const targets = Array.from({ length: remaining }, (_, i) => ({
        file: 'c.ts',
        name: `opt_${i}`,
        kind: 'function' as const
      }));
      return {
        grade: 'B',
        total: 80,
        percentage: 66.7,
        improvements:
          remaining > 0
            ? [{ suggestion: 'Add @useWhen …', points: 2, dimension: 'D2', targets }]
            : [],
        dimensions: {} as SkillJudgeEstimate['dimensions']
      };
    };
    const opts = makeOptions(score, {
      maxIterations: 10,
      source: makeSource(Array.from({ length: 12 }, () => baseSkill()))
    });
    const result = await refineSkill(opts);
    // Reaches full coverage (no items left), not an early score plateau.
    expect(result.stoppedReason).toBe('no-improvements');
    expect(result.iterations.length).toBeGreaterThan(1);
  });

  it('calls onIteration callback each iteration', async () => {
    let call = 0;
    const onIteration = vi.fn();
    const opts = makeOptions(() => (call++ === 0 ? failingEstimate() : passingEstimate()), {
      onIteration
    });
    await refineSkill(opts);
    expect(onIteration).toHaveBeenCalledOnce();
  });

  it('calls model.review and retries draft if verdict is revise', async () => {
    let call = 0;
    const model: ModelClient = {
      draft: vi.fn(async () => 'draft'),
      review: vi.fn(async () =>
        call++ === 0
          ? { verdict: 'revise' as const, feedback: 'be more specific' }
          : { verdict: 'accepted' as const, feedback: '' }
      )
    };
    let scoreCall = 0;
    const opts = makeOptions(() => (scoreCall++ === 0 ? failingEstimate() : passingEstimate()), {
      source: makeSource([baseSkill(), baseSkill()]),
      model
    });
    const result = await refineSkill(opts);
    expect(model.draft).toHaveBeenCalledTimes(2);
    expect(result.passed).toBe(true);
  });
});
