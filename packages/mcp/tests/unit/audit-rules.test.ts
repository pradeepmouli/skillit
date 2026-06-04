/**
 * Unit tests (T105) for the M1–M4 audit rules and the `runMcpAudit`
 * aggregator. M5 (freshness) has its own dedicated test file
 * (`audit-freshness.test.ts`); we cover only the aggregator-level integration
 * here to avoid duplicating freshness-specific cases.
 *
 * Coverage matrix:
 *   1. M1 — empty description triggers fatal
 *   2. M2 — `tags.schemaError` triggers error
 *   3. M3 — no useWhen anywhere → server-level warning
 *   4. M3 — per-tool warning when server has useWhen but tool does not
 *   5. M3 — cap collapses tail into a summary at 6 missing tools
 *   6. M4 — `get` triggers alert
 *   7. M4 — custom genericNames option overrides default
 *   8. M5 — stale fingerprint surfaces through aggregator
 *   9. runMcpAudit — severity-then-code ordering is deterministic
 *  10. runMcpAudit — no fingerprint args → no M5
 *  11. runMcpAudit — clean skill returns []
 */

import type { AdapterFingerprint, ExtractedFunction, ExtractedSkill } from '@skillit/core';
import { describe, expect, it } from 'vitest';
import type { InvocationAdapter } from '../../src/adapter/types.js';
import { runM1 } from '../../src/audit/rule-m1.js';
import { runM2 } from '../../src/audit/rule-m2.js';
import { runM3 } from '../../src/audit/rule-m3.js';
import { runM4 } from '../../src/audit/rule-m4.js';
import { runMcpAudit } from '../../src/audit/rules.js';

/**
 * Compose an ExtractedFunction with sensible defaults — the audit rules read
 * a small subset of fields, and the helper keeps each test case focused on
 * the field that matters to its assertion.
 */
function fn(overrides: Partial<ExtractedFunction> & { name: string }): ExtractedFunction {
  return {
    name: overrides.name,
    description: overrides.description ?? 'Default description.',
    signature: overrides.signature ?? `${overrides.name}()`,
    parameters: overrides.parameters ?? [],
    returnType: overrides.returnType ?? 'unknown',
    examples: overrides.examples ?? [],
    tags: overrides.tags ?? { useWhen: 'When testing' }
  };
}

/**
 * Compose an ExtractedSkill with sensible defaults. Defaults to one healthy
 * tool so each test case can override only the fields it cares about.
 */
function skill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: overrides.name ?? 'fixture',
    description: overrides.description ?? 'Fixture skill for audit unit tests.',
    functions: overrides.functions ?? [fn({ name: 'compute' })],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    ...(overrides.useWhen !== undefined ? { useWhen: overrides.useWhen } : {})
  };
}

function makeAdapter(version: string): InvocationAdapter {
  return {
    target: 'cli:mcpc',
    fingerprint: { adapter: '@skillit/target-mcpc', version, targetCliRange: 'mcpc@^2.1' },
    render: async () => {
      throw new Error('not used in audit tests');
    }
  };
}

function makeFingerprint(version: string): AdapterFingerprint {
  return { adapter: '@skillit/target-mcpc', version, targetCliRange: 'mcpc@^2.1' };
}

