/**
 * Integration test (T089): unknown CLI target produces exit 5 with a
 * helpful "Installed adapters:" hint listing the resolvable targets.
 *
 * Spawns:
 *   node dist/bin.js extract --command echo --invocation cli:nonexistent
 *
 * The `--command echo` is harmless because target validation runs eagerly
 * (T081) BEFORE any extract spawn — so the test never actually launches an
 * MCP server. Asserts:
 *
 *   1. Exit code 5 (UNKNOWN_TARGET / ADAPTER_NOT_FOUND map to 5 per bin.ts).
 *   2. stderr includes the "Installed adapters:" hint.
 *   3. The hint enumerates `mcp-protocol`, `cli:mcpc`, `cli:fastmcp` (the
 *      three known adapter packages currently shipped in the workspace).
 *   4. stderr includes the npm-install suggestion.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';
const __dirname = dirname(fileURLToPath(import.meta.url));

interface ExecError extends Error {
  code?: number;
  stdout?: string;
  stderr?: string;
}

describe.skipIf(!RUN)('cli-target-unknown: extract --invocation cli:nonexistent', () => {
  it('exits 5 with an Installed-adapters hint listing the shipped targets', async () => {
    const binPath = join(__dirname, '..', '..', 'dist', 'bin.js');

    let err: ExecError | undefined;
    await new Promise<void>((resolve) => {
      execFile(
        'node',
        [
          binPath,
          'extract',
          '--command',
          'echo',
          '--invocation',
          'cli:nonexistent',
          '--out',
          // OK to pass an arbitrary --out: validation fires before any IO.
          'unused-output-dir'
        ],
        { timeout: 30_000 },
        (e, stdout, stderr) => {
          if (e) {
            const ee = e as ExecError;
            ee.stdout = stdout?.toString();
            ee.stderr = stderr?.toString();
            err = ee;
          }
          resolve();
        }
      );
    });

    // 1. Non-zero exit code 5 (the loader's UNKNOWN_TARGET / ADAPTER_NOT_FOUND
    // both map to 5 per bin.ts).
    expect(err).toBeDefined();
    expect(err!.code).toBe(5);

    // 2 + 3 + 4. stderr text shape.
    const stderr = err!.stderr ?? '';
    expect(stderr).toContain('Installed adapters:');
    // The three workspace-resolvable adapters should appear in the hint.
    expect(stderr).toContain('mcp-protocol');
    expect(stderr).toContain('cli:mcpc');
    expect(stderr).toContain('cli:fastmcp');
    // npm-install pointer.
    expect(stderr).toContain('npm install @skillit/target-');
  }, 45_000);
});
