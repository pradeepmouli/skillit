// Unit tests for the listTools introspection helper.

import { describe, expect, it } from 'vitest';
import type {
  McpClient,
  McpToolListEntry,
  McpResourceListEntry,
  McpPromptListEntry
} from '../../src/introspect/client-types.js';
import { listTools } from '../../src/introspect/tools.js';

/**
 * Build a stub McpClient that returns the given pages of tools in order.
 * The cursor passed by the caller selects the next page; once `pages` is
 * exhausted, `nextCursor` is undefined.
 */
function makeClient(pages: McpToolListEntry[][]): McpClient {
  return {
    async listTools(params?: { cursor?: string }) {
      const idx = params?.cursor === undefined ? 0 : Number(params.cursor);
      const tools = pages[idx] ?? [];
      const hasNext = idx + 1 < pages.length;
      return {
        tools,
        nextCursor: hasNext ? String(idx + 1) : undefined
      };
    },
    async listResources(_params?: { cursor?: string }) {
      const _entries: McpResourceListEntry[] = [];
      return { resources: _entries, nextCursor: undefined };
    },
    async listPrompts(_params?: { cursor?: string }) {
      const _entries: McpPromptListEntry[] = [];
      return { prompts: _entries, nextCursor: undefined };
    }
  };
}

