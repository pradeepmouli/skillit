/**
 * Unit tests for the `extract --config <path>` batch path (T092, T093).
 *
 * Mocks `extractMcpSkill` so each entry resolves without spawning a real MCP
 * server; per-entry containment is exercised by making the mock throw for
 * specific entry names. Adapter loading goes through the real
 * `loadAdapterAsync` against the workspace-linked adapter packages.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import type { Command } from 'commander';
import type { ExtractedSkill } from '@to-skills/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ExtractCall {
  skillName?: string;
  transport: { type: string; command?: string; url?: string };
}
const extractCalls: ExtractCall[] = [];
/**
 * When non-empty, the mock throws for entries whose `skillName` is in this
 * map. Cleared in beforeEach so per-test injection is isolated.
 */
const failFor = new Map<string, { code: string; message: string }>();

const baseSkill = (name: string): ExtractedSkill => ({
  name,
  description: `mock ${name}`,
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
});

vi.mock('../../src/extract.js', async () => {
  const errors = await import('../../src/errors.js');
  return {
    extractMcpSkill: vi.fn(
      async (options: {
        skillName?: string;
        transport: { type: string; command?: string; url?: string };
      }) => {
        extractCalls.push({
          skillName: options.skillName,
          transport: {
            type: options.transport.type,
            ...(options.transport.command !== undefined
              ? { command: options.transport.command }
              : {}),
            ...(options.transport.url !== undefined ? { url: options.transport.url } : {})
          }
        });
        const inject = failFor.get(options.skillName ?? '');
        if (inject !== undefined) {
          throw new errors.McpError(inject.message, inject.code as never);
        }
        return baseSkill(options.skillName ?? 'mock');
      }
    )
  };
});

const { buildProgram } = await import('../../src/cli.js');
const { McpError } = await import('../../src/errors.js');

function makeProgram(): Command {
  const program = buildProgram();
  program.exitOverride();
  for (const sub of program.commands) {
    sub.exitOverride();
  }
  return program;
}

