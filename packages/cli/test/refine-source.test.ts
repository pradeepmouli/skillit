import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { CliRefineSource } from '../src/refine-source.js';

function makeProgram(): Command {
  const program = new Command().name('demo');
  program.command('gen').description('Generate things').option('--out <dir>', 'Output dir');
  return program;
}

describe('CliRefineSource', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(os.tmpdir(), 'to-skills-refine-cli-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('extract() reads useWhen from the matching *Options interface onto the CLI surface', async () => {
    const file = path.join(cwd, 'options.ts');
    writeFileSync(
      file,
      `/**\n * @useWhen When generating output\n */\nexport interface GenOptions {\n  out: string;\n}\n`,
      'utf8'
    );

    const source = new CliRefineSource({
      program: makeProgram(),
      sourceGlob: path.join(cwd, '**/*.ts'),
      cwd
    });

    const skill = await source.extract();
    const cliSurface = skill.configSurfaces?.find(
      (s) => s.sourceType === 'cli' && s.name === 'gen'
    );
    expect(cliSurface).toBeDefined();
    expect(cliSurface?.useWhen).toContain('When generating output');
  });

  it('applyFixes() writes @useWhen JSDoc onto the GenOptions interface', async () => {
    const file = path.join(cwd, 'options.ts');
    writeFileSync(file, `export interface GenOptions {\n  out: string;\n}\n`, 'utf8');

    const source = new CliRefineSource({
      program: makeProgram(),
      sourceGlob: path.join(cwd, '**/*.ts'),
      cwd
    });

    await source.applyFixes([{ toolName: 'gen', tag: 'useWhen', value: 'When X' }]);

    const written = readFileSync(file, 'utf8');
    expect(written).toContain('@useWhen When X');
  });

  it('applyFixes() persists multiple tags targeting the same interface', async () => {
    const file = path.join(cwd, 'options.ts');
    writeFileSync(file, `export interface GenOptions {\n  out: string;\n}\n`, 'utf8');

    const source = new CliRefineSource({
      program: makeProgram(),
      sourceGlob: path.join(cwd, '**/*.ts'),
      cwd
    });

    await source.applyFixes([
      { toolName: 'gen', tag: 'useWhen', value: 'When X' },
      { toolName: 'gen', tag: 'avoidWhen', value: 'Avoid Y' }
    ]);

    const written = readFileSync(file, 'utf8');
    expect(written).toContain('@useWhen When X');
    expect(written).toContain('@avoidWhen Avoid Y');
  });

  it('applyFixes() warns and changes nothing when no matching interface exists', async () => {
    const file = path.join(cwd, 'options.ts');
    const original = `export interface GenOptions {\n  out: string;\n}\n`;
    writeFileSync(file, original, 'utf8');

    const source = new CliRefineSource({
      program: makeProgram(),
      sourceGlob: path.join(cwd, '**/*.ts'),
      cwd
    });

    const lines: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;
    try {
      await source.applyFixes([{ toolName: 'missing', tag: 'useWhen', value: 'When Y' }]);
    } finally {
      process.stderr.write = orig;
    }

    expect(lines.join('')).toContain('MissingOptions');
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('applyFixes() warns and changes nothing when only a longer-named interface matches', async () => {
    // `interface GenOptionsExtra` must NOT be treated as the `GenOptions` probe.
    const file = path.join(cwd, 'options.ts');
    const original = `export interface GenOptionsExtra {\n  out: string;\n}\n`;
    writeFileSync(file, original, 'utf8');

    const source = new CliRefineSource({
      program: makeProgram(),
      sourceGlob: path.join(cwd, '**/*.ts'),
      cwd
    });

    const lines: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;
    try {
      await source.applyFixes([{ toolName: 'gen', tag: 'useWhen', value: 'When Z' }]);
    } finally {
      process.stderr.write = orig;
    }

    expect(lines.join('')).toContain('GenOptions');
    expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('extract() maps an example-only interface onto the surface usage field', async () => {
    const file = path.join(cwd, 'options.ts');
    writeFileSync(
      file,
      `/**\n * @example demo gen --out dist\n */\nexport interface GenOptions {\n  out: string;\n}\n`,
      'utf8'
    );

    const source = new CliRefineSource({
      program: makeProgram(),
      sourceGlob: path.join(cwd, '**/*.ts'),
      cwd
    });

    const skill = await source.extract();
    const cliSurface = skill.configSurfaces?.find(
      (s) => s.sourceType === 'cli' && s.name === 'gen'
    );
    expect(cliSurface).toBeDefined();
    expect(cliSurface?.usage).toContain('demo gen --out dist');
  });

  it('derives the interface name for colon/dot commands (db:migrate → DbMigrateOptions)', async () => {
    const file = path.join(cwd, 'options.ts');
    writeFileSync(file, `export interface GenOptions {}\n`, 'utf8');

    const source = new CliRefineSource({
      program: makeProgram(),
      sourceGlob: path.join(cwd, '**/*.ts'),
      cwd
    });

    const lines: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;
    try {
      await source.applyFixes([
        { toolName: 'db:migrate', tag: 'useWhen', value: 'When migrating' }
      ]);
    } finally {
      process.stderr.write = orig;
    }

    expect(lines.join('')).toContain('DbMigrateOptions');
  });

  it('guidance() returns the bundled CLI conventions skill', async () => {
    const source = new CliRefineSource({
      program: makeProgram(),
      sourceGlob: path.join(cwd, '**/*.ts'),
      cwd
    });

    const guidance = await source.guidance();
    expect(guidance.length).toBeGreaterThan(0);
    expect(guidance).toContain('CLI Documentation Conventions');
  });
});
