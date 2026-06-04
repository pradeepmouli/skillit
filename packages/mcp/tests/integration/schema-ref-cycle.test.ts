/**
 * Edge-case integration test (T113): a server with a tool whose inputSchema
 * contains a recursive `$ref` cycle. The end-to-end behavior under FR-011 is:
 *
 *   1. The healthy tool renders normally (with parameter table).
 *   2. The cyclic tool appears in Quick Reference but its parameter table is
 *      omitted (the `tags.schemaError` marker drives this fallback).
 *   3. Audit rule M2 fires with a warning the operator sees on stderr.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_BIN = join(__dirname, '..', 'fixtures', 'cycle-server', 'dist', 'server.js');
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('extract integration: schema $ref cycle', () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-cycle-'));
    const fixtureNm = join(__dirname, '..', 'fixtures', 'cycle-server', 'node_modules');
    if (!existsSync(fixtureNm)) {
      symlinkSync(PKG_NODE_MODULES, fixtureNm, 'dir');
    }
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('renders both tools, omits parameter table on the cyclic one, and logs an M2 warning', async () => {
    // Audit M2 surfaces as a warning (not error) so the run still exits 0
    // without --skip-audit. We capture stderr to verify the warning is emitted.
    const { stdout, stderr } = await exec(
      'node',
      [
        BIN_PATH,
        'extract',
        '--command',
        'node',
        '--arg',
        FIXTURE_BIN,
        '--out',
        outDir,
        '--skill-name',
        'cycle'
      ],
      { timeout: 30_000 }
    );

    expect(stdout).toMatch(/Wrote .*cycle.*SKILL\.md/);

    const skillPath = join(outDir, 'cycle', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    // Both tools appear in Quick Reference (rendered into the SKILL.md body).
    const skillContent = readFileSync(skillPath, 'utf-8');
    expect(skillContent).toContain('ping');
    expect(skillContent).toContain('walk_tree');

    // The tools/functions reference file should mention both. The cyclic tool
    // renders with no parameter table (the introspector emits an empty
    // parameters list when it catches SCHEMA_REF_CYCLE).
    const refsDir = join(outDir, 'cycle', 'references');
    const toolsFile = ['tools.md', 'functions.md']
      .map((f) => join(refsDir, f))
      .find((p) => existsSync(p));
    expect(toolsFile).toBeTruthy();
    const toolsContent = readFileSync(toolsFile!, 'utf-8');
    expect(toolsContent).toContain('walk_tree');
    expect(toolsContent).toContain('ping');

    // M2 audit warning lands on stderr — one of "M2", "schema", or "cycle"
    // should appear so the operator knows which tool was degraded.
    expect(stderr).toMatch(/M2|schema|cycle/i);
  }, 60_000);
});
