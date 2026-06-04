import { describe, it, expect } from 'vitest';
import { parseMarkdownDoc } from '@skillit/core';

// ─── Frontmatter extraction ───────────────────────────────────────────────────

describe('parseMarkdownDoc – frontmatter', () => {
  it('returns undefined frontmatter when no frontmatter present', () => {
    const result = parseMarkdownDoc('# Hello\n\nSome content.', 'docs/hello.md');
    expect(result.frontmatter).toBeUndefined();
  });

  it('parses basic key-value frontmatter', () => {
    const md = `---\ntitle: My Title\ndescription: A description\n---\n\n# Content`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.frontmatter).toEqual({ title: 'My Title', description: 'A description' });
  });

  it('coerces numeric values', () => {
    const md = `---\nsidebar_position: 3\nversion: 2\n---\n\n# Content`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.frontmatter?.sidebar_position).toBe(3);
    expect(result.frontmatter?.version).toBe(2);
  });

  it('strips double quotes from string values', () => {
    const md = `---\ntitle: "Quoted Title"\n---\n\n# Content`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.frontmatter?.title).toBe('Quoted Title');
  });

  it('strips single quotes from string values', () => {
    const md = `---\ntitle: 'Single Quoted'\n---\n\n# Content`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.frontmatter?.title).toBe('Single Quoted');
  });

  it('handles frontmatter with multiple fields', () => {
    const md = `---\ntitle: Setup\nsidebar_position: 1\ndraft: false\n---\n\n# Setup`;
    const result = parseMarkdownDoc(md, 'docs/setup.md');
    expect(result.frontmatter?.title).toBe('Setup');
    expect(result.frontmatter?.sidebar_position).toBe(1);
    expect(result.frontmatter?.draft).toBe('false');
  });
});

// ─── Title resolution ─────────────────────────────────────────────────────────

describe('parseMarkdownDoc – title', () => {
  it('uses frontmatter title when present', () => {
    const md = `---\ntitle: FM Title\n---\n\n# Heading Title\n\nContent.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.title).toBe('FM Title');
  });

  it('falls back to first # heading when no frontmatter title', () => {
    const md = `# My Heading\n\nSome content.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.title).toBe('My Heading');
  });

  it('falls back to filename when no frontmatter or heading', () => {
    const md = `Just some content without headings.`;
    const result = parseMarkdownDoc(md, 'docs/my-document.md');
    expect(result.title).toBe('My Document');
  });

  it('converts kebab-case filename to title case', () => {
    const md = `Just some content.`;
    const result = parseMarkdownDoc(md, 'docs/getting-started.md');
    expect(result.title).toBe('Getting Started');
  });

  it('strips numeric prefix from filename', () => {
    const md = `Just some content.`;
    const result = parseMarkdownDoc(md, 'docs/01-introduction.md');
    expect(result.title).toBe('Introduction');
  });

  it('strips multi-digit numeric prefix from filename', () => {
    const md = `Just some content.`;
    const result = parseMarkdownDoc(md, 'docs/03-advanced-setup.md');
    expect(result.title).toBe('Advanced Setup');
  });

  it('handles filename with no path prefix', () => {
    const md = `Just some content.`;
    const result = parseMarkdownDoc(md, 'quick-reference.md');
    expect(result.title).toBe('Quick Reference');
  });

  it('frontmatter title takes priority over heading', () => {
    const md = `---\ntitle: Override Title\n---\n\n# Original Heading\n\nContent.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.title).toBe('Override Title');
  });
});

// ─── Description resolution ───────────────────────────────────────────────────

describe('parseMarkdownDoc – description', () => {
  it('uses frontmatter description when present', () => {
    const md = `---\ndescription: FM Description\n---\n\n# Title\n\nFirst paragraph.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.description).toBe('FM Description');
  });

  it('falls back to first paragraph after first heading', () => {
    const md = `# Title\n\nThis is the description paragraph.\n\n## Section\n\nOther content.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.description).toBe('This is the description paragraph.');
  });

  it('returns undefined when no description can be found', () => {
    const md = `# Title\n\n## Section\n\nContent.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.description).toBeUndefined();
  });

  it('frontmatter description takes priority over paragraph', () => {
    const md = `---\ndescription: My description\n---\n\n# Title\n\nOther paragraph.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.description).toBe('My description');
  });

  it('strips frontmatter before looking for first paragraph', () => {
    const md = `---\ntitle: Test\n---\n\n# Title\n\nThe real description.\n\n## Section`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.description).toBe('The real description.');
  });

  it('joins multi-line first paragraph with space', () => {
    const md = `# Title\n\nLine one.\nLine two.\n\n## Section`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.description).toBe('Line one. Line two.');
  });
});

