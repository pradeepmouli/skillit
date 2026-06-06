import { describe, expect, it } from 'vitest';
import {
  parseConfigTypeSpec,
  resolveModelClientKind,
  resolveRefineSource
} from '../commands/refine.js';

describe('resolveModelClientKind', () => {
  it("defaults to 'api' when --model-client is omitted", () => {
    expect(resolveModelClientKind(undefined)).toBe('api');
  });
  it('passes through a provided kind', () => {
    expect(resolveModelClientKind('claude')).toBe('claude');
  });
});

describe('resolveRefineSource', () => {
  it('explicit --source cli wins over detection', () => {
    const res = resolveRefineSource({ source: 'cli' }, 'mcp');
    expect(res).toEqual({ kind: 'cli' });
  });

  it('explicit --source mcp requires --mcp', () => {
    const res = resolveRefineSource({ source: 'mcp' }, 'none');
    expect('error' in res && res.error).toMatch(/--mcp/);
  });

  it('explicit --source mcp with --mcp resolves to mcp', () => {
    const res = resolveRefineSource({ source: 'mcp', mcp: 'mcp.json' }, 'none');
    expect(res).toEqual({ kind: 'mcp' });
  });

  it('rejects an invalid --source value', () => {
    const res = resolveRefineSource({ source: 'bogus' }, 'cli');
    expect('error' in res && res.error).toMatch(/cli|mcp|typedoc/);
  });

  it('falls back to detection when --source is omitted', () => {
    const res = resolveRefineSource({}, 'cli');
    expect(res).toEqual({ kind: 'cli' });
  });

  it('detected mcp still requires --mcp', () => {
    const res = resolveRefineSource({}, 'mcp');
    expect('error' in res && res.error).toMatch(/--mcp/);
  });

  it('detected mcp with --mcp resolves to mcp', () => {
    const res = resolveRefineSource({ mcp: 'mcp.json' }, 'mcp');
    expect(res).toEqual({ kind: 'mcp' });
  });

  it('errors on ambiguous detection listing candidates and --source form', () => {
    const res = resolveRefineSource({}, 'ambiguous', ['cli', 'mcp']);
    const error = 'error' in res ? res.error : '';
    expect(error).toMatch(/--source <cli\|mcp\|typedoc>/);
    expect(error).toMatch(/cli/);
    expect(error).toMatch(/mcp/);
    expect(error).toMatch(/found: cli, mcp/);
  });

  it('errors on no detected source with the --source form', () => {
    const res = resolveRefineSource({}, 'none');
    expect('error' in res && res.error).toMatch(/--source <cli\|mcp\|typedoc>/);
  });

  it('errors that typedoc is not yet supported', () => {
    const res = resolveRefineSource({ source: 'typedoc' }, 'none');
    expect('error' in res && res.error).toMatch(/not yet supported/);
  });

  it('errors that detected typedoc is not yet supported', () => {
    const res = resolveRefineSource({}, 'typedoc');
    expect('error' in res && res.error).toMatch(/not yet supported/);
  });

  it('explicit --source config requires --config-type', () => {
    const res = resolveRefineSource({ source: 'config' }, 'none');
    expect('error' in res && res.error).toMatch(/--config-type/);
  });

  it('explicit --source config with --config-type resolves to config', () => {
    const res = resolveRefineSource(
      { source: 'config', configType: './src/config.ts#MyConfig' },
      'none'
    );
    expect(res).toEqual({ kind: 'config' });
  });

  it('accepts --source config as a valid value (not an invalid-source error)', () => {
    const res = resolveRefineSource({ source: 'config', configType: 'c.ts#C' }, 'cli');
    expect('error' in res).toBe(false);
  });
});

describe('parseConfigTypeSpec', () => {
  it('splits a relative file#export and resolves the file against cwd', () => {
    const res = parseConfigTypeSpec('./src/config.ts#ZodFormsConfig', '/work');
    expect(res).toEqual({ configFile: '/work/src/config.ts', typeName: 'ZodFormsConfig' });
  });

  it('keeps an absolute file path as-is', () => {
    const res = parseConfigTypeSpec('/abs/config.ts#Cfg', '/work');
    expect(res).toEqual({ configFile: '/abs/config.ts', typeName: 'Cfg' });
  });

  it('errors when the # separator is missing', () => {
    const res = parseConfigTypeSpec('./src/config.ts', '/work');
    expect('error' in res && res.error).toMatch(/<file>#<ExportName>/);
  });

  it('errors when the export name is empty', () => {
    const res = parseConfigTypeSpec('./src/config.ts#', '/work');
    expect('error' in res && res.error).toMatch(/<file>#<ExportName>/);
  });

  it('errors when the file part is empty', () => {
    const res = parseConfigTypeSpec('#Cfg', '/work');
    expect('error' in res && res.error).toMatch(/<file>#<ExportName>/);
  });
});
