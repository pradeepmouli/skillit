import { describe, expect, it, vi } from 'vitest';
import { canonicalize, renderSkill, renderSkills } from '@to-skills/core';
import type {
  AdapterRenderContext,
  ExtractedSkill,
  InvocationAdapter,
  RenderedSkill
} from '@to-skills/core';

const minimalSkill: ExtractedSkill = {
  name: 'my-lib',
  description: 'A test library',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

describe('renderSkill — invocation hook', () => {
  it('returns same shape as today when invocation is absent (synchronous)', () => {
    const out = renderSkill(minimalSkill);
    expect(out).toHaveProperty('skill.filename', 'my-lib/SKILL.md');
    expect(out.skill.content).toContain('name: my-lib');
    expect(out.skill.content).toContain('description: A test library');
  });

  it('canonicalizes default-path output — canonicalize(output) equals output', () => {
    const out = renderSkill(minimalSkill);
    const recanonicalized = canonicalize(out);
    expect(recanonicalized.skill.content).toBe(out.skill.content);
    expect(recanonicalized.references.length).toBe(out.references.length);
    for (let i = 0; i < out.references.length; i++) {
      expect(recanonicalized.references[i]!.content).toBe(out.references[i]!.content);
    }
  });

  it('delegates to invocation.render when present and passes a correct AdapterRenderContext', async () => {
    const fakeRendered: RenderedSkill = {
      skill: { filename: 'my-lib/SKILL.md', content: '---\nz: 1\na: 2\n---\n\n\nbody   \n' },
      references: []
    };
    const render = vi.fn(
      async (_skill: ExtractedSkill, _ctx: AdapterRenderContext) => fakeRendered
    );
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: '@to-skills/target-mcp-protocol', version: '0.0.0-test' },
      render
    };

    const out = await renderSkill(minimalSkill, {
      invocation: adapter,
      maxTokens: 1234,
      // The renderer now requires exactly one of the three launch-info options
      // to determine the DU arm — pick stdio for this baseline test.
      invocationLaunchCommand: { command: 'node', args: ['./server.js'] }
    });

    expect(render).toHaveBeenCalledTimes(1);
    const [passedSkill, passedCtx] = render.mock.calls[0]!;
    expect(passedSkill).toBe(minimalSkill);
    expect(passedCtx.skillName).toBe('my-lib');
    expect(passedCtx.maxTokens).toBe(1234);
    expect(passedCtx.canonicalize).toBe(true);
    expect(passedCtx.mode).toBe('stdio');

    // Result is canonicalized: keys sorted, whitespace normalized.
    expect(out.skill.content.startsWith('---\na: 2\nz: 1\n---\n')).toBe(true);
    // Idempotent under a second pass.
    expect(canonicalize(out).skill.content).toBe(out.skill.content);
  });

  it('honors namePrefix when building AdapterRenderContext.skillName', async () => {
    const render = vi.fn(
      async (_s: ExtractedSkill, _c: AdapterRenderContext): Promise<RenderedSkill> => ({
        skill: { filename: 's/SKILL.md', content: '---\nname: s\n---\n' },
        references: []
      })
    );
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: 'x', version: '0' },
      render
    };
    await renderSkill(minimalSkill, {
      invocation: adapter,
      namePrefix: 'custom-name',
      invocationLaunchCommand: { command: 'node', args: ['./server.js'] }
    });
    expect(render.mock.calls[0]![1].skillName).toBe('custom-name');
  });

  it('merges additionalFrontmatter into SKILL.md (default path)', () => {
    const out = renderSkill(minimalSkill, {
      additionalFrontmatter: { mcp: { foo: 'bar' } }
    });
    // Canonicalization sorts keys alphabetically — verify both content and structure.
    expect(out.skill.content).toMatch(/mcp:\n\s+foo: bar/);
  });

  it('does not overwrite existing keys via additionalFrontmatter', () => {
    const out = renderSkill(minimalSkill, {
      additionalFrontmatter: { name: 'override-attempt' }
    });
    // Original `name: my-lib` wins; the override must NOT appear.
    expect(out.skill.content).toContain('name: my-lib');
    expect(out.skill.content).not.toContain('override-attempt');
  });

  it('threads invocationPackageName into ctx as the bundle arm', async () => {
    const render = vi.fn(
      async (_s: ExtractedSkill, _c: AdapterRenderContext): Promise<RenderedSkill> => ({
        skill: { filename: 's/SKILL.md', content: '---\nname: s\n---\n' },
        references: []
      })
    );
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: 'x', version: '0' },
      render
    };
    await renderSkill(minimalSkill, {
      invocation: adapter,
      invocationPackageName: '@org/my-server'
    });
    const ctx = render.mock.calls[0]![1];
    expect(ctx.mode).toBe('bundle');
    if (ctx.mode === 'bundle') {
      expect(ctx.packageName).toBe('@org/my-server');
    }
  });

  it('threads invocationLaunchCommand into ctx as the stdio arm', async () => {
    const render = vi.fn(
      async (_s: ExtractedSkill, _c: AdapterRenderContext): Promise<RenderedSkill> => ({
        skill: { filename: 's/SKILL.md', content: '---\nname: s\n---\n' },
        references: []
      })
    );
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: 'x', version: '0' },
      render
    };
    await renderSkill(minimalSkill, {
      invocation: adapter,
      invocationLaunchCommand: { command: 'npx', args: ['-y', '@org/my-server'] }
    });
    const ctx = render.mock.calls[0]![1];
    expect(ctx.mode).toBe('stdio');
    if (ctx.mode === 'stdio') {
      expect(ctx.launchCommand).toEqual({ command: 'npx', args: ['-y', '@org/my-server'] });
    }
  });

  it('throws when more than one of invocationPackageName/HttpEndpoint/LaunchCommand is set (FR-H002)', () => {
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: 'x', version: '0' },
      render: async () => ({ skill: { filename: 's/SKILL.md', content: '' }, references: [] })
    };
    // The renderer throws synchronously before reaching its Promise return, so
    // assert via a thunk rather than a `rejects.toThrow` matcher.
    expect(() =>
      renderSkill(minimalSkill, {
        invocation: adapter,
        invocationPackageName: '@org/my-server',
        invocationLaunchCommand: { command: 'npx', args: ['-y', '@org/my-server'] }
      })
    ).toThrow(/more than one of/);
  });

  it('throws when none of the three launch-info options is set (FR-H002)', () => {
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: 'x', version: '0' },
      render: async () => ({ skill: { filename: 's/SKILL.md', content: '' }, references: [] })
    };
    expect(() => renderSkill(minimalSkill, { invocation: adapter })).toThrow(/missing launch info/);
  });

  it('threads invocationHttpEndpoint into ctx', async () => {
    const render = vi.fn(
      async (_s: ExtractedSkill, _c: AdapterRenderContext): Promise<RenderedSkill> => ({
        skill: { filename: 's/SKILL.md', content: '---\nname: s\n---\n' },
        references: []
      })
    );
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: 'x', version: '0' },
      render
    };
    await renderSkill(minimalSkill, {
      invocation: adapter,
      invocationHttpEndpoint: {
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer' }
      }
    });
    const ctx = render.mock.calls[0]![1];
    expect(ctx.mode).toBe('http');
    if (ctx.mode === 'http') {
      expect(ctx.httpEndpoint).toEqual({
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer' }
      });
    }
  });

  it('threads invocationBinName into ctx (multi-bin bundle path)', async () => {
    const render = vi.fn(
      async (_s: ExtractedSkill, _c: AdapterRenderContext): Promise<RenderedSkill> => ({
        skill: { filename: 's/SKILL.md', content: '---\nname: s\n---\n' },
        references: []
      })
    );
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: 'x', version: '0' },
      render
    };
    await renderSkill(minimalSkill, {
      invocation: adapter,
      invocationPackageName: '@org/multi',
      invocationBinName: 'tool-b'
    });
    const ctx = render.mock.calls[0]![1];
    expect(ctx.mode).toBe('bundle');
    if (ctx.mode === 'bundle') {
      expect(ctx.binName).toBe('tool-b');
    }
  });

  it('bodyPrefix injects content between frontmatter and the existing body (default path)', () => {
    const out = renderSkill(minimalSkill, { bodyPrefix: '## Setup\n\n```sh\nnpm i x\n```' });
    // Frontmatter terminator is followed by the prefix, before the existing `# my-lib` heading.
    const idx = out.skill.content.indexOf('## Setup');
    const headingIdx = out.skill.content.indexOf('# my-lib');
    expect(idx).toBeGreaterThan(0);
    expect(headingIdx).toBeGreaterThan(idx);
  });

  it('skipDefaultFunctionsRef suppresses references/functions.md on the default path', () => {
    const skillWithFn: ExtractedSkill = {
      ...minimalSkill,
      functions: [
        {
          name: 'doThing',
          description: 'Does the thing.',
          signature: 'doThing(input: string): void',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    };

    const baseline = renderSkill(skillWithFn);
    const baseHasFunctions = baseline.references.some((r) => r.filename.endsWith('functions.md'));
    expect(baseHasFunctions).toBe(true);

    const skipped = renderSkill(skillWithFn, { skipDefaultFunctionsRef: true });
    const skippedHasFunctions = skipped.references.some((r) => r.filename.endsWith('functions.md'));
    expect(skippedHasFunctions).toBe(false);
  });

  it('uses file loading triggers when references stay in a single file', () => {
    const skillWithFn: ExtractedSkill = {
      ...minimalSkill,
      functions: [
        {
          name: 'greet',
          description: 'Greets a user',
          signature: 'greet(name: string): string',
          parameters: [
            { name: 'name', type: 'string', description: 'Who to greet', optional: false }
          ],
          returnType: 'string',
          examples: [],
          tags: {}
        }
      ]
    };

    const out = renderSkill(skillWithFn, { maxTokens: 8_000 });
    expect(out.references.some((r) => r.filename.endsWith('references/functions.md'))).toBe(true);
    expect(out.skill.content).toContain('read `references/functions.md`');
  });

  it('uses directory loading triggers when grouped references split into a directory', () => {
    const splitSkill: ExtractedSkill = {
      ...minimalSkill,
      functions: [
        {
          name: 'coreFunction',
          description: 'A'.repeat(400),
          signature: 'coreFunction(value: string): string',
          parameters: [{ name: 'value', type: 'string', description: 'Input', optional: false }],
          returnType: 'string',
          examples: [],
          tags: {},
          category: 'Core'
        },
        {
          name: 'utilFunction',
          description: 'B'.repeat(400),
          signature: 'utilFunction(value: string): string',
          parameters: [{ name: 'value', type: 'string', description: 'Input', optional: false }],
          returnType: 'string',
          examples: [],
          tags: {},
          category: 'Utils'
        }
      ]
    };

    const out = renderSkill(splitSkill, { maxTokens: 80 });
    expect(out.references.some((r) => r.filename.endsWith('references/functions/core.md'))).toBe(
      true
    );
    expect(out.references.some((r) => r.filename.endsWith('references/functions/utils.md'))).toBe(
      true
    );
    expect(out.skill.content).toContain('browse `references/functions/`');
    expect(out.skill.content).not.toContain('read `references/functions.md`');
  });

  it('canonicalize: false returns un-canonicalized output (default path)', () => {
    // additionalFrontmatter with insertion-order keys lets us observe whether
    // canonicalize ran (canonicalize sorts keys alphabetically).
    const withCanon = renderSkill(minimalSkill, {
      additionalFrontmatter: { z: 'last', a: 'first' }
    });
    const noCanon = renderSkill(minimalSkill, {
      additionalFrontmatter: { z: 'last', a: 'first' },
      canonicalize: false
    });
    // With canonicalize, frontmatter keys end up alphabetically ordered.
    // Without, insertion order is preserved (z appears before a in our input).
    const canonZIdx = withCanon.skill.content.indexOf('z: last');
    const canonAIdx = withCanon.skill.content.indexOf('a: first');
    expect(canonAIdx).toBeLessThan(canonZIdx);
    const rawZIdx = noCanon.skill.content.indexOf('z: last');
    const rawAIdx = noCanon.skill.content.indexOf('a: first');
    expect(rawZIdx).toBeLessThan(rawAIdx);
  });

  it('renders all reference kinds (functions, classes, types, enums, variables, examples)', () => {
    const fullSkill: ExtractedSkill = {
      ...minimalSkill,
      functions: [
        {
          name: 'fn',
          description: 'd',
          signature: 'fn(): void',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ],
      classes: [
        {
          name: 'C',
          description: 'd',
          constructorSignature: 'new C()',
          methods: [],
          properties: [],
          examples: [],
          tags: {}
        }
      ],
      types: [{ name: 'T', description: 'd', definition: 'string' }],
      enums: [
        { name: 'E', description: 'd', members: [{ name: 'A', value: '1', description: '' }] }
      ],
      variables: [{ name: 'V', type: 'number', description: 'd', isConst: true }],
      examples: ['ex1', 'ex2']
    };
    const out = renderSkill(fullSkill);
    const filenames = out.references.map((r) => r.filename);
    expect(filenames.some((f) => f.endsWith('functions.md'))).toBe(true);
    expect(filenames.some((f) => f.endsWith('classes.md'))).toBe(true);
    expect(filenames.some((f) => f.endsWith('types.md'))).toBe(true);
    expect(filenames.some((f) => f.endsWith('variables.md'))).toBe(true);
    expect(filenames.some((f) => f.endsWith('examples.md'))).toBe(true);
  });

  it('renders resources and prompts references when populated', () => {
    const skillWithResAndPrompts: ExtractedSkill = {
      ...minimalSkill,
      resources: [{ uri: 'file:///x', name: 'X', description: 'a resource' }],
      prompts: [{ name: 'p', description: 'a prompt', arguments: [] }]
    };
    const out = renderSkill(skillWithResAndPrompts);
    const filenames = out.references.map((r) => r.filename);
    expect(filenames.some((f) => f.endsWith('resources.md'))).toBe(true);
    expect(filenames.some((f) => f.endsWith('prompts.md'))).toBe(true);
  });

  // Type-guard: renderSkills must reject an invocation adapter at compile time.
  // This is a compile-time assertion, not a runtime one — if the file type-checks,
  // the guard is in place. The runtime body is a no-op.
  it('renderSkills rejects invocation adapter at compile time', () => {
    const skills: ExtractedSkill[] = [];
    const opts = {
      outDir: '.',
      includeExamples: true,
      includeSignatures: true,
      maxTokens: 4000,
      namePrefix: '',
      license: 'MIT'
    };
    const adapter: InvocationAdapter = {
      target: 'mcp-protocol',
      fingerprint: { adapter: 'x', version: '0' },
      render: async () => ({ skill: { filename: 's/SKILL.md', content: '' }, references: [] })
    };
    // @ts-expect-error — invocation should be disallowed on renderSkills options
    renderSkills(skills, { ...opts, invocation: adapter });
    // If the above @ts-expect-error DOESN'T trigger, this test will fail the build.
    expect(true).toBe(true);
  });
});
