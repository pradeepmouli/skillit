import { buildInitCommand, type GenerateSkillOpts, type InitDeps } from '../commands/init.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tmpDir: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
});

afterEach(async () => {
  process.chdir(prevCwd);
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

/**
 * A cli-nature project with a pnpm lockfile. Returns the realized cwd
 * (`process.cwd()` after chdir), since macOS resolves `/tmp` → `/private/tmp`.
 */
async function writeCliFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'init-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: '@scope/my-tool', dependencies: { commander: '^14.0.0' } })
  );
  await writeFile(join(tmpDir, 'pnpm-lock.yaml'), '');
  process.chdir(tmpDir);
  return process.cwd();
}

/** An mcp-nature project (no commander/yargs, no loadable bin). */
async function writeMcpFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'init-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'my-server',
      dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' }
    })
  );
  await writeFile(join(tmpDir, 'pnpm-lock.yaml'), '');
  process.chdir(tmpDir);
  return process.cwd();
}

interface InstallCall {
  pkg: string;
  pm: string;
  cwd: string;
}

function makeStubs(overrides?: Partial<InitDeps>): {
  deps: InitDeps;
  installCalls: InstallCall[];
  generateCalls: GenerateSkillOpts[];
  refineCalls: unknown[];
} {
  const installCalls: InstallCall[] = [];
  const generateCalls: GenerateSkillOpts[] = [];
  const refineCalls: unknown[] = [];
  const deps: InitDeps = {
    runInstall: async (pkg, pm, cwd) => {
      installCalls.push({ pkg, pm, cwd });
    },
    generateSkill: async (opts) => {
      generateCalls.push(opts);
    },
    runRefine: async (opts) => {
      refineCalls.push(opts);
    },
    ...overrides
  };
  return { deps, installCalls, generateCalls, refineCalls };
}

async function run(deps: InitDeps, argv: string[] = []): Promise<void> {
  const cmd = buildInitCommand(deps);
  await cmd.parseAsync(argv, { from: 'user' });
}

describe('buildInitCommand', () => {
  it('chooses @to-skills/cli with the detected pnpm add command for a cli project', async () => {
    const dir = await writeCliFixture();
    const { deps, installCalls } = makeStubs();
    await run(deps);
    expect(installCalls).toHaveLength(1);
    expect(installCalls[0]!.pkg).toBe('@to-skills/cli');
    expect(installCalls[0]!.pm).toBe('pnpm');
    expect(installCalls[0]!.cwd).toBe(dir);
  });

  it('generates the initial skill into <cwd>/skills', async () => {
    const dir = await writeCliFixture();
    const { deps, generateCalls } = makeStubs();
    await run(deps);
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]!.outDir).toBe(join(dir, 'skills'));
  });

  it('dispatches refine with the cli source', async () => {
    await writeCliFixture();
    const { deps, refineCalls } = makeStubs();
    await run(deps);
    expect(refineCalls).toHaveLength(1);
    expect((refineCalls[0] as { source?: string }).source).toBe('cli');
  });

  it('respects an explicit --out directory', async () => {
    const dir = await writeCliFixture();
    const { deps, generateCalls } = makeStubs();
    await run(deps, ['--out', 'docs/skills']);
    expect(generateCalls[0]!.outDir).toBe(join(dir, 'docs/skills'));
  });

  it('throws with the exact command on install failure and skips generate + refine', async () => {
    await writeCliFixture();
    const generate = vi.fn();
    const refine = vi.fn();
    const { deps } = makeStubs({
      runInstall: async (pkg, pm) => {
        throw new Error(`install of ${pkg} via ${pm} failed`);
      },
      generateSkill: generate,
      runRefine: refine
    });
    await expect(run(deps)).rejects.toThrow(/pnpm add -D @to-skills\/cli/);
    expect(generate).not.toHaveBeenCalled();
    expect(refine).not.toHaveBeenCalled();
  });

  it('rejects an invalid --source value', async () => {
    await writeCliFixture();
    const { deps } = makeStubs();
    await expect(run(deps, ['--source', 'bogus'])).rejects.toThrow(/cli\|mcp\|typedoc/);
  });

  it('installs @to-skills/mcp but skips generate + refine for an mcp project', async () => {
    await writeMcpFixture();
    const { deps, installCalls, generateCalls, refineCalls } = makeStubs();
    // Override console.log directly: vitest's console interceptor bypasses
    // vi.spyOn(console, 'log') here, so capture via a plain reassignment.
    const logged: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]): void => {
      logged.push(String(args[0]));
    };
    try {
      await run(deps);
    } finally {
      console.log = originalLog;
    }
    expect(installCalls).toHaveLength(1);
    expect(installCalls[0]!.pkg).toBe('@to-skills/mcp');
    // CLI-first: no auto generate or refine for the mcp source this pass.
    expect(generateCalls).toHaveLength(0);
    expect(refineCalls).toHaveLength(0);
    expect(logged.join('\n')).toMatch(/to-skills refine --source mcp/);
  });
});
