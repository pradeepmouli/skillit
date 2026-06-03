import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { loadProgram } from '../src/program-loader.js';

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));

describe('loadProgram', () => {
  it('loads a program via --program file#export (factory)', async () => {
    const program = await loadProgram({
      program: 'fixtures/program-factory.mjs#buildProgram',
      cwd: fileURLToPath(new URL('.', import.meta.url))
    });

    expect(program).toBeInstanceOf(Command);
    expect(program.name()).toBe('fixture-tool');
  });

  it('auto-finds the program from package.json bin (program export)', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'to-skills-loader-'));
    try {
      writeFileSync(
        path.join(cwd, 'package.json'),
        JSON.stringify({ name: 'auto', bin: path.join(fixturesDir, 'bin-with-program.mjs') }),
        'utf8'
      );

      const program = await loadProgram({ cwd });
      expect(program).toBeInstanceOf(Command);
      expect(program.name()).toBe('auto-tool');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('throws a guiding error when no usable export exists', async () => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'to-skills-loader-'));
    try {
      writeFileSync(
        path.join(cwd, 'package.json'),
        JSON.stringify({ name: 'no-prog', bin: path.join(fixturesDir, 'bin-no-program.mjs') }),
        'utf8'
      );

      await expect(loadProgram({ cwd })).rejects.toThrow(/--program/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
