/**
 * Integration test (T094): batch extract from a Claude-Desktop-shaped
 * `mcp.json` with three entries — `filesystem` (live stdio), `everything`
 * (live stdio), and `disabled-server` (skipped via `disabled: true`).
 *
 * Asserts:
 *   1. Exit code 0 (all enabled entries succeed).
 *   2. Two skill directories produced: `filesystem/` and `everything/`.
 *   3. The `disabled-server/` directory does NOT exist.
 *   4. Each SKILL.md carries the canonical `mcp:` frontmatter block keyed
 *      by the entry's `mcpServers` map key.
 *
 * Gated via `RUN_INTEGRATION_TESTS=true` so the default `pnpm test` doesn't
 * spawn npx. Built CLI is invoked via `node <pkg>/dist/bin.js`.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe.skipIf(!RUN)('config-file batch extract: 3-server config (1 disabled)', () => {
  let workDir: string;
  let outDir: string;
  let configPath: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-cfg-batch-'));
    outDir = join(workDir, 'out');
    configPath = join(workDir, 'mcp.json');

    const config = {
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp']
        },
        everything: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-everything']
        },
        'disabled-server': {
          command: 'node',
          args: ['./does-not-matter.js'],
          disabled: true
        }
      }
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('writes 2 skills, skips the disabled entry, exits 0', async () => {
    const binPath = join(__dirname, '..', '..', 'dist', 'bin.js');
    const { stdout } = await exec(
      'node',
      [binPath, 'extract', '--config', configPath, '--out', outDir],
      { timeout: 180_000 }
    );

    expect(stdout).toMatch(/Wrote .*filesystem.*SKILL\.md/);
    expect(stdout).toMatch(/Wrote .*everything.*SKILL\.md/);

    expect(existsSync(join(outDir, 'filesystem', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(outDir, 'everything', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(outDir, 'disabled-server'))).toBe(false);

    // Frontmatter sanity: `mcp:` block keyed by entry name.
    const fsContent = readFileSync(join(outDir, 'filesystem', 'SKILL.md'), 'utf-8');
    const fsFmMatch = fsContent.match(/^---\n([\s\S]*?)\n---/);
    expect(fsFmMatch).toBeTruthy();
    const fsFm = YAML.parse(fsFmMatch![1]!) as {
      name?: string;
      mcp?: Record<string, { command?: string }>;
    };
    expect(fsFm.name).toBe('filesystem');
    expect(fsFm.mcp?.filesystem?.command).toBe('npx');

    const evContent = readFileSync(join(outDir, 'everything', 'SKILL.md'), 'utf-8');
    const evFmMatch = evContent.match(/^---\n([\s\S]*?)\n---/);
    expect(evFmMatch).toBeTruthy();
    const evFm = YAML.parse(evFmMatch![1]!) as {
      name?: string;
      mcp?: Record<string, { command?: string }>;
    };
    expect(evFm.name).toBe('everything');
    expect(evFm.mcp?.everything?.command).toBe('npx');
  }, 240_000);
});
