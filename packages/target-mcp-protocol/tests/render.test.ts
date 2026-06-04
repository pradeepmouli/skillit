import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import type { AdapterRenderContext, ExtractedSkill } from '@skillit/core';
import { McpProtocolAdapter } from '../src/render.js';

const baseSkill: ExtractedSkill = {
  name: 'my-server',
  description: 'A test MCP server',
  functions: [
    {
      name: 'doThing',
      description: 'Does the thing',
      signature: 'doThing(input: string): void',
      parameters: [{ name: 'input', type: 'string', description: '', optional: false }],
      returnType: 'void',
      examples: [],
      tags: {}
    }
  ],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

/**
 * Inputs to {@link makeCtx} mirror the old flat-context API for test
 * brevity; the helper picks the matching DU arm at construction. Exactly
 * one of `packageName`/`httpEndpoint`/`launchCommand` is required — the
 * renderer in `@skillit/core` enforces this invariant at dispatch time
 * (see `core/test/renderer.invocation.test.ts`).
 */
type CtxInput = {
  skillName?: string;
  maxTokens?: number;
  canonicalize?: boolean;
  packageName?: string;
  binName?: string;
  launchCommand?: {
    command: string;
    args?: readonly string[];
    env?: Readonly<Record<string, string>>;
  };
  httpEndpoint?: { url: string; headers?: Readonly<Record<string, string>> };
};

function makeCtx(overrides: CtxInput = {}): AdapterRenderContext {
  const skillName = overrides.skillName ?? 'my-server';
  const maxTokens = overrides.maxTokens ?? 4000;
  const canonicalize = overrides.canonicalize ?? true;
  if (overrides.packageName !== undefined) {
    return {
      mode: 'bundle',
      skillName,
      maxTokens,
      canonicalize,
      packageName: overrides.packageName,
      ...(overrides.binName !== undefined ? { binName: overrides.binName } : {})
    };
  }
  if (overrides.httpEndpoint !== undefined) {
    return {
      mode: 'http',
      skillName,
      maxTokens,
      canonicalize,
      httpEndpoint: overrides.httpEndpoint
    };
  }
  if (overrides.launchCommand !== undefined) {
    return {
      mode: 'stdio',
      skillName,
      maxTokens,
      canonicalize,
      launchCommand: overrides.launchCommand
    };
  }
  throw new Error(
    'test makeCtx: must supply one of packageName, httpEndpoint, launchCommand (DU invariant)'
  );
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error('no frontmatter');
  return YAML.parse(m[1]!) as Record<string, unknown>;
}

describe('McpProtocolAdapter', () => {
  const adapter = new McpProtocolAdapter();

  it('exposes target and fingerprint', () => {
    expect(adapter.target).toBe('mcp-protocol');
    expect(adapter.fingerprint.adapter).toBe('@skillit/target-mcp-protocol');
    expect(adapter.fingerprint.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('extract mode — ctx.launchCommand is used verbatim', async () => {
    const launchCommand = {
      command: 'npx',
      args: ['-y', '@mcp/server-filesystem', '/tmp'] as const
    };
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: launchCommand.command, args: [...launchCommand.args] } })
    );

    expect(out.skill.content.startsWith('---\n')).toBe(true);
    const fm = parseFrontmatter(out.skill.content) as { mcp: Record<string, unknown> };
    expect(fm.mcp).toBeDefined();
    expect((fm.mcp as Record<string, unknown>)['my-server']).toEqual({
      command: 'npx',
      args: ['-y', '@mcp/server-filesystem', '/tmp']
    });
  });

  it('emits references/functions.md from the IR', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: 'node', args: ['./server.js'] } })
    );
    const fnFile = out.references.find((f) => f.filename === 'my-server/references/functions.md');
    expect(fnFile).toBeDefined();
    expect(fnFile!.content).toContain('doThing');
  });

  it('emits references/resources.md when the IR has resources', async () => {
    const out = await adapter.render(
      {
        ...baseSkill,
        resources: [
          { uri: 'file:///x', name: 'X', description: 'a resource', mimeType: 'text/plain' }
        ]
      },
      makeCtx({ launchCommand: { command: 'node', args: ['./server.js'] } })
    );
    const resFile = out.references.find((f) => f.filename === 'my-server/references/resources.md');
    expect(resFile).toBeDefined();
    expect(resFile!.content).toContain('## X');
    expect(resFile!.content).toContain('text/plain');
  });

  it('emits references/prompts.md when the IR has prompts', async () => {
    const out = await adapter.render(
      {
        ...baseSkill,
        prompts: [
          {
            name: 'summarize',
            description: 'Summarize the input',
            arguments: [{ name: 'topic', required: true, description: 'topic to cover' }]
          }
        ]
      },
      makeCtx({ launchCommand: { command: 'node', args: ['./server.js'] } })
    );
    const pFile = out.references.find((f) => f.filename === 'my-server/references/prompts.md');
    expect(pFile).toBeDefined();
    expect(pFile!.content).toContain('## summarize');
    expect(pFile!.content).toContain('| topic | yes | topic to cover |');
  });

  it('bundle mode — packageName produces npx-by-name self reference', async () => {
    const out = await adapter.render(baseSkill, makeCtx({ packageName: '@org/my-server' }));
    const fm = parseFrontmatter(out.skill.content) as { mcp: Record<string, unknown> };
    const inner = (fm.mcp as Record<string, unknown>)['my-server'] as {
      command: string;
      args: string[];
    };
    expect(inner.command).toBe('npx');
    expect(inner.args).toEqual(['-y', '@org/my-server']);
  });

  it('bundle mode multi-bin — packageName + binName produces --package= form (FR-034)', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ packageName: '@org/my-server', binName: 'mcp-tool' })
    );
    const fm = parseFrontmatter(out.skill.content) as { mcp: Record<string, unknown> };
    const inner = (fm.mcp as Record<string, unknown>)['my-server'] as {
      command: string;
      args: string[];
    };
    expect(inner.command).toBe('npx');
    expect(inner.args).toEqual(['-y', '--package=@org/my-server', 'mcp-tool']);
  });

  // NOTE: pre-DU tests for "binName without packageName ignored",
  // "bundle wins over launchCommand", and "MISSING_LAUNCH_COMMAND when no
  // arm set" have been removed — these states are now unrepresentable in
  // AdapterRenderContext (3-arm DU over `mode`). The renderer in
  // `@skillit/core` enforces exactly-one-arm at dispatch time; see
  // `core/test/renderer.invocation.test.ts` for the new coverage.

  it('http-extract mode — ctx.httpEndpoint emits {url, headers} shape', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({
        httpEndpoint: { url: 'https://example.com/mcp', headers: { Authorization: 'Bearer x' } }
      })
    );
    const fm = parseFrontmatter(out.skill.content) as { mcp: Record<string, unknown> };
    expect((fm.mcp as Record<string, unknown>)['my-server']).toEqual({
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer x' }
    });
  });

  it('http-extract mode without headers omits the headers key', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ httpEndpoint: { url: 'https://example.com/mcp' } })
    );
    const fm = parseFrontmatter(out.skill.content) as { mcp: Record<string, unknown> };
    expect((fm.mcp as Record<string, unknown>)['my-server']).toEqual({
      url: 'https://example.com/mcp'
    });
  });

  // NOTE: pre-DU multi-arm precedence tests ("packageName wins over
  // httpEndpoint", "httpEndpoint wins over launchCommand") removed — the
  // renderer can no longer produce a multi-arm ctx, so adapter-level
  // precedence is moot.
});
