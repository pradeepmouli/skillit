/**
 * Unit tests (T046, US6) for the M3 sub-rule that surfaces malformed
 * `_meta.toSkills` annotations as warning-severity audit issues
 * (FR-H010 / data-model.md §8).
 *
 * Two layers of coverage:
 *
 *  1. **Audit layer** — given an `ExtractedSkill` whose function carries the
 *     `tags.metaToSkillsMalformed` sentinel, `runMcpAudit` (and the M3 rule
 *     directly) emit a warning per offending tool with a `/malformed _meta\.toSkills/`
 *     message and `location.tool`.
 *
 *  2. **Introspector layer** — given an MCP server returning a tool with a
 *     wrong-shape `_meta.toSkills`, `listTools` writes the sentinel onto
 *     `ExtractedFunction.tags.metaToSkillsMalformed`. This is the contract
 *     the audit layer relies on; covered with the same mock-client pattern
 *     used elsewhere in `tests/unit/`.
 */

import type { ExtractedFunction, ExtractedSkill } from '@to-skills/core';
import { describe, expect, it } from 'vitest';
import type {
  McpClient,
  McpPromptListEntry,
  McpResourceListEntry,
  McpToolListEntry
} from '../../src/introspect/client-types.js';
import { listTools } from '../../src/introspect/tools.js';
import { runM3 } from '../../src/audit/rule-m3.js';
import { runMcpAudit } from '../../src/audit/rules.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fn(overrides: Partial<ExtractedFunction> & { name: string }): ExtractedFunction {
  return {
    name: overrides.name,
    description: overrides.description ?? 'Default description.',
    signature: overrides.signature ?? `${overrides.name}()`,
    parameters: overrides.parameters ?? [],
    returnType: overrides.returnType ?? 'unknown',
    examples: overrides.examples ?? [],
    // Default to a populated useWhen so the unrelated missing-useWhen branch
    // of M3 does not pollute these test assertions.
    tags: overrides.tags ?? { useWhen: 'When testing' }
  };
}

function skill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: overrides.name ?? 'fixture',
    description: overrides.description ?? 'Fixture skill for malformed-meta tests.',
    functions: overrides.functions ?? [fn({ name: 'compute' })],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    // Provide a server-level useWhen by default so the server-level missing
    // branch in M3 does not fire and confuse assertions.
    useWhen: overrides.useWhen ?? ['Use when testing']
  };
}

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

// ---------------------------------------------------------------------------
// Audit layer
// ---------------------------------------------------------------------------

describe('audit rule M3 — malformed _meta.toSkills sub-rule (US6)', () => {
  it('emits a warning when a tool has tags.metaToSkillsMalformed set', () => {
    const sk = skill({
      functions: [
        fn({
          name: 'badTool',
          tags: {
            useWhen: 'When testing',
            metaToSkillsMalformed: 'useWhen must be string[], got string'
          }
        })
      ]
    });

    const issues = runM3(sk);
    const malformed = issues.filter((i) => /malformed _meta\.toSkills/.test(i.message));
    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toMatchObject({
      code: 'M3',
      severity: 'warning',
      location: { tool: 'badTool' }
    });
    expect(malformed[0]!.message).toContain('useWhen must be string[], got string');
    expect(malformed[0]!.suggestion).toBe(
      'Change to array: _meta.toSkills.useWhen = ["[scenario]"]'
    );
  });

  it('emits no malformed-meta warning when the sentinel is absent', () => {
    const sk = skill({
      functions: [fn({ name: 'cleanTool', tags: { useWhen: 'When testing' } })]
    });

    const issues = runM3(sk);
    expect(issues.some((i) => /malformed _meta\.toSkills/.test(i.message))).toBe(false);
  });

  it('emits one warning per malformed tool when multiple tools are affected', () => {
    const sk = skill({
      functions: [
        fn({
          name: 'badA',
          tags: {
            useWhen: 'When testing',
            metaToSkillsMalformed: 'useWhen must be string[], got number'
          }
        }),
        fn({
          name: 'badB',
          tags: {
            useWhen: 'When testing',
            metaToSkillsMalformed: 'avoidWhen contains non-string entries'
          }
        }),
        fn({ name: 'okC', tags: { useWhen: 'When testing' } })
      ]
    });

    const issues = runM3(sk);
    const malformed = issues.filter((i) => /malformed _meta\.toSkills/.test(i.message));
    expect(malformed).toHaveLength(2);
    expect(malformed.map((i) => i.location?.tool)).toEqual(['badA', 'badB']);
    expect(malformed[0]!.suggestion).toMatch(/useWhen|Fix _meta\.toSkills shape/);
    expect(malformed[1]!.suggestion).toMatch(/Fix _meta\.toSkills shape/);
  });

  it('flows through runMcpAudit with the expected sort order (warnings)', () => {
    const sk = skill({
      functions: [
        fn({
          name: 'alpha',
          tags: {
            useWhen: 'When testing',
            metaToSkillsMalformed: 'pitfalls contains empty strings'
          }
        })
      ]
    });

    const issues = runMcpAudit(sk);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'M3',
      severity: 'warning',
      location: { tool: 'alpha' }
    });
    expect(issues[0]!.message).toMatch(/malformed _meta\.toSkills/);
    expect(issues[0]!.suggestion).toMatch(/Fix _meta\.toSkills shape/);
  });
});

