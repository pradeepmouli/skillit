import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { CliRefineSource } from '../src/refine-source.js';

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('CliRefineSource.resolveTargetLocation', () => {
  it('resolves a command target to the file declaring its <Command>Options interface', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-resolve-'));
    await writeFile(
      join(tmpDir, 'add-remote.ts'),
      `export interface AddRemoteOptions {\n  url: string;\n}\n`
    );
    const program = new Command('tool');
    const source = new CliRefineSource({
      program,
      sourceGlob: join(tmpDir, '**', '*.ts'),
      cwd: tmpDir
    });

    const loc = await source.resolveTargetLocation({ name: 'add-remote', kind: 'command' });
    expect(loc).toBeDefined();
    expect(loc!.declName).toBe('AddRemoteOptions');
    expect(loc!.file).toBe(join(tmpDir, 'add-remote.ts'));
  });

  it('returns undefined when no options interface exists for the command', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-resolve-'));
    await writeFile(join(tmpDir, 'other.ts'), `export const x = 1;\n`);
    const program = new Command('tool');
    const source = new CliRefineSource({
      program,
      sourceGlob: join(tmpDir, '**', '*.ts'),
      cwd: tmpDir
    });

    const loc = await source.resolveTargetLocation({ name: 'missing', kind: 'command' });
    expect(loc).toBeUndefined();
  });
});
