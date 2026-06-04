/**
 * Integration test: `extract` against
 * `npx -y @modelcontextprotocol/server-filesystem /tmp` and verify the
 * resulting skill directory.
 *
 * Requires network access on first run (npx fetches the server package).
 * Gated via `RUN_INTEGRATION_TESTS=true`; skipped by default so normal
 * `pnpm test` runs don't require network.
 *
 * The test invokes `node <pkg>/dist/bin.js`, so the package must be built
 * before these tests run. The `pretest:integration` npm script handles that;
 * run via `pnpm --filter @skillit/mcp run test:integration`.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe.skipIf(!RUN)('stdio integration: server-filesystem', () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-it-'));
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('produces SKILL.md with mcp: frontmatter and references', async () => {
    const binPath = join(__dirname, '..', '..', 'dist', 'bin.js');
    const { stdout } = await exec(
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
        '--out',
        outDir,
        '--skill-name',
        'filesystem'
      ],
      { timeout: 60_000 }
    );

    expect(stdout).toMatch(/Wrote .*filesystem.*SKILL\.md/);

    const skillPath = join(outDir, 'filesystem', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    const content = readFileSync(skillPath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).toBeTruthy();
    const frontmatter = YAML.parse(fmMatch![1]) as {
      name?: string;
      mcp?: Record<string, { command?: string }>;
    };
    expect(frontmatter.name).toBe('filesystem');
    expect(frontmatter.mcp).toBeTruthy();
    // `mcp:` frontmatter is keyed by skill name per emitMcpFrontmatter.
    expect(frontmatter.mcp!.filesystem?.command).toBe('npx');

    const toolsRef = join(outDir, 'filesystem', 'references', 'functions.md');
    expect(existsSync(toolsRef)).toBe(true);
  }, 90_000);
});
