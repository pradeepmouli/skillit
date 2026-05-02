// Unit tests for `_meta.toSkills` annotation enrichment (Phase 9 / US7 — T102).
//
// Two-layer coverage:
//
//  1. `listTools` (tools.ts) — reads each tool's `_meta.toSkills.{useWhen,
//     avoidWhen, pitfalls}` and projects it onto `ExtractedFunction.tags`.
//     Tested with the same mock-client pattern used in `introspect-tools.test.ts`.
//
//  2. `extractMcpSkill` (extract.ts) — reads `serverInfo._meta.toSkills` and
//     aggregates per-tool meta into the skill-level arrays. Tested via the
//     same SDK-mock pattern used in `extract.test.ts` so we can drive
//     getServerVersion() with arbitrary `_meta` payloads.
//
// All malformed-data assertions verify the additive contract from the task
// brief: bad metadata is silently ignored — a healthy extract must never
// crash because of a misshapen annotation.

import type { ExtractedSkill } from '@to-skills/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  McpClient,
  McpPromptListEntry,
  McpResourceListEntry,
  McpToolListEntry
} from '../../src/introspect/client-types.js';
import { listTools } from '../../src/introspect/tools.js';

// ===========================================================================
// Layer 1: listTools — per-tool _meta.toSkills → ExtractedFunction.tags
// ===========================================================================

function makeClient(tools: McpToolListEntry[]): McpClient {
  return {
    async listTools() {
      return { tools, nextCursor: undefined };
    },
    async listResources() {
      const _r: McpResourceListEntry[] = [];
      return { resources: _r, nextCursor: undefined };
    },
    async listPrompts() {
      const _p: McpPromptListEntry[] = [];
      return { prompts: _p, nextCursor: undefined };
    }
  };
}

