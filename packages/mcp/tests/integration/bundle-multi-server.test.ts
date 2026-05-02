/**
 * Integration test (T068): multi-bin package → two skill directories.
 *
 * Drives the bundle pipeline against the multi-server-package fixture, which
 * declares two bins (`server-a`, `server-b`) and a `to-skills.mcp` array. The
 * generated SKILL.md frontmatter for each entry should use the npx
 * `--package=<pkg> <binName>` form (FR-034) so harnesses can launch the
 * specific bin from the published package.
 */
import { execFile } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'multi-server-package');
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

interface McpFrontmatter {
  mcp?: Record<string, { command?: string; args?: string[] }>;
}

function readFrontmatter(p: string): McpFrontmatter {
  const content = readFileSync(p, 'utf-8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) throw new Error(`No frontmatter in ${p}`);
  return YAML.parse(fmMatch[1]) as McpFrontmatter;
}

describe.skipIf(!RUN)('bundle integration: multi-server-package', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'to-skills-mcp-bundle-multi-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('writes one skill per bin with --package=<pkg> <binName> npx form', async () => {
    await exec('node', [BIN_PATH, 'bundle', '--package-root', workDir, '--out', 'skills'], {
      timeout: 90_000
    });

    const skillA = join(workDir, 'skills', 'server-a', 'SKILL.md');
    const skillB = join(workDir, 'skills', 'server-b', 'SKILL.md');
    expect(existsSync(skillA)).toBe(true);
    expect(existsSync(skillB)).toBe(true);

    const fmA = readFrontmatter(skillA);
    expect(fmA.mcp?.['server-a']?.command).toBe('npx');
    expect(fmA.mcp?.['server-a']?.args).toEqual([
      '-y',
      '--package=@fixture/multi-server',
      'server-a'
    ]);

    const fmB = readFrontmatter(skillB);
    expect(fmB.mcp?.['server-b']?.command).toBe('npx');
    expect(fmB.mcp?.['server-b']?.args).toEqual([
      '-y',
      '--package=@fixture/multi-server',
      'server-b'
    ]);

    // Each bin's tool-list is unique, so the two reference files differ.
    const refA = readFileSync(
      join(workDir, 'skills', 'server-a', 'references', 'functions.md'),
      'utf-8'
    );
    const refB = readFileSync(
      join(workDir, 'skills', 'server-b', 'references', 'functions.md'),
      'utf-8'
    );
    expect(refA).toMatch(/tool-a/);
    expect(refB).toMatch(/tool-b/);
  }, 120_000);

  it('uses last-wins semantics across successive bundle runs that target the same installed skill name', async () => {
    const secondPackageRoot = mkdtempSync(join(tmpdir(), 'to-skills-mcp-bundle-multi-second-'));
    cpSync(FIXTURE_DIR, secondPackageRoot, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(secondPackageRoot, 'node_modules'), 'dir');
    const installDir = join(workDir, '.claude', 'skills');
    try {
      const firstPkgPath = join(workDir, 'package.json');
      const secondPkgPath = join(secondPackageRoot, 'package.json');
      const firstPkg = JSON.parse(readFileSync(firstPkgPath, 'utf8')) as {
        'to-skills': { mcp: Array<{ skillName: string; binName: string }> };
      };
      const secondPkg = JSON.parse(readFileSync(secondPkgPath, 'utf8')) as {
        'to-skills': { mcp: Array<{ skillName: string; binName: string }> };
      };
      firstPkg['to-skills'].mcp = [{ skillName: 'shared-server', binName: 'server-a' }];
      secondPkg['to-skills'].mcp = [{ skillName: 'shared-server', binName: 'server-b' }];
      writeFileSync(firstPkgPath, JSON.stringify(firstPkg, null, 2));
      writeFileSync(secondPkgPath, JSON.stringify(secondPkg, null, 2));

      await exec(
        'node',
        [
          BIN_PATH,
          'bundle',
          '--package-root',
          workDir,
          '--out',
          'skills',
          '--install-target',
          installDir
        ],
        { timeout: 90_000 }
      );
      await exec(
        'node',
        [
          BIN_PATH,
          'bundle',
          '--package-root',
          secondPackageRoot,
          '--out',
          'skills',
          '--install-target',
          installDir
        ],
        { timeout: 90_000 }
      );

      const functionsRef = readFileSync(
        join(installDir, 'shared-server', 'references', 'functions.md'),
        'utf8'
      );
      expect(existsSync(join(installDir, 'shared-server', 'SKILL.md'))).toBe(true);
      expect(functionsRef).toMatch(/tool-b/);
      expect(functionsRef).not.toMatch(/tool-a/);
    } finally {
      rmSync(secondPackageRoot, { recursive: true, force: true });
    }
  }, 120_000);
});
