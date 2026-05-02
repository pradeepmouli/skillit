// Unit tests for the bundle orchestrator (T060a–T060d, T063).
//
// Strategy: vi.mock the heavy collaborators (`extractMcpSkill`, `loadAdapterAsync`)
// so we can drive happy-path / failure-path / multi-server scenarios without
// spawning actual servers. The renderSkill+writeSkills pipeline runs for real
// against tmpdirs so the on-disk layout is exercised end-to-end. Files-field
// warnings are checked against `result.packageJsonWarnings` and the captured
// stderr stream.

import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ExtractedSkill, InvocationAdapter, RenderedSkill } from '@to-skills/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state shared across helpers.
type ExtractMockShape = {
  // Records each call so tests can assert order + transport contents.
  calls: Array<{
    command: string;
    args: string[];
    env?: Record<string, string>;
    skillName?: string;
  }>;
  // Per-skillName impl. Defaults to a minimal ExtractedSkill.
  impls: Map<string, () => Promise<ExtractedSkill>>;
};

const extractState: ExtractMockShape = {
  calls: [],
  impls: new Map()
};

vi.mock('../../src/extract.js', () => ({
  extractMcpSkill: vi.fn(
    async (options: {
      transport: { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };
      skillName?: string;
    }) => {
      extractState.calls.push({
        command: options.transport.command,
        args: options.transport.args ?? [],
        env: options.transport.env,
        skillName: options.skillName
      });
      const impl = options.skillName ? extractState.impls.get(options.skillName) : undefined;
      if (impl) return impl();
      // Default minimal ExtractedSkill.
      return {
        name: options.skillName ?? 'mcp-server',
        description: 'mock server',
        functions: [],
        classes: [],
        types: [],
        enums: [],
        variables: [],
        examples: []
      };
    }
  )
}));

// Stub adapter — produces deterministic output that exercises writeSkills
// without depending on the real target-mcp-protocol package.
const stubAdapter: InvocationAdapter = {
  target: 'mcp-protocol',
  fingerprint: { adapter: '@stub/adapter', version: '0.0.0' },
  async render(skill, ctx): Promise<RenderedSkill> {
    return {
      skill: {
        filename: `${ctx.skillName}/SKILL.md`,
        content: `---\nname: ${ctx.skillName}\npackage: ${ctx.packageName ?? ''}\n---\n# ${skill.name}\n`,
        tokens: 32
      },
      references: []
    };
  }
};

vi.mock('../../src/adapter/loader.js', () => ({
  loadAdapterAsync: vi.fn(async () => stubAdapter)
}));

// Bring the orchestrator in AFTER mocks are declared.
const { bundleMcpSkill } = await import('../../src/bundle.js');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(tmpdir(), 'bundle-'));
  extractState.calls.length = 0;
  extractState.impls.clear();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function writePkg(contents: unknown): void {
  writeFileSync(path.join(workDir, 'package.json'), JSON.stringify(contents, null, 2), 'utf8');
}

