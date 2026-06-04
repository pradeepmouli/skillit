/**
 * Integration test (T056, FR-H013, US9, SC-H008): HTTP `--header` end-to-end.
 *
 * Spins up the in-process mock SSE server with `authToken: 'test-token'`,
 * then runs the *built* CLI (`dist/bin.js extract --url ... --header ...`) as
 * a child process. Verifies the CLI threads `--header` through the
 * `extractMcpSkill` HTTP transport so the server-side auth gate passes.
 *
 * Two variants:
 *   1. Header present → exit 0, SKILL.md written, server's bearer check passes.
 *   2. Header absent  → non-zero exit, server returns 401, surfaced as
 *      INITIALIZE_FAILED (no protocol fallback for auth errors).
 *
 * Closes the gap flagged in PR 20 review: prior coverage existed only at the
 * `extractMcpSkill()` API boundary (`tests/unit/http-extract.test.ts`) — no
 * test exercised the CLI flag-parsing and transport-options plumbing.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type MockSseServer, startMockSseServer } from '../fixtures/mock-sse-server.js';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');

describe.skipIf(!RUN)('CLI --header end-to-end (FR-H013, US9)', () => {
  let server: MockSseServer | undefined;
  let outDir: string;

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-http-header-it-'));
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
    rmSync(outDir, { recursive: true, force: true });
  });

  it('threads --header through to the HTTP transport (auth passes)', async () => {
    server = await startMockSseServer({
      authToken: 'test-token',
      serverInfo: { name: 'authed-mock', version: '0.0.0' },
      capabilities: { tools: true },
      tools: [{ name: 'echo', description: 'Echo back' }]
    });

    // The mock server returns 401 if Authorization isn't `Bearer test-token`,
    // which extract.ts surfaces as INITIALIZE_FAILED → exit code 4. So a
    // successful run here proves the CLI's --header flag reached the wire.
    const { stdout } = await exec(
      'node',
      [
        BIN_PATH,
        'extract',
        '--url',
        server.url,
        '--header',
        'Authorization=Bearer test-token',
        '--out',
        outDir,
        '--skill-name',
        'authed-mock'
      ],
      { timeout: 30_000 }
    );

    expect(stdout).toMatch(/Wrote .*authed-mock.*SKILL\.md/);
    expect(existsSync(join(outDir, 'authed-mock', 'SKILL.md'))).toBe(true);
  }, 45_000);

  it('exits non-zero when --header is omitted (server returns 401)', async () => {
    server = await startMockSseServer({
      authToken: 'test-token',
      capabilities: { tools: true },
      tools: [{ name: 'echo', description: 'Echo back' }]
    });

    // Negative variant: same server, no --header. Expect a non-zero exit and
    // an auth/initialize-related error on stderr. We don't pin the exact
    // exit code because the SDK has classified 401 differently across
    // versions (INITIALIZE_FAILED vs TRANSPORT_FAILED) — what matters is
    // that the CLI surfaces the failure rather than silently producing a
    // (broken) skill.
    const url = server.url;
    let caught: { code?: number; stderr?: string } | undefined;
    try {
      await exec(
        'node',
        [BIN_PATH, 'extract', '--url', url, '--out', outDir, '--skill-name', 'unauthed'],
        { timeout: 30_000 }
      );
    } catch (err) {
      caught = err as { code?: number; stderr?: string };
    }

    expect(caught).toBeTruthy();
    expect(caught!.code).toBeGreaterThan(0);
    expect(caught!.stderr ?? '').toMatch(/INITIALIZE_FAILED|TRANSPORT_FAILED|401|Unauthorized/i);
    expect(existsSync(join(outDir, 'unauthed', 'SKILL.md'))).toBe(false);
  }, 45_000);
});
