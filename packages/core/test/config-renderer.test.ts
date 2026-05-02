import { describe, it, expect } from 'vitest';
import { renderConfigSurfaceSection, renderConfigReference, renderSkill } from '@to-skills/core';
import type {
  ExtractedConfigSurface,
  ExtractedConfigOption,
  ExtractedSkill
} from '@to-skills/core';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeOption(overrides: Partial<ExtractedConfigOption> = {}): ExtractedConfigOption {
  return {
    name: 'output',
    cliFlag: '--output',
    type: 'string',
    description: 'Output directory',
    required: false,
    defaultValue: 'dist',
    ...overrides
  };
}

function makeCliSurface(overrides: Partial<ExtractedConfigSurface> = {}): ExtractedConfigSurface {
  return {
    name: 'build',
    description: 'Compile the project',
    sourceType: 'cli',
    usage: 'pnpm build --watch',
    options: [makeOption()],
    arguments: [
      {
        name: '<entrypoint>',
        description: 'The entry file to compile',
        required: true,
        variadic: false
      }
    ],
    useWhen: ['You need to produce production artifacts'],
    avoidWhen: ['Running in watch mode with --watch already active'],
    pitfalls: ['Always clean dist/ before building'],
    ...overrides
  };
}

function makeConfigSurface(
  overrides: Partial<ExtractedConfigSurface> = {}
): ExtractedConfigSurface {
  return {
    name: 'BuildConfig',
    description: 'Configures the build pipeline',
    sourceType: 'config',
    options: [
      makeOption({ name: 'outDir', cliFlag: undefined, configKey: 'outDir', type: 'string' }),
      makeOption({
        name: 'minify',
        cliFlag: undefined,
        configKey: 'minify',
        type: 'boolean',
        defaultValue: 'false',
        required: true
      })
    ],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// renderConfigSurfaceSection — inline SKILL.md sections
// ---------------------------------------------------------------------------

describe('renderConfigSurfaceSection — CLI surfaces', () => {
  it('renders ## Commands heading for cli surfaces', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('## Commands');
  });

  it('renders command name as a sub-heading', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('### build');
  });

  it('renders usage block', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('pnpm build --watch');
  });

  it('renders options table with correct columns', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('| Flag |');
    expect(result).toContain('| Type |');
    expect(result).toContain('| Required |');
    expect(result).toContain('| Default |');
    expect(result).toContain('| Description |');
  });

  it('renders option flag and details in table row', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('--output');
    expect(result).toContain('string');
    expect(result).toContain('dist');
    expect(result).toContain('Output directory');
  });

  it('renders envVar metadata in the inline options table', () => {
    const result = renderConfigSurfaceSection([
      makeCliSurface({ options: [makeOption({ envVar: 'BUILD_OUTPUT_DIR' })] })
    ]);
    expect(result).toContain('BUILD_OUTPUT_DIR');
  });

  it('renders positional arguments', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('<entrypoint>');
    expect(result).toContain('The entry file to compile');
  });

  it('does not render a dangling dash for arguments without descriptions', () => {
    const result = renderConfigSurfaceSection([
      makeCliSurface({
        arguments: [{ name: 'entrypoint', description: '', required: true, variadic: false }]
      })
    ]);
    expect(result).toContain('- `entrypoint` *(required)*');
    expect(result).not.toContain('- `entrypoint` *(required)* —');
  });

  it('renders useWhen section', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('You need to produce production artifacts');
  });

  it('renders avoidWhen section', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('Running in watch mode with --watch already active');
  });

  it('renders pitfalls section', () => {
    const result = renderConfigSurfaceSection([makeCliSurface()]);
    expect(result).toContain('Always clean dist/ before building');
  });

  it('renders multiple cli surfaces', () => {
    const surfaces = [
      makeCliSurface({ name: 'build' }),
      makeCliSurface({ name: 'test', description: 'Run tests', usage: 'pnpm test' })
    ];
    const result = renderConfigSurfaceSection(surfaces);
    expect(result).toContain('### build');
    expect(result).toContain('### test');
  });
});

describe('renderConfigSurfaceSection — config surfaces', () => {
  it('renders ## Configuration heading for config surfaces', () => {
    const result = renderConfigSurfaceSection([makeConfigSurface()]);
    expect(result).toContain('## Configuration');
  });

  it('renders config name and description in summary', () => {
    const result = renderConfigSurfaceSection([makeConfigSurface()]);
    expect(result).toContain('**BuildConfig**');
    expect(result).toContain('Configures the build pipeline');
  });

  it('points to references/config.md for details', () => {
    const result = renderConfigSurfaceSection([makeConfigSurface()]);
    expect(result).toContain('references/config.md');
  });

  it('shows option count', () => {
    const result = renderConfigSurfaceSection([makeConfigSurface()]);
    expect(result).toContain('options');
  });
});

describe('renderConfigSurfaceSection — mixed surfaces', () => {
  it('renders both Commands and Configuration sections when both types present', () => {
    const surfaces = [makeCliSurface(), makeConfigSurface()];
    const result = renderConfigSurfaceSection(surfaces);
    expect(result).toContain('## Commands');
    expect(result).toContain('## Configuration');
  });
});

