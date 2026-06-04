/**
 * Unit tests for the M3 audit rule behavior with flat `_meta` format.
 *
 * Two layers of coverage:
 *
 *  1. **Audit layer** — verifies that `runM3` does NOT emit malformed-meta
 *     warnings in the new flat format (no malformed detection in rule-m3).
 *
 *  2. **Introspector layer** — given an MCP server returning a tool with flat
 *     `_meta` string fields, `listTools` reads them correctly without setting
 *     a `metaToSkillsMalformed` sentinel.
 */

import type { ExtractedFunction, ExtractedSkill } from '@skillit/core';
import { describe, expect, it } from 'vitest';
import type {
  McpClient,
  McpPromptListEntry,
  McpResourceListEntry,
  McpToolListEntry
} from '../../src/introspect/client-types.js';
import { listTools } from '../../src/introspect/tools.js';
import { runM3 } from '../../src/audit/rule-m3.js';

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

describe('audit rule M3 — malformed-meta warnings (flat format)', () => {
  it('emits no malformed-meta warning when the sentinel is absent', () => {
    const sk = skill({
      functions: [fn({ name: 'cleanTool', tags: { useWhen: 'When testing' } })]
    });

    const issues = runM3(sk);
    expect(issues.some((i) => /malformed _meta\.toSkills/.test(i.message))).toBe(false);
  });

  it('emits no malformed-meta warning even when metaToSkillsMalformed tag is present (flat format drops sentinel)', () => {
    // In the new flat format, the introspector no longer plants a malformed
    // sentinel — bad values are silently skipped. This test confirms the audit
    // rule does not accidentally emit a warning if a legacy tag exists.
    const sk = skill({
      functions: [
        fn({
          name: 'legacyTool',
          tags: {
            useWhen: 'When testing',
            metaToSkillsMalformed: 'legacy sentinel from old format'
          }
        })
      ]
    });

    const issues = runM3(sk);
    expect(issues.some((i) => /malformed _meta\.toSkills/.test(i.message))).toBe(false);
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
