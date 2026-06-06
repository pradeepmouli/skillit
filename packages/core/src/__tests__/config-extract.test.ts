// packages/core/src/__tests__/config-extract.test.ts
import { describe, it, expect } from 'vitest';
import { extractConfigSurface } from '../config-extract.js';

describe('extractConfigSurface', () => {
  it('extracts properties with types, optionality, description, and @default', () => {
    const src = `export interface ZodFormsConfig {
  /** Output directory for generated files.
   * @default "dist" */
  outDir?: string;
  /** Validation strictness. */
  mode: 'strict' | 'loose';
}`;
    const surface = extractConfigSurface(src, 'ZodFormsConfig');
    expect(surface).toBeDefined();
    expect(surface!.sourceType).toBe('config');
    expect(surface!.name).toBe('ZodFormsConfig');

    const outDir = surface!.options.find((o) => o.name === 'outDir')!;
    expect(outDir.configKey).toBe('outDir');
    expect(outDir.type).toBe('string');
    expect(outDir.required).toBe(false);
    expect(outDir.description).toBe('Output directory for generated files.');
    expect(outDir.defaultValue).toBe('"dist"');

    const mode = surface!.options.find((o) => o.name === 'mode')!;
    expect(mode.type).toBe("'strict' | 'loose'");
    expect(mode.required).toBe(true);
  });

  it('recurses into inline object types with dot-notation config keys', () => {
    const src = `export interface Cfg {
  components: { prefix: string };
}`;
    const surface = extractConfigSurface(src, 'Cfg');
    const keys = surface!.options.map((o) => o.configKey);
    expect(keys).toContain('components');
    expect(keys).toContain('components.prefix');
    const nested = surface!.options.find((o) => o.configKey === 'components.prefix')!;
    expect(nested.type).toBe('string');
    expect(nested.required).toBe(true);
  });

  it('captures routing tags (@useWhen/@avoidWhen/@pitfalls) from property JSDoc', () => {
    const src = `export interface Cfg {
  /** Enable SSR.
   * @useWhen targeting a server runtime
   * @pitfalls breaks static export */
  ssr?: boolean;
}`;
    const ssr = extractConfigSurface(src, 'Cfg')!.options.find((o) => o.name === 'ssr')!;
    expect(ssr.useWhen).toEqual(['targeting a server runtime']);
    expect(ssr.pitfalls).toEqual(['breaks static export']);
  });

  it('supports an object-type `type` alias', () => {
    const src = `export type Cfg = {
  /** A flag. */
  flag: boolean;
};`;
    const surface = extractConfigSurface(src, 'Cfg');
    expect(surface!.options.find((o) => o.name === 'flag')?.type).toBe('boolean');
  });

  it('collapses a multi-line property type to one line (no table-breaking newlines)', () => {
    const src = `export type Cfg = {
  schemas?: {
    [K in keyof T & string]?: ZodTypeConfig<
      T[K],
      C
    >;
  };
};`;
    const schemas = extractConfigSurface(src, 'Cfg')!.options.find((o) => o.name === 'schemas')!;
    expect(schemas.type).not.toContain('\n');
    expect(schemas.type).toBe('{ [K in keyof T & string]?: ZodTypeConfig< T[K], C >; }');
  });

  it('matches a generic object-type alias by its bare name', () => {
    const src = `export type Cfg<T = unknown> = {
  /** A flag. */
  flag: boolean;
};`;
    const surface = extractConfigSurface(src, 'Cfg');
    expect(surface?.options.find((o) => o.name === 'flag')?.type).toBe('boolean');
  });

  it('returns undefined when the type is not found', () => {
    expect(extractConfigSurface(`export interface Other {}`, 'Missing')).toBeUndefined();
  });
});
