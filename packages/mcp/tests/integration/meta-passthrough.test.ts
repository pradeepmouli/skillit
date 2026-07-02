/**
 * Integration test (T103): bundle against the meta-server-package fixture
 * and assert that per-tool `_meta` annotations are rendered through to SKILL.md.
 *
 * Verifies the end-to-end Phase 9 / US7 path:
 *   1. Exit code 0; SKILL.md written.
 *   2. The "When to Use" section lists per-tool useWhen entries (under the
 *      "Use this skill when:" sub-heading produced by core's renderer).
 *   3. The "Do NOT use when:" sub-heading lists per-tool avoidWhen entries.
 *   4. The "## NEVER" section lists per-tool pitfall entries.
 *
 * Note on server-level `_meta`: the SDK's `ImplementationSchema`
 * (`z.object` with $strip semantics in Zod 4) silently drops unknown keys
 * including `_meta` during initialize-response validation, so server-level
 * `_meta` annotations do not currently survive the round-trip through SDK
 * 1.29.0. The reader in `extract.ts` is implemented for forward-compat (and
 * unit-tested with mocked `getServerVersion()`); this integration test
 * focuses on per-tool meta which the `Tool` schema (loose) preserves.
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'meta-server-package');
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');
// Symlink the parent package's node_modules into the tmpdir copy so the
// fixture's `import '@modelcontextprotocol/sdk/...'` resolves — same trick as
// bundle-basic.test.ts.
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('bundle integration: meta-server-package (_meta passthrough)', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-meta-it-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('renders SKILL.md sections sourced from tool-level _meta', async () => {
    const { stdout } = await exec(
      'node',
      [BIN_PATH, 'bundle', '--package-root', workDir, '--out', 'skills'],
      { timeout: 60_000 }
    );
    expect(stdout).toMatch(/Wrote .*meta-server.*SKILL\.md/);

    const skillPath = join(workDir, 'skills', 'meta-server', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const body = readFileSync(skillPath, 'utf-8');

    // "When to Use" section heading present, with the per-tool useWhen entry
    // aggregated by extract.ts onto skill.useWhen.
    expect(body).toMatch(/## When to Use/);
    expect(body).toMatch(/Use this skill when:/);
    expect(body).toMatch(/Computing a value from a string input/);

    // "Do NOT use when:" sub-section content from per-tool avoidWhen.
    expect(body).toMatch(/Do NOT use when:/);
    expect(body).toMatch(/Inputs longer than 1KB/);

    // NEVER section heading + per-tool pitfall entry.
    expect(body).toMatch(/## NEVER/);
    expect(body).toMatch(/NEVER pass binary data — compute expects UTF-8 text/);
  }, 90_000);
});
