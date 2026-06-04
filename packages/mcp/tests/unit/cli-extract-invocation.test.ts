/**
 * Unit tests for the `extract --invocation` flag (T080–T082).
 *
 * Multi-target dispatch: extract once, render-and-write once per requested
 * target. Single-target keeps the canonical `<outDir>/<skillName>/` shape;
 * multi-target disambiguates with a `<skillName>-<targetSuffix>/` suffix.
 *
 * Mocks `extractMcpSkill` so the tests don't try to spawn a real MCP server.
 * Adapter loading goes through the real `loadAdapterAsync` against the
 * workspace-linked `target-mcp-protocol` and `target-mcpc` packages.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import type { Command } from 'commander';
import type { ExtractedSkill } from '@skillit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const extractCalls: Array<{ skillName?: string; installTargets?: readonly string[] }> = [];
const extractedSkill = (): ExtractedSkill => ({
  name: 'mock-server',
  description: 'mock',
  functions: [],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
});

vi.mock('../../src/extract.js', () => ({
  extractMcpSkill: vi.fn(
    async (options: { skillName?: string; installTargets?: readonly string[] }) => {
      extractCalls.push({ skillName: options.skillName, installTargets: options.installTargets });
      const s = extractedSkill();
      if (options.skillName) s.name = options.skillName;
      return s;
    }
  )
}));

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

describe('extract --invocation flag', () => {
  let workDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutLines: string[];

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'to-skills-mcp-cli-inv-'));
    extractCalls.length = 0;
    stdoutLines = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutLines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('default (no --invocation) writes a single mcp-protocol skill dir', async () => {
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'extract',
      '--command',
      'node',
      '--out',
      workDir,
      '--skill-name',
      'demo'
    ]);
    expect(extractCalls).toHaveLength(1);
    expect(extractCalls[0]!.installTargets).toEqual([]);
    // Single-target keeps the canonical <skillName>/ shape (no suffix).
    expect(existsSync(path.join(workDir, 'demo', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(workDir, 'demo-mcp-protocol'))).toBe(false);
    expect(stdoutLines.join('')).toMatch(/Wrote .*demo\/SKILL\.md/);
  });

  it('repeated --invocation writes one skill dir per target with disambiguation suffix', async () => {
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'extract',
      '--command',
      'node',
      '--out',
      workDir,
      '--skill-name',
      'demo',
      '--invocation',
      'mcp-protocol',
      '--invocation',
      'cli:mcpc'
    ]);
    // Extract is called exactly once — the IR is target-agnostic.
    expect(extractCalls).toHaveLength(1);
    // Two skill directories, each with the suffix derived from the target.
    expect(existsSync(path.join(workDir, 'demo-mcp-protocol', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(workDir, 'demo-cli-mcpc', 'SKILL.md'))).toBe(true);
    // The undisambiguated path is NOT written.
    expect(existsSync(path.join(workDir, 'demo'))).toBe(false);
    // One stdout line per write.
    const out = stdoutLines.join('');
    expect(out).toMatch(/Wrote .*demo-mcp-protocol\/SKILL\.md/);
    expect(out).toMatch(/Wrote .*demo-cli-mcpc\/SKILL\.md/);
  });

  it('installs extracted skills into each --install-target and includes bundled MCP guidance', async () => {
    const installA = path.join(workDir, '.claude', 'skills');
    const installB = path.join(workDir, '.agents', 'skills');
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'extract',
      '--command',
      'node',
      '--out',
      workDir,
      '--skill-name',
      'demo',
      '--install-target',
      installA,
      '--install-target',
      installB
    ]);

    expect(extractCalls).toHaveLength(1);
    expect(extractCalls[0]!.installTargets).toEqual([installA, installB]);

    for (const root of [workDir, installA, installB]) {
      expect(existsSync(path.join(root, 'demo', 'SKILL.md'))).toBe(true);
    }

    expect(existsSync(path.join(workDir, 'to-skills-mcp-docs', 'SKILL.md'))).toBe(false);
    expect(existsSync(path.join(installA, 'to-skills-mcp-docs', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(installB, 'to-skills-mcp-docs', 'SKILL.md'))).toBe(true);
  });

  it('allows existing bundled guidance in install targets before extract runs', async () => {
    const installTarget = path.join(workDir, '.claude', 'skills');
    const guidanceDir = path.join(installTarget, 'to-skills-mcp-docs');
    mkdirSync(guidanceDir, { recursive: true });
    writeFileSync(
      path.join(guidanceDir, 'SKILL.md'),
      [
        '---',
        'name: to-skills-mcp-docs',
        'version: 0.7.0',
        'toSkills:',
        '  managed: bundled-guidance',
        '---',
        '# Existing bundled guidance'
      ].join('\n')
    );

    await makeProgram().parseAsync([
      'node',
      'bin',
      'extract',
      '--command',
      'node',
      '--out',
      workDir,
      '--install-target',
      installTarget
    ]);
    expect(extractCalls).toHaveLength(1);
    expect(existsSync(path.join(installTarget, 'to-skills-mcp-docs', 'SKILL.md'))).toBe(true);
  });

  it('cli:mcpc render emits generated-by frontmatter (no mcp: block)', async () => {
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'extract',
      '--command',
      'node',
      '--out',
      workDir,
      '--skill-name',
      'demo',
      '--invocation',
      'cli:mcpc'
    ]);
    const skillPath = path.join(workDir, 'demo', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toMatch(/generated-by:/);
    expect(content).not.toMatch(/^mcp:/m);
  });

  it('rejects unknown invocation target with installed-adapter hint (exit 5 path)', async () => {
    const program = makeProgram();
    await expect(
      program.parseAsync([
        'node',
        'bin',
        'extract',
        '--command',
        'node',
        '--out',
        workDir,
        '--skill-name',
        'demo',
        '--invocation',
        'cli:nonexistent-adapter'
      ])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        (err.code === 'ADAPTER_NOT_FOUND' || err.code === 'UNKNOWN_TARGET') &&
        /Installed adapters:/.test(err.message)
    );
    // Validation fired BEFORE extract spawn.
    expect(extractCalls).toHaveLength(0);
  });

  it('rejects malformed --invocation cli: target', async () => {
    const program = makeProgram();
    await expect(
      program.parseAsync([
        'node',
        'bin',
        'extract',
        '--command',
        'node',
        '--out',
        workDir,
        '--skill-name',
        'demo',
        '--invocation',
        'totally-bogus-form'
      ])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'UNKNOWN_TARGET' &&
        /Installed adapters:/.test(err.message)
    );
    expect(extractCalls).toHaveLength(0);
  });
});