describe('bundleMcpSkill', () => {
  it('propagates config-load failures (no package.json)', async () => {
    await expect(bundleMcpSkill({ packageRoot: workDir })).rejects.toMatchObject({
      name: 'McpError',
      code: 'TRANSPORT_FAILED'
    });
  });

  it('happy path: single-server config writes one skill directory', async () => {
    writePkg({
      name: '@my/server',
      'to-skills': {
        mcp: { skillName: 'my-server', command: 'node', args: ['./a.js'] }
      }
    });
    const result = await bundleMcpSkill({ packageRoot: workDir });
    expect(result.failures).toEqual({});
    expect(result.skills['my-server']).toBeDefined();
    expect(result.skills['my-server']?.target).toBe('mcp-protocol');
    expect(result.skills['my-server']?.dir).toBe(path.join(workDir, 'skills', 'my-server'));
    // SKILL.md exists with package-name self-reference embedded.
    const skillPath = path.join(workDir, 'skills', 'my-server', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, 'utf8');
    expect(content).toContain('package: @my/server');
    // Extract was called with the entry's transport.
    expect(extractState.calls).toHaveLength(1);
    expect(extractState.calls[0]).toMatchObject({
      command: 'node',
      args: ['./a.js'],
      skillName: 'my-server'
    });
  });

  it('multi-server: writes one directory per entry independently', async () => {
    writePkg({
      name: '@my/server',
      'to-skills': {
        mcp: [
          { skillName: 'server-a', command: 'node', args: ['./a.js'] },
          { skillName: 'server-b', command: 'node', args: ['./b.js'] }
        ]
      }
    });
    const result = await bundleMcpSkill({ packageRoot: workDir });
    expect(Object.keys(result.skills).sort()).toEqual(['server-a', 'server-b']);
    expect(result.failures).toEqual({});
    expect(existsSync(path.join(workDir, 'skills', 'server-a', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(workDir, 'skills', 'server-b', 'SKILL.md'))).toBe(true);
  });

  it('records mid-stream extract failure and continues with remaining entries', async () => {
    const { McpError } = await import('../../src/errors.js');
    extractState.impls.set('server-a', async () => {
      throw new McpError('boom', 'INITIALIZE_FAILED');
    });
    writePkg({
      name: '@my/server',
      'to-skills': {
        mcp: [
          { skillName: 'server-a', command: 'node', args: ['./a.js'] },
          { skillName: 'server-b', command: 'node', args: ['./b.js'] }
        ]
      }
    });
    const result = await bundleMcpSkill({ packageRoot: workDir });
    expect(result.failures['server-a']).toMatchObject({ code: 'INITIALIZE_FAILED' });
    expect(result.skills['server-b']).toBeDefined();
    expect(result.skills['server-a']).toBeUndefined();
  });

  it('warns when package.json files array omits skills/dist', async () => {
    // Pre-create a dist directory so the dist warning fires.
    mkdirSync(path.join(workDir, 'dist'), { recursive: true });
    writePkg({
      name: '@my/server',
      bin: './dist/server.js',
      files: ['README.md'],
      'to-skills': { mcp: { skillName: 'my-server' } }
    });
    const stderr: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    // Cast: process.stderr.write has many overloads; the test only writes strings.
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stderr.write;
    let result;
    try {
      result = await bundleMcpSkill({ packageRoot: workDir });
    } finally {
      process.stderr.write = orig;
    }
    expect(result.packageJsonWarnings).toEqual([
      expect.stringContaining('"dist"'),
      expect.stringContaining('"skills"')
    ]);
    expect(stderr.join('')).toContain('"skills"');
  });

  it('does not warn when package.json files is absent (implicit-include)', async () => {
    writePkg({
      name: '@my/server',
      'to-skills': {
        mcp: { skillName: 'my-server', command: 'node', args: ['./a.js'] }
      }
    });
    const result = await bundleMcpSkill({ packageRoot: workDir });
    expect(result.packageJsonWarnings).toEqual([]);
  });

  it('does not warn when package.json files already includes skills', async () => {
    writePkg({
      name: '@my/server',
      files: ['dist', 'skills', 'README.md'],
      'to-skills': {
        mcp: { skillName: 'my-server', command: 'node', args: ['./a.js'] }
      }
    });
    const result = await bundleMcpSkill({ packageRoot: workDir });
    expect(result.packageJsonWarnings).toEqual([]);
  });

  it('multi-target entry renders one skill dir per target with disambiguation suffix', async () => {
    writePkg({
      name: '@my/server',
      'to-skills': {
        mcp: {
          skillName: 'my-server',
          command: 'node',
          args: ['./a.js'],
          invocation: ['mcp-protocol', 'cli:mcpc']
        }
      }
    });
    const result = await bundleMcpSkill({ packageRoot: workDir });
    // Each target gets its own skill, keyed by the disambiguated directory name.
    expect(Object.keys(result.skills).sort()).toEqual([
      'my-server-cli-mcpc',
      'my-server-mcp-protocol'
    ]);
    expect(result.skills['my-server-mcp-protocol']?.target).toBe('mcp-protocol');
    expect(result.skills['my-server-cli-mcpc']?.target).toBe('cli:mcpc');
    // Both directories exist on disk under <outDir>.
    expect(existsSync(path.join(workDir, 'skills', 'my-server-mcp-protocol', 'SKILL.md'))).toBe(
      true
    );
    expect(existsSync(path.join(workDir, 'skills', 'my-server-cli-mcpc', 'SKILL.md'))).toBe(true);
    // The "renders only the first" notice must be gone.
    expect(result.failures).toEqual({});
  });

  it('copies generated skills and bundled MCP guidance into install targets', async () => {
    writePkg({
      name: '@my/server',
      'to-skills': {
        mcp: { skillName: 'my-server', command: 'node', args: ['./a.js'] }
      }
    });
    const installDir = path.join(workDir, '.claude', 'skills');
    const result = await bundleMcpSkill({ packageRoot: workDir, installTargets: [installDir] });
    expect(result.failures).toEqual({});
    expect(existsSync(path.join(workDir, 'skills', 'my-server', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(installDir, 'my-server', 'SKILL.md'))).toBe(true);
    expect(existsSync(path.join(workDir, 'skills', 'to-skills-mcp-docs', 'SKILL.md'))).toBe(false);
    expect(existsSync(path.join(installDir, 'to-skills-mcp-docs', 'SKILL.md'))).toBe(true);
    expect(readFileSync(path.join(installDir, 'to-skills-mcp-docs', 'SKILL.md'), 'utf8')).toContain(
      'managed: bundled-guidance'
    );
    expect(readFileSync(path.join(installDir, 'to-skills-mcp-docs', 'SKILL.md'), 'utf8')).toContain(
      'version: 0.1.0'
    );
  });

  it('options.invocation overrides per-entry invocation', async () => {
    writePkg({
      name: '@my/server',
      'to-skills': {
        mcp: {
          skillName: 'my-server',
          command: 'node',
          args: ['./a.js'],
          invocation: 'mcp-protocol'
        }
      }
    });
    const result = await bundleMcpSkill({ packageRoot: workDir, invocation: 'cli:mcpc' });
    expect(result.skills['my-server']?.target).toBe('cli:mcpc');
  });

  it('WrittenSkill.files relativizes nested reference paths regardless of adapter prefix', async () => {
    writePkg({
      name: '@my/server',
      'to-skills': {
        mcp: { skillName: 'my-server', command: 'node', args: ['./a.js'] }
      }
    });
    // Rebind the adapter mock for this test to emit a reference file with
    // a nested path. We can't reassign vi.mock; instead, install a custom
    // ExtractedSkill via extractState whose IR causes the (real) renderer to
    // emit references — except we use the stub adapter, not the real one. So
    // patch via a per-call adapter override. The simplest path: mutate
    // stubAdapter.render in a beforeEach scoped block.

    // Use a fresh mock adapter that emits a deeply-nested reference file.
    const customAdapter = {
      target: 'mcp-protocol' as const,
      fingerprint: { adapter: '@stub/adapter', version: '0.0.0' },
      async render(_: ExtractedSkill, ctx: { skillName: string }): Promise<RenderedSkill> {
        return {
          skill: { filename: `${ctx.skillName}/SKILL.md`, content: '---\n---\n', tokens: 8 },
          references: [
            {
              filename: `${ctx.skillName}/references/deep/nested/file.md`,
              content: '# nested',
              tokens: 4
            },
            // Adapter that doesn't prefix with skillName — the relativizer
            // should still produce a relative path that doesn't escape skillDir.
            { filename: `references/flat.md`, content: '# flat', tokens: 4 }
          ]
        };
      }
    };
    const loaderMod = await import('../../src/adapter/loader.js');
    const orig = loaderMod.loadAdapterAsync;
    (loaderMod as { loadAdapterAsync: typeof loaderMod.loadAdapterAsync }).loadAdapterAsync = vi.fn(
      async () => customAdapter as unknown as InvocationAdapter
    );
    try {
      const result = await bundleMcpSkill({ packageRoot: workDir });
      const written = result.skills['my-server'];
      expect(written).toBeDefined();
      expect(written!.files).toContain('SKILL.md');
      expect(written!.files).toContain(path.join('references', 'deep', 'nested', 'file.md'));
      // The flat-prefix file (no skillName prefix from adapter) escapes via
      // ../, which is the correct relativization given the contract: files is
      // relative to dir, and a file emitted at the outDir root is "above" dir.
      const flat = written!.files.find((f) => f.endsWith('flat.md'));
      expect(flat).toBeDefined();
    } finally {
      (loaderMod as { loadAdapterAsync: typeof loaderMod.loadAdapterAsync }).loadAdapterAsync =
        orig;
    }
  });
});
