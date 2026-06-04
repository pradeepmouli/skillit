/**
 * Integration test (T088): multi-target extract.
 *
 * Runs one `extract` invocation with two `--invocation` targets
 * (`mcp-protocol` and `cli:mcpc`) against `@modelcontextprotocol/server-filesystem`
 * and asserts:
 *
 *   1. Exit code 0.
 *   2. Two skill directories produced — `<out>/filesystem-mcp-protocol/` and
 *      `<out>/filesystem-cli-mcpc/` — using the disambiguating suffix
 *      (FR-IT-009; `:` → `-`).
 *   3. Both directories contain a `SKILL.md`.
 *   4. mcp-protocol uses `references/functions.md`; cli:mcpc uses
 *      `references/tools.md` (per-adapter naming).
 *   5. mcp-protocol skill has an `mcp:` frontmatter block; cli:mcpc skill
 *      has a `generated-by:` block and NO `mcp:` block.
 *   6. The same tool names appear in both reference files — proves the IR
 *      is target-agnostic and only the rendering differs (SC-011).
 *
 * Gated via `RUN_INTEGRATION_TESTS=true` so the default `pnpm test` doesn't
 * spawn child processes.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import YAML from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInstallTargets } from './install-target-fixtures.js';

const exec = promisify(execFile);
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe.skipIf(!RUN)('multi-target extract: server-filesystem × {mcp-protocol, cli:mcpc}', () => {
  let outDir: string;

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), 'skillit-mcp-multitarget-'));
  });

  afterAll(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('produces two disambiguated skill dirs sharing the same tool set', async () => {
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
        '--invocation',
        'mcp-protocol',
        '--invocation',
        'cli:mcpc',
        '--out',
        outDir,
        '--skill-name',
        'filesystem'
      ],
      { timeout: 90_000 }
    );

    // Each target prints its own "Wrote" line.
    expect(stdout).toMatch(/Wrote .*filesystem-mcp-protocol.*SKILL\.md/);
    expect(stdout).toMatch(/Wrote .*filesystem-cli-mcpc.*SKILL\.md/);

    // 2. Two disambiguated skill directories.
    const mcpDir = join(outDir, 'filesystem-mcp-protocol');
    const cliDir = join(outDir, 'filesystem-cli-mcpc');
    expect(existsSync(mcpDir)).toBe(true);
    expect(existsSync(cliDir)).toBe(true);
    const { installA, installB } = createInstallTargets(outDir);
    expect(existsSync(installA)).toBe(false);
    expect(existsSync(installB)).toBe(false);

    // 3. Both have SKILL.md.
    const mcpSkill = join(mcpDir, 'SKILL.md');
    const cliSkill = join(cliDir, 'SKILL.md');
    expect(existsSync(mcpSkill)).toBe(true);
    expect(existsSync(cliSkill)).toBe(true);

    // 4. Adapter-specific reference filenames.
    const mcpFunctions = join(mcpDir, 'references', 'functions.md');
    const cliTools = join(cliDir, 'references', 'tools.md');
    expect(existsSync(mcpFunctions)).toBe(true);
    expect(existsSync(cliTools)).toBe(true);

    // 5a. mcp-protocol frontmatter has `mcp:`.
    const mcpContent = readFileSync(mcpSkill, 'utf-8');
    const mcpFmMatch = mcpContent.match(/^---\n([\s\S]*?)\n---/);
    expect(mcpFmMatch).toBeTruthy();
    const mcpFm = YAML.parse(mcpFmMatch![1]!) as {
      mcp?: Record<string, unknown>;
      'generated-by'?: unknown;
    };
    expect(mcpFm.mcp).toBeTruthy();

    // 5b. cli:mcpc frontmatter has `generated-by:` and NO `mcp:`.
    const cliContent = readFileSync(cliSkill, 'utf-8');
    const cliFmMatch = cliContent.match(/^---\n([\s\S]*?)\n---/);
    expect(cliFmMatch).toBeTruthy();
    const cliFm = YAML.parse(cliFmMatch![1]!) as {
      mcp?: unknown;
      'generated-by'?: { adapter?: string; version?: string };
    };
    expect(cliFm['generated-by']).toBeTruthy();
    expect(cliFm['generated-by']!.adapter).toBe('@skillit/target-mcpc');
    expect(cliFm.mcp).toBeUndefined();

    // 6. Same tool names in both reference files (target-agnostic IR).
    // server-filesystem ships these tools as of 2024; we sample a few
    // representative ones rather than asserting an exhaustive list, which
    // would couple the test to upstream package version bumps.
    const mcpRef = readFileSync(mcpFunctions, 'utf-8');
    const cliRef = readFileSync(cliTools, 'utf-8');
    for (const tool of ['list_directory', 'read_file']) {
      expect(mcpRef).toContain(tool);
      expect(cliRef).toContain(tool);
    }

    // 7. Differ in invocation-specific shape — cli:mcpc emits a fenced shell
    // block calling `mcpc filesystem-cli-mcpc tools-call <tool>`. The
    // mcp-protocol reference does NOT contain that shape.
    expect(cliRef).toMatch(/mcpc\s+filesystem-cli-mcpc\s+tools-call/);
    expect(mcpRef).not.toMatch(/mcpc\s+\S+\s+tools-call/);
  }, 120_000);

  it('installs each rendered target and bundled guidance into every install target', async () => {
    const { installA, installB } = createInstallTargets(outDir);
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
        'mcp-protocol',
        '--invocation',
        'cli:mcpc',
        '--out',
        outDir,
        '--skill-name',
        'filesystem-installed',
        '--install-target',
        installA,
        '--install-target',
        installB
      ],
      { timeout: 90_000 }
    );

    for (const root of [outDir, installA, installB]) {
      expect(existsSync(join(root, 'filesystem-installed-mcp-protocol', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(root, 'filesystem-installed-cli-mcpc', 'SKILL.md'))).toBe(true);
    }
    expect(existsSync(join(outDir, 'skillit-mcp-docs', 'SKILL.md'))).toBe(false);
    expect(existsSync(join(installA, 'skillit-mcp-docs', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(installB, 'skillit-mcp-docs', 'SKILL.md'))).toBe(true);
  }, 120_000);
});
