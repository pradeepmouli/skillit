/**
 * Integration test for CLI-target extract when the target CLI binary is not
 * present on PATH (Edge Case from T074b).
 *
 * The spec contract: producing a `cli:mcpc` skill is a build-time documentation
 * activity — neither the host nor the consuming agent need `mcpc` installed
 * at extract time. The Setup section the adapter emits tells the consumer
 * how to install it later. This test verifies that promise by spawning the
 * CLI with a `PATH` that excludes any system `mcpc` binary and asserting the
 * extract succeeds and the rendered Setup section carries the install line.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true` like the rest of `tests/integration/`.
 * The barrel-import sanity check runs unconditionally so adapter resolution
 * is exercised on every CI run.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env['RUN_INTEGRATION_TESTS'] === 'true';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');

describe('cli:mcpc extract works without the mcpc binary on PATH', () => {
  it('loads the McpcAdapter from the package barrel (sanity check, ungated)', async () => {
    const mod = await import('@skillit/target-mcpc');
    expect(mod.default).toBeDefined();
    expect((mod.default as { target: string }).target).toBe('cli:mcpc');
  });

  describe.skipIf(!RUN)('full extract subprocess', () => {
    let workDir: string;

    beforeEach(() => {
      workDir = mkdtempSync(join(tmpdir(), 'to-skills-mcp-cli-no-bin-'));
    });

    afterEach(() => {
      rmSync(workDir, { recursive: true, force: true });
    });

    it('extract --invocation cli:mcpc emits a Setup section without requiring mcpc', async () => {
      // PATH explicitly excludes any directory that might contain `mcpc`.
      // /usr/bin:/bin is the POSIX baseline and is reliably present on
      // GitHub Actions runners.
      await exec(
        'node',
        [
          BIN_PATH,
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
          workDir,
          '--skill-name',
          'fs-no-bin'
        ],
        {
          timeout: 90_000,
          env: {
            ...process.env,
            PATH: '/usr/bin:/bin'
          }
        }
      );

      const skillPath = join(workDir, 'fs-no-bin', 'SKILL.md');
      expect(existsSync(skillPath)).toBe(true);
      const content = readFileSync(skillPath, 'utf-8');
      // Setup section is present.
      expect(content).toMatch(/^##\s+Setup/m);
      // Install instructions point at the absent CLI.
      expect(content).toContain('npm install -g mcpc');
      // No mcp: frontmatter (cli:* adapter contract).
      expect(content).not.toMatch(/^mcp:/m);
    }, 120_000);
  });
});
