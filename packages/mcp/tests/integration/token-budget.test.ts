/**
 * Integration test (T108a / FR-021 / SC-002): rendered SKILL.md and
 * `references/tools.md` stay inside the per-file token budget for a
 * representative server surface.
 *
 * The fixture is generated programmatically (matching the bundle-perf
 * pattern in `bundle-perf.test.ts`) at a smaller scale — 20 tools — so
 * we can exercise the rendering pipeline without splitting being
 * triggered. The split path is exercised separately by the unit test
 * `namespace-split.test.ts`.
 *
 * Gating: RUN_INTEGRATION_TESTS=true. We don't gate on CI because the
 * test is fast (no subprocess spawn, no network) and useful as a local
 * smoke check.
 */

import { describe, expect, it } from 'vitest';
import type { ExtractedFunction, ExtractedSkill } from '@skillit/core';
import { estimateTokens } from '@skillit/core';
import { McpcAdapter } from '@skillit/target-mcpc';
import { McpProtocolAdapter } from '@skillit/target-mcp-protocol';

const RUN = process.env.RUN_INTEGRATION_TESTS === 'true';

/**
 * Build a synthetic 20-tool surface mirroring the shape of typical MCP
 * servers — short descriptions, a few scalar parameters per tool, no
 * namespacing (so the no-split path is exercised).
 */
function makeFixtureSkill(): ExtractedSkill {
  const tools: ExtractedFunction[] = Array.from({ length: 20 }, (_, i) => ({
    name: `tool_${i}`,
    description: `Tool ${i} performs work item ${i} on the configured backend.`,
    signature: `tool_${i}(input, flag?)`,
    parameters: [
      {
        name: 'input',
        type: 'string',
        description: `Input for tool ${i}`,
        optional: false
      },
      {
        name: 'flag',
        type: 'boolean',
        description: `Optional flag for tool ${i}`,
        optional: true
      }
    ],
    returnType: 'unknown',
    examples: [],
    tags: {}
  }));

  return {
    name: '@fixture/budget-server',
    description: 'Synthetic MCP server fixture for token-budget assertions',
    packageDescription: 'Synthetic MCP server fixture for token-budget assertions',
    keywords: [],
    functions: tools,
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };
}

describe.skipIf(!RUN)('token budget: 20-tool fixture stays inside default budgets', () => {
  it('SKILL.md is < 500 tokens (lean discovery doc per SC-002)', async () => {
    // SC-002 specifies the lean discovery-document baseline. We use the
    // mcp-protocol adapter for this assertion because the CLI adapters
    // (mcpc / fastmcp) prepend a Setup section as `bodyPrefix` — that's
    // legitimate adapter overhead and out of scope for the SC-002 token
    // budget which targets the standard skill body.
    const skill = makeFixtureSkill();
    const adapter = new McpProtocolAdapter();
    const rendered = await adapter.render(skill, {
      mode: 'stdio',
      skillName: 'budget-server',
      maxTokens: 4000,
      canonicalize: true,
      launchCommand: { command: 'npx', args: ['-y', '@fixture/budget-server'] }
    });

    const skillTokens = estimateTokens(rendered.skill.content);
    expect(skillTokens).toBeLessThan(500);
  });

  it('references/tools.md is < 4000 tokens (the default budget)', async () => {
    const skill = makeFixtureSkill();
    const adapter = new McpcAdapter();
    const rendered = await adapter.render(skill, {
      mode: 'stdio',
      skillName: 'budget-server',
      maxTokens: 4000,
      canonicalize: true,
      launchCommand: { command: 'npx', args: ['-y', '@fixture/budget-server'] }
    });

    const toolsRef = rendered.references.find(
      (r) => r.filename === 'budget-server/references/tools.md'
    );
    expect(toolsRef).toBeDefined();
    const toolsTokens = estimateTokens(toolsRef!.content);
    expect(toolsTokens).toBeLessThan(4000);
  });

  it('does not trigger a namespace split at 20-tool scale', async () => {
    const skill = makeFixtureSkill();
    const adapter = new McpcAdapter();
    const rendered = await adapter.render(skill, {
      mode: 'stdio',
      skillName: 'budget-server',
      maxTokens: 4000,
      canonicalize: true,
      launchCommand: { command: 'npx', args: ['-y', '@fixture/budget-server'] }
    });

    const splitFiles = rendered.references.filter((r) => /\/tools-[^/]+\.md$/.test(r.filename));
    expect(splitFiles).toEqual([]);

    // Exactly one tools.md emitted (the un-split form).
    const toolFiles = rendered.references.filter((r) => /\/tools(?:-[^/]+)?\.md$/.test(r.filename));
    expect(toolFiles).toHaveLength(1);
    expect(toolFiles[0]!.filename).toBe('budget-server/references/tools.md');
  });
});
