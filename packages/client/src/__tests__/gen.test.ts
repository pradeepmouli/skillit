import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGenCommand, type GenDeps } from '../commands/gen.js';
import type { GenerateConfigSkillOpts, GenerateSkillOpts } from '../generate.js';

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
  tmpDir = await mkdtemp(join(tmpdir(), 'gen-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({
      name: '@scope/my-tool',
      dependencies: { commander: '^15.0.0', '@skillit/cli': '^0.1.0' }
    })
  );
  process.chdir(tmpDir);
  return process.cwd();
}

async function writeConfigFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'gen-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: '@scope/my-lib', dependencies: {} })
  );
  await writeFile(
    join(tmpDir, 'config.ts'),
    `export interface MyConfig {\n  outDir?: string;\n}\n`
  );
  process.chdir(tmpDir);
  return process.cwd();
}

function makeStubs(): {
  deps: GenDeps;
  cliCalls: GenerateSkillOpts[];
  configCalls: GenerateConfigSkillOpts[];
} {
  const cliCalls: GenerateSkillOpts[] = [];
  const configCalls: GenerateConfigSkillOpts[] = [];
  const deps: GenDeps = {
    generateCliSkill: async (opts) => {
      cliCalls.push(opts);
    },
    generateConfigSkill: async (opts) => {
      configCalls.push(opts);
    }
  };
  return { deps, cliCalls, configCalls };
}

async function run(deps: GenDeps, argv: string[]): Promise<void> {
  const cmd = buildGenCommand(deps);
  await cmd.parseAsync(argv, { from: 'user' });
}

describe('buildGenCommand', () => {
  it('generates the cli skill into <cwd>/skills for a cli source', async () => {
    const dir = await writeCliFixture();
    const { deps, cliCalls } = makeStubs();
    await run(deps, ['--source', 'cli']);
    expect(cliCalls).toHaveLength(1);
    expect(cliCalls[0]!.outDir).toBe(join(dir, 'skills'));
    expect(cliCalls[0]!.name).toBe('my-tool');
  });

  it('respects an explicit --out directory', async () => {
    const dir = await writeCliFixture();
    const { deps, cliCalls } = makeStubs();
    await run(deps, ['--source', 'cli', '--out', 'docs/skills']);
    expect(cliCalls[0]!.outDir).toBe(join(dir, 'docs/skills'));
  });

  it('generates the config skill from --config-type', async () => {
    const dir = await writeConfigFixture();
    const { deps, configCalls } = makeStubs();
    await run(deps, ['--source', 'config', '--config-type', './config.ts#MyConfig']);
    expect(configCalls).toHaveLength(1);
    expect(configCalls[0]!.typeName).toBe('MyConfig');
    expect(configCalls[0]!.configFile).toBe(join(dir, 'config.ts'));
    expect(configCalls[0]!.outDir).toBe(join(dir, 'skills'));
  });

  it('errors when the config source lacks --config-type', async () => {
    await writeConfigFixture();
    const { deps } = makeStubs();
    await expect(run(deps, ['--source', 'config'])).rejects.toThrow(/--config-type/);
  });

  it('rejects an explicit mcp source with a clear gen-specific message (not a refine error)', async () => {
    await writeCliFixture();
    const { deps } = makeStubs();
    // Must NOT surface refine's "requires --mcp" error; must say gen doesn't
    // support mcp yet.
    await expect(run(deps, ['--source', 'mcp'])).rejects.toThrow(
      /skillit gen does not yet support the mcp source/
    );
  });

  it('rejects an explicit typedoc source with a clear gen-specific message', async () => {
    await writeCliFixture();
    const { deps } = makeStubs();
    await expect(run(deps, ['--source', 'typedoc'])).rejects.toThrow(
      /skillit gen does not yet support the typedoc source/
    );
  });
});
