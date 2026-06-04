/**
 * Integration test (T067): `bundle` against the fake-server-package fixture.
 *
 * Asserts the end-to-end bundle pipeline:
 *   1. Exit code 0.
 *   2. `<tmpdir>/skills/my-server/SKILL.md` written.
 *   3. Frontmatter contains the npx-by-name self-reference (FR-033):
 *      `mcp.my-server.command === 'npx'`,
 *      `mcp.my-server.args === ['-y', '@fixture/my-mcp-server']`.
 *   4. `references/functions.md` documents the `echo` tool.
 *   5. The fixture's `package.json` is byte-identical before and after
 *      (FR-035: never mutate the host package.json).
 *
 * Gated via `RUN_INTEGRATION_TESTS=true` so the default `pnpm test` doesn't
 * spawn child Node processes.
 */
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'fake-server-package');
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');
// The fixture's `dist/server.js` imports `@modelcontextprotocol/sdk`. When the
// fixture is copied into a tmpdir, Node can't resolve that package from the
// tmpdir's nonexistent node_modules. Symlink the parent package's node_modules
// into the tmpdir copy so module resolution succeeds without bloating fixture
// storage.
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('bundle integration: fake-server-package', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-bundle-it-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('writes SKILL.md with npx-by-name frontmatter, never mutates package.json', async () => {
    const pkgPath = join(workDir, 'package.json');
    const pkgBefore = readFileSync(pkgPath);

    const { stdout } = await exec(
      'node',
      [BIN_PATH, 'bundle', '--package-root', workDir, '--out', 'skills'],
      { timeout: 60_000 }
    );
    expect(stdout).toMatch(/Wrote .*my-server.*SKILL\.md/);

    // 2. SKILL.md exists.
    const skillPath = join(workDir, 'skills', 'my-server', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    // 3. Frontmatter — npx-by-name self-reference (FR-033).
    const content = readFileSync(skillPath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).toBeTruthy();
    const frontmatter = YAML.parse(fmMatch![1]) as {
      mcp?: Record<string, { command?: string; args?: string[] }>;
    };
    expect(frontmatter.mcp).toBeTruthy();
    expect(frontmatter.mcp!['my-server']?.command).toBe('npx');
    expect(frontmatter.mcp!['my-server']?.args).toEqual(['-y', '@fixture/my-mcp-server']);

    // 4. echo tool documented in references/functions.md.
    const toolsRef = join(workDir, 'skills', 'my-server', 'references', 'functions.md');
    expect(existsSync(toolsRef)).toBe(true);
    expect(readFileSync(toolsRef, 'utf-8')).toMatch(/echo/);

    // 5. package.json byte-identical (no mutation).
    const pkgAfter = readFileSync(pkgPath);
    expect(pkgAfter.equals(pkgBefore)).toBe(true);
  }, 90_000);
});
