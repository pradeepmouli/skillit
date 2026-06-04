/**
 * Contract test (T085) — frontmatter ⇄ Setup-section fingerprint dual placement.
 *
 * Per FR-IT-012, every CLI-as-proxy adapter (`cli:*`) MUST emit its
 * fingerprint twice in the rendered SKILL.md:
 *
 *   1. YAML frontmatter — `generated-by: { adapter, version, target-cli-range? }`
 *      via {@link generatedByFrontmatter}.
 *   2. Setup-section trace line — "Generated for &lt;cli&gt; … via &lt;adapter&gt; &lt;version&gt;".
 *
 * The two carriers MUST agree, and the adapter MUST NOT emit an `mcp:`
 * frontmatter block (that's reserved for the MCP-native adapter).
 *
 * This test parametrizes over every shipped CLI adapter, loads it via the
 * real `loadAdapterAsync`, renders a fixture skill, and asserts the
 * dual-placement contract via {@link assertFingerprintConsistency}.
 */
import { renderSkill } from '@skillit/core';
import type { ExtractedSkill } from '@skillit/core';
import { describe, expect, it } from 'vitest';
import { assertFingerprintConsistency } from '../../src/adapter/fingerprint.js';
import { loadAdapterAsync } from '../../src/adapter/loader.js';
import type { InvocationTarget } from '../../src/adapter/types.js';

const fixtureSkill = (): ExtractedSkill => ({
  name: 'fixture-server',
  description: 'fixture for the FR-IT-012 fingerprint contract',
  functions: [
    {
      name: 'echo',
      description: 'echo the input back',
      parameters: [
        { name: 'message', type: 'string', optional: false, description: 'message to echo' }
      ],
      returnType: 'string',
      signature: 'echo(message: string): string',
      examples: []
    }
  ],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
});

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe.each<InvocationTarget>(['cli:mcpc', 'cli:fastmcp'])(
  'fingerprint contract — %s',
  (target) => {
    it('emits generated-by frontmatter and a matching Setup trace line', async () => {
      const adapter = await loadAdapterAsync(target);
      const rendered = await renderSkill(fixtureSkill(), {
        invocation: adapter,
        invocationLaunchCommand: { command: 'node', args: ['./server.js'] }
      });
      const content = rendered.skill.content;

      // 1. Frontmatter contains `generated-by` with the adapter's package name + version.
      // YAML quotes scalars that contain `@` (so the literal package name
      // appears as either `adapter: foo` or `adapter: "foo"`), so anchor the
      // match on the key + (optionally quoted) value.
      expect(content).toMatch(/^---\n[\s\S]*?\ngenerated-by:\s*\n/m);
      expect(content).toMatch(
        new RegExp(`adapter:\\s*"?${escapeForRegex(adapter.fingerprint.adapter)}"?`)
      );
      expect(content).toMatch(
        new RegExp(`version:\\s*"?${escapeForRegex(adapter.fingerprint.version)}"?`)
      );

      // 2. NO `mcp:` frontmatter block — that's reserved for target-mcp-protocol.
      // We test against the literal frontmatter region (between the two `---`
      // delimiters) so legitimate body mentions of "mcp" don't trigger.
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      expect(fmMatch).not.toBeNull();
      const frontmatter = fmMatch![1]!;
      expect(frontmatter).not.toMatch(/^mcp:/m);

      // 3. Setup-section trace line — "via <adapter> <version>".
      expect(content).toContain(
        `via ${adapter.fingerprint.adapter} ${adapter.fingerprint.version}`
      );

      // 4. Dual-placement consistency — frontmatter and Setup section agree.
      expect(() => assertFingerprintConsistency(content, adapter.fingerprint)).not.toThrow();
    });
  }
);
