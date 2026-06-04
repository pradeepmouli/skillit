/**
 * Integration test (T069): files-field warning is non-fatal.
 *
 * Copies the fake-server-package fixture, mutates its `package.json` to drop
 * `skills` from `files`, then runs `bundleMcpSkill` programmatically. Asserts:
 *   - `BundleResult.packageJsonWarnings` includes the "skills" entry.
 *   - The skill directory was still written (warning is non-fatal).
 *   - `package.json` is byte-identical before/after (FR-035: never mutate).
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'fake-server-package');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('bundle integration: files-field warning', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-bundle-fw-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
    // Rewrite package.json with `files` omitting "skills".
    const pkgPath = join(workDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { files?: string[] };
    pkg.files = ['dist', 'README.md'];
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('surfaces the warning, still writes the skill, and never mutates package.json', async () => {
    const { bundleMcpSkill } = await import('../../src/bundle.js');
    const pkgPath = join(workDir, 'package.json');
    // pkgBefore captures the post-beforeEach state (files = ["dist","README.md"]).
    // The assertion below verifies bundleMcpSkill itself doesn't write package.json.
    // It also catches a regression where bundleMcpSkill might "helpfully" restore
    // the original `files` array — that would change pkgAfter and fail.
    const pkgBefore = readFileSync(pkgPath);
    // Sanity: the snapshot reflects the mutated form (no "skills" entry yet).
    expect(pkgBefore.toString('utf-8')).not.toContain('"skills"');

    const result = await bundleMcpSkill({ packageRoot: workDir });

    expect(result.failures).toEqual({});
    // Warning was surfaced.
    expect(result.packageJsonWarnings.some((w) => w.includes('"skills"'))).toBe(true);
    // Skill was still written.
    expect(existsSync(join(workDir, 'skills', 'my-server', 'SKILL.md'))).toBe(true);
    // package.json byte-identical with our pre-bundle snapshot — proves
    // bundleMcpSkill never touched the file even though the warning surfaced
    // a missing entry it could have "fixed" (FR-035).
    const pkgAfter = readFileSync(pkgPath);
    expect(pkgAfter.equals(pkgBefore)).toBe(true);
  }, 120_000);
});
