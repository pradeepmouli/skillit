import { describe, it, expect } from 'vitest';
import { estimateSkillJudgeScore } from '@to-skills/core';
import type { AuditResult } from '@to-skills/core';
import type { ExtractedSkill } from '@to-skills/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuditResult(passing: string[]): AuditResult {
  return {
    package: 'test-pkg',
    summary: { fatal: 0, error: 0, warning: 0, alert: 0 },
    issues: [],
    passing: passing.map((code) => ({ code, message: `Check ${code} passed` }))
  };
}

/** Minimal ExtractedSkill with empty TypeDoc surfaces and one CLI command */
function makeCLISkill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: 'my-cli',
    description: 'A CLI tool',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    configSurfaces: [
      {
        name: 'gen',
        description: 'Generate output',
        sourceType: 'cli',
        options: []
        // useWhen intentionally absent — this is the gap we want to detect
      }
    ],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// CLI command targets appear in @useWhen improvement
// ---------------------------------------------------------------------------

describe('CLI command surfaces as refine work items', () => {
  // W7 (@useWhen) failing → D2 below threshold → improvement is surfaced
  // W8, W9 also failing → D2, D3, D6 below threshold (baseline: D2=5, D3=2, D6=12)
  // Pass nothing so D2 (base 5) < 80% of 15 = 12 → improvement emitted
  const audit = makeAuditResult([]);
  const skill = makeCLISkill();
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('produces at least one improvement suggestion', () => {
    expect(estimate.improvements.length).toBeGreaterThan(0);
  });

  it('@useWhen improvement includes a target with name="gen" and kind="command"', () => {
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
    expect(useWhenImp).toBeDefined();
    expect(useWhenImp?.targets).toBeDefined();
    const target = useWhenImp?.targets?.find((t) => t.name === 'gen' && t.kind === 'command');
    expect(target).toBeDefined();
  });

  it('command target has file="" (resolved later by refine loop)', () => {
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
    const target = useWhenImp?.targets?.find((t) => t.name === 'gen' && t.kind === 'command');
    expect(target?.file).toBe('');
  });
});

// ---------------------------------------------------------------------------
// A CLI surface WITH useWhen already set is NOT included as a target
// ---------------------------------------------------------------------------

describe('CLI surface already annotated with useWhen is excluded', () => {
  const audit = makeAuditResult([]);
  const skill = makeCLISkill({
    configSurfaces: [
      {
        name: 'gen',
        description: 'Generate output',
        sourceType: 'cli',
        options: [],
        useWhen: ['when you need to generate files'] // already annotated
      }
    ]
  });
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('@useWhen improvement has no "gen" command target when already annotated', () => {
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
    // If the improvement exists at all, gen should NOT be in targets
    const genTarget = useWhenImp?.targets?.find((t) => t.name === 'gen' && t.kind === 'command');
    expect(genTarget).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Non-CLI surfaces (config, env) are NOT included as command targets
// ---------------------------------------------------------------------------

describe('non-CLI config surfaces are not surfaced as command targets', () => {
  const audit = makeAuditResult([]);
  const skill = makeCLISkill({
    configSurfaces: [
      {
        name: 'jest.config.ts',
        description: 'Jest config',
        sourceType: 'config', // not 'cli'
        options: []
      }
    ]
  });
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('@useWhen improvement has no config-file command target', () => {
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
    const configTarget = useWhenImp?.targets?.find(
      (t) => t.name === 'jest.config.ts' && t.kind === 'command'
    );
    expect(configTarget).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Existing class/function targets are unchanged (non-regression)
// ---------------------------------------------------------------------------

describe('non-regression: class/function targets still resolved when present', () => {
  const audit = makeAuditResult([]);
  const skill: ExtractedSkill = {
    name: 'my-lib',
    description: 'A library',
    functions: [
      {
        name: 'doThing',
        description: 'Does a thing',
        parameters: [],
        returnType: 'void',
        tags: {},
        isExported: true
      }
    ],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
    // no configSurfaces
  };
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('@useWhen improvement includes function target "doThing"', () => {
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
    expect(useWhenImp).toBeDefined();
    expect(useWhenImp?.targets).toBeDefined();
    const target = useWhenImp?.targets?.find((t) => t.name === 'doThing' && t.kind === 'function');
    expect(target).toBeDefined();
  });

  it('function target has file starting with "src/"', () => {
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
    const target = useWhenImp?.targets?.find((t) => t.name === 'doThing');
    expect(target?.file).toMatch(/^src\//);
  });
});
