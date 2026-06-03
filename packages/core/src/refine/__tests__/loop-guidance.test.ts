// packages/core/src/refine/__tests__/loop-guidance.test.ts
import { describe, it, expect } from 'vitest';
import { refineSkill } from '../loop.js';
import type { ModelClient, RefineSource, DraftRequest, ReviewRequest } from '../types.js';
import type { ExtractedSkill, SkillJudgeEstimate } from '../../index.js';

// ─── Minimal fixtures ────────────────────────────────────────────────────────

const baseSkill = (): ExtractedSkill =>
  ({ name: 'test', functions: [] }) as unknown as ExtractedSkill;

const passingEstimate = (): SkillJudgeEstimate => ({
  grade: 'A',
  total: 100,
  percentage: 83.3,
  improvements: [],
  dimensions: {} as SkillJudgeEstimate['dimensions']
});

const failingEstimate = (): SkillJudgeEstimate => ({
  grade: 'C',
  total: 60,
  percentage: 50.0,
  improvements: [
    {
      // @useWhen tag makes selectWorkItems produce one work item for tool_a
      suggestion: 'Add @useWhen annotation',
      points: 5,
      dimension: 'D2',
      targets: [{ file: 'f.ts', name: 'tool_a', kind: 'function' as const }]
    }
  ],
  dimensions: {} as SkillJudgeEstimate['dimensions']
});

// ─── Stubs ───────────────────────────────────────────────────────────────────

/** A source that exposes guidance() returning RUBRIC-XYZ */
function makeSourceWithGuidance(): RefineSource {
  // We capture requests via a recording model; the source itself just provides guidance.
  return {
    extract: async () => baseSkill(),
    auditContext: () => ({}) as ReturnType<RefineSource['auditContext']>,
    applyFixes: async () => {},
    guidance: async () => 'RUBRIC-XYZ'
  };
}

/** A source that does NOT have a guidance method */
function makeSourceWithoutGuidance(): RefineSource {
  return {
    extract: async () => baseSkill(),
    auditContext: () => ({}) as ReturnType<RefineSource['auditContext']>,
    applyFixes: async () => {}
  };
}

/** Records every request it receives */
function makeRecordingModel(): ModelClient & {
  draftRequests: DraftRequest[];
  reviewRequests: ReviewRequest[];
} {
  const draftRequests: DraftRequest[] = [];
  const reviewRequests: ReviewRequest[] = [];
  return {
    draftRequests,
    reviewRequests,
    draft: async (req: DraftRequest) => {
      draftRequests.push(req);
      return 'Use this tool when you need to list files';
    },
    review: async (req: ReviewRequest) => {
      reviewRequests.push(req);
      return { verdict: 'accepted' as const, feedback: '' };
    }
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('refineSkill — guidance threading', () => {
  it('threads guidance from source.guidance() into every draft and review request', async () => {
    const source = makeSourceWithGuidance();
    const model = makeRecordingModel();

    // First score → failing (one work item); second score → passing (loop terminates)
    let scoreCall = 0;
    const scoreSkill = () => (scoreCall++ === 0 ? failingEstimate() : passingEstimate());

    await refineSkill({ source, model, scoreSkill });

    // Must have driven at least one draft and one review
    expect(model.draftRequests.length).toBeGreaterThan(0);
    expect(model.reviewRequests.length).toBeGreaterThan(0);

    for (const req of model.draftRequests) {
      expect(req.guidance).toBe('RUBRIC-XYZ');
    }
    for (const req of model.reviewRequests) {
      expect(req.guidance).toBe('RUBRIC-XYZ');
    }
  });

  it('leaves guidance undefined when source has no guidance() method — no throw', async () => {
    const source = makeSourceWithoutGuidance();
    const model = makeRecordingModel();

    let scoreCall = 0;
    const scoreSkill = () => (scoreCall++ === 0 ? failingEstimate() : passingEstimate());

    await expect(refineSkill({ source, model, scoreSkill })).resolves.not.toThrow();

    expect(model.draftRequests.length).toBeGreaterThan(0);
    expect(model.reviewRequests.length).toBeGreaterThan(0);

    for (const req of model.draftRequests) {
      expect(req.guidance).toBeUndefined();
    }
    for (const req of model.reviewRequests) {
      expect(req.guidance).toBeUndefined();
    }
  });
});