// ─── Section extraction ───────────────────────────────────────────────────────

describe('parseMarkdownDoc – sections', () => {
  it('extracts ## sections with heading and content', () => {
    const md = `# Title\n\n## Section One\n\nContent of section one.\n\n## Section Two\n\nContent of section two.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]?.heading).toBe('Section One');
    expect(result.sections[0]?.level).toBe(2);
    expect(result.sections[0]?.content).toContain('Content of section one.');
    expect(result.sections[1]?.heading).toBe('Section Two');
  });

  it('extracts ### sections with level 3', () => {
    const md = `# Title\n\n## Parent\n\n### Child Section\n\nChild content.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    const child = result.sections.find((s) => s.heading === 'Child Section');
    expect(child).toBeDefined();
    expect(child?.level).toBe(3);
    expect(child?.content).toContain('Child content.');
  });

  it('section content ends at next same-level heading', () => {
    const md = `# Title\n\n## Alpha\n\nAlpha content.\n\n## Beta\n\nBeta content.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.sections[0]?.content).not.toContain('Beta content');
    expect(result.sections[1]?.content).toContain('Beta content');
  });

  it('section content ends at next higher-level heading', () => {
    const md = `# Title\n\n## Parent\n\nParent content.\n\n### Child\n\nChild content.\n\n## Next Parent\n\nNext content.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    const parent = result.sections.find((s) => s.heading === 'Parent');
    expect(parent?.content).not.toContain('Next content');
  });

  it('returns empty sections array when no ## headings', () => {
    const md = `# Title\n\nJust content with no sub-sections.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.sections).toEqual([]);
  });

  it('extracts sections at all heading levels', () => {
    const md = `# Title\n\n## H2\n\nH2 content.\n\n### H3\n\nH3 content.\n\n#### H4\n\nH4 content.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    const levels = result.sections.map((s) => s.level);
    expect(levels).toContain(2);
    expect(levels).toContain(3);
    expect(levels).toContain(4);
  });
});

// ─── Code block extraction ────────────────────────────────────────────────────

describe('parseMarkdownDoc – code blocks', () => {
  it('extracts fenced code block from section', () => {
    const md = `# Title\n\n## Section\n\nSome text.\n\n\`\`\`ts\nconst x = 1;\n\`\`\`\n`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    const section = result.sections.find((s) => s.heading === 'Section');
    expect(section?.codeBlocks).toHaveLength(1);
    expect(section?.codeBlocks[0]).toContain('const x = 1;');
  });

  it('extracts multiple code blocks from one section', () => {
    const md = `# Title\n\n## Section\n\n\`\`\`js\nconsole.log('a');\n\`\`\`\n\nSome text.\n\n\`\`\`bash\nnpm install\n\`\`\`\n`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    const section = result.sections.find((s) => s.heading === 'Section');
    expect(section?.codeBlocks).toHaveLength(2);
  });

  it('code blocks do not appear in section content prose', () => {
    const md = `# Title\n\n## Section\n\nProse text.\n\n\`\`\`ts\nconst y = 2;\n\`\`\`\n\nMore prose.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    const section = result.sections.find((s) => s.heading === 'Section');
    expect(section?.content).not.toContain('const y = 2;');
    expect(section?.content).toContain('Prose text.');
    expect(section?.content).toContain('More prose.');
  });

  it('returns empty codeBlocks array when section has no code', () => {
    const md = `# Title\n\n## Section\n\nJust prose.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    const section = result.sections.find((s) => s.heading === 'Section');
    expect(section?.codeBlocks).toEqual([]);
  });

  it('handles code blocks with language specifier', () => {
    const md = `# Title\n\n## Section\n\n\`\`\`typescript\ntype Foo = string;\n\`\`\`\n`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    const section = result.sections.find((s) => s.heading === 'Section');
    expect(section?.codeBlocks[0]).toContain('type Foo = string;');
  });
});

