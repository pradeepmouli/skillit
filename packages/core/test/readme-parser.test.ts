import { describe, it, expect } from 'vitest';
import { parseReadme } from '@skillit/core';

// ─── Blockquote extraction ────────────────────────────────────────────────────

describe('parseReadme – blockquote', () => {
  it('extracts blockquote after title', () => {
    const md = `# My Package\n\n> A concise one-liner summary.\n\n## Usage\n\nSome content.`;
    const result = parseReadme(md);
    expect(result.blockquote).toBe('A concise one-liner summary.');
  });

  it('prefers blockquote and still extracts first paragraph separately', () => {
    const md = `# My Package\n\n> One-liner summary.\n\nFirst prose paragraph here.\n\n## Features\n\nContent.`;
    const result = parseReadme(md);
    expect(result.blockquote).toBe('One-liner summary.');
    expect(result.firstParagraph).toBe('First prose paragraph here.');
  });
});

// ─── First paragraph ──────────────────────────────────────────────────────────

describe('parseReadme – firstParagraph', () => {
  it('extracts first prose paragraph when no blockquote', () => {
    const md = `# My Package\n\nThis is the first paragraph.\n\n## Usage\n\nContent.`;
    const result = parseReadme(md);
    expect(result.firstParagraph).toBe('This is the first paragraph.');
  });

  it('skips badges ([![) before first paragraph', () => {
    const md = `# My Package\n\n[![npm](https://img.shields.io/npm/v/foo)](https://npmjs.com/package/foo)\n\nActual paragraph.\n\n## Usage\n\nContent.`;
    const result = parseReadme(md);
    expect(result.firstParagraph).toBe('Actual paragraph.');
  });

  it('skips images (![) before first paragraph', () => {
    const md = `# My Package\n\n![logo](./logo.png)\n\nActual paragraph.\n\n## Usage\n\nContent.`;
    const result = parseReadme(md);
    expect(result.firstParagraph).toBe('Actual paragraph.');
  });

  it('joins multi-line paragraphs with space', () => {
    const md = `# My Package\n\nLine one of paragraph.\nLine two of paragraph.\n\n## Usage\n\nContent.`;
    const result = parseReadme(md);
    expect(result.firstParagraph).toBe('Line one of paragraph. Line two of paragraph.');
  });

  it('stops at next heading', () => {
    const md = `# My Package\n\nFirst paragraph.\n\n## Features\n\nShould not be in firstParagraph.`;
    const result = parseReadme(md);
    expect(result.firstParagraph).toBe('First paragraph.');
    expect(result.firstParagraph).not.toContain('Should not');
  });
});

// ─── Named sections ───────────────────────────────────────────────────────────

describe('parseReadme – quickStart', () => {
  it('extracts Quick Start section content', () => {
    const md = `# Pkg\n\n## Quick Start\n\nRun npm install.\n\n## Features\n\nFeatures here.`;
    const result = parseReadme(md);
    expect(result.quickStart).toBe('Run npm install.');
  });

  it('accepts "Usage" as Quick Start variant', () => {
    const md = `# Pkg\n\n## Usage\n\nUsage instructions.\n\n## Features\n\nFeatures here.`;
    const result = parseReadme(md);
    expect(result.quickStart).toBe('Usage instructions.');
  });

  it('accepts "Getting Started" as Quick Start variant', () => {
    const md = `# Pkg\n\n## Getting Started\n\nGetting started content.\n\n## Features\n\nFeatures here.`;
    const result = parseReadme(md);
    expect(result.quickStart).toBe('Getting started content.');
  });
});

describe('parseReadme – features', () => {
  it('extracts Features section', () => {
    const md = `# Pkg\n\n## Features\n\n- Fast\n- Reliable\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.features).toBe('- Fast\n- Reliable');
  });

  it('accepts "Key Features" as variant', () => {
    const md = `# Pkg\n\n## Key Features\n\n- Scalable\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.features).toBe('- Scalable');
  });

  it('accepts "Highlights" as variant', () => {
    const md = `# Pkg\n\n## Highlights\n\nAmzing stuff.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.features).toBe('Amzing stuff.');
  });
});

describe('parseReadme – troubleshooting', () => {
  it('extracts Troubleshooting section', () => {
    const md = `# Pkg\n\n## Troubleshooting\n\nDo not do X.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.troubleshooting).toBe('Do not do X.');
  });

  it('accepts "Common Issues" as variant', () => {
    const md = `# Pkg\n\n## Common Issues\n\nAvoid Y.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.troubleshooting).toBe('Avoid Y.');
  });

  it('accepts "Common Errors" as variant', () => {
    const md = `# Pkg\n\n## Common Errors\n\nWatch out for Z.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.troubleshooting).toBe('Watch out for Z.');
  });

  it('accepts "FAQ" as variant', () => {
    const md = `# Pkg\n\n## FAQ\n\nBe aware of W.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.troubleshooting).toBe('Be aware of W.');
  });

  it('accepts "Pitfalls" as variant', () => {
    const md = `# Pkg\n\n## Pitfalls\n\nNever do V.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.troubleshooting).toBe('Never do V.');
  });

  it('accepts "Common Mistakes" as variant', () => {
    const md = `# Pkg\n\n## Common Mistakes\n\nAvoid U.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.troubleshooting).toBe('Avoid U.');
  });

  it('accepts "Gotchas" as variant', () => {
    const md = `# Pkg\n\n## Gotchas\n\nWatch for T.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.troubleshooting).toBe('Watch for T.');
  });

  it('accepts "Caveats" as variant', () => {
    const md = `# Pkg\n\n## Caveats\n\nMind S.\n\n## Usage\n\nUsage.`;
    const result = parseReadme(md);
    expect(result.troubleshooting).toBe('Mind S.');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('parseReadme – edge cases', () => {
  it('returns empty object for empty string', () => {
    const result = parseReadme('');
    expect(result).toEqual({});
  });

  it('handles case-insensitive heading matching', () => {
    const md = `# Pkg\n\n## QUICK START\n\nContent here.\n\n## features\n\nFeature list.`;
    const result = parseReadme(md);
    expect(result.quickStart).toBe('Content here.');
    expect(result.features).toBe('Feature list.');
  });

  it('stops section at next ## heading', () => {
    const md = `# Pkg\n\n## Features\n\nLine one.\nLine two.\n\n## Usage\n\nUsage content.`;
    const result = parseReadme(md);
    expect(result.features).toBe('Line one.\nLine two.');
    expect(result.features).not.toContain('Usage content');
  });
});
