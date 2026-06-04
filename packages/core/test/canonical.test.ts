import { describe, expect, it } from 'vitest';
import { canonicalize } from '@skillit/core';
import type { RenderedSkill } from '@skillit/core';

function makeSkill(
  content: string,
  refs: Array<{ filename: string; content: string }> = []
): RenderedSkill {
  return {
    skill: { filename: 'x/SKILL.md', content },
    references: refs.map((r) => ({ filename: r.filename, content: r.content }))
  };
}

describe('canonicalize', () => {
  it('is idempotent — canonicalize(canonicalize(x)) equals canonicalize(x)', () => {
    const input = makeSkill(
      '---\nz: last\na: first\nm: middle\n---\n\n\nbody text  \n\n\nmore body\r\n',
      [{ filename: 'x/references/functions.md', content: 'trailing \t\n\n\n\ncontent\r\n' }]
    );
    const once = canonicalize(input);
    const twice = canonicalize(once);
    expect(twice).toEqual(once);
    expect(twice.skill.content).toBe(once.skill.content);
    expect(twice.references[0]!.content).toBe(once.references[0]!.content);
  });

  it('sorts YAML frontmatter keys alphabetically', () => {
    const input = makeSkill('---\nz: 1\na: 2\nm: 3\n---\n\nbody\n');
    const out = canonicalize(input);
    const fm = out.skill.content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).not.toBeNull();
    const keyOrder = fm![1]!
      .split('\n')
      .map((l) => l.match(/^([A-Za-z_][\w-]*)\s*:/)?.[1])
      .filter((x): x is string => Boolean(x));
    expect(keyOrder).toEqual(['a', 'm', 'z']);
  });

  it('collapses runs of 3+ blank lines to a single blank line', () => {
    const input = makeSkill('line1\n\n\n\nline2\n');
    const out = canonicalize(input);
    expect(out.skill.content).toBe('line1\n\nline2\n');
  });

  it('trims trailing whitespace on each line', () => {
    const input = makeSkill('line with trailing spaces   \nline with tabs\t\t\n');
    const out = canonicalize(input);
    expect(out.skill.content).toBe('line with trailing spaces\nline with tabs\n');
  });

  it('normalizes CRLF and CR line endings to LF', () => {
    const input = makeSkill('a\r\nb\rc\n');
    const out = canonicalize(input);
    expect(out.skill.content).not.toMatch(/\r/);
    expect(out.skill.content).toBe('a\nb\nc\n');
  });

  it('applies stripPatterns to remove nondeterministic prose', () => {
    const input = makeSkill('Generated at 2026-04-24T15:00:00Z by renderer.\n');
    const out = canonicalize(input, { stripPatterns: [/\d{4}-\d{2}-\d{2}T[\d:]+Z/g] });
    expect(out.skill.content).not.toContain('2026-04-24T15:00:00Z');
    expect(out.skill.content).toContain('Generated at');
    expect(out.skill.content).toContain('by renderer.');
  });

  it('preserves non-frontmatter markdown body text (except whitespace rules)', () => {
    const body = '# Heading\n\nA paragraph with **bold** and `code`.\n\n- item 1\n- item 2\n';
    const input = makeSkill('---\nname: test\n---\n\n' + body);
    const out = canonicalize(input);
    // Body text preserved verbatim (markdown rendering isn't touched).
    expect(out.skill.content).toContain('# Heading');
    expect(out.skill.content).toContain('A paragraph with **bold** and `code`.');
    expect(out.skill.content).toContain('- item 1');
    expect(out.skill.content).toContain('- item 2');
  });

  it('processes content without frontmatter using whitespace rules only', () => {
    const input = makeSkill('# Just markdown\n\n\n\nwith blank lines   \r\n');
    const out = canonicalize(input);
    expect(out.skill.content).toBe('# Just markdown\n\nwith blank lines\n');
    // No frontmatter markers injected.
    expect(out.skill.content).not.toMatch(/^---/);
  });

  it('does not mutate the input skill', () => {
    const originalContent = 'line  \r\n\n\n\nmore\n';
    const input = makeSkill(originalContent);
    canonicalize(input);
    expect(input.skill.content).toBe(originalContent);
  });

  it('canonicalizes every reference file as well as the main skill', () => {
    const input = makeSkill('---\nname: x\n---\nbody\n', [
      { filename: 'x/references/a.md', content: 'trailing   \r\n\n\n\nmore\n' }
    ]);
    const out = canonicalize(input);
    expect(out.references[0]!.content).toBe('trailing\n\nmore\n');
  });
});
