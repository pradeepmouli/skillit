// packages/core/src/refine/__tests__/config-source.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigRefineSource } from '../config-source.js';

let tmp = '';
afterEach(() => {
  if (tmp) {
    rmSync(tmp, { recursive: true });
    tmp = '';
  }
});

function fixture(source: string, extra?: { packageJson?: object; readme?: string }): string {
  tmp = mkdtempSync(join(tmpdir(), 'config-source-'));
  const file = join(tmp, 'config.ts');
  writeFileSync(file, source, 'utf8');
  if (extra?.packageJson) {
    writeFileSync(join(tmp, 'package.json'), JSON.stringify(extra.packageJson), 'utf8');
  }
  if (extra?.readme) writeFileSync(join(tmp, 'README.md'), extra.readme, 'utf8');
  return file;
}

describe('ConfigRefineSource.extract', () => {
  it('builds a skill with one config surface from the named type', async () => {
    const file = fixture(`export interface ZodFormsConfig {
  /** Output directory. @default "dist" */
  outDir?: string;
  mode: 'strict' | 'loose';
}`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'ZodFormsConfig' });
    const skill = await source.extract();

    expect(skill.name).toBe('ZodFormsConfig');
    expect(skill.configSurfaces).toHaveLength(1);
    const surface = skill.configSurfaces![0]!;
    expect(surface.sourceType).toBe('config');
    expect(surface.options.map((o) => o.configKey)).toEqual(['outDir', 'mode']);
  });

  it('uses the name/description overrides when provided', async () => {
    const file = fixture(`export interface Cfg { a: string; }`);
    const source = new ConfigRefineSource({
      configFile: file,
      typeName: 'Cfg',
      name: 'my-config',
      description: 'My config surface'
    });
    const skill = await source.extract();
    expect(skill.name).toBe('my-config');
    expect(skill.description).toBe('My config surface');
  });

  it('throws when the type is not found', async () => {
    const file = fixture(`export interface Other {}`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Missing' });
    await expect(source.extract()).rejects.toThrow(/Missing.*not found/);
  });

  it('enriches name/description/keywords/repository from the nearest package.json', async () => {
    const file = fixture(`export interface Cfg { a: string; }`, {
      packageJson: {
        name: '@scope/my-lib',
        description: 'A configurable widget generator',
        keywords: ['widget', 'codegen', 'config'],
        repository: { type: 'git', url: 'https://github.com/me/my-lib.git' }
      }
    });
    const skill = await new ConfigRefineSource({ configFile: file, typeName: 'Cfg' }).extract();
    expect(skill.name).toBe('my-lib'); // scope stripped
    expect(skill.description).toBe('A configurable widget generator');
    expect(skill.keywords).toEqual(['widget', 'codegen', 'config']);
    expect(skill.repository).toBe('https://github.com/me/my-lib.git');
  });

  it('explicit name/description override the package.json values', async () => {
    const file = fixture(`export interface Cfg { a: string; }`, {
      packageJson: { name: '@scope/my-lib', description: 'pkg desc' }
    });
    const skill = await new ConfigRefineSource({
      configFile: file,
      typeName: 'Cfg',
      name: 'override',
      description: 'override desc'
    }).extract();
    expect(skill.name).toBe('override');
    expect(skill.description).toBe('override desc');
  });
});

describe('ConfigRefineSource example file', () => {
  it('writes an @example fix to a sibling <base>.example.ts, stripping code fences', async () => {
    const file = fixture(`export interface Cfg { a: string; }`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.applyFixes([
      {
        toolName: 'Cfg',
        tag: 'example',
        value:
          '```ts\nimport { defineConfig } from "x";\nexport default defineConfig({ a: "1" });\n```'
      }
    ]);
    const examplePath = join(tmp, 'config.example.ts');
    const written = readFileSync(examplePath, 'utf8');
    expect(written).not.toContain('```');
    expect(written).toContain('export default defineConfig({ a: "1" });');
    expect(written.endsWith('\n')).toBe(true);
  });

  it('does not clobber an existing example file', async () => {
    const file = fixture(`export interface Cfg { a: string; }`);
    const examplePath = join(tmp, 'config.example.ts');
    writeFileSync(examplePath, 'export const handAuthored = true;\n', 'utf8');
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.applyFixes([{ toolName: 'Cfg', tag: 'example', value: 'export default {};' }]);
    expect(readFileSync(examplePath, 'utf8')).toBe('export const handAuthored = true;\n');
  });

  it('reads an existing example file into skill.examples (clears E4)', async () => {
    const file = fixture(`export interface Cfg { a: string; }`);
    writeFileSync(join(tmp, 'config.example.ts'), 'export default { a: "x" };\n', 'utf8');
    const skill = await new ConfigRefineSource({ configFile: file, typeName: 'Cfg' }).extract();
    expect(skill.examples).toEqual(['export default { a: "x" };']);
  });

  it('extract() leaves examples empty when no example file exists', async () => {
    const file = fixture(`export interface Cfg { a: string; }`);
    const skill = await new ConfigRefineSource({ configFile: file, typeName: 'Cfg' }).extract();
    expect(skill.examples).toEqual([]);
  });
});

describe('ConfigRefineSource.guidance', () => {
  it('scopes drafting to the named option and lists the options with types', async () => {
    const file = fixture(`export interface Cfg {\n  outDir?: string;\n  mode: 'a' | 'b';\n}`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.extract(); // populates the surface cache guidance() reads
    const g = source.guidance();
    expect(g).toMatch(/SPECIFIC to that single option/);
    expect(g).toMatch(/@example/);
    expect(g).toContain('`outDir`: string');
    expect(g).toContain("`mode`: 'a' | 'b'");
    // Grounding directive: forbid inventing unverifiable runtime semantics.
    expect(g).toMatch(/GROUND every claim/);
    expect(g).toMatch(/do NOT assert runtime behavior you cannot verify/);
  });
});

describe('ConfigRefineSource grounding', () => {
  it('feeds matched grounding files into guidance and switches to the grounded directive', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'config-source-'));
    const file = join(tmp, 'config.ts');
    writeFileSync(
      file,
      `export interface Cfg {\n  /** A glob. */\n  include?: string[];\n}\n` +
        `export const PRESET_OVERRIDES = { Select: { controlled: true } };`,
      'utf8'
    );
    writeFileSync(
      join(tmp, 'filter.ts'),
      `export function matchesAnyPattern(p: string[]) {\n  // empty array means MATCH ALL\n  return !p || p.length === 0;\n}`,
      'utf8'
    );
    const source = new ConfigRefineSource({
      configFile: file,
      typeName: 'Cfg',
      groundingGlobs: [join(tmp, '*.ts')]
    });
    await source.extract();
    const g = source.guidance();
    expect(g).toContain('IMPLEMENTATION REFERENCE');
    expect(g).toContain('empty array means MATCH ALL'); // consumer behavior in context
    expect(g).toMatch(/GROUND every runtime-behavior claim in the IMPLEMENTATION REFERENCE/);
    // The config module's NON-type declarations (e.g. preset tables) are now
    // included so the model can be accurate about them.
    expect(g).toContain('PRESET_OVERRIDES');
    expect(g).toContain('Select: { controlled: true }');
    // ...but its JSDoc is stripped (the routing tags we accumulate are docs, not
    // implementation, and must not be fed back as grounding).
    expect(g).not.toContain('A glob.');
  });

  it('uses the conservative directive when no grounding is configured', async () => {
    const file = fixture(`export interface Cfg {\n  a: string;\n}`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.extract();
    const g = source.guidance();
    expect(g).not.toContain('IMPLEMENTATION REFERENCE');
    expect(g).toMatch(/do NOT assert runtime behavior you cannot verify/);
  });
});

