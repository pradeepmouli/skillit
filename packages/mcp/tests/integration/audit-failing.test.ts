/**
 * Integration test (T107): bundle a fixture server whose tools have blank
 * descriptions and assert the audit-driven exit code policy.
 *
 * Asserts:
 *   1. Default audit (no --skip-audit) → exit code 3 (AUDIT_FAILED).
 *   2. With --skip-audit → exit code 0.
 *   3. Either way the SKILL.md is still written — audit is a post-hoc check;
 *      we don't refuse to render. Operators who want strict refusal can
 *      compose `bundle && grep -q '...'` or read WrittenSkill.audit.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true` so the default `pnpm test` doesn't
 * spawn child Node processes.
 */
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'audit-failing-package');
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('bundle integration: audit-failing-package', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-audit-it-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('exits 3 (AUDIT_FAILED) when tools have blank descriptions and --skip-audit is NOT passed', async () => {
    let exitCode = 0;
    try {
      await exec('node', [BIN_PATH, 'bundle', '--package-root', workDir, '--out', 'skills'], {
        timeout: 60_000
      });
    } catch (err) {
      // execFile throws on non-zero; the caught error carries `code`.
      const e = err as NodeJS.ErrnoException & { code?: unknown };
      exitCode = typeof e.code === 'number' ? e.code : 1;
    }
    expect(exitCode).toBe(3);

    // SKILL.md is still written — audit is post-hoc.
    expect(existsSync(join(workDir, 'skills', 'audit-failing-server', 'SKILL.md'))).toBe(true);
  }, 90_000);

  it('exits 0 when --skip-audit is passed, even with the same broken fixture', async () => {
    const { stdout } = await exec(
      'node',
      [BIN_PATH, 'bundle', '--package-root', workDir, '--out', 'skills', '--skip-audit'],
      { timeout: 60_000 }
    );
    expect(stdout).toMatch(/Wrote .*audit-failing-server.*SKILL\.md/);
    expect(existsSync(join(workDir, 'skills', 'audit-failing-server', 'SKILL.md'))).toBe(true);
  }, 90_000);
});
