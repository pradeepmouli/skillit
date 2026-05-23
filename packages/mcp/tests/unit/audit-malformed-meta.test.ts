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
// Introspector layer — flat-format reading contract
// ---------------------------------------------------------------------------

describe('listTools — flat _meta string reading (new format)', () => {
  it('reads a valid flat useWhen string and does not set metaToSkillsMalformed', async () => {
    const client = makeClient([
      {
        name: 'goodShape',
        description: '',
        inputSchema: { type: 'object' },
        _meta: { useWhen: 'use when searching' }
      }
    ]);

    const fns = await listTools(client);
    expect(fns).toHaveLength(1);
    expect(fns[0]!.tags.useWhen).toBe('use when searching');
    expect(fns[0]!.tags['metaToSkillsMalformed']).toBeUndefined();
    expect(fns[0]!.tags.hasMetaToSkills).toBe('true');
    expect(fns[0]!.mcpMetadata?.toSkills?.useWhen).toEqual(['use when searching']);
  });

  it('silently skips non-string values for known fields (no sentinel in new format)', async () => {
    const client = makeClient([
      {
        name: 'numberShape',
        description: '',
        inputSchema: { type: 'object' },
        // Non-string values are silently skipped in the new flat format.
        _meta: { useWhen: 42 as unknown as string }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags['metaToSkillsMalformed']).toBeUndefined();
    expect(fns[0]!.tags.useWhen).toBeUndefined();
    expect(fns[0]!.tags.hasMetaToSkills).toBeUndefined();
  });

  it('silently skips array values for known fields (no sentinel in new format)', async () => {
    const client = makeClient([
      {
        name: 'arrayShape',
        description: '',
        inputSchema: { type: 'object' },
        // Old format arrays are silently skipped in the new flat format.
        _meta: { useWhen: ['valid', 'also valid'] as unknown as string }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags['metaToSkillsMalformed']).toBeUndefined();
    expect(fns[0]!.tags.useWhen).toBeUndefined();
  });

  it('reads valid sibling fields and skips non-string ones independently', async () => {
    const client = makeClient([
      {
        name: 'partial',
        description: '',
        inputSchema: { type: 'object' },
        _meta: {
          useWhen: 'Use when X',
          // Non-string avoidWhen is silently skipped.
          avoidWhen: 99 as unknown as string
        }
      }
    ]);

    const fns = await listTools(client);
    expect(fns[0]!.tags.useWhen).toBe('Use when X');
    expect(fns[0]!.tags.avoidWhen).toBeUndefined();
    expect(fns[0]!.tags['metaToSkillsMalformed']).toBeUndefined();
    // hasMetaToSkills fires because at least one valid field was read.
    expect(fns[0]!.tags.hasMetaToSkills).toBe('true');
  });

  it('end-to-end: tool with flat useWhen has no M3 malformed warning via runM3', async () => {
    const client = makeClient([
      {
        name: 'annotated',
        description: 'A tool with flat metadata.',
        inputSchema: { type: 'object' },
        _meta: { useWhen: 'use when you need to annotate' }
      }
    ]);

    const fns = await listTools(client);
    const sk = skill({ functions: fns });
    const issues = runM3(sk);
    const malformed = issues.filter((i) => /malformed _meta\.toSkills/.test(i.message));
    expect(malformed).toHaveLength(0);
    // Also no missing-useWhen warning since the tool has useWhen.
    const missingUseWhen = issues.filter(
      (i) => i.location?.tool === 'annotated' && /useWhen/.test(i.message)
    );
    expect(missingUseWhen).toHaveLength(0);
  });
});
