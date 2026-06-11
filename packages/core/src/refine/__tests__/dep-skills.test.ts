import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverDepSkills, discoverDepSkillsSync } from '../dep-skills.js';

let tmpDir: string;
afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

async function makePkg(dir: string, content: object): Promise<void> {
  await writeFile(join(dir, 'package.json'), JSON.stringify(content));
}

async function makeSkillMd(dir: string, name: string, description?: string): Promise<void> {
  const lines = ['---', `name: ${name}`];
  if (description) lines.push(`description: ${description}`);
  lines.push('---', '');
  await writeFile(join(dir, 'SKILL.md'), lines.join('\n'));
}

describe('discoverDepSkillsSync', () => {
  it('returns [] when package.json is missing', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    expect(discoverDepSkillsSync(tmpDir)).toEqual([]);
  });

  it('returns [] when there are no dependencies', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await makePkg(tmpDir, { name: 'my-pkg' });
    expect(discoverDepSkillsSync(tmpDir)).toEqual([]);
  });

  it('returns [] when dep is not installed (no node_modules/<dep>)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'missing-dep': '1.0.0' } });
    expect(discoverDepSkillsSync(tmpDir)).toEqual([]);
  });

  it('returns [] when dep has no skills/ directory and no skillit.skills field', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    const depDir = join(tmpDir, 'node_modules', 'no-skill-dep');
    await mkdir(depDir, { recursive: true });
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'no-skill-dep': '1.0.0' } });
    await makePkg(depDir, { name: 'no-skill-dep' });
    expect(discoverDepSkillsSync(tmpDir)).toEqual([]);
  });

  it('discovers skills via convention (skills/*/SKILL.md)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    const depDir = join(tmpDir, 'node_modules', 'some-lib');
    const skillDir = join(depDir, 'skills', 'some-lib-core');
    await mkdir(skillDir, { recursive: true });
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'some-lib': '1.0.0' } });
    await makePkg(depDir, { name: 'some-lib' });
    await makeSkillMd(skillDir, 'some-lib-core', 'Core API for some-lib');

    const refs = discoverDepSkillsSync(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('some-lib-core');
    expect(refs[0].path).toBe('node_modules/some-lib/skills/some-lib-core');
    expect(refs[0].description).toBe('Core API for some-lib');
  });

  it('uses skillit.skills explicit list when present', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    const depDir = join(tmpDir, 'node_modules', 'custom-lib');
    const customSkillDir = join(depDir, 'custom-skills', 'my-skill');
    await mkdir(customSkillDir, { recursive: true });
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'custom-lib': '1.0.0' } });
    await makePkg(depDir, { name: 'custom-lib', skillit: { skills: ['custom-skills/my-skill'] } });
    await makeSkillMd(customSkillDir, 'my-skill', 'A custom skill');

    const refs = discoverDepSkillsSync(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].name).toBe('my-skill');
    expect(refs[0].path).toBe('node_modules/custom-lib/custom-skills/my-skill');
    expect(refs[0].description).toBe('A custom skill');
  });

  it('skips skill directories whose SKILL.md has no name field', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    const depDir = join(tmpDir, 'node_modules', 'unnamed-lib');
    const skillDir = join(depDir, 'skills', 'no-name');
    await mkdir(skillDir, { recursive: true });
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'unnamed-lib': '1.0.0' } });
    await makePkg(depDir, { name: 'unnamed-lib' });
    await writeFile(join(skillDir, 'SKILL.md'), '---\ndescription: no name here\n---\n');

    expect(discoverDepSkillsSync(tmpDir)).toEqual([]);
  });

  it('omits description field when not in frontmatter', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    const depDir = join(tmpDir, 'node_modules', 'nodesc-lib');
    const skillDir = join(depDir, 'skills', 'nodesc-skill');
    await mkdir(skillDir, { recursive: true });
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'nodesc-lib': '1.0.0' } });
    await makePkg(depDir, { name: 'nodesc-lib' });
    await makeSkillMd(skillDir, 'nodesc-skill');

    const refs = discoverDepSkillsSync(tmpDir);
    expect(refs).toHaveLength(1);
    expect(refs[0].description).toBeUndefined();
  });

  it('strips quotes from frontmatter description', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    const depDir = join(tmpDir, 'node_modules', 'quoted-lib');
    const skillDir = join(depDir, 'skills', 'quoted-skill');
    await mkdir(skillDir, { recursive: true });
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'quoted-lib': '1.0.0' } });
    await makePkg(depDir, { name: 'quoted-lib' });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      "---\nname: quoted-skill\ndescription: 'Quoted description'\n---\n"
    );

    const refs = discoverDepSkillsSync(tmpDir);
    expect(refs[0].description).toBe('Quoted description');
  });

  it('collects refs from multiple dependencies', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    for (const lib of ['lib-a', 'lib-b']) {
      const depDir = join(tmpDir, 'node_modules', lib);
      const skillDir = join(depDir, 'skills', lib);
      await mkdir(skillDir, { recursive: true });
      await makePkg(depDir, { name: lib });
      await makeSkillMd(skillDir, lib, `Skill for ${lib}`);
    }
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'lib-a': '1.0.0', 'lib-b': '1.0.0' } });

    const refs = discoverDepSkillsSync(tmpDir);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.name).sort()).toEqual(['lib-a', 'lib-b']);
  });
});

describe('discoverDepSkills (async wrapper)', () => {
  it('returns the same result as the sync variant', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'dep-skills-'));
    const depDir = join(tmpDir, 'node_modules', 'async-lib');
    const skillDir = join(depDir, 'skills', 'async-skill');
    await mkdir(skillDir, { recursive: true });
    await makePkg(tmpDir, { name: 'my-pkg', dependencies: { 'async-lib': '1.0.0' } });
    await makePkg(depDir, { name: 'async-lib' });
    await makeSkillMd(skillDir, 'async-skill', 'Async skill');

    const syncRefs = discoverDepSkillsSync(tmpDir);
    const asyncRefs = await discoverDepSkills(tmpDir);
    expect(asyncRefs).toEqual(syncRefs);
  });
});
