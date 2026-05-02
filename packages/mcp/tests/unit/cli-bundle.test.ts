/**
 * Unit tests for the `bundle` CLI subcommand wiring (T064 / T065).
 *
 * Lives in its own file so we can `vi.mock('../../src/bundle.js')` cleanly —
 * the sibling `cli.test.ts` exercises the extract path and never imports
 * bundle, so co-locating the mock would force the same module-graph mock onto
 * the extract tests.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import type { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BundleResult, McpBundleOptions } from '../../src/types.js';

// Capture every bundleMcpSkill call so tests can assert option threading.
const bundleCalls: McpBundleOptions[] = [];
const bundleResults: BundleResult[] = [];

vi.mock('../../src/bundle.js', () => ({
  bundleMcpSkill: vi.fn(async (options: McpBundleOptions) => {
    bundleCalls.push(options);
    // Default: empty success. Tests push their own results to `bundleResults`
    // before invoking parseAsync to drive specific scenarios.
    return (
      bundleResults.shift() ?? {
        skills: {},
        failures: {},
        packageJsonWarnings: []
      }
    );
  })
}));

// readBundleConfig is invoked by runBundle BEFORE bundleMcpSkill (pre-flight
// DUPLICATE_SKILL_NAME check). Stub it so we control the entry list.
const configEntries: Array<{ skillName: string }> = [];
vi.mock('../../src/bundle/config.js', () => ({
  readBundleConfig: vi.fn(async () =>
    configEntries.map((e) => ({
      skillName: e.skillName,
      command: 'node',
      args: [],
      invocation: ['mcp-protocol' as const]
    }))
  )
}));

// Import AFTER mocks.
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

describe('bundle subcommand', () => {
  let workDir: string;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stdoutLines: string[];
  let stderrLines: string[];

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'to-skills-mcp-bundle-cli-'));
    bundleCalls.length = 0;
    bundleResults.length = 0;
    configEntries.length = 0;
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
    // Minimal package.json so readBundleConfig (when un-mocked path runs)
    // doesn't blow up before our mock takes effect.
    writeFileSync(
      join(workDir, 'package.json'),
      JSON.stringify({ name: 'fixture', 'to-skills': { mcp: { skillName: 'whatever' } } }, null, 2)
    );
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('emits one stdout line per written skill', async () => {
    configEntries.push({ skillName: 'my-server' });
    bundleResults.push({
      skills: {
        'my-server': {
          dir: path.join(workDir, 'skills', 'my-server'),
          // SKILL.md + 2 references → "(2 references)"
          files: ['SKILL.md', 'references/functions.md', 'references/types.md'],
          target: 'mcp-protocol',
          audit: { issues: [], worstSeverity: 'none' }
        }
      },
      failures: {},
      packageJsonWarnings: []
    });
    const program = makeProgram();
    await program.parseAsync(['node', 'bin', 'bundle', '--package-root', workDir]);
    const out = stdoutLines.join('');
    expect(out).toMatch(/Wrote .*my-server\/SKILL\.md \(2 references\)/);
  });

  it('emits one stderr line per failure and throws with the worst code', async () => {
    configEntries.push({ skillName: 'a' }, { skillName: 'b' });
    bundleResults.push({
      skills: {},
      failures: {
        a: { code: 'TRANSPORT_FAILED', message: 'boom-a' },
        b: { code: 'MISSING_LAUNCH_COMMAND', message: 'boom-b' }
      },
      packageJsonWarnings: []
    });
    const program = makeProgram();
    await expect(
      program.parseAsync(['node', 'bin', 'bundle', '--package-root', workDir])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        // MISSING_LAUNCH_COMMAND wins the hierarchy over TRANSPORT_FAILED.
        err.code === 'MISSING_LAUNCH_COMMAND' &&
        /entries failed/.test(err.message)
    );
    const err = stderrLines.join('');
    expect(err).toContain('Failed [TRANSPORT_FAILED] a: boom-a');
    expect(err).toContain('Failed [MISSING_LAUNCH_COMMAND] b: boom-b');
  });

  it('throws DUPLICATE_SKILL_NAME pre-flight when destination exists and --force is omitted', async () => {
    configEntries.push({ skillName: 'preexisting' });
    mkdirSync(path.join(workDir, 'skills', 'preexisting'), { recursive: true });
    const program = makeProgram();
    await expect(
      program.parseAsync(['node', 'bin', 'bundle', '--package-root', workDir])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'DUPLICATE_SKILL_NAME' &&
        /preexisting/.test(err.message)
    );
    // Pre-flight ran BEFORE bundleMcpSkill — so no extract happened.
    expect(bundleCalls).toHaveLength(0);
  });

  it('throws DUPLICATE_SKILL_NAME pre-flight when install-target destination exists', async () => {
    configEntries.push({ skillName: 'preexisting' });
    const installTarget = path.join(workDir, '.claude', 'skills');
    const skillDir = path.join(installTarget, 'preexisting');
    mkdirSync(skillDir, { recursive: true });
    const program = makeProgram();
    await expect(
      program.parseAsync([
        'node',
        'bin',
        'bundle',
        '--package-root',
        workDir,
        '--install-target',
        installTarget
      ])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        err.code === 'DUPLICATE_SKILL_NAME' &&
        err.message.includes(skillDir)
    );
    expect(bundleCalls).toHaveLength(0);
  });

  it('--force bypasses the pre-flight collision check', async () => {
    configEntries.push({ skillName: 'preexisting' });
    bundleResults.push({ skills: {}, failures: {}, packageJsonWarnings: [] });
    mkdirSync(path.join(workDir, 'skills', 'preexisting'), { recursive: true });
    const program = makeProgram();
    await program.parseAsync(['node', 'bin', 'bundle', '--package-root', workDir, '--force']);
    expect(bundleCalls).toHaveLength(1);
  });

  it('threads --invocation overrides into bundleMcpSkill (only when non-empty)', async () => {
    configEntries.push({ skillName: 'my-server' });
    bundleResults.push({ skills: {}, failures: {}, packageJsonWarnings: [] });
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'bundle',
      '--package-root',
      workDir,
      '--invocation',
      'mcp-protocol',
      '--invocation',
      'cli:mcpc'
    ]);
    expect(bundleCalls).toHaveLength(1);
    expect(bundleCalls[0]?.invocation).toEqual(['mcp-protocol', 'cli:mcpc']);
  });

  it('threads repeated --install-target values into bundleMcpSkill', async () => {
    configEntries.push({ skillName: 'my-server' });
    bundleResults.push({ skills: {}, failures: {}, packageJsonWarnings: [] });
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'bundle',
      '--package-root',
      workDir,
      '--install-target',
      '.claude/skills',
      '--install-target',
      '.agents/skills'
    ]);
    expect(bundleCalls).toHaveLength(1);
    expect(bundleCalls[0]?.installTargets).toEqual(['.claude/skills', '.agents/skills']);
  });

  it('omits invocation override when --invocation is not provided (per-entry config wins)', async () => {
    configEntries.push({ skillName: 'my-server' });
    bundleResults.push({ skills: {}, failures: {}, packageJsonWarnings: [] });
    const program = makeProgram();
    await program.parseAsync(['node', 'bin', 'bundle', '--package-root', workDir]);
    expect(bundleCalls).toHaveLength(1);
    expect(bundleCalls[0]?.invocation).toBeUndefined();
  });

  it('emits a stderr notice for --no-canonicalize, threads --skip-audit + --llms-txt into bundleMcpSkill', async () => {
    // Phase 10 / B21 wired --skip-audit through to bundleMcpSkill; B23 (T111)
    // wired --llms-txt the same way. The --no-canonicalize stub notice stays
    // until canonicalization becomes opt-out-able. --skip-audit and
    // --llms-txt now both surface as captured options on the spy so we know
    // they reached the bundle layer rather than emitting Phase-10 stubs.
    configEntries.push({ skillName: 'my-server' });
    bundleResults.push({ skills: {}, failures: {}, packageJsonWarnings: [] });
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'bundle',
      '--package-root',
      workDir,
      '--no-canonicalize',
      '--skip-audit',
      '--llms-txt'
    ]);
    const err = stderrLines.join('');
    expect(err).toMatch(/--no-canonicalize is not yet wired/);
    expect(err).not.toMatch(/--llms-txt is not yet implemented/);
    expect(err).not.toMatch(/--skip-audit is not yet implemented/);
    expect(bundleCalls).toHaveLength(1);
    expect(bundleCalls[0]?.skipAudit).toBe(true);
    expect(bundleCalls[0]?.llmsTxt).toBe(true);
  });

  it('emits a stderr notice when --max-tokens is set to a non-default value', async () => {
    configEntries.push({ skillName: 'my-server' });
    bundleResults.push({ skills: {}, failures: {}, packageJsonWarnings: [] });
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'bundle',
      '--package-root',
      workDir,
      '--max-tokens',
      '8000'
    ]);
    expect(stderrLines.join('')).toMatch(/--max-tokens is not yet threaded/);
  });

  it('stays silent on --max-tokens default (4000) — no spurious notice', async () => {
    configEntries.push({ skillName: 'my-server' });
    bundleResults.push({ skills: {}, failures: {}, packageJsonWarnings: [] });
    const program = makeProgram();
    await program.parseAsync(['node', 'bin', 'bundle', '--package-root', workDir]);
    expect(stderrLines.join('')).not.toMatch(/--max-tokens/);
  });

  it('multi-target stdout: one line per (entry × target) WrittenSkill', async () => {
    // The bundle mock surfaces two skills keyed by their disambiguated
    // directory names (matches the new bundle.ts shape from T083).
    configEntries.push({ skillName: 'my-server' });
    bundleResults.push({
      skills: {
        'my-server-mcp-protocol': {
          dir: path.join(workDir, 'skills', 'my-server-mcp-protocol'),
          files: ['SKILL.md'],
          target: 'mcp-protocol',
          audit: { issues: [], worstSeverity: 'none' }
        },
        'my-server-cli-mcpc': {
          dir: path.join(workDir, 'skills', 'my-server-cli-mcpc'),
          files: ['SKILL.md', 'references/tools.md'],
          target: 'cli:mcpc',
          audit: { issues: [], worstSeverity: 'none' }
        }
      },
      failures: {},
      packageJsonWarnings: []
    });
    const program = makeProgram();
    await program.parseAsync([
      'node',
      'bin',
      'bundle',
      '--package-root',
      workDir,
      '--invocation',
      'mcp-protocol',
      '--invocation',
      'cli:mcpc'
    ]);
    const out = stdoutLines.join('');
    expect(out).toMatch(/Wrote .*my-server-mcp-protocol\/SKILL\.md \(0 references\)/);
    expect(out).toMatch(/Wrote .*my-server-cli-mcpc\/SKILL\.md \(1 references\)/);
  });

  it('rejects unknown invocation target eagerly with installed-adapter hint', async () => {
    // No need to push configEntries — validation runs BEFORE readBundleConfig.
    const program = makeProgram();
    await expect(
      program.parseAsync([
        'node',
        'bin',
        'bundle',
        '--package-root',
        workDir,
        '--invocation',
        'cli:nonexistent-adapter'
      ])
    ).rejects.toSatisfy(
      (err) =>
        err instanceof McpError &&
        (err.code === 'ADAPTER_NOT_FOUND' || err.code === 'UNKNOWN_TARGET') &&
        /Installed adapters:/.test(err.message)
    );
    expect(bundleCalls).toHaveLength(0);
  });

  it('worst-failure-code hierarchy covers SCHEMA_REF_CYCLE and SERVER_EXITED_EARLY (deterministic across multi-failure runs)', async () => {
    // Two failures: SCHEMA_REF_CYCLE (more actionable) + INITIALIZE_FAILED.
    // Ordered hierarchy says SCHEMA_REF_CYCLE wins.
    configEntries.push({ skillName: 'a' }, { skillName: 'b' });
    bundleResults.push({
      skills: {},
      failures: {
        a: { code: 'INITIALIZE_FAILED', message: 'x' },
        b: { code: 'SCHEMA_REF_CYCLE', message: 'cycle' }
      },
      packageJsonWarnings: []
    });
    const program = makeProgram();
    await expect(
      program.parseAsync(['node', 'bin', 'bundle', '--package-root', workDir])
    ).rejects.toSatisfy((err) => err instanceof McpError && err.code === 'SCHEMA_REF_CYCLE');
  });
});