// ---------------------------------------------------------------------------
// Introspector layer — sentinel-planting contract
// ---------------------------------------------------------------------------

describe('listTools — malformed _meta.toSkills sentinel (US6)', () => {
  it('plants tags.metaToSkillsMalformed when useWhen is a bare string', async () => {
    const client = makeClient([
      {
        name: 'wrongShape',
        description: '',
        inputSchema: { type: 'object' },
        _meta: { toSkills: { useWhen: 'should-be-array' as unknown as string[] } }
      }
    ]);

    const fns = await listTools(client);
    expect(fns).toHaveLength(1);
    expect(fns[0]!.tags.metaToSkillsMalformed).toBe('useWhen must be string[], got string');
    expect(fns[0]!.mcpMetadata?.toSkills?.malformedReason).toBe(
      'useWhen must be string[], got string'
    );
    // The malformed key itself should NOT be projected onto tags.
    expect(fns[0]!.tags.useWhen).toBeUndefined();
    // hasMetaToSkills marker should not fire for a malformed-only annotation.
    expect(fns[0]!.tags.hasMetaToSkills).toBeUndefined();
  });

  it('plants the sentinel when toSkills itself is the wrong type', async () => {
    const client = makeClient([
      {
        name: 'metaIsString',
        description: '',
        inputSchema: { type: 'object' },
        // toSkills must be an object; here it's a string.
        _meta: { toSkills: 'oops' as unknown as Record<string, unknown> }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.metaToSkillsMalformed).toBe('toSkills must be object, got string');
    expect(fns[0]!.mcpMetadata?.toSkills?.malformedReason).toBe(
      'toSkills must be object, got string'
    );
  });

  it('plants the sentinel when an array contains non-string entries', async () => {
    const client = makeClient([
      {
        name: 'mixed',
        description: '',
        inputSchema: { type: 'object' },
        _meta: { toSkills: { useWhen: ['valid', 7 as unknown as string, 'also valid'] } }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.metaToSkillsMalformed).toBe('useWhen contains non-string entries');
    expect(fns[0]!.mcpMetadata?.toSkills?.malformedReason).toBe(
      'useWhen contains non-string entries'
    );
    // The malformed key is dropped — no partial pickup.
    expect(fns[0]!.tags.useWhen).toBeUndefined();
  });

  it('plants the sentinel when an array contains empty strings', async () => {
    const client = makeClient([
      {
        name: 'emptyEntry',
        description: '',
        inputSchema: { type: 'object' },
        _meta: { toSkills: { avoidWhen: ['valid', ''] } }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.metaToSkillsMalformed).toBe('avoidWhen contains empty strings');
    expect(fns[0]!.tags.avoidWhen).toBeUndefined();
  });

  it('keeps valid sibling fields when only one key is malformed', async () => {
    const client = makeClient([
      {
        name: 'partial',
        description: '',
        inputSchema: { type: 'object' },
        _meta: {
          toSkills: {
            useWhen: ['Use when X'],
            // Wrong shape — should be flagged but should NOT erase useWhen.
            avoidWhen: 99 as unknown as string[]
          }
        }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.useWhen).toBe('Use when X');
    expect(fns[0]!.tags.metaToSkillsMalformed).toBe('avoidWhen must be string[], got number');
    // Mixed cases prefer the malformed sentinel and skip the marker.
    expect(fns[0]!.tags.hasMetaToSkills).toBeUndefined();
  });

  it('joins multiple malformed reasons with "; "', async () => {
    const client = makeClient([
      {
        name: 'doubleBad',
        description: '',
        inputSchema: { type: 'object' },
        _meta: {
          toSkills: {
            useWhen: 'no-array' as unknown as string[],
            avoidWhen: [42 as unknown as string]
          }
        }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.metaToSkillsMalformed).toBe(
      'useWhen must be string[], got string; avoidWhen contains non-string entries'
    );
  });

  it('end-to-end: malformed tool from listTools surfaces an M3 warning via runM3', async () => {
    const client = makeClient([
      {
        name: 'bad',
        description: 'A tool with broken metadata.',
        inputSchema: { type: 'object' },
        _meta: { toSkills: { useWhen: 'oops' as unknown as string[] } }
      }
    ]);

    const fns = await listTools(client);
    const sk = skill({ functions: fns });
    const issues = runM3(sk);
    const malformed = issues.filter((i) => /malformed _meta\.toSkills/.test(i.message));
    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toMatchObject({
      code: 'M3',
      severity: 'warning',
      location: { tool: 'bad' }
    });
  });
});
