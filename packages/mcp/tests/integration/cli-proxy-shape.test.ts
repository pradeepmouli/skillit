/**
 * Integration test (T088a sanity check): cli:mcpc extract emits a tools.md
 * whose command shape matches the documented mcpc syntax (SC-010 spirit
 * without requiring the live mcpc binary).
 *
 * The full SC-010 e2e test — installing mcpc into a temp env and exercising
 * `mcpc connect` + `mcpc <skill> tools-call ...` end-to-end — lives in
 * `tests/e2e/cli-proxy.test.ts` as a stubbed describe.skipIf(true) test.
 * That test is heavy (network + mcpc install + live MCP server) and not
 * suitable for default CI even with RUN_INTEGRATION_TESTS=true.
 *
 * This sanity-check just validates the shape of the rendered command string,
 * which is the primary contract the user/agent relies on.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe.skipIf(!RUN)('cli-proxy shape: tools.md follows documented mcpc syntax', () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-cli-shape-'));
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('emits `mcpc <skillName> tools-call <tool>` lines for each tool', async () => {
    const binPath = join(__dirname, '..', '..', 'dist', 'bin.js');
    await exec(
      'node',
      [
        binPath,
        'extract',
        '--command',
        'npx',
        '--arg',
        '-y',
        '--arg',
        '@modelcontextprotocol/server-filesystem',
        '--arg',
        '/tmp',
        '--invocation',
        'cli:mcpc',
        '--out',
        outDir,
        '--skill-name',
        'fs-shape'
      ],
      { timeout: 60_000 }
    );

    const toolsRef = join(outDir, 'fs-shape', 'references', 'tools.md');
    expect(existsSync(toolsRef)).toBe(true);

    const content = readFileSync(toolsRef, 'utf-8');
    // Documented shape: `mcpc <skillName> tools-call <tool>` on its own line
    // (the adapter wraps each tool's command line in a fenced ```sh block).
    const shapeRegex = /^mcpc\s+fs-shape\s+tools-call\s+\S+/m;
    expect(content).toMatch(shapeRegex);

    // The adapter also documents per-tool sections — at least one well-known
    // server-filesystem tool should appear.
    expect(content).toMatch(/^mcpc\s+fs-shape\s+tools-call\s+(list_directory|read_file)/m);

    // `mcpc connect <skillName> --` setup hint is in SKILL.md, NOT tools.md.
    // Verify the tools.md stays focused on tool invocations.
    expect(content).not.toContain('mcpc connect');
  }, 90_000);
});
