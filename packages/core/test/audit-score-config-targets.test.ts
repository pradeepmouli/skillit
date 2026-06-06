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
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
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
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
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
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
    const nested = useWhenImp?.targets?.find((t) => t.name === 'components.prefix');
    expect(nested).toBeDefined();
    expect(nested?.kind).toBe('config-option');
  });
});

describe('config surfaces do not produce command-kind targets', () => {
  const audit = makeAuditResult([]);
  const skill = makeConfigSkill([option({ name: 'outDir' })]);
  const estimate = estimateSkillJudgeScore(audit, skill);

  it('no target has kind="command"', () => {
    const useWhenImp = estimate.improvements.find((imp) => imp.suggestion.includes('@useWhen'));
    expect(useWhenImp?.targets?.some((t) => t.kind === 'command')).toBe(false);
  });
});