describe('ConfigRefineSource.auditContext', () => {
  it('returns the discovered package + README context after extract()', async () => {
    const file = fixture(`export interface Cfg { a: string; }`, {
      packageJson: {
        name: 'lib',
        description: 'desc',
        keywords: ['k1', 'k2'],
        repository: 'https://example.com/repo.git'
      },
      readme: `# lib\n\n> One-line summary.\n\nFirst paragraph here.\n`
    });
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.extract();
    const ctx = source.auditContext(await source.extract());
    expect(ctx.packageDescription).toBe('desc');
    expect(ctx.keywords).toEqual(['k1', 'k2']);
    expect(ctx.repository).toBe('https://example.com/repo.git');
    expect(ctx.readme).toBeDefined();
  });

  it('is empty when no package.json is discoverable', async () => {
    // mkdtemp dirs live under the OS tmp root, which has no ancestor package.json.
    const file = fixture(`export interface Cfg { a: string; }`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.extract();
    expect(source.auditContext(await source.extract())).toEqual({});
  });
});

describe('ConfigRefineSource.applyFixes', () => {
  it('writes a routing tag onto a top-level property, visible on re-extract', async () => {
    const file = fixture(`export interface Cfg {
  ssr?: boolean;
}`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.applyFixes([
      { toolName: 'ssr', tag: 'useWhen', value: 'targeting a server runtime' }
    ]);

    const written = readFileSync(file, 'utf8');
    expect(written).toContain('@useWhen targeting a server runtime');
    expect(written.indexOf('@useWhen')).toBeLessThan(written.indexOf('ssr'));

    const surface = (await source.extract()).configSurfaces![0]!;
    const ssr = surface.options.find((o) => o.name === 'ssr')!;
    expect(ssr.useWhen).toEqual(['targeting a server runtime']);
  });

  it('targets a nested property via its dot-path configKey', async () => {
    const file = fixture(`export interface Cfg {
  components: { prefix: string };
}`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.applyFixes([
      { toolName: 'components.prefix', tag: 'pitfalls', value: 'must be a valid identifier' }
    ]);

    const written = readFileSync(file, 'utf8');
    expect(written).toContain('@pitfalls must be a valid identifier');
    expect(written.indexOf('@pitfalls')).toBeLessThan(written.indexOf('prefix'));
  });

  it('leaves the file untouched when no fix applies', async () => {
    const original = `export interface Cfg {\n  a: string;\n}\n`;
    const file = fixture(original);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.applyFixes([{ toolName: 'missing', tag: 'useWhen', value: 'X' }]);
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('survives content containing a JSDoc terminator (glob) and round-trips it', async () => {
    const file = fixture(`export interface Cfg {\n  include?: string[];\n}`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.applyFixes([
      { toolName: 'include', tag: 'pitfalls', value: 'avoid the `**/*.ts` glob — too broad' }
    ]);
    // The type must still parse (an unescaped */ would have corrupted the file).
    const skill = await source.extract();
    const include = skill.configSurfaces![0]!.options.find((o) => o.name === 'include')!;
    expect(include.pitfalls?.join(' ')).toContain('**/*.ts'); // round-trips unescaped
  });

  it('accumulates multiple fixes across properties in one pass', async () => {
    const file = fixture(`export interface Cfg {
  a: string;
  b: number;
}`);
    const source = new ConfigRefineSource({ configFile: file, typeName: 'Cfg' });
    await source.applyFixes([
      { toolName: 'a', tag: 'useWhen', value: 'first' },
      { toolName: 'b', tag: 'avoidWhen', value: 'second' }
    ]);
    const written = readFileSync(file, 'utf8');
    expect(written).toContain('@useWhen first');
    expect(written).toContain('@avoidWhen second');
  });
});
