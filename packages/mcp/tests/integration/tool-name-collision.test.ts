/**
 * Edge-case integration test (T114): verify that a tool literally named
 * `connect` (which collides with mcpc's reserved `mcpc connect` subcommand)
 * still renders into a valid `mcpc <skillName> tools-call connect` line.
 *
 * The mcpc CLI disambiguates on positional argument count rather than
 * argument value: the third positional (after `<skillName>` and `tools-call`)
 * is the tool name. So as long as the renderer emits the tool name in that
 * slot, the shell never sees the bare `mcpc connect` form. This test asserts
 * that the renderer DOES emit it correctly — no inadvertent escaping or
 * dropping of the colliding name.
 *
 * Unlike T112/T113 this is a pure renderer test (no child process spawn), so
 * we don't gate on `RUN_INTEGRATION_TESTS`.
 */
import { describe, expect, it } from 'vitest';
import type { AdapterRenderContext, ExtractedSkill } from '@skillit/core';
import { McpcAdapter } from '@skillit/target-mcpc';

const skillWithConnect: ExtractedSkill = {
  name: 'collision-server',
  description: 'A server whose tool is literally named `connect`.',
  functions: [
    {
      name: 'connect',
      description: 'Establish an outbound connection to a peer.',
      signature: 'connect(host: string, port: number)',
      parameters: [
        { name: 'host', type: 'string', description: 'Peer hostname', optional: false },
        { name: 'port', type: 'number', description: 'Peer TCP port', optional: false }
      ],
      returnType: 'unknown',
      examples: [],
      tags: {}
    }
  ],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

function makeCtx(_overrides: Partial<AdapterRenderContext> = {}): AdapterRenderContext {
  // After the AdapterRenderContext DU refactor (002-mcp-hardening US1) the
  // helper returns the stdio arm directly. Tests in this file only need the
  // default stdio arm — `_overrides` is accepted for backward compatibility
  // but currently ignored.
  return {
    mode: 'stdio',
    skillName: 'collision-server',
    maxTokens: 4000,
    canonicalize: true,
    launchCommand: { command: 'node', args: ['./server.js'] }
  };
}

describe('mcpc tool-name collision: connect', () => {
  const adapter = new McpcAdapter();

  it('emits `mcpc <skillName> tools-call connect` — name lands in the third positional slot', async () => {
    const rendered = await adapter.render(skillWithConnect, makeCtx());

    // The skill body or a reference file (depending on token budget) carries
    // the rendered command. Concatenate every emitted file so the assertion is
    // robust to namespace splitting.
    const allContent =
      rendered.skill.content + '\n' + rendered.references.map((r) => r.content).join('\n');

    // The reserved `mcpc connect` subcommand is two tokens; the tool-call form
    // is three (`mcpc <skill> tools-call connect`). Asserting the exact prefix
    // proves the renderer placed the name in slot 4, not slot 2.
    expect(allContent).toContain('mcpc collision-server tools-call connect');

    // The Setup section legitimately emits a `mcpc connect <skill> -- ...`
    // line (the reserved subcommand registers the server). That line MUST
    // place the skill name (not the tool name) immediately after `connect`,
    // so the operator's setup never accidentally targets a tool.
    const connectLines = allContent.split('\n').filter((l) => /^mcpc connect\b/.test(l));
    for (const line of connectLines) {
      // After `mcpc connect` the next token must be the skill name, not the
      // colliding tool name `connect`.
      expect(line).toMatch(/^mcpc connect collision-server\b/);
    }

    // The tool-call lines must use the three-positional `tools-call` form;
    // never a bare `mcpc connect ...` form that would invoke the reserved
    // subcommand instead of dispatching to the tool.
    const toolCallLines = allContent.split('\n').filter((l) => /^mcpc \S+ tools-call /.test(l));
    expect(toolCallLines.length).toBeGreaterThan(0);
    for (const line of toolCallLines) {
      // The tool name `connect` must appear in slot 4 (positions 1-3 are
      // `mcpc`, `<skillName>`, `tools-call`).
      const tokens = line.split(/\s+/);
      expect(tokens[0]).toBe('mcpc');
      expect(tokens[1]).toBe('collision-server');
      expect(tokens[2]).toBe('tools-call');
      expect(tokens[3]).toBe('connect');
    }
  });

  it('preserves the colliding tool name in the parameter table', async () => {
    const rendered = await adapter.render(skillWithConnect, makeCtx());

    const allContent =
      rendered.skill.content + '\n' + rendered.references.map((r) => r.content).join('\n');

    // The tool's name and parameters survive intact — no munging just because
    // the name overlaps with a CLI reserved word.
    expect(allContent).toContain('connect');
    expect(allContent).toContain('host');
    expect(allContent).toContain('port');
  });
});
