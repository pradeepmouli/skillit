import { readFileSync } from 'node:fs';
import type { Application } from 'typedoc';
import { Converter, ParameterType } from 'typedoc';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const renderSkillsMock = vi.fn(() => [
  {
    skill: { filename: 'demo/SKILL.md', content: '# demo' },
    references: []
  }
]);
const writeSkillsMock = vi.fn();
const extractSkillsMock = vi.fn(() => [
  {
    name: 'demo',
    description: 'Demo package',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  }
]);

vi.mock('@to-skills/core', async () => {
  const actual = await vi.importActual<typeof import('@to-skills/core')>('@to-skills/core');
  return {
    ...actual,
    renderSkills: renderSkillsMock,
    writeSkills: writeSkillsMock
  };
});

vi.mock('../src/extractor.js', () => ({
  extractSkills: extractSkillsMock
}));

const { load } = await import('../src/plugin.js');

function createAppHarness() {
  const declarations: Array<{ name: string; type: ParameterType; defaultValue: unknown }> = [];
  const optionValues = new Map<string, unknown>([
    ['blockTags', []],
    ['modifierTags', []]
  ]);
  const converterHandlers = new Map<string, (context: { project: { name: string } }) => void>();

  const app = {
    options: {
      addDeclaration(declaration: { name: string; type: ParameterType; defaultValue: unknown }) {
        declarations.push(declaration);
        optionValues.set(declaration.name, declaration.defaultValue);
      },
      getValue(name: string) {
        return optionValues.get(name);
      },
      setValue(name: string, value: unknown) {
        optionValues.set(name, value);
      }
    },
    converter: {
      on(event: string, handler: (context: { project: { name: string } }) => void) {
        converterHandlers.set(event, handler);
      }
    },
    renderer: {
      postRenderAsyncJobs: []
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  } as unknown as Application;

  return { app, declarations, optionValues, converterHandlers };
}

describe('typedoc plugin install targets', () => {
  beforeEach(() => {
    renderSkillsMock.mockClear();
    writeSkillsMock.mockClear();
    extractSkillsMock.mockClear();
  });

  it('registers the skillsInstallTargets option', () => {
    const harness = createAppHarness();
    load(harness.app);

    expect(harness.declarations).toContainEqual(
      expect.objectContaining({
        name: 'skillsInstallTargets',
        type: ParameterType.Array,
        defaultValue: []
      })
    );
  });

  it('passes install targets to writeSkills and installs bundled guidance only into install targets', () => {
    const harness = createAppHarness();
    load(harness.app);
    harness.optionValues.set('skillsInstallTargets', ['.claude/skills']);

    const resolveEnd = harness.converterHandlers.get(Converter.EVENT_RESOLVE_END);
    expect(resolveEnd).toBeDefined();
    resolveEnd!({ project: { name: 'demo-project' } });

    expect(writeSkillsMock).toHaveBeenCalledTimes(2);
    const [rendered, options] = writeSkillsMock.mock.calls[0] as [
      Array<{ skill: { filename: string } }>,
      { outDir: string; installTargets?: string[]; includeOutDir?: boolean }
    ];
    expect(options.installTargets).toEqual(['.claude/skills']);
    expect(rendered.some((entry) => entry.skill.filename === 'to-skills-docs/SKILL.md')).toBe(
      false
    );

    const [bundledRendered, bundledOptions] = writeSkillsMock.mock.calls[1] as [
      Array<{ skill: { filename: string; content: string } }>,
      { outDir: string; installTargets?: string[]; includeOutDir?: boolean }
    ];
    expect(bundledOptions.installTargets).toEqual(['.claude/skills']);
    expect(bundledOptions.includeOutDir).toBe(false);
    expect(bundledRendered).toHaveLength(1);
    expect(bundledRendered[0]!.skill.filename).toBe('to-skills-docs/SKILL.md');
    expect(bundledRendered[0]!.skill.content).toContain('managed: bundled-guidance');
    expect(bundledRendered[0]!.skill.content).toContain('version:');
  });

  it('keeps legacy behavior when install targets are omitted or empty', () => {
    const harness = createAppHarness();
    load(harness.app);
    harness.optionValues.set('skillsInstallTargets', []);

    const resolveEnd = harness.converterHandlers.get(Converter.EVENT_RESOLVE_END);
    expect(resolveEnd).toBeDefined();
    resolveEnd!({ project: { name: 'demo-project' } });

    expect(writeSkillsMock).toHaveBeenCalledTimes(1);
    const [rendered] = writeSkillsMock.mock.calls[0] as [Array<{ skill: { filename: string } }>];
    expect(rendered.some((entry) => entry.skill.filename === 'to-skills-docs/SKILL.md')).toBe(
      false
    );
  });

  it('publishes bundled guidance from both typedoc packages', () => {
    const typedocPkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as {
      files?: string[];
    };
    const pluginPkg = JSON.parse(
      readFileSync(new URL('../../typedoc-plugin/package.json', import.meta.url), 'utf8')
    ) as { files?: string[] };

    expect(typedocPkg.files).toContain('skills');
    expect(pluginPkg.files).toContain('skills');
  });
});