describe('listTools', () => {
  it('collects all tools across paginated pages and terminates when cursor is undefined', async () => {
    const client = makeClient([
      [
        { name: 'a', description: 'A', inputSchema: { type: 'object' } },
        { name: 'b', description: 'B', inputSchema: { type: 'object' } }
      ],
      [
        { name: 'c', description: 'C', inputSchema: { type: 'object' } },
        { name: 'd', description: 'D', inputSchema: { type: 'object' } }
      ],
      [{ name: 'e', description: 'E', inputSchema: { type: 'object' } }]
    ]);

    const tools = await listTools(client);
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('resolves $ref pointers in inputSchema before mapping parameters', async () => {
    const client = makeClient([
      [
        {
          name: 'createUser',
          description: 'Create a user',
          inputSchema: {
            type: 'object',
            properties: {
              user: { $ref: '#/$defs/User' }
            },
            required: ['user'],
            $defs: {
              User: {
                type: 'object',
                properties: { id: { type: 'string' } }
              }
            }
          }
        }
      ]
    ]);

    const tools = await listTools(client);
    expect(tools).toHaveLength(1);
    const fn = tools[0]!;
    expect(fn.name).toBe('createUser');
    expect(fn.parameters).toHaveLength(1);
    const param = fn.parameters[0]!;
    expect(param.name).toBe('user');
    expect(param.type).toBe('object');
    expect(param.optional).toBe(false);
    // Signature uses bare name for required parameters.
    expect(fn.signature).toBe('createUser(user)');
  });

  it('flags tools with cyclic $refs via tags.schemaError and empty parameters', async () => {
    const client = makeClient([
      [
        {
          name: 'recursive',
          description: 'A recursive node',
          inputSchema: {
            type: 'object',
            properties: {
              root: { $ref: '#/$defs/Node' }
            },
            $defs: {
              Node: {
                type: 'object',
                properties: { next: { $ref: '#/$defs/Node' } }
              }
            }
          }
        }
      ]
    ]);

    const tools = await listTools(client);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.parameters).toEqual([]);
    expect(tools[0]!.tags.schemaError).toBe('true');
    expect(tools[0]!.mcpMetadata?.schemaError).toEqual({ kind: 'ref-cycle' });
    // schemaErrorTool tag carries the offending tool name so the M2 audit
    // rule (Phase 9) can name the culprit when surfacing the row.
    expect(tools[0]!.tags.schemaErrorTool).toBe('recursive');
  });

  it('handles tools with missing/undefined inputSchema as empty parameters', async () => {
    const client = makeClient([
      [
        { name: 'noSchema', description: 'No schema' },
        { name: 'nullSchema', description: 'Null schema', inputSchema: null }
      ]
    ]);

    const tools = await listTools(client);
    expect(tools).toHaveLength(2);
    expect(tools[0]!.parameters).toEqual([]);
    expect(tools[1]!.parameters).toEqual([]);
    // No schemaError tag — these are not error states. Asserting full shape
    // so future drift in the healthy path (e.g. accidentally introducing a
    // tag) is caught.
    expect(tools[0]!.tags).toEqual({});
    expect(tools[1]!.tags).toEqual({});
  });

  it('handles tools with non-object inputSchema as empty parameters without schemaError', async () => {
    // A misbehaving SDK or server returning a string/number instead of an
    // object schema is a data-quality issue at the SDK boundary, not a $ref
    // cycle. We treat it as no usable schema and do NOT tag schemaError —
    // that tag is reserved for cycle failures so the M2 audit rule can
    // distinguish the two.
    const client = makeClient([
      [
        // Cast through unknown because McpToolListEntry types inputSchema as
        // an object; the whole point of the test is exercising the runtime
        // guard against external-origin junk.
        { name: 'badString', description: '', inputSchema: 'not-an-object' as unknown as object },
        { name: 'badNumber', description: '', inputSchema: 42 as unknown as object }
      ]
    ]);

    const tools = await listTools(client);
    expect(tools).toHaveLength(2);
    expect(tools[0]!.parameters).toEqual([]);
    expect(tools[0]!.tags).toEqual({});
    expect(tools[0]!.signature).toBe('badString()');
    expect(tools[1]!.parameters).toEqual([]);
    expect(tools[1]!.tags).toEqual({});
    expect(tools[1]!.signature).toBe('badNumber()');
  });

  it('marks parameters not in `required` as optional and decorates the signature', async () => {
    const client = makeClient([
      [
        {
          name: 'mix',
          description: 'Mixed params',
          inputSchema: {
            type: 'object',
            properties: {
              a: { type: 'string', description: 'first' },
              b: { type: 'number' }
            },
            required: ['a']
          }
        }
      ]
    ]);

    const tools = await listTools(client);
    const fn = tools[0]!;
    expect(fn.parameters).toHaveLength(2);
    const a = fn.parameters.find((p) => p.name === 'a')!;
    const b = fn.parameters.find((p) => p.name === 'b')!;
    expect(a.optional).toBe(false);
    expect(a.description).toBe('first');
    expect(a.type).toBe('string');
    expect(b.optional).toBe(true);
    expect(fn.signature).toBe('mix(a, b?)');
    expect(fn.returnType).toBe('unknown');
    expect(fn.examples).toEqual([]);
    expect(fn.tags).toEqual({});
  });

  it('preserves array element type as T[] and union/anyOf as union', async () => {
    const client = makeClient([
      [
        {
          name: 'shapes',
          description: '',
          inputSchema: {
            type: 'object',
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              value: { anyOf: [{ type: 'string' }, { type: 'number' }] }
            }
          }
        }
      ]
    ]);

    const tools = await listTools(client);
    const params = tools[0]!.parameters;
    expect(params.find((p) => p.name === 'tags')!.type).toBe('string[]');
    expect(params.find((p) => p.name === 'value')!.type).toBe('union');
  });

  it('captures default values as JSON-encoded strings', async () => {
    const client = makeClient([
      [
        {
          name: 'withDefault',
          description: '',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', default: 10 }
            }
          }
        }
      ]
    ]);

    const tools = await listTools(client);
    const param = tools[0]!.parameters[0]!;
    expect(param.defaultValue).toBe('10');
  });

  it('does not mutate the caller-provided inputSchema', async () => {
    const original = {
      type: 'object' as const,
      properties: { user: { $ref: '#/$defs/User' } },
      required: ['user'],
      $defs: {
        User: { type: 'object' as const, properties: { id: { type: 'string' as const } } }
      }
    };
    const snapshot = JSON.stringify(original);
    const client = makeClient([[{ name: 'snap', description: '', inputSchema: original }]]);

    await listTools(client);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
