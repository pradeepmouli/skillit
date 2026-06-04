/**
 * Integration test (T067a): bundle is content-identical across two runs.
 *
 * Exercises the FR-038 / SC-009 idempotency guarantee (post-canonicalization).
 * Runs `bundleMcpSkill` programmatically twice against the fake-server-package
 * fixture and asserts SHA-256 of `SKILL.md` and each `references/*.md` matches
 * across runs.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`: the fixture spawns a real child
 * Node process during extract, so this test is integration-y even though
 * the bundle orchestrator itself is in-process.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'fake-server-package');
// Symlinked into each tmpdir copy so the fixture's `import
// '@modelcontextprotocol/sdk'` resolves — see bundle-basic.test.ts for context.
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

function sha256(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function snapshotSkill(skillDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  out['SKILL.md'] = sha256(join(skillDir, 'SKILL.md'));
  const refDir = join(skillDir, 'references');
  for (const file of readdirSync(refDir)) {
    out[`references/${file}`] = sha256(join(refDir, file));
  }
  return out;
}

describe.skipIf(!RUN)('bundle integration: idempotency', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-bundle-idem-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('two bundle runs produce content-identical output (SHA-256 match)', async () => {
    const { bundleMcpSkill } = await import('../../src/bundle.js');

    const r1 = await bundleMcpSkill({ packageRoot: workDir });
    expect(r1.failures).toEqual({});
    const skillDir = join(workDir, 'skills', 'my-server');
    const snap1 = snapshotSkill(skillDir);

    // Run again — bundleMcpSkill calls writeSkills which rmSyncs and rewrites.
    const r2 = await bundleMcpSkill({ packageRoot: workDir });
    expect(r2.failures).toEqual({});
    const snap2 = snapshotSkill(skillDir);

    expect(snap2).toEqual(snap1);
  }, 120_000);
});
