/**
 * Integration test: `extract` against `@modelcontextprotocol/server-everything`,
 * the reference server that exposes tools + resources + prompts.
 *
 * Exercises SC-008 (server category 2 of 3 — third-party TypeScript server
 * with the full capability surface).
 *
 * Gated via `RUN_INTEGRATION_TESTS=true`.
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

describe.skipIf(!RUN)('stdio integration: server-everything', () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-everything-'));
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('produces SKILL.md with tools, resources, and prompts references', async () => {
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
        '@modelcontextprotocol/server-everything',
        '--out',
        outDir,
        '--skill-name',
        'everything'
      ],
      { timeout: 60_000 }
    );

    expect(stdout).toMatch(/Wrote .*everything.*SKILL\.md/);

    const skillPath = join(outDir, 'everything', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);

    const content = readFileSync(skillPath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).toBeTruthy();
    const frontmatter = YAML.parse(fmMatch![1]) as {
      name?: string;
      mcp?: Record<string, unknown>;
    };
    expect(frontmatter.name).toBe('everything');
    expect(frontmatter.mcp).toBeTruthy();

    // server-everything advertises all three capability surfaces, so core
    // emits one reference file per category.
    expect(existsSync(join(outDir, 'everything', 'references', 'functions.md'))).toBe(true);
    expect(existsSync(join(outDir, 'everything', 'references', 'resources.md'))).toBe(true);
    expect(existsSync(join(outDir, 'everything', 'references', 'prompts.md'))).toBe(true);
  }, 90_000);
});
