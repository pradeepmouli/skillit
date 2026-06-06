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

function fixture(source: string): string {
  tmp = mkdtempSync(join(tmpdir(), 'config-source-'));
  const file = join(tmp, 'config.ts');
  writeFileSync(file, source, 'utf8');
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
