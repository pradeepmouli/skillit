import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DraftedFix, ExtractedSkill, RefineSource, TargetLocation } from '@skillit/core';
import { createMcpRefineSource } from '@skillit/mcp';
import { buildAuditReport, runAuditCommand } from '../commands/audit.js';

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

describe('runAuditCommand --source mcp guards', () => {
  it('rejects an explicit mcp source without --mcp with a clear message and exit 1', async () => {
    const errors: string[] = [];
    const originalError = console.error;
    const originalExitCode = process.exitCode;
    console.error = (...args: unknown[]): void => {
      errors.push(String(args[0]));
    };
    try {
      await runAuditCommand({ source: 'mcp' });
    } finally {
      console.error = originalError;
    }
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toMatch(/--mcp/);
    process.exitCode = originalExitCode;
  });

  it('rejects an invalid --mode with a clear message and exit 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audit-mcp-mode-'));
    const mcpPath = join(dir, 'mcp.json');
    await writeFile(
      mcpPath,
      JSON.stringify({ mcpServers: { srv: { command: 'node', args: ['server.js'] } } }),
      'utf8'
    );
    const errors: string[] = [];
    const originalError = console.error;
    const originalExitCode = process.exitCode;
    console.error = (...args: unknown[]): void => {
      errors.push(String(args[0]));
    };
    try {
      await runAuditCommand({ source: 'mcp', mcp: mcpPath, mode: 'nonsense' });
    } finally {
      console.error = originalError;
      await rm(dir, { recursive: true, force: true });
    }
    expect(process.exitCode).toBe(1);
    expect(errors.join('\n')).toMatch(/Invalid --mode/);
    process.exitCode = originalExitCode;
  });
});

describe('mcp source is constructible for the audit tail (hermetic, build mode)', () => {
  // `createMcpRefineSource(build).extract()` spawns the live MCP transport, so a
  // full end-to-end `buildAuditReport` here would launch a real subprocess
  // (flaky / non-hermetic). Extraction coverage lives in @skillit/mcp's own
  // tests; here we assert only that the same factory the audit branch calls
  // yields a `RefineSource` shaped to feed `buildAuditReport` (extract +
  // resolveTargetLocation), without spawning anything.
  it('yields a RefineSource with the methods buildAuditReport consumes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'audit-mcp-build-'));
    const mcpPath = join(dir, 'mcp.json');
    await writeFile(
      mcpPath,
      JSON.stringify({ mcpServers: { srv: { command: 'node', args: ['server.js'] } } }),
      'utf8'
    );
    try {
      const source = await createMcpRefineSource({
        mcpPath,
        mode: 'build',
        cwd: dir,
        sourceGlob: join(dir, '**', '*.ts'),
        overlayPath: join(dir, '.skillit-overlay.json')
      });
      expect(typeof source.extract).toBe('function');
      expect(typeof source.applyFixes).toBe('function');
      expect(typeof source.resolveTargetLocation).toBe('function');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
