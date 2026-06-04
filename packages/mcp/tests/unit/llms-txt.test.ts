/**
 * Unit tests for the per-skill `llms.txt` renderer (T111).
 *
 * Verifies:
 *  - llmstxt.org-shaped output (`# name`, blockquote, `## Files`).
 *  - Reference files appear with relative paths and one-line summaries.
 *  - Pluralization in summaries (1 tool vs N tools).
 *  - Description fallback to `packageDescription`.
 *  - The returned `RenderedFile.filename` lands at `<basePath>/llms.txt`.
 */
import { describe, expect, it } from 'vitest';
import type { ExtractedSkill, RenderedSkill } from '@skillit/core';
import { renderLlmsTxt } from '../../src/render/llms-txt.js';

function makeSkill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: 'demo-server',
    description: 'A demo MCP server for testing.',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    ...overrides
  };
}

function makeRendered(refFilenames: string[]): RenderedSkill {
  return {
    skill: { filename: 'demo-server/SKILL.md', content: '' },
    references: refFilenames.map((f) => ({ filename: f, content: '' }))
  };
}

describe('renderLlmsTxt', () => {
  it('emits an llmstxt.org-shaped header with name + description', () => {
    const skill = makeSkill();
    const rendered = makeRendered(['demo-server/references/tools.md']);
    const out = renderLlmsTxt(rendered, skill);

    expect(out.filename).toBe('demo-server/llms.txt');
    expect(out.content.startsWith('# demo-server\n')).toBe(true);
    expect(out.content).toContain('> A demo MCP server for testing.');
    expect(out.content).toContain('## Files');
  });

  it('lists each reference file with a relative path link', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'echo',
          description: 'Echo input',
          parameters: [],
          returnType: 'string',
          examples: [],
          signature: '',
          tags: {}
        }
      ],
      resources: [{ uri: 'file://x', name: 'x', description: '' }]
    });
    const rendered = makeRendered([
      'demo-server/references/tools.md',
      'demo-server/references/resources.md'
    ]);
    const out = renderLlmsTxt(rendered, skill);

    expect(out.content).toMatch(/- \[Tools\]\(references\/tools\.md\): 1 tool /);
    expect(out.content).toMatch(/- \[Resources\]\(references\/resources\.md\): 1 resource /);
  });

  it('uses plural form when count != 1 and singular when count == 1', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'a',
          description: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          signature: '',
          tags: {}
        },
        {
          name: 'b',
          description: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          signature: '',
          tags: {}
        }
      ]
    });
    const rendered = makeRendered(['demo-server/references/tools.md']);
    const out = renderLlmsTxt(rendered, skill);

    expect(out.content).toContain('2 tools the server exposes');
  });

  it('falls back to packageDescription when description is empty', () => {
    const skill = makeSkill({
      description: '',
      packageDescription: 'Fallback desc.'
    });
    const rendered = makeRendered(['demo-server/references/tools.md']);
    const out = renderLlmsTxt(rendered, skill);

    expect(out.content).toContain('> Fallback desc.');
  });

  it('omits the Files section when there are no references', () => {
    const skill = makeSkill();
    const rendered: RenderedSkill = {
      skill: { filename: 'demo-server/SKILL.md', content: '' },
      references: []
    };
    const out = renderLlmsTxt(rendered, skill);

    expect(out.content).not.toContain('## Files');
  });
});
