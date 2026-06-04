/**
 * Edge-case integration test (T112): a server that exposes ONLY resources —
 * zero tools and zero prompts. Asserts SKILL.md is still produced and either
 * documents the absence of tools or omits the tools section cleanly.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true` so the default `pnpm test` doesn't
 * spawn child Node processes.
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
const FIXTURE_BIN = join(__dirname, '..', 'fixtures', 'zero-tools-server', 'dist', 'server.js');
const BIN_PATH = join(__dirname, '..', '..', 'dist', 'bin.js');
const PKG_NODE_MODULES = join(__dirname, '..', '..', 'node_modules');

describe.skipIf(!RUN)('extract integration: zero-tools server', () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-zerotools-'));
    // The fixture imports `@modelcontextprotocol/sdk` directly. Symlink the
    // mcp package's node_modules so the fixture resolves it without a local
    // install.
    const fixtureNm = join(__dirname, '..', 'fixtures', 'zero-tools-server', 'node_modules');
    if (!existsSync(fixtureNm)) {
      symlinkSync(PKG_NODE_MODULES, fixtureNm, 'dir');
    }
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('produces SKILL.md when the server has resources but no tools', async () => {
    const { stdout } = await exec(
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
        'zero-tools',
        // Resources-only servers fail M3 (no useWhen) which is a warning, not
        // a fatal — but skip-audit removes any noise so we can assert clean
        // stdout.
        '--skip-audit'
      ],
      { timeout: 30_000 }
    );

    expect(stdout).toMatch(/Wrote .*zero-tools.*SKILL\.md/);

    const skillPath = join(outDir, 'zero-tools', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    const content = readFileSync(skillPath, 'utf-8');

    // Resources reference file should be present (the server advertised two).
    expect(existsSync(join(outDir, 'zero-tools', 'references', 'resources.md'))).toBe(true);

    // Tools / functions reference file should NOT be present — there are no tools.
    expect(existsSync(join(outDir, 'zero-tools', 'references', 'tools.md'))).toBe(false);
    expect(existsSync(join(outDir, 'zero-tools', 'references', 'functions.md'))).toBe(false);

    // SKILL.md should not falsely advertise tools. We accept either an explicit
    // empty-tools note or the absence of a tools/functions heading.
    const hasToolsHeading = /^##? Tools/m.test(content) || /^##? Functions/m.test(content);
    if (hasToolsHeading) {
      // If the renderer chose to emit the heading, it must be honest about
      // emptiness rather than listing nonexistent tools.
      expect(content).toMatch(/no tools|none|empty/i);
    } else {
      expect(hasToolsHeading).toBe(false);
    }
  }, 60_000);
});
