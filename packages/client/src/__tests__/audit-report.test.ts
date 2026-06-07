import { describe, expect, it } from 'vitest';
import type {
  AuditContext,
  DraftedFix,
  ExtractedSkill,
  RefineSource,
  TargetLocation
} from '@skillit/core';
import { buildAuditReport } from '../commands/audit.js';

/** A minimal skill that will fail several audit checks (no keywords, no JSDoc tags). */
function minimalSkill(): ExtractedSkill {
  return {
    name: 'demo',
    description: 'A demo skill for testing the audit report builder shape.',
    functions: [
      {
        name: 'doThing',
        description: 'Does the thing.',
        signature: 'doThing(): void',
        parameters: [],
        returnType: 'void',
        examples: [],
        tags: {},
        sourceModule: 'index'
      }
    ],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };
}

class StubSource implements RefineSource {
  constructor(private readonly skill: ExtractedSkill) {}
  extract(): Promise<ExtractedSkill> {
    return Promise.resolve(this.skill);
  }
  auditContext(): AuditContext {
    return {};
  }
  async applyFixes(_fixes: readonly DraftedFix[]): Promise<void> {}
  resolveTargetLocation(target: { name: string; kind: string }): TargetLocation | undefined {
    return { file: `src/${target.name}.ts`, declName: target.name };
  }
}

describe('buildAuditReport', () => {
  it('returns the audit, the estimate, and per-target resolved locations', async () => {
    const skill = minimalSkill();
    const source = new StubSource(skill);

    const report = await buildAuditReport(source, skill);

    // audit + estimate present
    expect(report.audit.package).toBe('demo');
    expect(typeof report.estimate.total).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.estimate.grade);

    // improvements carry resolved locations for their targets
    const withTargets = report.improvements.filter((i) => (i.targets?.length ?? 0) > 0);
    if (withTargets.length > 0) {
      const first = withTargets[0]!;
      expect(first.resolvedLocations.length).toBe(first.targets!.length);
      expect(first.resolvedLocations[0]).toMatchObject({ declName: expect.any(String) });
    }
  });

  it('tolerates a source without resolveTargetLocation (locations are null)', async () => {
    const skill = minimalSkill();
    const source: RefineSource = {
      extract: () => Promise.resolve(skill),
      auditContext: () => ({}),
      applyFixes: async () => {}
    };

    const report = await buildAuditReport(source, skill);
    for (const imp of report.improvements) {
      for (const loc of imp.resolvedLocations) {
        expect(loc).toBeNull();
      }
    }
  });
});