describe('extract --config <path>', () => {
  let workDir: string;
  let configPath: string;
  let outDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutLines: string[];
  let stderrLines: string[];

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'to-skills-mcp-cli-cfg-'));
    configPath = join(workDir, 'mcp.json');
    outDir = join(workDir, 'out');
    extractCalls.length = 0;
    failFor.clear();
    stdoutLines = [];
    stderrLines = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(workDir, { recursive: true, force: true });
  });

  function writeConfig(content: object): void {
    writeFileSync(configPath, JSON.stringify(content));
  }

  it('processes every enabled entry and writes one skill dir per entry', async () => {
    writeConfig({
      mcpServers: {
        alpha: { command: 'node', args: ['./a.js'] },
        beta: { url: 'https://example.com/mcp' }
      }
    });
    const program = makeProgram();
    await program.parseAsync(['node', 'bin', 'extract', '--config', configPath, '--out', outDir]);

    expect(extractCalls).toHaveLength(2);
    expect(extractCalls[0]!.skillName).toBe('alpha');
    expect(extractCalls[0]!.transport.type).toBe('stdio');
    expect(extractCalls[1]!.skillName).toBe('beta');
    expect(extractCalls[1]!.transport.type).toBe('http');

    expect(existsSync(path.join(outDir, 'alpha', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'beta', 'SKILL.md'))).toBe(true);
  });

  it('skips entries with disabled: true silently', async () => {
    writeConfig({
      mcpServers: {
        live: { command: 'node', args: ['./a.js'] },
        off: { command: 'node', args: ['./b.js'], disabled: true }
      }
    });
    const program = makeProgram();
    await program.parseAsync(['node', 'bin', 'extract', '--config', configPath, '--out', outDir]);

    expect(extractCalls.map((c) => c.skillName)).toEqual(['live']);
    expect(existsSync(path.join(outDir, 'live', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'off'))).toBe(false);
    // No stderr noise about the disabled entry.
    expect(stderrLines.join('')).not.toMatch(/off/);
  });

  it('contains per-entry McpError and continues with remaining entries', async () => {
    writeConfig({
      mcpServers: {
        ok: { command: 'node', args: ['./a.js'] },
        broken: { command: '/does/not/exist' }
      }
    });
    failFor.set('broken', { code: 'TRANSPORT_FAILED', message: 'spawn ENOENT /does/not/exist' });

    const program = makeProgram();
    await expect(
      program.parseAsync(['node', 'bin', 'extract', '--config', configPath, '--out', outDir])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /1 entry failed/.test(err.message)
    );

    // The healthy entry still produced a skill dir.
    expect(existsSync(path.join(outDir, 'ok', 'SKILL.md'))).toBe(true);
    // Stderr names the failing entry with the McpError code.
    expect(stderrLines.join('')).toMatch(/Failed \[TRANSPORT_FAILED\] broken/);
  });

  it('config-load failures (ENOENT) propagate without running any extracts', async () => {
    const missing = join(workDir, 'nope.json');
    const program = makeProgram();
    await expect(
      program.parseAsync(['node', 'bin', 'extract', '--config', missing, '--out', outDir])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /Config file not found/.test(err.message)
    );
    expect(extractCalls).toHaveLength(0);
  });

  it('--invocation threads through to per-entry render loop', async () => {
    writeConfig({
      mcpServers: {
        demo: { command: 'node', args: ['./a.js'] }
      }
    });
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'extract',
      '--config',
      configPath,
      '--out',
      outDir,
      '--invocation',
      'mcp-protocol',
      '--invocation',
      'cli:mcpc'
    ]);

    // Extract runs once — IR is target-agnostic.
    expect(extractCalls).toHaveLength(1);
    // Two disambiguated dirs, one per target.
    expect(existsSync(path.join(outDir, 'demo-mcp-protocol', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'demo-cli-mcpc', 'SKILL.md'))).toBe(true);
    // The cli:mcpc render should emit generated-by frontmatter (no mcp:).
    const cliContent = readFileSync(path.join(outDir, 'demo-cli-mcpc', 'SKILL.md'), 'utf8');
    expect(cliContent).toMatch(/generated-by:/);
    expect(cliContent).not.toMatch(/^mcp:/m);
  });

  it('worst-code aggregation surfaces DUPLICATE_SKILL_NAME over TRANSPORT_FAILED', async () => {
    writeConfig({
      mcpServers: {
        a: { command: 'node', args: ['./a.js'] },
        b: { command: 'node', args: ['./b.js'] }
      }
    });
    failFor.set('a', { code: 'TRANSPORT_FAILED', message: 'a went sideways' });
    failFor.set('b', { code: 'DUPLICATE_SKILL_NAME', message: 'b would clobber' });

    const program = makeProgram();
    await expect(
      program.parseAsync(['node', 'bin', 'extract', '--config', configPath, '--out', outDir])
    ).rejects.toSatisfy((err) => err instanceof McpError && err.code === 'DUPLICATE_SKILL_NAME');
  });

  it('blocks install-target collisions before running config extracts', async () => {
    writeConfig({
      mcpServers: {
        alpha: { command: 'node', args: ['./a.js'] }
      }
    });
    const installTarget = join(workDir, '.claude', 'skills');
    const skillDir = join(installTarget, 'alpha');
    mkdirSync(skillDir, { recursive: true });

    const program = makeProgram();
    await expect(
      program.parseAsync([
        'node',
        'bin',
        'extract',
        '--config',
        configPath,
        '--out',
        outDir,
        '--install-target',
        installTarget
      ])
    ).rejects.toSatisfy((err) => err instanceof McpError && err.code === 'DUPLICATE_SKILL_NAME');
    expect(extractCalls).toHaveLength(0);
    expect(stderrLines.join('')).toContain(skillDir);
  });

  it('rejects --config combined with --command (mutually exclusive)', async () => {
    writeConfig({ mcpServers: { x: { command: 'node' } } });
    const program = makeProgram();
    await expect(
      program.parseAsync([
        'node',
        'bin',
        'extract',
        '--config',
        configPath,
        '--command',
        'node',
        '--out',
        outDir
      ])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'TRANSPORT_FAILED' &&
        /mutually exclusive/.test(err.message)
    );
    expect(extractCalls).toHaveLength(0);
  });
});
