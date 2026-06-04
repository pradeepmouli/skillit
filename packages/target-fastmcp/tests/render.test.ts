import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import type { AdapterRenderContext, ExtractedSkill } from '@skillit/core';
import { FastMcpAdapter } from '../src/render.js';

const baseSkill: ExtractedSkill = {
  name: 'demo-server',
  description: 'A test fastmcp-proxied server',
  functions: [
    {
      name: 'doThing',
      description: 'Does the thing',
      signature: 'doThing(input: string)',
      parameters: [{ name: 'input', type: 'string', description: 'an input', optional: false }],
      returnType: 'unknown',
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
 * renderer in `@skillit/core` enforces this invariant at dispatch time.
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
  const skillName = overrides.skillName ?? 'demo-server';
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

describe('FastMcpAdapter', () => {
  const adapter = new FastMcpAdapter();

  it('exposes target and fingerprint with target-cli-range', () => {
    expect(adapter.target).toBe('cli:fastmcp');
    expect(adapter.fingerprint.adapter).toBe('@skillit/target-fastmcp');
    expect(adapter.fingerprint.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(adapter.fingerprint.targetCliRange).toBe('fastmcp@^2');
  });

  it('does NOT emit `mcp:` frontmatter (reserved for mcp-protocol adapter)', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    const fm = parseFrontmatter(out.skill.content);
    expect(fm['mcp']).toBeUndefined();
  });

  it('emits `generated-by:` frontmatter with adapter, version, target-cli-range', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    const fm = parseFrontmatter(out.skill.content) as {
      'generated-by'?: { adapter?: string; version?: string; 'target-cli-range'?: string };
    };
    expect(fm['generated-by']).toBeDefined();
    expect(fm['generated-by']!.adapter).toBe('@skillit/target-fastmcp');
    expect(fm['generated-by']!.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(fm['generated-by']!['target-cli-range']).toBe('fastmcp@^2');
  });

  it('Setup section includes the install command', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    expect(out.skill.content).toContain('## Setup');
    expect(out.skill.content).toContain('pip install fastmcp');
  });

  it('Setup section embeds FR-IT-012 fingerprint trace line', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    expect(out.skill.content).toMatch(
      /Generated for fastmcp 2\.x via @to-skills\/target-fastmcp \d+\.\d+\.\d+/
    );
  });

  it('Setup section includes `pyfastmcp connect` command using launchCommand', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    expect(out.skill.content).toContain('pyfastmcp connect demo-server -- python ./server.py');
  });

  it('Setup section uses --url form for HTTP endpoint', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ httpEndpoint: { url: 'https://example.com/mcp' } })
    );
    expect(out.skill.content).toContain(
      'pyfastmcp connect demo-server --url https://example.com/mcp'
    );
  });

  it('emits references/tools.md with fastmcp command rows and parameter table', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    const tools = out.references.find((f) => f.filename === 'demo-server/references/tools.md');
    expect(tools).toBeDefined();
    expect(tools!.content).toContain('pyfastmcp call demo-server doThing input=<value>');
    expect(tools!.content).toContain('| MCP Name | CLI Flag/Key | Type | Required | Description |');
    expect(tools!.content).toContain('| input | input=<value> | string | yes | an input |');
  });

  it('does NOT emit references/functions.md (skipDefaultFunctionsRef)', async () => {
    const out = await adapter.render(
      baseSkill,
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    const fnFile = out.references.find((f) => f.filename === 'demo-server/references/functions.md');
    expect(fnFile).toBeUndefined();
  });

  it('still emits references/resources.md when the IR has resources', async () => {
    const out = await adapter.render(
      {
        ...baseSkill,
        resources: [
          { uri: 'file:///x', name: 'X', description: 'a resource', mimeType: 'text/plain' }
        ]
      },
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    const resFile = out.references.find(
      (f) => f.filename === 'demo-server/references/resources.md'
    );
    expect(resFile).toBeDefined();
    expect(resFile!.content).toContain('## X');
  });

  it('still emits references/prompts.md when the IR has prompts', async () => {
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
      makeCtx({ launchCommand: { command: 'python', args: ['./server.py'] } })
    );
    const pFile = out.references.find((f) => f.filename === 'demo-server/references/prompts.md');
    expect(pFile).toBeDefined();
    expect(pFile!.content).toContain('## summarize');
  });

  // NOTE: pre-DU "throws MISSING_LAUNCH_COMMAND when no launch info" test
  // removed — the no-arm state is unrepresentable in AdapterRenderContext;
  // the renderer in `@skillit/core` enforces exactly-one-arm at dispatch
  // time (see `core/test/renderer.invocation.test.ts`).

  it('falls back to npx-by-name when only packageName is set', async () => {
    const out = await adapter.render(baseSkill, makeCtx({ packageName: '@org/demo-server' }));
    expect(out.skill.content).toContain('pyfastmcp connect demo-server -- npx -y @org/demo-server');
  });
});
