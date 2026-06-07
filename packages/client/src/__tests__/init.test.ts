import { buildInitCommand, type InitDeps } from '../commands/init.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
});

afterEach(async () => {
  process.chdir(prevCwd);
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

async function writeCliFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'init-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: '@scope/my-tool', dependencies: { commander: '^15.0.0' } })
  );
  await writeFile(join(tmpDir, 'pnpm-lock.yaml'), '');
  process.chdir(tmpDir);
  return process.cwd();
}

async function writeMcpFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'init-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'my-server', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } })
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
} {
  const installCalls: InstallCall[] = [];
  const deps: InitDeps = {
    runInstall: async (pkg, pm, cwd) => {
      installCalls.push({ pkg, pm, cwd });
    },
    ...overrides
  };
  return { deps, installCalls };
}

function captureLog(): { logged: string[]; restore: () => void } {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]): void => {
    logged.push(String(args[0]));
  };
  return {
    logged,
    restore: () => {
      console.log = originalLog;
    }
  };
}

async function run(deps: InitDeps, argv: string[] = []): Promise<void> {
  const cmd = buildInitCommand(deps);
  await cmd.parseAsync(argv, { from: 'user' });
}

describe('buildInitCommand (install/wire only)', () => {
  it('installs @skillit/cli with the detected pnpm command for a cli project', async () => {
    const dir = await writeCliFixture();
    const { deps, installCalls } = makeStubs();
    const { restore } = captureLog();
    try {
      await run(deps);
    } finally {
      restore();
    }
    expect(installCalls).toHaveLength(1);
    expect(installCalls[0]!.pkg).toBe('@skillit/cli');
    expect(installCalls[0]!.pm).toBe('pnpm');
    expect(installCalls[0]!.cwd).toBe(dir);
  });

  it('prints "run skillit gen" guidance and generates no artifacts for cli', async () => {
    await writeCliFixture();
    const { deps } = makeStubs();
    const { logged, restore } = captureLog();
    try {
      await run(deps);
    } finally {
      restore();
    }
    const out = logged.join('\n');
    expect(out).toMatch(/Installed @skillit\/cli/);
    expect(out).toMatch(/skillit gen/);
  });

  it('installs @skillit/mcp and points at skillit gen for an mcp project', async () => {
    await writeMcpFixture();
    const { deps, installCalls } = makeStubs();
    const { logged, restore } = captureLog();
    try {
      await run(deps);
    } finally {
      restore();
    }
    expect(installCalls[0]!.pkg).toBe('@skillit/mcp');
    expect(logged.join('\n')).toMatch(/skillit gen/);
  });

  it('does not install for the config source (built in) and points at skillit gen', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'init-'));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: '@scope/my-lib' }));
    await writeFile(
      join(tmpDir, 'config.ts'),
      `export interface MyConfig {\n  outDir?: string;\n}\n`
    );
    await writeFile(join(tmpDir, 'pnpm-lock.yaml'), '');
    process.chdir(tmpDir);
    const { deps, installCalls } = makeStubs();
    const { logged, restore } = captureLog();
    try {
      await run(deps, ['--source', 'config', '--config-type', './config.ts#MyConfig']);
    } finally {
      restore();
    }
    expect(installCalls).toHaveLength(0);
    expect(logged.join('\n')).toMatch(/skillit gen --source config/);
  });

  it('throws with the exact command on install failure', async () => {
    await writeCliFixture();
    const { deps } = makeStubs({
      runInstall: async (pkg, pm) => {
        throw new Error(`install of ${pkg} via ${pm} failed`);
      }
    });
    await expect(run(deps)).rejects.toThrow(/pnpm add -D @skillit\/cli/);
  });

  it('rejects an invalid --source value', async () => {
    await writeCliFixture();
    const { deps } = makeStubs();
    await expect(run(deps, ['--source', 'bogus'])).rejects.toThrow(/cli\|mcp\|typedoc/);
  });
});
