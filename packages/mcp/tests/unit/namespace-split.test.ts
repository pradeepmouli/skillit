/**
 * Unit tests for `splitToolsByNamespace` (T110, FR-022).
 *
 * Covers:
 *  - 5-tool small fixture → no split (single `tools` group)
 *  - 150-tool fixture across 3 namespaces → per-namespace groups
 *  - tools without `.` get bucketed in the default `tools` group
 *  - integration with `McpcAdapter`: SKILL.md + per-namespace `tools-<ns>.md`
 *    files are emitted and the rendered references are reachable from the
 *    skill output (Quick Reference linking is owned by core's renderer and
 *    is per-export-kind rather than per-reference-file, so we assert the
 *    files materialize on disk-shape rather than the SKILL.md text).
 */

import { describe, expect, it } from 'vitest';
import type { ExtractedFunction, ExtractedSkill } from '@skillit/core';
import { splitToolsByNamespace } from '../../src/render/split-by-namespace.js';
import { McpcAdapter } from '@skillit/target-mcpc';

/** Tiny synthetic tool builder — keeps the per-tool surface shape consistent. */
function makeTool(name: string, paramCount = 3): ExtractedFunction {
  return {
    name,
    description: `Tool ${name} performs ${name.split('.').pop()} for ${name.split('.')[0]}.`,
    signature: `${name}(${Array.from({ length: paramCount }, (_, i) => `arg${i}`).join(', ')})`,
    parameters: Array.from({ length: paramCount }, (_, i) => ({
      name: `arg${i}`,
      type: 'string',
      description: `Argument ${i} for ${name}`,
      optional: i > 0
    })),
    returnType: 'unknown',
    examples: [],
    tags: {}
  };
}

/** Build a synthetic ExtractedSkill backed by the supplied tool list. */
function makeSkill(name: string, tools: ExtractedFunction[]): ExtractedSkill {
  return {
    name,
    description: `Synthetic skill ${name}`,
    packageDescription: `Synthetic skill ${name}`,
    keywords: [],
    functions: tools,
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };
}

describe('splitToolsByNamespace', () => {
  it('returns a single `tools` group when total fits inside the budget', () => {
    const tools = [
      makeTool('github.issues.create'),
      makeTool('github.pulls.merge'),
      makeTool('slack.channels.list'),
      makeTool('ping'),
      makeTool('echo')
    ];

    // Generous budget — full surface fits comfortably.
    const groups = splitToolsByNamespace(tools, (subset) => subset.length * 5, 4000);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('tools');
    expect(groups[0]!.tools).toEqual(tools);
  });

  it('splits a 150-tool surface across namespace prefixes when budget exceeded', () => {
    // 50 tools per namespace × 3 namespaces = 150 tools total.
    const githubTools = Array.from({ length: 50 }, (_, i) =>
      makeTool(`github.${i % 5 === 0 ? 'issues' : 'pulls'}.op${i}`)
    );
    const slackTools = Array.from({ length: 50 }, (_, i) =>
      makeTool(`slack.${i % 5 === 0 ? 'channels' : 'messages'}.op${i}`)
    );
    const linearTools = Array.from({ length: 50 }, (_, i) =>
      makeTool(`linear.${i % 5 === 0 ? 'issues' : 'projects'}.op${i}`)
    );
    const allTools = [...githubTools, ...slackTools, ...linearTools];

    // Force a split — return a per-tool cost that exceeds the budget when the
    // full set is rendered, but each individual namespace fits.
    const groups = splitToolsByNamespace(
      allTools,
      (subset) => subset.length * 100, // 150 * 100 = 15 000 > 4000; 50 * 100 = 5000 > 4000 too actually
      4000
    );

    // We expect 3 namespace groups regardless of per-group fit — the helper
    // does not recurse beyond the first segment.
    expect(groups).toHaveLength(3);
    const names = groups.map((g) => g.name).sort();
    expect(names).toEqual(['github', 'linear', 'slack']);

    const githubGroup = groups.find((g) => g.name === 'github')!;
    expect(githubGroup.tools).toHaveLength(50);
    expect(githubGroup.tools.every((t) => t.name.startsWith('github.'))).toBe(true);

    const slackGroup = groups.find((g) => g.name === 'slack')!;
    expect(slackGroup.tools).toHaveLength(50);

    const linearGroup = groups.find((g) => g.name === 'linear')!;
    expect(linearGroup.tools).toHaveLength(50);
  });

  it('puts un-namespaced tools into the default `tools` bucket when split triggers', () => {
    const tools = [
      makeTool('github.issues.create'),
      makeTool('github.pulls.merge'),
      makeTool('ping'), // un-namespaced
      makeTool('echo'), // un-namespaced
      makeTool('slack.channels.list')
    ];

    const groups = splitToolsByNamespace(tools, () => 99_999, 4000);

    expect(groups).toHaveLength(3);
    const byName = new Map(groups.map((g) => [g.name, g]));
    expect(byName.get('github')?.tools).toHaveLength(2);
    expect(byName.get('slack')?.tools).toHaveLength(1);
    expect(byName.get('tools')?.tools.map((t) => t.name)).toEqual(['ping', 'echo']);
  });

  it('returns one group when all tools share a single namespace (degenerate split)', () => {
    const tools = Array.from({ length: 20 }, (_, i) => makeTool(`github.api.op${i}`));
    const groups = splitToolsByNamespace(tools, () => 99_999, 4000);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('github');
    expect(groups[0]!.tools).toHaveLength(20);
  });

  it('returns an empty array when given no tools', () => {
    const groups = splitToolsByNamespace([], () => 0, 4000);
    expect(groups).toEqual([]);
  });
});

