import { describe, expect, it } from 'vitest';
import { resolveRefineSource } from '../commands/refine.js';

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
});
