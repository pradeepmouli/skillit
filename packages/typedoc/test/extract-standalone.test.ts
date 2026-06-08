import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractTypeDocSkills, generateTypeDocSkills } from '../src/extract-standalone.js';

let tmpDir: string;
afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

async function writeLibFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'td-extract-'));
  await mkdir(join(tmpDir, 'src'), { recursive: true });
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({
      name: '@scope/mylib',
      description: 'A small documented library.',
      version: '0.0.0'
    })
  );
  await writeFile(
    join(tmpDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
        skipLibCheck: true,
        declaration: true
      },
      include: ['src']
    })
  );
  await writeFile(
    join(tmpDir, 'src', 'index.ts'),
    `/**\n * Add two numbers together.\n * @param a first addend\n * @param b second addend\n * @returns the sum\n */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`
  );
  return tmpDir;
}

describe('extractTypeDocSkills (audit path)', () => {
  it('extracts a skill with the documented export', async () => {
    const dir = await writeLibFixture();
    const skills = await extractTypeDocSkills({
      entryPoints: [join(dir, 'src', 'index.ts')],
      tsconfig: join(dir, 'tsconfig.json'),
      cwd: dir
    });
    expect(skills.length).toBeGreaterThan(0);
    const fn = skills[0]!.functions.find((f) => f.name === 'add');
    expect(fn).toBeDefined();
    expect(fn!.description).toMatch(/Add two numbers/);
  });
});

describe('generateTypeDocSkills (gen path, plugin-driven write)', () => {
  it('writes a SKILL.md into outDir via the plugin', async () => {
    const dir = await writeLibFixture();
    const outDir = join(dir, 'skills');
    await generateTypeDocSkills({
      entryPoints: [join(dir, 'src', 'index.ts')],
      tsconfig: join(dir, 'tsconfig.json'),
      cwd: dir,
      outDir
    });
    // The plugin writes skills/<name>/SKILL.md — assert SOME SKILL.md exists under outDir.
    const found =
      existsSync(outDir) &&
      readdirSync(outDir, { recursive: true }).some((p) => String(p).endsWith('SKILL.md'));
    expect(found).toBe(true);
  });
});