describe('namespace-split integration with McpcAdapter', () => {
  it('emits a single tools.md when the surface fits the budget', async () => {
    const skill = makeSkill('@example/small-server', [
      makeTool('github.issues.create'),
      makeTool('slack.channels.list'),
      makeTool('ping')
    ]);

    const adapter = new McpcAdapter();
    const rendered = await adapter.render(skill, {
      mode: 'stdio',
      skillName: 'small-server',
      maxTokens: 4000,
      canonicalize: true,
      launchCommand: { command: 'npx', args: ['-y', '@example/small-server'] }
    });

    const toolFiles = rendered.references.filter((r) => /\/tools(?:-[^/]+)?\.md$/.test(r.filename));
    expect(toolFiles).toHaveLength(1);
    expect(toolFiles[0]!.filename).toBe('small-server/references/tools.md');
  });

  it('emits one tools-<ns>.md per namespace when the surface exceeds the budget', async () => {
    // ~80 tools per namespace, with descriptions long enough to push the
    // single-file render past the 4000-token budget. We shrink the budget
    // explicitly so the split is deterministic regardless of platform-specific
    // token estimation drift.
    const githubTools = Array.from({ length: 80 }, (_, i) => makeTool(`github.issues.op${i}`, 5));
    const slackTools = Array.from({ length: 80 }, (_, i) => makeTool(`slack.channels.op${i}`, 5));

    const skill = makeSkill('@example/big-server', [...githubTools, ...slackTools]);

    const adapter = new McpcAdapter();
    const rendered = await adapter.render(skill, {
      mode: 'stdio',
      skillName: 'big-server',
      // Tight budget forces the split helper to chop by namespace.
      maxTokens: 500,
      canonicalize: true,
      launchCommand: { command: 'npx', args: ['-y', '@example/big-server'] }
    });

    const toolFiles = rendered.references
      .filter((r) => /\/tools(?:-[^/]+)?\.md$/.test(r.filename))
      .map((r) => r.filename)
      .sort();

    expect(toolFiles).toEqual([
      'big-server/references/tools-github.md',
      'big-server/references/tools-slack.md'
    ]);

    // Each split file is truncated to fit the budget — the body is non-empty.
    for (const file of rendered.references.filter((r) =>
      r.filename.startsWith('big-server/references/tools-')
    )) {
      expect(file.content.length).toBeGreaterThan(0);
    }
  });
});
