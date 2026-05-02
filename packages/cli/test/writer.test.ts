import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeCliSkill } from '../src/extract.js';

const tempDirs: string[] = [];

function createTempDir(name: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('writeCliSkill', () => {
  it('installs the extracted skill and bundled CLI guidance into install targets', () => {
    const outDir = createTempDir('cli-out');
    const installDir = createTempDir('cli-install');

    writeCliSkill(
      {
        name: 'demo-cli',
        description: 'Demo CLI',
        functions: [],
        classes: [],
        types: [],
        enums: [],
        variables: [],
        examples: []
      },
      {
        outDir,
        installTargets: [installDir]
      }
    );

    expect(existsSync(path.join(outDir, 'demo-cli', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'to-skills-cli-docs', 'SKILL.md'))).toBe(false);
    expect(existsSync(path.join(installDir, 'demo-cli', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(installDir, 'to-skills-cli-docs', 'SKILL.md'))).toBe(true);
  });
});
