/**
 * Integration test (T095): partial failure during config-file batch extract.
 *
 * Config has two entries:
 *   - `ok`     — `npx -y @modelcontextprotocol/server-filesystem /tmp` (live).
 *   - `broken` — `/this/path/does/not/exist` (spawn ENOENT → TRANSPORT_FAILED).
 *
 * Asserts:
 *   1. Exit code is non-zero — TRANSPORT_FAILED maps to exit 2 in bin.ts.
 *   2. The healthy `ok/` skill IS produced.
 *   3. Stderr names `broken` along with the error code (`Failed [TRANSPORT_FAILED] broken`).
 *   4. The terminal "1 entry failed" summary surfaces.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';
const __dirname = dirname(fileURLToPath(import.meta.url));

interface ExecError extends Error {
  code?: number | string;
  stdout?: string;
  stderr?: string;
}

/**
 * Execute the built CLI and return ALL of {stdout, stderr, exit code} —
 * `execFile`'s promisified form rejects on non-zero exit so we wrap it in a
 * Promise that resolves either way and surfaces the error fields.
 */
function runCli(
  args: string[],
  opts: { timeout: number }
): Promise<{
  stdout: string;
  stderr: string;
  code: number | null;
}> {
  return new Promise((resolve, reject) => {
    execFile('node', args, { timeout: opts.timeout }, (err, stdout, stderr) => {
      if (err) {
        const exitCode = (err as ExecError).code;
        if (typeof exitCode === 'number') {
          resolve({ stdout, stderr, code: exitCode });
          return;
        }
        // execFile populates `code` as a string for signal-induced exits and
        // null for clean exits; fall back to the err object so the test can
        // surface the spawn failure rather than masking it as exit 0.
        reject(err);
        return;
      }
      resolve({ stdout, stderr, code: 0 });
    });
  });
}

describe.skipIf(!RUN)('config-file batch extract: partial failure', () => {
  let workDir: string;
  let outDir: string;
  let configPath: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-cfg-partial-'));
    outDir = join(workDir, 'out');
    configPath = join(workDir, 'mcp.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          ok: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
          },
          broken: {
            command: '/this/path/does/not/exist'
          }
        }
      })
    );
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('produces the healthy skill, names the broken entry, exits non-zero', async () => {
    const binPath = join(__dirname, '..', '..', 'dist', 'bin.js');
    const result = await runCli([binPath, 'extract', '--config', configPath, '--out', outDir], {
      timeout: 180_000
    });

    // 1. Exit non-zero. TRANSPORT_FAILED maps to exit 2 per bin.ts; we
    //    assert non-zero rather than literal 2 so adjacent code reshuffles
    //    don't churn the test.
    expect(result.code).not.toBe(0);

    // 2. Healthy entry still produced.
    expect(existsSync(join(outDir, 'ok', 'SKILL.md'))).toBe(true);
    // 3. Failing entry is NOT in the output.
    expect(existsSync(join(outDir, 'broken'))).toBe(false);

    // 4. Stderr names the failing entry with its code + carries the summary
    //    line.
    expect(result.stderr).toMatch(/Failed \[TRANSPORT_FAILED\] broken/);
    expect(result.stderr).toMatch(/1 entry failed/);
  }, 240_000);
});
