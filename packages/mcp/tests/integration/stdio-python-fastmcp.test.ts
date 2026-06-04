/**
 * Integration test: `extract` against a minimal FastMCP-based Python server.
 *
 * Exercises SC-008 (server category 3 of 3 — Python / FastMCP). Gated via
 * both `RUN_INTEGRATION_TESTS=true` AND `HAS_FASTMCP=1` so the test skips
 * cleanly on machines without a FastMCP install. Also skips if `python`
 * is not on PATH.
 *
 * The fixture server lives at `tests/fixtures/py-server/server.py`.
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';
const HAS_FASTMCP = process.env.HAS_FASTMCP === '1';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Probe whether `python` (or `python3`) is on PATH and runnable. We don't
 * attempt to detect which one FastMCP is installed under — caller sets
 * `HAS_FASTMCP=1` explicitly when the environment is known-good.
 */
function hasPython(): boolean {
  for (const bin of ['python3', 'python']) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

function pickPython(): string {
  for (const bin of ['python3', 'python']) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
      return bin;
    } catch {
      /* try next */
    }
  }
  return 'python'; // unreachable when describe.skipIf is honored
}

const shouldRun = RUN && HAS_FASTMCP && hasPython();

describe.skipIf(!shouldRun)('stdio integration: python fastmcp fixture', () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-py-'));
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('produces SKILL.md from the FastMCP fixture', async () => {
    const binPath = join(__dirname, '..', '..', 'dist', 'bin.js');
    const serverPath = join(__dirname, '..', 'fixtures', 'py-server', 'server.py');
    const python = pickPython();

    const { stdout } = await exec(
      'node',
      [
        binPath,
        'extract',
        '--command',
        python,
        '--arg',
        serverPath,
        '--out',
        outDir,
        '--skill-name',
        'py-test-server'
      ],
      { timeout: 60_000 }
    );

    expect(stdout).toMatch(/Wrote .*py-test-server.*SKILL\.md/);
    expect(existsSync(join(outDir, 'py-test-server', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(outDir, 'py-test-server', 'references', 'functions.md'))).toBe(true);
  }, 90_000);
});
