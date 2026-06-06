import { describe, it, expect } from 'vitest';
import { estimateSkillJudgeScore } from '@skillit/core';
import type { AuditResult } from '@skillit/core';
import type { ExtractedSkill, ExtractedConfigOption } from '@skillit/core';

function makeAuditResult(passing: string[]): AuditResult {
  return {
    package: 'test-pkg',
    summary: { fatal: 0, error: 0, warning: 0, alert: 0 },
    issues: [],
    passing: passing.map((code) => ({ code, message: `Check ${code} passed` }))
  };
}

function option(
  overrides: Partial<ExtractedConfigOption> & { name: string }
): ExtractedConfigOption {
  return {
    type: 'string',
    description: '',
    required: false,
    configKey: overrides.name,
    ...overrides
  };
}

/** Minimal ExtractedSkill with one `config` surface and the given options. */
function makeConfigSkill(options: ExtractedConfigOption[]): ExtractedSkill {
  return {
    name: 'my-config',
    description: 'A config surface',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    configSurfaces: [
      {
        name: 'ZodFormsConfig',
        description: 'Config',
        sourceType: 'config',
        options
      }
    ]
  };
}

describe('config options as refine work items (per-option targeting)', () => {
  const audit = makeAuditResult([]);
  const skill = makeConfigSkill([option({ name: 'outDir' }), option({ name: 'mode' })]);
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('@useWhen improvement includes a target per un-annotated option with kind="config-option"', () => {
    const useWhenImp = estimate.improvements.find(
      (imp) => imp.suggestion.includes('@useWhen') && imp.suggestion.includes('config option')
    );
    expect(useWhenImp).toBeDefined();
    const outDir = useWhenImp?.targets?.find(
      (t) => t.name === 'outDir' && t.kind === 'config-option'
    );
    expect(outDir).toBeDefined();
    // file is resolved later by the ConfigRefineSource (it knows the type's file)
    expect(outDir?.file).toBe('');
  });
});

describe('config option already annotated is excluded from targets', () => {
  const audit = makeAuditResult([]);
  const skill = makeConfigSkill([
    option({ name: 'outDir', useWhen: ['emitting build artifacts'] }),
    option({ name: 'mode' })
  ]);
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('annotated option is not a target; unannotated one still is', () => {
    const useWhenImp = estimate.improvements.find(
      (imp) => imp.suggestion.includes('@useWhen') && imp.suggestion.includes('config option')
    );
    expect(
      useWhenImp?.targets?.find((t) => t.name === 'outDir' && t.kind === 'config-option')
    ).toBeUndefined();
    expect(
      useWhenImp?.targets?.find((t) => t.name === 'mode' && t.kind === 'config-option')
    ).toBeDefined();
  });
});

describe('nested option uses its dot-path configKey as the target name', () => {
  const audit = makeAuditResult([]);
  const skill = makeConfigSkill([
    option({ name: 'components' }),
    option({ name: 'prefix', configKey: 'components.prefix' })
  ]);
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('@useWhen target name is the dot path "components.prefix"', () => {
    const useWhenImp = estimate.improvements.find(
      (imp) => imp.suggestion.includes('@useWhen') && imp.suggestion.includes('config option')
    );
    const nested = useWhenImp?.targets?.find((t) => t.name === 'components.prefix');
    expect(nested).toBeDefined();
    expect(nested?.kind).toBe('config-option');
  });
});

describe('config option targets are not truncated at the class cap (5)', () => {
  const audit = makeAuditResult([]);
  // 7 options — more than the 5-class cap that previously dropped the tail.
  const names = ['components', 'defaults', 'types', 'include', 'exclude', 'fields', 'schemas'];
  const skill = makeConfigSkill(names.map((name) => option({ name })));
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('emits a @useWhen target for every one of the 7 options', () => {
    const useWhenImp = estimate.improvements.find(
      (imp) => imp.suggestion.includes('@useWhen') && imp.suggestion.includes('config option')
    );
    const targeted = new Set(
      (useWhenImp?.targets ?? []).filter((t) => t.kind === 'config-option').map((t) => t.name)
    );
    for (const name of names) expect(targeted.has(name)).toBe(true);
  });
});

describe('config example target (E4) is threshold-independent', () => {
  // E4 absent from `passing` => no example anywhere. The config-example
  // improvement should appear with a config-example target regardless of
  // whether D2/D8 are above their 80% thresholds.
  const audit = makeAuditResult([]);
  const skill = makeConfigSkill([option({ name: 'outDir' })]);
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('surfaces an @example config-file improvement targeting the config type', () => {
    const exampleImp = estimate.improvements.find((imp) =>
      imp.suggestion.includes('@example config file')
    );
    expect(exampleImp).toBeDefined();
    const target = exampleImp?.targets?.find(
      (t) => t.name === 'ZodFormsConfig' && t.kind === 'config-example'
    );
    expect(target).toBeDefined();
  });

  it('omits the example improvement once E4 passes', () => {
    const passing = estimateSkillJudgeScore(makeAuditResult(['E4']), skill);
    expect(
      passing.improvements.find((imp) => imp.suggestion.includes('@example config file'))
    ).toBeUndefined();
  });
});

describe('config surfaces do not produce command-kind targets', () => {
  const audit = makeAuditResult([]);
  const skill = makeConfigSkill([option({ name: 'outDir' })]);
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('no target has kind="command"', () => {
    const useWhenImp = estimate.improvements.find(
      (imp) => imp.suggestion.includes('@useWhen') && imp.suggestion.includes('config option')
    );
    expect(useWhenImp?.targets?.some((t) => t.kind === 'command')).toBe(false);
  });
});