describe('renderConfigSurfaceSection — empty/undefined', () => {
  it('returns empty string for empty array', () => {
    expect(renderConfigSurfaceSection([])).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(renderConfigSurfaceSection(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// renderConfigReference — detailed reference files
// ---------------------------------------------------------------------------

describe('renderConfigReference — CLI surfaces', () => {
  it('renders # Commands top-level heading', () => {
    const result = renderConfigReference([makeCliSurface()]);
    expect(result).toContain('# Commands');
  });

  it('renders ## commandName sub-heading', () => {
    const result = renderConfigReference([makeCliSurface()]);
    expect(result).toContain('## build');
  });

  it('renders #### --flag per-option heading', () => {
    const result = renderConfigReference([makeCliSurface()]);
    expect(result).toContain('#### --output');
  });

  it('renders option description in detail', () => {
    const result = renderConfigReference([makeCliSurface()]);
    expect(result).toContain('Output directory');
  });

  it('renders default value in detail', () => {
    const result = renderConfigReference([makeCliSurface()]);
    expect(result).toContain('dist');
  });

  it('renders useWhen from option', () => {
    const surface = makeCliSurface({
      options: [
        makeOption({
          useWhen: ['Targeting ESM output'],
          pitfalls: ['Cannot combine with --cjs flag']
        })
      ]
    });
    const result = renderConfigReference([surface]);
    expect(result).toContain('Targeting ESM output');
    expect(result).toContain('Cannot combine with --cjs flag');
  });

  it('renders remarks from option', () => {
    const surface = makeCliSurface({
      options: [makeOption({ remarks: 'Takes precedence over config file setting' })]
    });
    const result = renderConfigReference([surface]);
    expect(result).toContain('Takes precedence over config file setting');
  });

  it('renders envVar metadata in option detail views', () => {
    const surface = makeCliSurface({
      options: [makeOption({ envVar: 'BUILD_OUTPUT_DIR' })]
    });
    const result = renderConfigReference([surface]);
    expect(result).toContain('BUILD_OUTPUT_DIR');
  });
});

describe('renderConfigReference — config surfaces', () => {
  it('renders # Configuration top-level heading', () => {
    const result = renderConfigReference([makeConfigSurface()]);
    expect(result).toContain('# Configuration');
  });

  it('renders ## InterfaceName sub-heading', () => {
    const result = renderConfigReference([makeConfigSurface()]);
    expect(result).toContain('## BuildConfig');
  });

  it('renders #### propertyName per-option heading', () => {
    const result = renderConfigReference([makeConfigSurface()]);
    expect(result).toContain('#### outDir');
    expect(result).toContain('#### minify');
  });
});

describe('renderConfigReference — mixed surfaces', () => {
  it('renders both Commands and Configuration sections', () => {
    const surfaces = [makeCliSurface(), makeConfigSurface()];
    const result = renderConfigReference(surfaces);
    expect(result).toContain('# Commands');
    expect(result).toContain('# Configuration');
  });
});

describe('renderConfigReference — empty/undefined', () => {
  it('returns empty string for empty array', () => {
    expect(renderConfigReference([])).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(renderConfigReference(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// renderSkill integration — reference files wired correctly
// ---------------------------------------------------------------------------

const baseSkill: ExtractedSkill = {
  name: 'my-tool',
  description: 'A CLI tool',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

describe('renderSkill — configSurfaces wired into references', () => {
  it('generates references/commands.md for CLI surfaces', () => {
    const { references } = renderSkill({
      ...baseSkill,
      configSurfaces: [makeCliSurface()]
    });
    const commandsRef = references.find((r) => r.filename.endsWith('references/commands.md'));
    expect(commandsRef).toBeDefined();
    expect(commandsRef!.content).toContain('# Commands');
    expect(commandsRef!.content).toContain('## build');
  });

  it('generates references/config.md for config surfaces', () => {
    const { references } = renderSkill({
      ...baseSkill,
      configSurfaces: [makeConfigSurface()]
    });
    const configRef = references.find((r) => r.filename.endsWith('references/config.md'));
    expect(configRef).toBeDefined();
    expect(configRef!.content).toContain('# Configuration');
    expect(configRef!.content).toContain('## BuildConfig');
  });

  it('generates both reference files when both surface types are present', () => {
    const { references } = renderSkill({
      ...baseSkill,
      configSurfaces: [makeCliSurface(), makeConfigSurface()]
    });
    const filenames = references.map((r) => r.filename);
    expect(filenames.some((f) => f.endsWith('references/commands.md'))).toBe(true);
    expect(filenames.some((f) => f.endsWith('references/config.md'))).toBe(true);
  });

  it('does not generate config reference files when configSurfaces is empty', () => {
    const { references } = renderSkill({ ...baseSkill, configSurfaces: [] });
    const filenames = references.map((r) => r.filename);
    expect(filenames.some((f) => f.includes('commands.md'))).toBe(false);
    expect(filenames.some((f) => f.includes('config.md'))).toBe(false);
  });

  it('includes config section in SKILL.md when configSurfaces provided', () => {
    const { skill } = renderSkill({
      ...baseSkill,
      configSurfaces: [makeCliSurface()]
    });
    expect(skill.content).toContain('## Commands');
    expect(skill.content).toContain('### build');
  });
});