describe('audit rule M1 — missing tool description', () => {
  it('emits fatal for tools with empty description', () => {
    const issues = runM1(skill({ functions: [fn({ name: 'compute', description: '' })] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('M1');
    expect(issues[0]!.severity).toBe('fatal');
    expect(issues[0]!.location?.tool).toBe('compute');
    expect(issues[0]!.message).toContain('compute');
    expect(issues[0]!.suggestion).toMatch(/description to the tool/i);
  });

  it('treats whitespace-only description as missing', () => {
    const issues = runM1(skill({ functions: [fn({ name: 'compute', description: '   \n  ' })] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('fatal');
  });

  it('emits nothing for a populated description', () => {
    expect(runM1(skill())).toEqual([]);
  });
});

describe('audit rule M2 — invalid inputSchema', () => {
  it('emits error when tags.schemaError is set', () => {
    const issues = runM2(
      skill({
        functions: [
          fn({
            name: 'broken',
            tags: { schemaError: 'true', schemaErrorTool: 'broken', useWhen: 'demo' },
            mcpMetadata: { schemaError: { kind: 'ref-cycle' } }
          })
        ]
      })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('M2');
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.message).toMatch(/cycle in \$ref/);
    expect(issues[0]!.location?.tool).toBe('broken');
    expect(issues[0]!.suggestion).toMatch(/inputSchema/i);
  });

  it('emits nothing when no tool has the marker', () => {
    expect(runM2(skill())).toEqual([]);
  });
});

describe('audit rule M3 — missing useWhen', () => {
  it('emits server-level warning when no useWhen exists anywhere', () => {
    const issues = runM3(
      skill({
        functions: [fn({ name: 'a', tags: {} }), fn({ name: 'b', tags: {} })]
      })
    );
    // 2 per-tool warnings + 1 server-level
    expect(issues).toHaveLength(3);
    expect(issues.filter((i) => i.location?.tool === undefined)).toHaveLength(1);
    expect(issues.filter((i) => i.location?.tool !== undefined)).toHaveLength(2);
  });

  it('emits per-tool warning only when server has useWhen but a tool does not', () => {
    const issues = runM3(
      skill({
        useWhen: ['Server-level trigger'],
        functions: [fn({ name: 'a', tags: { useWhen: 'When A' } }), fn({ name: 'b', tags: {} })]
      })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.location?.tool).toBe('b');
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.suggestion).toMatch(/useWhen/i);
  });

  it('caps per-tool issues at 5 and emits a summary for the overflow', () => {
    const fns = Array.from({ length: 6 }, (_, i) => fn({ name: `tool${i}`, tags: {} }));
    const issues = runM3(skill({ functions: fns }));
    // 5 per-tool kept + 1 summary + 1 server-level (none of the 6 had useWhen
    // and skill.useWhen is empty)
    expect(issues).toHaveLength(7);
    const summary = issues.find((i) => i.message.startsWith('+ '));
    expect(summary).toBeDefined();
    expect(summary!.message).toContain('1 more');
  });

  it('emits nothing when every tool has useWhen', () => {
    expect(
      runM3(
        skill({
          functions: [
            fn({ name: 'a', tags: { useWhen: 'A' } }),
            fn({ name: 'b', tags: { useWhen: 'B' } })
          ]
        })
      )
    ).toEqual([]);
  });

  it('does not emit a server-level warning for zero-tool servers', () => {
    expect(
      runM3(
        skill({
          functions: []
        })
      )
    ).toEqual([]);
  });
});

describe('audit rule M4 — generic tool name', () => {
  it('flags default generic names case-insensitively', () => {
    const issues = runM4(
      skill({
        functions: [fn({ name: 'get' }), fn({ name: 'GET' }), fn({ name: 'specific_action' })]
      })
    );
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.code === 'M4' && i.severity === 'alert')).toBe(true);
    expect(issues.map((i) => i.location?.tool)).toEqual(['get', 'GET']);
    expect(issues[0]!.suggestion).toMatch(/more specific name/i);
  });

  it('respects custom genericNames option (replaces, not augments)', () => {
    const issues = runM4(skill({ functions: [fn({ name: 'get' }), fn({ name: 'frob' })] }), {
      genericNames: ['frob']
    });
    // `get` no longer flagged because the override replaces the default list.
    expect(issues).toHaveLength(1);
    expect(issues[0]!.location?.tool).toBe('frob');
  });

  it('emits nothing when nothing is generic', () => {
    expect(runM4(skill({ functions: [fn({ name: 'list_users' })] }))).toEqual([]);
  });
});

describe('runMcpAudit aggregator', () => {
  it('passes M5 freshness through when both fingerprints are supplied', () => {
    const issues = runMcpAudit(skill(), makeFingerprint('1.0.0'), makeAdapter('1.1.0'));
    expect(issues.some((i) => i.code === 'M5' && i.severity === 'warning')).toBe(true);
  });

  it('skips M5 when no fingerprint args are passed', () => {
    const issues = runMcpAudit(skill());
    expect(issues.some((i) => i.code === 'M5')).toBe(false);
  });

  it('returns [] for a clean skill (description, useWhen, no schemaError, specific name, fresh fingerprint)', () => {
    const issues = runMcpAudit(
      skill({
        useWhen: ['Healthy trigger'],
        functions: [
          fn({
            name: 'specific_compute',
            description: 'Compute the answer.',
            tags: { useWhen: 'When computing' }
          })
        ]
      }),
      makeFingerprint('1.2.3'),
      makeAdapter('1.2.3')
    );
    expect(issues).toEqual([]);
  });

  it('orders issues deterministically: severity descending, then code ascending', () => {
    // Hand-craft a skill that triggers M1 (fatal), M2 (error), M3 (warning), M4 (alert),
    // plus M5 (warning) via stale fingerprint. Expected order:
    //   M1 fatal, M2 error, M3 warning, M5 warning, M4 alert
    const issues = runMcpAudit(
      skill({
        functions: [
          // Triggers M1 (no description), M3 (no useWhen) AND M4 (generic name `get`)
          fn({ name: 'get', description: '', tags: {} }),
          // Triggers M2
          fn({
            name: 'broken',
            description: 'broken tool',
            tags: { schemaError: 'true', schemaErrorTool: 'broken', useWhen: 'demo' }
          })
        ]
      }),
      makeFingerprint('1.0.0'),
      makeAdapter('1.1.0')
    );
    const codes = issues.map((i) => i.code);
    // Severity sort puts fatal first, then error, then warnings (M3 + M5 — code-asc puts M3 before M5),
    // then alert (M4) last.
    const fatalIdx = codes.indexOf('M1');
    const errorIdx = codes.indexOf('M2');
    const m3Idx = codes.indexOf('M3');
    const m5Idx = codes.indexOf('M5');
    const m4Idx = codes.indexOf('M4');
    expect(fatalIdx).toBeLessThan(errorIdx);
    expect(errorIdx).toBeLessThan(m3Idx);
    expect(m3Idx).toBeLessThan(m5Idx);
    expect(m5Idx).toBeLessThan(m4Idx);
  });
});
