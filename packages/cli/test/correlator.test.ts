import { describe, it, expect } from 'vitest';
import { correlateFlags } from '../src/correlator.js';
import type { ExtractedConfigSurface, ExtractedConfigOption } from '@skillit/core';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeCLIOption(overrides: Partial<ExtractedConfigOption> = {}): ExtractedConfigOption {
  return {
    name: 'output',
    cliFlag: '--output',
    cliShort: '-o',
    type: 'string',
    description: 'Output directory',
    required: false,
    defaultValue: 'dist',
    ...overrides
  };
}

function makeConfigOption(overrides: Partial<ExtractedConfigOption> = {}): ExtractedConfigOption {
  return {
    name: 'output',
    configKey: 'output',
    type: 'string',
    description: 'Config: directory for build output',
    required: false,
    remarks: 'Takes precedence over tsconfig outDir',
    useWhen: ['Targeting a custom output location'],
    avoidWhen: ['Using defaults — omit to inherit from tsconfig'],
    pitfalls: ['Must be a relative path'],
    category: 'Output',
    ...overrides
  };
}

function makeCLISurface(overrides: Partial<ExtractedConfigSurface> = {}): ExtractedConfigSurface {
  return {
    name: 'build',
    description: 'Compile the project',
    sourceType: 'cli',
    options: [makeCLIOption()],
    ...overrides
  };
}

function makeConfigSurface(
  overrides: Partial<ExtractedConfigSurface> = {}
): ExtractedConfigSurface {
  return {
    name: 'BuildOptions',
    description: 'Configures the build pipeline',
    sourceType: 'config',
    options: [makeConfigOption()],
    useWhen: ['You need to produce production artifacts'],
    avoidWhen: ['Running in CI with pre-built artifacts'],
    pitfalls: ['Always clean dist/ before building'],
    remarks: 'Requires Node >=18',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('correlateFlags — basic merging', () => {
  it('merges JSDoc tags from config interface into CLI options', () => {
    const result = correlateFlags(makeCLISurface(), makeConfigSurface());
    const opt = result.options[0]!;
    expect(opt.remarks).toBe('Takes precedence over tsconfig outDir');
    expect(opt.useWhen).toEqual(['Targeting a custom output location']);
    expect(opt.avoidWhen).toEqual(['Using defaults — omit to inherit from tsconfig']);
    expect(opt.pitfalls).toEqual(['Must be a relative path']);
    expect(opt.category).toBe('Output');
  });

  it('CLI description wins over config description', () => {
    const result = correlateFlags(makeCLISurface(), makeConfigSurface());
    const opt = result.options[0]!;
    expect(opt.description).toBe('Output directory');
  });

  it('uses config description when CLI description is empty', () => {
    const cli = makeCLISurface({
      options: [makeCLIOption({ description: '' })]
    });
    const result = correlateFlags(cli, makeConfigSurface());
    const opt = result.options[0]!;
    expect(opt.description).toBe('Config: directory for build output');
  });

  it('preserves CLI structural fields (flags, required, defaultValue)', () => {
    const result = correlateFlags(makeCLISurface(), makeConfigSurface());
    const opt = result.options[0]!;
    expect(opt.cliFlag).toBe('--output');
    expect(opt.cliShort).toBe('-o');
    expect(opt.required).toBe(false);
    expect(opt.defaultValue).toBe('dist');
  });
});

describe('correlateFlags — command-level tag merging', () => {
  it('merges command-level tags from config surface when CLI has none', () => {
    const cli = makeCLISurface();
    const result = correlateFlags(cli, makeConfigSurface());
    expect(result.useWhen).toEqual(['You need to produce production artifacts']);
    expect(result.avoidWhen).toEqual(['Running in CI with pre-built artifacts']);
    expect(result.pitfalls).toEqual(['Always clean dist/ before building']);
    expect(result.remarks).toBe('Requires Node >=18');
  });

  it('CLI command-level tags win over config surface tags', () => {
    const cli = makeCLISurface({
      useWhen: ['CLI-specific use case'],
      avoidWhen: ['CLI-specific avoid'],
      pitfalls: ['CLI-specific pitfall'],
      remarks: 'CLI-specific remarks'
    });
    const result = correlateFlags(cli, makeConfigSurface());
    expect(result.useWhen).toEqual(['CLI-specific use case']);
    expect(result.avoidWhen).toEqual(['CLI-specific avoid']);
    expect(result.pitfalls).toEqual(['CLI-specific pitfall']);
    expect(result.remarks).toBe('CLI-specific remarks');
  });
});

describe('correlateFlags — no config surface', () => {
  it('returns CLI surface unchanged when no config surface provided', () => {
    const cli = makeCLISurface();
    const result = correlateFlags(cli, undefined);
    expect(result).toBe(cli);
  });
});

describe('correlateFlags — case-insensitive matching', () => {
  it('matches CLI option name to config property case-insensitively', () => {
    const cli = makeCLISurface({
      options: [makeCLIOption({ name: 'OutputDir', cliFlag: '--output-dir', description: '' })]
    });
    const config = makeConfigSurface({
      options: [makeConfigOption({ name: 'outputDir', description: 'Config output dir' })]
    });
    const result = correlateFlags(cli, config);
    const opt = result.options[0]!;
    // Falls back to config description since CLI description is empty
    expect(opt.description).toBe('Config output dir');
  });
});

describe('correlateFlags — unmatched options', () => {
  it('leaves unmatched CLI options unchanged (no match in config)', () => {
    const cli = makeCLISurface({
      options: [makeCLIOption({ name: 'verbose', cliFlag: '--verbose', type: 'boolean' })]
    });
    const config = makeConfigSurface({
      options: [makeConfigOption({ name: 'output' })]
    });
    const result = correlateFlags(cli, config);
    const opt = result.options[0]!;
    expect(opt.name).toBe('verbose');
    expect(opt.remarks).toBeUndefined();
    expect(opt.useWhen).toBeUndefined();
  });

  it('ignores config properties with no matching CLI option', () => {
    const cli = makeCLISurface({
      options: [makeCLIOption({ name: 'output' })]
    });
    const config = makeConfigSurface({
      options: [
        makeConfigOption({ name: 'output' }),
        makeConfigOption({ name: 'minify', configKey: 'minify', type: 'boolean' })
      ]
    });
    const result = correlateFlags(cli, config);
    expect(result.options).toHaveLength(1);
    expect(result.options[0]!.name).toBe('output');
  });
});
