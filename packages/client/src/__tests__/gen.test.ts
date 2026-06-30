import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGenCommand, type GenDeps } from '../commands/gen.js';
import type {
  GenerateConfigSkillOpts,
  GenerateMcpSkillOpts,
  GenerateSkillOpts,
  GenerateTypeDocSkillOpts
} from '../generate.js';

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

async function writeTypedocFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'gen-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    // No commander/yargs dep — detectProjectNature resolves to 'typedoc'
    JSON.stringify({ name: '@scope/my-lib', dependencies: {} })
  );
  await writeFile(join(tmpDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: {} }));
  const srcDir = join(tmpDir, 'src');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(srcDir, 'index.ts'), `export const version = '0.0.1';\n`);
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
  typedocCalls: GenerateTypeDocSkillOpts[];
  mcpCalls: GenerateMcpSkillOpts[];
} {
  const cliCalls: GenerateSkillOpts[] = [];
  const configCalls: GenerateConfigSkillOpts[] = [];
  const typedocCalls: GenerateTypeDocSkillOpts[] = [];
  const mcpCalls: GenerateMcpSkillOpts[] = [];
  const deps: GenDeps = {
    generateCliSkill: async (opts) => {
      cliCalls.push(opts);
    },
    generateConfigSkill: async (opts) => {
      configCalls.push(opts);
    },
    generateTypeDocSkill: async (opts) => {
      typedocCalls.push(opts);
    },
    generateMcpSkill: async (opts) => {
      mcpCalls.push(opts);
    }
  };
  return { deps, cliCalls, configCalls, typedocCalls, mcpCalls };
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

  it('honours an absolute --out path as-is', async () => {
    await writeCliFixture();
    const { deps, cliCalls } = makeStubs();
    const absOut = join(tmpdir(), 'skillit-abs-out-test');
    await run(deps, ['--source', 'cli', '--out', absOut]);
    expect(cliCalls[0]!.outDir).toBe(absOut);
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

  it('routes --source mcp to generateMcpSkill with the resolved mcp path', async () => {
    const dir = await writeCliFixture();
    const { deps, mcpCalls } = makeStubs();
    await run(deps, ['--source', 'mcp', '--mcp', './mcp.json', '--out', 'skills']);
    expect(mcpCalls).toHaveLength(1);
    expect(mcpCalls[0]!.mcpPath).toBe(join(dir, 'mcp.json'));
    expect(mcpCalls[0]!.outDir).toBe(join(dir, 'skills'));
  });

  it('passes --server through to generateMcpSkill', async () => {
    await writeCliFixture();
    const { deps, mcpCalls } = makeStubs();
    await run(deps, ['--source', 'mcp', '--mcp', './mcp.json', '--server', 'fs']);
    expect(mcpCalls[0]!.server).toBe('fs');
  });

  it('errors when --source mcp is given without --mcp', async () => {
    await writeCliFixture();
    const { deps } = makeStubs();
    await expect(run(deps, ['--source', 'mcp', '--out', 'skills'])).rejects.toThrow(/--mcp/);
  });

  it('generates the typedoc skill for a typedoc source', async () => {
    const dir = await writeTypedocFixture();
    const { deps, typedocCalls } = makeStubs();
    await run(deps, ['--source', 'typedoc']);
    expect(typedocCalls).toHaveLength(1);
    expect(typedocCalls[0]!.outDir).toBe(join(dir, 'skills'));
    expect(typedocCalls[0]!.cwd).toBe(dir);
  });
});
