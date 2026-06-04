/**
 * Integration test (T057, FR-H013, US9, SC-H008): bundle multi-target.
 *
 * Runs `bundle --invocation mcp-protocol --invocation cli:mcpc` against the
 * `fake-server-package` fixture and asserts BOTH disambiguated output dirs
 * exist with the right frontmatter shape:
 *   - `<skillName>-mcp-protocol/SKILL.md` has an `mcp:` block (native target)
 *   - `<skillName>-cli-mcpc/SKILL.md` has a `generated-by:` block, NO `mcp:`
 *
 * Closes the gap flagged in PR 20 review: bundle's multi-target path was
 * exercised end-to-end only in extract mode (`multi-target.test.ts`) and
 * single-target in bundle mode (`cli-target-bundle.test.ts`) — but the
 * cross-product (bundle × multiple invocations) had no integration coverage.
 *
 * Reuses the bundle-basic / cli-target-bundle fixture pattern (cpSync +
 * symlinked node_modules) so the fixture's compiled MCP server can resolve
 * `@modelcontextprotocol/sdk` from the parent package's installed deps.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
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
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('bundle integration: multi-target {mcp-protocol, cli:mcpc}', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'to-skills-mcp-bundle-multi-it-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('produces two disambiguated skill dirs with target-specific frontmatter', async () => {
    const { stdout } = await exec(
      'node',
      [
        BIN_PATH,
        'bundle',
        '--package-root',
        workDir,
        '--out',
        'skills',
        '--invocation',
        'mcp-protocol',
        '--invocation',
        'cli:mcpc'
      ],
      { timeout: 60_000 }
    );

    // Each target prints its own "Wrote" line.
    expect(stdout).toMatch(/Wrote .*my-server-mcp-protocol.*SKILL\.md/);
    expect(stdout).toMatch(/Wrote .*my-server-cli-mcpc.*SKILL\.md/);

    // Disambiguated dirs (FR-IT-009: `:` → `-`).
    const mcpDir = join(workDir, 'skills', 'my-server-mcp-protocol');
    const cliDir = join(workDir, 'skills', 'my-server-cli-mcpc');
    expect(existsSync(mcpDir)).toBe(true);
    expect(existsSync(cliDir)).toBe(true);

    const mcpSkill = join(mcpDir, 'SKILL.md');
    const cliSkill = join(cliDir, 'SKILL.md');
    expect(existsSync(mcpSkill)).toBe(true);
    expect(existsSync(cliSkill)).toBe(true);

    // mcp-protocol frontmatter: has `mcp:`, no `generated-by:` adapter override.
    const mcpContent = readFileSync(mcpSkill, 'utf-8');
    const mcpFmMatch = mcpContent.match(/^---\n([\s\S]*?)\n---/);
    expect(mcpFmMatch).toBeTruthy();
    const mcpFm = YAML.parse(mcpFmMatch![1]!) as {
      mcp?: Record<string, unknown>;
      'generated-by'?: { adapter?: string };
    };
    expect(mcpFm.mcp).toBeTruthy();
    // Sanity check: the mcp: block keys an entry under the (disambiguated)
    // skill name so consumers know which `claude mcp add` line to run. We
    // don't pin the inner shape — the surrounding `mcp:` block being present
    // is the load-bearing assertion for the native target.
    expect(Object.keys(mcpFm.mcp!)).toHaveLength(1);
    expect(mcpFm.mcp).toHaveProperty('my-server-mcp-protocol');

    // cli:mcpc frontmatter: has `generated-by:` (adapter+version), no `mcp:`.
    const cliContent = readFileSync(cliSkill, 'utf-8');
    const cliFmMatch = cliContent.match(/^---\n([\s\S]*?)\n---/);
    expect(cliFmMatch).toBeTruthy();
    const cliFm = YAML.parse(cliFmMatch![1]!) as {
      mcp?: unknown;
      'generated-by'?: { adapter?: string; version?: string };
    };
    expect(cliFm['generated-by']).toBeTruthy();
    expect(cliFm['generated-by']!.adapter).toBe('@skillit/target-mcpc');
    expect(typeof cliFm['generated-by']!.version).toBe('string');
    expect(cliFm.mcp).toBeUndefined();

    // Adapter-specific reference filenames also disambiguate by target.
    expect(existsSync(join(mcpDir, 'references', 'functions.md'))).toBe(true);
    expect(existsSync(join(cliDir, 'references', 'tools.md'))).toBe(true);
  }, 90_000);
});
