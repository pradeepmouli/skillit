import { describe, expect, it } from 'vitest';
import type { ExtractedConfigSurface, ExtractedSkill } from '@to-skills/core';
import { runCliAudit } from '../src/audit.js';

function makeCliSurface(overrides: Partial<ExtractedConfigSurface> = {}): ExtractedConfigSurface {
  return {
    name: 'build',
    description: 'Build the project',
    sourceType: 'cli',
    usage: 'tool build [options] <entry>',
    options: [
      {
        name: 'outDir',
        cliFlag: '--out-dir',
        type: 'string',
        description: 'Output directory',
        required: false
      }
    ],
    arguments: [
      { name: 'entry', description: 'Entry module path', required: true, variadic: false }
    ],
    useWhen: ['Use when producing build artifacts'],
    ...overrides
  };
}

function makeSkill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: 'tool',
    description: 'CLI tool',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    configSurfaces: [makeCliSurface()],
    ...overrides
  };
}

describe('runCliAudit', () => {
  it('emits C1 suggestions for commands without descriptions', () => {
    const issues = runCliAudit(
      makeSkill({
        configSurfaces: [makeCliSurface({ description: '' })]
      })
    );
    const issue = issues.find((candidate) => candidate.code === 'C1');
    expect(issue).toBeDefined();
    expect(issue?.suggestion).toMatch(/\.description\('/);
  });

  it('emits C4 suggestions for arguments without descriptions', () => {
    const issues = runCliAudit(
      makeSkill({
        configSurfaces: [
          makeCliSurface({
            arguments: [{ name: 'entry', description: '', required: true, variadic: false }]
          })
        ]
      })
    );
    const issue = issues.find((candidate) => candidate.code === 'C4');
    expect(issue).toBeDefined();
    expect(issue?.suggestion).toMatch(/\.argument\('/);
  });

  it('emits C3 alerts for commands without usage text', () => {
    const issues = runCliAudit(
      makeSkill({
        configSurfaces: [makeCliSurface({ usage: undefined })]
      })
    );
    expect(issues.find((candidate) => candidate.code === 'C3')).toMatchObject({
      severity: 'alert',
      location: { command: 'build' }
    });
  });

  it('emits C5 warnings for subcommands without descriptions', () => {
    const issues = runCliAudit(
      makeSkill({
        configSurfaces: [
          makeCliSurface({
            subcommands: [
              {
                name: 'deploy',
                description: '',
                sourceType: 'cli',
                options: [],
                arguments: [],
                useWhen: ['Use when deploying']
              }
            ]
          })
        ]
      })
    );
    expect(issues.find((candidate) => candidate.code === 'C5')).toMatchObject({
      severity: 'warning',
      location: { command: 'build deploy' }
    });
  });

  it('emits C6 alerts for env-backed options that do not mention the env var', () => {
    const issues = runCliAudit(
      makeSkill({
        configSurfaces: [
          makeCliSurface({
            options: [
              {
                name: 'token',
                cliFlag: '--token',
                type: 'string',
                description: 'Authentication token',
                required: false,
                envVar: 'DEMO_TOKEN'
              }
            ]
          })
        ]
      })
    );
    expect(issues.find((candidate) => candidate.code === 'C6')).toMatchObject({
      severity: 'alert',
      location: { command: 'build', option: '--token' }
    });
  });

  it('emits C7 suggestions when neither help text nor config correlation supplied an option description', () => {
    const issues = runCliAudit(
      makeSkill({
        configSurfaces: [
          makeCliSurface({
            options: [
              {
                name: 'outDir',
                cliFlag: '--out-dir',
                type: 'string',
                description: '',
                required: false
              }
            ]
          })
        ]
      })
    );
    const issue = issues.find((candidate) => candidate.code === 'C7');
    expect(issue).toBeDefined();
    expect(issue?.suggestion).toMatch(/neither.*help.*config/i);
  });

  it('emits C8 warnings when commands lack useWhen guidance', () => {
    const issues = runCliAudit(
      makeSkill({
        configSurfaces: [makeCliSurface({ useWhen: [] })]
      })
    );
    expect(issues.find((candidate) => candidate.code === 'C8')).toMatchObject({
      severity: 'warning',
      location: { command: 'build' }
    });
  });
});
