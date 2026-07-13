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

describe('CliRefineSource writes package metadata onto the IR', () => {
  it('populates packageDescription, keywords, and readme from cwd', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-ctx-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: '@scope/my-tool',
        description: 'A meaningful description of the my-tool CLI for callers.',
        keywords: ['cli', 'tool', 'skillit', 'docs', 'gen']
      })
    );
    await writeFile(
      join(tmpDir, 'README.md'),
      '# my-tool\n\n> A blockquote describing what my-tool does for the caller.\n\nMore body text here.\n'
    );
    const source = new CliRefineSource({
      program: new Command('my-tool'),
      sourceGlob: join(tmpDir, '**', '*.ts'),
      cwd: tmpDir
    });
    const skill = await source.extract();
    expect(skill.packageDescription).toMatch(/meaningful description/);
    expect(skill.keywords).toContain('skillit');
    expect(skill.readme).toBeDefined();
    expect(skill.readme?.blockquote ?? skill.readme?.firstParagraph ?? '').toMatch(
      /blockquote describing/
    );
  });

  it('leaves metadata unset when no package.json/README exist', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-ctx-'));
    const source = new CliRefineSource({
      program: new Command('bare'),
      sourceGlob: join(tmpDir, '**', '*.ts'),
      cwd: tmpDir
    });
    const skill = await source.extract();
    expect(skill.packageDescription).toBeUndefined();
    expect(skill.readme).toBeUndefined();
  });
});