// ─── Sort order ───────────────────────────────────────────────────────────────

describe('parseMarkdownDoc – sort order', () => {
  it('uses frontmatter sidebar_position as order', () => {
    const md = `---\nsidebar_position: 5\n---\n\n# Title`;
    const result = parseMarkdownDoc(md, 'docs/05-page.md');
    expect(result.order).toBe(5);
  });

  it('uses numeric filename prefix when no sidebar_position', () => {
    const md = `# Title`;
    const result = parseMarkdownDoc(md, 'docs/03-setup.md');
    expect(result.order).toBe(3);
  });

  it('uses Infinity when no sidebar_position or numeric prefix', () => {
    const md = `# Title`;
    const result = parseMarkdownDoc(md, 'docs/setup.md');
    expect(result.order).toBe(Infinity);
  });

  it('sidebar_position takes priority over filename prefix', () => {
    const md = `---\nsidebar_position: 2\n---\n\n# Title`;
    const result = parseMarkdownDoc(md, 'docs/07-page.md');
    expect(result.order).toBe(2);
  });

  it('handles two-digit numeric prefix', () => {
    const md = `# Title`;
    const result = parseMarkdownDoc(md, 'docs/10-reference.md');
    expect(result.order).toBe(10);
  });
});

// ─── rawContent ───────────────────────────────────────────────────────────────

describe('parseMarkdownDoc – rawContent', () => {
  it('rawContent strips frontmatter', () => {
    const md = `---\ntitle: My Title\n---\n\n# Heading\n\nContent here.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.rawContent).not.toContain('title: My Title');
    expect(result.rawContent).not.toContain('---');
    expect(result.rawContent).toContain('# Heading');
    expect(result.rawContent).toContain('Content here.');
  });

  it('rawContent is unchanged when no frontmatter', () => {
    const md = `# Heading\n\nContent here.`;
    const result = parseMarkdownDoc(md, 'docs/page.md');
    expect(result.rawContent).toBe(md);
  });
});

// ─── relativePath ─────────────────────────────────────────────────────────────

describe('parseMarkdownDoc – relativePath', () => {
  it('sets relativePath from filePath argument', () => {
    const result = parseMarkdownDoc('# Title', 'docs/guide/intro.md');
    expect(result.relativePath).toBe('docs/guide/intro.md');
  });

  it('sets relativePath to exact value passed', () => {
    const result = parseMarkdownDoc('# Title', 'some/other/path.md');
    expect(result.relativePath).toBe('some/other/path.md');
  });
});

// ─── Empty input ──────────────────────────────────────────────────────────────

describe('parseMarkdownDoc – empty input', () => {
  it('handles empty string input', () => {
    const result = parseMarkdownDoc('', 'docs/empty.md');
    expect(result.frontmatter).toBeUndefined();
    expect(result.sections).toEqual([]);
    expect(result.rawContent).toBe('');
    expect(result.order).toBe(Infinity);
    expect(result.relativePath).toBe('docs/empty.md');
  });

  it('returns a valid title from filename for empty content', () => {
    const result = parseMarkdownDoc('', 'docs/my-page.md');
    expect(result.title).toBe('My Page');
  });

  it('description is undefined for empty content', () => {
    const result = parseMarkdownDoc('', 'docs/page.md');
    expect(result.description).toBeUndefined();
  });
});
