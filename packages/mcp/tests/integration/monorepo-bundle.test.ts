/**
 * Integration test (T098) — US6 AC4: sibling packages bundle independently.
 *
 * Two sibling packages, each with its own `skillit.mcp` config and its own
 * stdio MCP server, are bundled in sequence via the programmatic
 * `bundleMcpSkill` API. Asserts:
 *
 *   1. Each package gets its own `<packageRoot>/skills/<skillName>/SKILL.md`.
 *   2. The two skills directories live under their respective package roots —
 *      neither bundle leaks output into the other package's tree (US6 AC4 —
 *      no collision in monorepo / sibling-package layouts).
 *   3. Each frontmatter's `mcp:` block self-references its own package name
 *      via `npx -y <packageName>` (FR-033), proving the bundle re-resolved
 *      the host package.json each call.
 *
 * Builds both fixture packages by copying the existing `fake-server-package`
 * fixture twice into a tmpdir and rewriting `package.json#name` and
 * `skillit.mcp.skillName` for each copy. Symlinks the parent package's
 * `node_modules` into each copy so the hand-written stdio server can resolve
 * `@modelcontextprotocol/sdk`.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
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
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bundleMcpSkill } from '../../src/index.js';

const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'fake-server-package');
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

/**
 * Materialize a sibling package by copying the canonical fake-server fixture
 * and rewriting its package.json identity.
 */
function makePackage(parent: string, dirName: string, pkgName: string, skillName: string): string {
  const root = join(parent, dirName);
  cpSync(FIXTURE_DIR, root, { recursive: true });
  // Symlink node_modules so the hand-written server can resolve @mcp/sdk.
  symlinkSync(PKG_NODE_MODULES, join(root, 'node_modules'), 'dir');
  // Rewrite package.json: name + skillName.
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
    name: string;
    skillit?: { mcp?: { skillName?: string } };
  };
  pkg.name = pkgName;
  if (pkg['skillit']?.mcp) pkg['skillit'].mcp.skillName = skillName;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return root;
}

describe.skipIf(!RUN)('monorepo bundle — sibling packages stay isolated (US6 AC4)', () => {
  let workDir: string;
  let pkgA: string;
  let pkgB: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-monorepo-bundle-'));
    pkgA = makePackage(workDir, 'pkg-a', '@fixture/sibling-a', 'sibling-a');
    pkgB = makePackage(workDir, 'pkg-b', '@fixture/sibling-b', 'sibling-b');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('runs bundleMcpSkill from each package root in sequence without collision', async () => {
    // 1. Bundle package A.
    const resultA = await bundleMcpSkill({ packageRoot: pkgA });
    expect(resultA.failures).toEqual({});
    expect(resultA.skills['sibling-a']).toBeDefined();

    // 2. Bundle package B.
    const resultB = await bundleMcpSkill({ packageRoot: pkgB });
    expect(resultB.failures).toEqual({});
    expect(resultB.skills['sibling-b']).toBeDefined();

    // 3. Each package owns its own skills/ tree.
    const skillAPath = join(pkgA, 'skills', 'sibling-a', 'SKILL.md');
    const skillBPath = join(pkgB, 'skills', 'sibling-b', 'SKILL.md');
    expect(existsSync(skillAPath)).toBe(true);
    expect(existsSync(skillBPath)).toBe(true);

    // 4. Cross-leak check — neither package's tree contains the other's skill.
    expect(existsSync(join(pkgA, 'skills', 'sibling-b'))).toBe(false);
    expect(existsSync(join(pkgB, 'skills', 'sibling-a'))).toBe(false);

    // 5. Frontmatter self-reference — each carries its own packageName.
    const fmA = readFrontmatter(skillAPath);
    expect(fmA.mcp?.['sibling-a']?.command).toBe('npx');
    expect(fmA.mcp?.['sibling-a']?.args).toEqual(['-y', '@fixture/sibling-a']);

    const fmB = readFrontmatter(skillBPath);
    expect(fmB.mcp?.['sibling-b']?.command).toBe('npx');
    expect(fmB.mcp?.['sibling-b']?.args).toEqual(['-y', '@fixture/sibling-b']);
  }, 180_000);
});
