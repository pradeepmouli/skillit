/**
 * Integration test: ts-source-server fixture for build-mode enrichment.
 *
 * Verifies the full Phase 2 build-mode loop against the editable-TS-source
 * fixture at tests/fixtures/ts-source-server:
 *
 *   1. extract()     — spawn dist/server.js, read tools via MCP protocol.
 *   2. discoverTools — confirm src/server.ts has server.tool({ }) options objects.
 *   3. applyFixes()  — inject _meta.toSkills into src/server.ts in-place.
 *   4. Re-read       — assert the injected annotation is present.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true` (same as other integration tests that
 * spawn child processes).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypeScriptMcpRefineSource } from '../../src/refine/build/ts-mcp-source.js';
import { discoverTools } from '../../src/refine/build/tool-discovery.js';

const RUN = process.env['RUN_INTEGRATION_TESTS'] === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'ts-source-server');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('build-mode integration: ts-source-server fixture', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-ts-src-it-'));
    cpSync(FIXTURE_DIR, workDir, { recursive: true });
    symlinkSync(PKG_NODE_MODULES, join(workDir, 'node_modules'), 'dir');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('extract() reads compute and list_items from the compiled server', async () => {
    const refine = new TypeScriptMcpRefineSource({
      transport: {
        type: 'stdio',
        command: 'node',
        args: [join(workDir, 'dist', 'server.js')]
      },
      sourceGlob: join(workDir, 'src', '*.ts'),
      cwd: workDir
    });

    const skill = await refine.extract();
    const names = skill.functions.map((f) => f.name);
    expect(names).toContain('compute');
    expect(names).toContain('list_items');
  }, 30_000);

  it('discoverTools() finds both tool declarations in src/server.ts', () => {
    const srcPath = join(workDir, 'src', 'server.ts');
    const source = readFileSync(srcPath, 'utf8');
    const { tools, warnings } = discoverTools(srcPath, source);

    expect([...tools.keys()]).toContain('compute');
    expect([...tools.keys()]).toContain('list_items');
    // @ts-nocheck comment should not trigger spurious warnings
    expect(warnings).toHaveLength(0);
  });

  it('applyFixes() injects _meta.toSkills annotations into src/server.ts', async () => {
    const refine = new TypeScriptMcpRefineSource({
      transport: {
        type: 'stdio',
        command: 'node',
        args: [join(workDir, 'dist', 'server.js')]
      },
      sourceGlob: join(workDir, 'src', '*.ts'),
      cwd: workDir
    });

    await refine.applyFixes([
      { toolName: 'compute', tag: 'useWhen', value: 'Computing a value from a string input.' },
      { toolName: 'list_items', tag: 'useWhen', value: 'Listing all available items.' }
    ]);

    const patched = readFileSync(join(workDir, 'src', 'server.ts'), 'utf8');
    expect(patched).toContain("useWhen: 'Computing a value from a string input.'");
    expect(patched).toContain("useWhen: 'Listing all available items.'");
    // Original description should still be present
    expect(patched).toContain("description: 'Compute a result from the given input.'");
  }, 30_000);
});
