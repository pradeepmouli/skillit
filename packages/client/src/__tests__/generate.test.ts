import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generateCliSkill, generateConfigSkill } from '../generate.js';

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('generateConfigSkill', () => {
  it('extracts the config type and writes a SKILL.md into outDir', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gen-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: '@scope/my-lib', description: 'A test lib', keywords: ['x'] })
    );
    await writeFile(
      join(tmpDir, 'config.ts'),
      `/** A config. */\nexport interface MyConfig {\n  /** out dir */\n  outDir?: string;\n}\n`
    );
    const outDir = join(tmpDir, 'skills');

    await generateConfigSkill({
      configFile: join(tmpDir, 'config.ts'),
      typeName: 'MyConfig',
      name: 'my-lib',
      outDir
    });

    expect(existsSync(join(outDir, 'my-lib', 'SKILL.md'))).toBe(true);
    const md = await readFile(join(outDir, 'my-lib', 'SKILL.md'), 'utf8');
    expect(md).toContain('my-lib');
  });
});

describe('generateCliSkill', () => {
  it('correlates @never JSDoc from a <Command>Options interface into the generated skill', async () => {
    const programPath = fileURLToPath(
      new URL('./fixtures/cli-with-greet-command.mjs', import.meta.url)
    );
    tmpDir = await mkdtemp(join(tmpdir(), 'gen-cli-never-'));
    await writeFile(
      join(tmpDir, 'command-options.ts'),
      [
        '/**',
        ' * @useWhen - Server advertises the capability',
        ' * @never - NEVER call this without checking capabilities first. Fix: probe with --help',
        ' */',
        'export interface GreetOptions {}'
      ].join('\n'),
      'utf8'
    );
    const outDir = join(tmpDir, 'skills');

    await generateCliSkill({
      program: `${programPath}#program`,
      cwd: tmpDir,
      nature: 'cli',
      name: 'greet-cli',
      outDir
    });

    const skillMd = await readFile(join(outDir, 'greet-cli', 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('**Never:**');
    expect(skillMd).toContain('NEVER call this without checking capabilities first');
  });
});