describe('listTools — _meta.toSkills (per-tool)', () => {
  it('projects useWhen/avoidWhen/pitfalls onto tags as newline-joined strings', async () => {
    const client = makeClient([
      {
        name: 'search',
        description: 'Search',
        inputSchema: { type: 'object' },
        _meta: {
          toSkills: {
            useWhen: ['use this for X', 'use for Y'],
            avoidWhen: ['avoid for Z'],
            pitfalls: ['NEVER pass a regex with backreferences']
          }
        }
      }
    ]);

    const fns = await listTools(client);
    expect(fns).toHaveLength(1);
    expect(fns[0]!.tags.useWhen).toBe('use this for X\nuse for Y');
    expect(fns[0]!.tags.avoidWhen).toBe('avoid for Z');
    expect(fns[0]!.tags.pitfalls).toBe('NEVER pass a regex with backreferences');
    expect(fns[0]!.mcpMetadata?.toSkills).toEqual({
      useWhen: ['use this for X', 'use for Y'],
      avoidWhen: ['avoid for Z'],
      pitfalls: ['NEVER pass a regex with backreferences']
    });
    // Marker so audit rules can flag tools that emit metadata.
    expect(fns[0]!.tags.hasMetaToSkills).toBe('true');
  });

  it('leaves tags empty when _meta is absent', async () => {
    const client = makeClient([
      { name: 'plain', description: 'no meta', inputSchema: { type: 'object' } }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags).toEqual({});
  });

  it('flags wrong-typed _meta.toSkills.useWhen (e.g. number) as malformed (US6)', async () => {
    const client = makeClient([
      {
        name: 'bad-shape',
        description: '',
        inputSchema: { type: 'object' },
        // useWhen should be string[] — number gets the malformed sentinel
        // (US6, FR-H010); see audit-malformed-meta.test.ts for full coverage.
        _meta: { toSkills: { useWhen: 42 as unknown as string[] } }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.useWhen).toBeUndefined();
    expect(fns[0]!.tags.hasMetaToSkills).toBeUndefined();
    expect(fns[0]!.tags.metaToSkillsMalformed).toBe('useWhen must be string[], got number');
    expect(fns[0]!.mcpMetadata?.toSkills?.malformedReason).toBe(
      'useWhen must be string[], got number'
    );
  });

  it('flags non-string entries in a useWhen array as malformed (US6)', async () => {
    // Pre-US6 this case partially salvaged the valid entries; per FR-H010 the
    // shape mismatch now surfaces a warning instead of silently filtering.
    const client = makeClient([
      {
        name: 'mixed',
        description: '',
        inputSchema: { type: 'object' },
        _meta: { toSkills: { useWhen: ['valid', 7 as unknown as string, '', 'also valid'] } }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.useWhen).toBeUndefined();
    expect(fns[0]!.tags.metaToSkillsMalformed).toBe('useWhen contains non-string entries');
    expect(fns[0]!.mcpMetadata?.toSkills?.malformedReason).toBe(
      'useWhen contains non-string entries'
    );
  });

  it('treats empty _meta.toSkills as no-op (no IR fields, no marker)', async () => {
    const client = makeClient([
      {
        name: 'empty-meta',
        description: '',
        inputSchema: { type: 'object' },
        _meta: { toSkills: {} }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags).toEqual({});
  });

  it('preserves metadata on tools that also produce schemaError tags', async () => {
    // A schema with a self-referential cycle triggers SCHEMA_REF_CYCLE → the
    // mapTool branch sets `schemaError`. Metadata enrichment must still apply
    // so authors don't lose annotations on broken-schema tools.
    const client = makeClient([
      {
        name: 'cyclic',
        description: '',
        inputSchema: {
          type: 'object',
          properties: { self: { $ref: '#/$defs/Self' } },
          $defs: { Self: { $ref: '#/$defs/Self' } }
        },
        _meta: { toSkills: { useWhen: ['still annotated'] } }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.schemaError).toBe('true');
    expect(fns[0]!.tags.useWhen).toBe('still annotated');
    expect(fns[0]!.mcpMetadata?.schemaError).toEqual({ kind: 'ref-cycle' });
    expect(fns[0]!.mcpMetadata?.toSkills?.useWhen).toEqual(['still annotated']);
  });
});

// ===========================================================================
// Layer 2: extractMcpSkill — server-level _meta.toSkills + aggregation
//
// Mirrors the SDK-mock setup from `extract.test.ts` so we can drive
// getServerVersion() with arbitrary `_meta` payloads.
// ===========================================================================

type CapShape = {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
} & Record<string, unknown>;

type ServerInfo = {
  name: string;
  version: string;
  title?: string;
  _meta?: Record<string, unknown>;
};

interface MockState {
  capabilities: CapShape;
  serverInfo: ServerInfo | undefined;
  listToolsImpl: () => Promise<{ tools: McpToolListEntry[]; nextCursor?: string }>;
}

const state: MockState = {
  capabilities: {},
  serverInfo: undefined,
  listToolsImpl: async () => ({ tools: [] })
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class Client {
    constructor(
      public readonly clientInfo: unknown,
      public readonly options: unknown
    ) {}
    async connect(_transport: unknown): Promise<void> {
      /* noop — happy-path connect */
    }
    getServerCapabilities(): CapShape {
      return state.capabilities;
    }
    getServerVersion(): ServerInfo | undefined {
      return state.serverInfo;
    }
    async listTools(): Promise<{ tools: McpToolListEntry[]; nextCursor?: string }> {
      return state.listToolsImpl();
    }
    async listResources() {
      return { resources: [], nextCursor: undefined };
    }
    async listPrompts() {
      return { prompts: [], nextCursor: undefined };
    }
    async close(): Promise<void> {
      /* noop */
    }
  }
  return { Client };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  class StdioClientTransport {
    onclose?: () => void;
    get stderr(): null {
      return null;
    }
    constructor(public readonly params: unknown) {}
    async close(): Promise<void> {
      /* noop */
    }
  }
  return { StdioClientTransport };
});

// Import after vi.mock so the mocked SDK is wired in.
import { extractMcpSkill } from '../../src/extract.js';

const baseStdio = {
  transport: { type: 'stdio' as const, command: 'node', args: ['server.js'] }
};

beforeEach(() => {
  state.capabilities = { tools: {} };
  state.serverInfo = { name: 'meta-test', version: '1.0.0' };
  state.listToolsImpl = async () => ({ tools: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('extractMcpSkill — server-level _meta.toSkills', () => {
  it('populates skill.remarks and skill.packageDescription', async () => {
    state.serverInfo = {
      name: 'meta-test',
      version: '1.0.0',
      _meta: {
        toSkills: {
          remarks: 'This server is best for X.',
          packageDescription: 'Tools for X management.'
        }
      }
    };

    const skill: ExtractedSkill = await extractMcpSkill(baseStdio);
    expect(skill.remarks).toBe('This server is best for X.');
    expect(skill.packageDescription).toBe('Tools for X management.');
  });

  it('aggregates server-level useWhen + per-tool useWhen onto skill.useWhen', async () => {
    state.serverInfo = {
      name: 'meta-test',
      version: '1.0.0',
      _meta: {
        toSkills: {
          useWhen: ['Server-wide trigger A', 'Server-wide trigger B']
        }
      }
    };
    state.listToolsImpl = async () => ({
      tools: [
        {
          name: 't1',
          description: '',
          inputSchema: { type: 'object' },
          _meta: { toSkills: { useWhen: ['Tool-specific trigger C'] } }
        },
        {
          name: 't2',
          description: '',
          inputSchema: { type: 'object' }
        }
      ]
    });

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.useWhen).toEqual([
      'Server-wide trigger A',
      'Server-wide trigger B',
      'Tool-specific trigger C'
    ]);
  });

  it('aggregates avoidWhen and pitfalls onto skill arrays', async () => {
    state.serverInfo = {
      name: 'meta-test',
      version: '1.0.0',
      _meta: {
        toSkills: {
          avoidWhen: ['Avoid scenario X'],
          pitfalls: ['NEVER pass null']
        }
      }
    };
    state.listToolsImpl = async () => ({
      tools: [
        {
          name: 't1',
          description: '',
          inputSchema: { type: 'object' },
          _meta: {
            toSkills: {
              avoidWhen: ['Avoid Y for tool t1'],
              pitfalls: ['NEVER pass empty array to t1']
            }
          }
        }
      ]
    });

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.avoidWhen).toEqual(['Avoid scenario X', 'Avoid Y for tool t1']);
    expect(skill.pitfalls).toEqual(['NEVER pass null', 'NEVER pass empty array to t1']);
  });

  it('leaves IR fields unset when _meta.toSkills is empty', async () => {
    state.serverInfo = {
      name: 'meta-test',
      version: '1.0.0',
      _meta: { toSkills: {} }
    };

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.useWhen).toBeUndefined();
    expect(skill.avoidWhen).toBeUndefined();
    expect(skill.pitfalls).toBeUndefined();
    expect(skill.remarks).toBeUndefined();
    expect(skill.packageDescription).toBeUndefined();
  });

  it('silently rejects malformed server-level meta (non-object _meta)', async () => {
    state.serverInfo = {
      name: 'meta-test',
      version: '1.0.0',
      _meta: 'not-an-object' as unknown as Record<string, unknown>
    };

    // Must not throw — additive feature.
    const skill = await extractMcpSkill(baseStdio);
    expect(skill.useWhen).toBeUndefined();
    expect(skill.remarks).toBeUndefined();
  });

  it('silently rejects malformed server-level useWhen (non-array)', async () => {
    state.serverInfo = {
      name: 'meta-test',
      version: '1.0.0',
      _meta: { toSkills: { useWhen: 'should-be-array' } }
    };

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.useWhen).toBeUndefined();
  });

  it('produces no aggregated array when neither server nor any tool emits meta', async () => {
    state.serverInfo = { name: 'meta-test', version: '1.0.0' };
    state.listToolsImpl = async () => ({
      tools: [{ name: 't1', description: '', inputSchema: { type: 'object' } }]
    });

    const skill = await extractMcpSkill(baseStdio);
    expect(skill.useWhen).toBeUndefined();
    expect(skill.avoidWhen).toBeUndefined();
    expect(skill.pitfalls).toBeUndefined();
  });
});
