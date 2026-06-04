# Markdown & Docusaurus Docs Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generalized markdown doc parser and directory scanner to `@skillit/core`, a `@skillit/docusaurus` adapter package for Docusaurus conventions, and wire docs extraction into the TypeDoc plugin as opt-in.

**Architecture:** Core gets two new files: `markdown-parser.ts` (pure function, parses one markdown doc into structured sections) and `docs-scanner.ts` (reads a directory, parses all .md files, orders them). The docusaurus package is a thin adapter that adds `_category_.json` reading and default `docs/` directory. Parsed docs feed into the existing `ExtractedSkill.documents` field and render via the existing document renderer.

**Tech Stack:** TypeScript 5.9, Vitest 4.1, pnpm workspaces

---

## File Structure

| File                                               | Responsibility                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/core/src/markdown-parser.ts`             | Pure function: parse one markdown file → `ParsedMarkdownDoc`                                   |
| `packages/core/src/docs-scanner.ts`                | Read directory of .md files → ordered `ParsedMarkdownDoc[]` + convert to `ExtractedDocument[]` |
| `packages/core/src/markdown-types.ts`              | `ParsedMarkdownDoc`, `ParsedSection`, `DocsExtractionOptions` types                            |
| `packages/core/test/markdown-parser.test.ts`       | Tests for single-doc parsing                                                                   |
| `packages/core/test/docs-scanner.test.ts`          | Tests for directory scanning                                                                   |
| `packages/core/src/renderer.ts`                    | Add "Documentation" section to SKILL.md listing doc titles                                     |
| `packages/docusaurus/` (NEW package)               | Docusaurus adapter                                                                             |
| `packages/docusaurus/src/index.ts`                 | `extractDocusaurusDocs()`                                                                      |
| `packages/docusaurus/src/category-reader.ts`       | Read `_category_.json` files                                                                   |
| `packages/docusaurus/test/category-reader.test.ts` | Tests                                                                                          |
| `packages/docusaurus/test/index.test.ts`           | Integration tests                                                                              |
| `packages/typedoc/src/plugin.ts`                   | Add `skillsIncludeDocs` + `skillsDocsDir` options, wire scanner                                |

---

### Task 1: Markdown types

**Files:**

- Create: `packages/core/src/markdown-types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create markdown-types.ts**

```typescript
/** A section within a markdown document, delimited by headings */
export interface ParsedSection {
  /** Heading text (without # prefix) */
  heading: string;
  /** Heading level (2 for ##, 3 for ###, etc.) */
  level: number;
  /** Content between this heading and the next same-or-higher level heading */
  content: string;
  /** Fenced code blocks extracted from content */
  codeBlocks: string[];
}

/** A parsed markdown documentation page */
export interface ParsedMarkdownDoc {
  /** YAML frontmatter fields (title, sidebar_position, description, etc.) */
  frontmatter?: Record<string, unknown>;
  /** Document title (from # heading or frontmatter title or filename) */
  title: string;
  /** Document description (from frontmatter description or first paragraph) */
  description?: string;
  /** File path relative to docs root */
  relativePath: string;
  /** Ordered sections extracted from headings */
  sections: ParsedSection[];
  /** Full raw content (frontmatter stripped) */
  rawContent: string;
  /** Sort order (from frontmatter sidebar_position, filename prefix, or Infinity) */
  order: number;
}

/** Options for scanning a docs directory */
export interface DocsExtractionOptions {
  /** Directory containing .md files */
  docsDir: string;
  /** Glob pattern for inclusion (default: "**\/*.md") */
  include?: string;
  /** Glob patterns for exclusion */
  exclude?: string[];
  /** Maximum number of documents to include (default: 20) */
  maxDocs?: number;
}
```

- [ ] **Step 2: Export from index.ts**

```typescript
export type { ParsedSection, ParsedMarkdownDoc, DocsExtractionOptions } from './markdown-types.js';
```

- [ ] **Step 3: Run tests, commit**

```bash
pnpm test
git add packages/core/src/markdown-types.ts packages/core/src/index.ts
git commit -m "feat(core): add markdown doc parser types"
```

---

### Task 2: Markdown parser

The pure function that parses a single markdown file.

**Files:**

- Create: `packages/core/src/markdown-parser.ts`
- Create: `packages/core/test/markdown-parser.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

````typescript
import { describe, it, expect } from 'vitest';
import { parseMarkdownDoc } from '../src/markdown-parser.js';

describe('parseMarkdownDoc', () => {
  describe('frontmatter parsing', () => {
    it('extracts YAML frontmatter', () => {
      const md =
        '---\ntitle: My Guide\nsidebar_position: 3\ndescription: A helpful guide\n---\n\n# Content\n\nBody text.';
      const doc = parseMarkdownDoc(md, 'guide.md');
      expect(doc.frontmatter).toEqual({
        title: 'My Guide',
        sidebar_position: 3,
        description: 'A helpful guide'
      });
    });

    it('handles missing frontmatter', () => {
      const md = '# My Doc\n\nJust content.';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.frontmatter).toBeUndefined();
    });
  });

  describe('title resolution', () => {
    it('uses frontmatter title when present', () => {
      const md = '---\ntitle: From Frontmatter\n---\n\n# From Heading\n\nBody.';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.title).toBe('From Frontmatter');
    });

    it('falls back to # heading', () => {
      const md = '# From Heading\n\nBody.';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.title).toBe('From Heading');
    });

    it('falls back to filename', () => {
      const md = 'Just body text, no heading.';
      const doc = parseMarkdownDoc(md, 'getting-started.md');
      expect(doc.title).toBe('Getting Started');
    });

    it('strips numeric prefix from filename', () => {
      const doc = parseMarkdownDoc('Body.', '01-introduction.md');
      expect(doc.title).toBe('Introduction');
    });
  });

  describe('description resolution', () => {
    it('uses frontmatter description', () => {
      const md = '---\ndescription: From FM\n---\n\n# Title\n\nFirst paragraph.';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.description).toBe('From FM');
    });

    it('falls back to first paragraph', () => {
      const md = '# Title\n\nThis is the first paragraph.\n\n## Section';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.description).toBe('This is the first paragraph.');
    });
  });

  describe('section extraction', () => {
    it('extracts ## sections', () => {
      const md = '# Title\n\nIntro.\n\n## Setup\n\nSetup content.\n\n## Usage\n\nUsage content.';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.sections).toHaveLength(2);
      expect(doc.sections[0].heading).toBe('Setup');
      expect(doc.sections[0].level).toBe(2);
      expect(doc.sections[0].content).toContain('Setup content.');
      expect(doc.sections[1].heading).toBe('Usage');
    });

    it('handles nested headings', () => {
      const md =
        '# Title\n\n## Parent\n\nParent content.\n\n### Child\n\nChild content.\n\n## Next';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.sections).toHaveLength(3);
      expect(doc.sections[0].heading).toBe('Parent');
      expect(doc.sections[0].level).toBe(2);
      expect(doc.sections[1].heading).toBe('Child');
      expect(doc.sections[1].level).toBe(3);
      expect(doc.sections[2].heading).toBe('Next');
    });

    it('extracts code blocks from sections', () => {
      const md =
        '# Title\n\n## Example\n\nSome text.\n\n```typescript\nconst x = 1;\n```\n\nMore text.\n\n```bash\nnpm install\n```';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.sections[0].codeBlocks).toHaveLength(2);
      expect(doc.sections[0].codeBlocks[0]).toContain('const x = 1;');
      expect(doc.sections[0].codeBlocks[1]).toContain('npm install');
    });
  });

  describe('sort order', () => {
    it('uses sidebar_position from frontmatter', () => {
      const md = '---\nsidebar_position: 5\n---\n\n# Doc';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.order).toBe(5);
    });

    it('extracts numeric prefix from filename', () => {
      const doc = parseMarkdownDoc('# Doc', '03-setup.md');
      expect(doc.order).toBe(3);
    });

    it('defaults to Infinity when no order info', () => {
      const doc = parseMarkdownDoc('# Doc', 'random.md');
      expect(doc.order).toBe(Infinity);
    });
  });

  describe('rawContent', () => {
    it('strips frontmatter from rawContent', () => {
      const md = '---\ntitle: Test\n---\n\n# Title\n\nBody.';
      const doc = parseMarkdownDoc(md, 'doc.md');
      expect(doc.rawContent).not.toContain('---');
      expect(doc.rawContent).toContain('# Title');
      expect(doc.rawContent).toContain('Body.');
    });
  });

  it('sets relativePath from filePath argument', () => {
    const doc = parseMarkdownDoc('# Doc', 'cli/commands.md');
    expect(doc.relativePath).toBe('cli/commands.md');
  });

  it('handles empty input', () => {
    const doc = parseMarkdownDoc('', 'empty.md');
    expect(doc.title).toBe('Empty');
    expect(doc.sections).toHaveLength(0);
    expect(doc.rawContent).toBe('');
  });
});
````

- [ ] **Step 2: Implement markdown-parser.ts**

````typescript
import type { ParsedMarkdownDoc, ParsedSection } from './markdown-types.js';

/**
 * Parse a single markdown document into structured sections.
 *
 * Title resolution: frontmatter title > first # heading > filename.
 * Description resolution: frontmatter description > first paragraph.
 * Order resolution: frontmatter sidebar_position > numeric filename prefix > Infinity.
 */
export function parseMarkdownDoc(markdown: string, filePath: string): ParsedMarkdownDoc {
  const { frontmatter, content } = extractFrontmatter(markdown);

  const title = resolveTitle(frontmatter, content, filePath);
  const description = resolveDescription(frontmatter, content);
  const sections = extractSections(content);
  const order = resolveOrder(frontmatter, filePath);

  return {
    frontmatter: frontmatter ?? undefined,
    title,
    description,
    relativePath: filePath,
    sections,
    rawContent: content.trim(),
    order
  };
}

/** Extract YAML frontmatter from markdown. Returns parsed object + remaining content. */
function extractFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown> | null;
  content: string;
} {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: null, content: markdown };

  const yamlBlock = match[1] ?? '';
  const content = match[2] ?? '';

  // Simple YAML parser for flat key-value pairs
  const frontmatter: Record<string, unknown> = {};
  for (const line of yamlBlock.split('\n')) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1] ?? '';
      let value: unknown = (kvMatch[2] ?? '').trim();
      // Coerce numbers
      if (/^\d+$/.test(value as string)) value = Number(value);
      // Strip quotes
      if (typeof value === 'string' && /^["'].*["']$/.test(value)) {
        value = value.slice(1, -1);
      }
      if (key) frontmatter[key] = value;
    }
  }

  return { frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null, content };
}

/** Resolve document title: frontmatter > # heading > filename */
function resolveTitle(
  frontmatter: Record<string, unknown> | null,
  content: string,
  filePath: string
): string {
  // Frontmatter title
  if (frontmatter?.['title'] && typeof frontmatter['title'] === 'string') {
    return frontmatter['title'];
  }

  // First # heading
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) return headingMatch[1].trim();

  // Filename fallback
  return fileNameToTitle(filePath);
}

/** Convert filename to title: "01-getting-started.md" → "Getting Started" */
function fileNameToTitle(filePath: string): string {
  const basename =
    filePath
      .split('/')
      .pop()
      ?.replace(/\.mdx?$/, '') ?? '';
  // Strip numeric prefix
  const withoutPrefix = basename.replace(/^\d+-/, '');
  // Kebab to title case
  return withoutPrefix
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Resolve description: frontmatter > first paragraph */
function resolveDescription(
  frontmatter: Record<string, unknown> | null,
  content: string
): string | undefined {
  if (frontmatter?.['description'] && typeof frontmatter['description'] === 'string') {
    return frontmatter['description'];
  }

  // First non-heading, non-empty paragraph
  const lines = content.split('\n');
  const paraLines: string[] = [];
  let pastFirstHeading = false;
  let inPara = false;

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      if (inPara) break;
      pastFirstHeading = true;
      continue;
    }
    if (!pastFirstHeading) continue;
    const trimmed = line.trim();
    if (!trimmed) {
      if (inPara) break;
      continue;
    }
    inPara = true;
    paraLines.push(trimmed);
  }

  return paraLines.length > 0 ? paraLines.join(' ') : undefined;
}

/** Extract all headed sections from content */
function extractSections(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];
  let currentHeading: string | null = null;
  let currentLevel = 0;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentHeading !== null) {
        const sectionContent = currentLines.join('\n').trim();
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: sectionContent,
          codeBlocks: extractCodeBlocks(sectionContent)
        });
      }
      currentHeading = (headingMatch[2] ?? '').trim();
      currentLevel = (headingMatch[1] ?? '').length;
      currentLines = [];
    } else if (currentHeading !== null) {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentHeading !== null) {
    const sectionContent = currentLines.join('\n').trim();
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: sectionContent,
      codeBlocks: extractCodeBlocks(sectionContent)
    });
  }

  return sections;
}

/** Extract fenced code blocks from markdown content */
function extractCodeBlocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /```[\w]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) blocks.push(match[1].trim());
  }
  return blocks;
}

/** Resolve sort order: sidebar_position > filename prefix > Infinity */
function resolveOrder(frontmatter: Record<string, unknown> | null, filePath: string): number {
  // Frontmatter sidebar_position
  const pos = frontmatter?.['sidebar_position'];
  if (typeof pos === 'number') return pos;

  // Numeric filename prefix
  const basename = filePath.split('/').pop() ?? '';
  const prefixMatch = basename.match(/^(\d+)-/);
  if (prefixMatch?.[1]) return Number(prefixMatch[1]);

  return Infinity;
}
````

- [ ] **Step 3: Export from index.ts**

```typescript
export { parseMarkdownDoc } from './markdown-parser.js';
```

- [ ] **Step 4: Run tests, commit**

```bash
pnpm test
git add packages/core/src/markdown-parser.ts packages/core/test/markdown-parser.test.ts packages/core/src/index.ts
git commit -m "feat(core): generalized markdown document parser"
```

---

### Task 3: Docs directory scanner

Reads a directory of `.md` files, parses each with `parseMarkdownDoc`, orders them, and converts to `ExtractedDocument[]`.

**Files:**

- Create: `packages/core/src/docs-scanner.ts`
- Create: `packages/core/test/docs-scanner.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Use a temp directory with real `.md` files:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { scanDocs, docsToExtractedDocuments } from '../src/docs-scanner.js';

const TMP = join(import.meta.dirname ?? __dirname, '__tmp_docs__');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('scanDocs', () => {
  it('scans directory and returns parsed docs', () => {
    writeFileSync(join(TMP, 'guide.md'), '# Guide\n\nGuide content.');
    writeFileSync(join(TMP, 'setup.md'), '# Setup\n\nSetup content.');
    const docs = scanDocs({ docsDir: TMP });
    expect(docs).toHaveLength(2);
    expect(docs.map((d) => d.title)).toContain('Guide');
    expect(docs.map((d) => d.title)).toContain('Setup');
  });

  it('orders by sidebar_position', () => {
    writeFileSync(join(TMP, 'b.md'), '---\nsidebar_position: 2\n---\n\n# Second');
    writeFileSync(join(TMP, 'a.md'), '---\nsidebar_position: 1\n---\n\n# First');
    const docs = scanDocs({ docsDir: TMP });
    expect(docs[0].title).toBe('First');
    expect(docs[1].title).toBe('Second');
  });

  it('orders by numeric filename prefix', () => {
    writeFileSync(join(TMP, '02-setup.md'), '# Setup');
    writeFileSync(join(TMP, '01-intro.md'), '# Intro');
    const docs = scanDocs({ docsDir: TMP });
    expect(docs[0].title).toBe('Intro');
    expect(docs[1].title).toBe('Setup');
  });

  it('scans subdirectories', () => {
    mkdirSync(join(TMP, 'cli'), { recursive: true });
    writeFileSync(join(TMP, 'cli', 'commands.md'), '# CLI Commands');
    writeFileSync(join(TMP, 'overview.md'), '# Overview');
    const docs = scanDocs({ docsDir: TMP });
    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.title === 'CLI Commands')).toBeDefined();
  });

  it('excludes patterns', () => {
    mkdirSync(join(TMP, 'api'), { recursive: true });
    writeFileSync(join(TMP, 'api', 'generated.md'), '# API');
    writeFileSync(join(TMP, 'guide.md'), '# Guide');
    const docs = scanDocs({ docsDir: TMP, exclude: ['**/api/**'] });
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('Guide');
  });

  it('respects maxDocs limit', () => {
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(TMP, `doc-${i}.md`), `# Doc ${i}`);
    }
    const docs = scanDocs({ docsDir: TMP, maxDocs: 3 });
    expect(docs).toHaveLength(3);
  });

  it('returns empty array for non-existent directory', () => {
    const docs = scanDocs({ docsDir: join(TMP, 'nope') });
    expect(docs).toHaveLength(0);
  });
});

describe('docsToExtractedDocuments', () => {
  it('converts ParsedMarkdownDoc[] to ExtractedDocument[]', () => {
    writeFileSync(join(TMP, 'guide.md'), '# My Guide\n\nContent here.');
    const docs = scanDocs({ docsDir: TMP });
    const extracted = docsToExtractedDocuments(docs);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].title).toBe('My Guide');
    expect(extracted[0].content).toContain('Content here.');
  });
});
```

- [ ] **Step 2: Implement docs-scanner.ts**

```typescript
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { DocsExtractionOptions, ParsedMarkdownDoc } from './markdown-types.js';
import type { ExtractedDocument } from './types.js';
import { parseMarkdownDoc } from './markdown-parser.js';

const DEFAULT_EXCLUDE = ['**/api/**', '**/node_modules/**', '**/.specify/**', '**/superpowers/**'];
const DEFAULT_MAX_DOCS = 20;

/**
 * Scan a directory of .md files and return parsed, ordered documents.
 */
export function scanDocs(options: DocsExtractionOptions): ParsedMarkdownDoc[] {
  const { docsDir, exclude = DEFAULT_EXCLUDE, maxDocs = DEFAULT_MAX_DOCS } = options;

  if (!existsSync(docsDir)) return [];

  const mdFiles = collectMdFiles(docsDir, docsDir, exclude);
  const docs = mdFiles.map(({ absPath, relPath }) => {
    const content = readFileSync(absPath, 'utf-8');
    return parseMarkdownDoc(content, relPath);
  });

  // Sort: by order (sidebar_position / prefix), then alphabetically by title
  docs.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });

  return docs.slice(0, maxDocs);
}

/** Convert parsed docs to ExtractedDocument[] for the skill */
export function docsToExtractedDocuments(docs: ParsedMarkdownDoc[]): ExtractedDocument[] {
  return docs.map((doc) => ({
    title: doc.title,
    content: doc.rawContent
  }));
}

/** Recursively collect .md files from a directory */
function collectMdFiles(
  dir: string,
  rootDir: string,
  exclude: string[]
): Array<{ absPath: string; relPath: string }> {
  const results: Array<{ absPath: string; relPath: string }> = [];

  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = join(dir, entry.name);
    const relPath = relative(rootDir, absPath);

    // Check exclusions (simple glob matching)
    if (isExcluded(relPath, exclude)) continue;

    if (entry.isDirectory()) {
      results.push(...collectMdFiles(absPath, rootDir, exclude));
    } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      results.push({ absPath, relPath });
    }
  }

  return results;
}

/** Simple glob exclusion check */
function isExcluded(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Convert simple glob to regex: **/api/** → any path containing /api/
    const segment = pattern
      .replace(/\*\*\//g, '')
      .replace(/\/\*\*/, '')
      .replace(/\*/g, '[^/]*');
    if (relPath.includes(segment.replace(/\[\^\/\]\*/g, ''))) return true;
  }
  return false;
}
```

- [ ] **Step 3: Export from index.ts**

```typescript
export { scanDocs, docsToExtractedDocuments } from './docs-scanner.js';
```

- [ ] **Step 4: Run tests, commit**

```bash
pnpm test
git add packages/core/src/docs-scanner.ts packages/core/test/docs-scanner.test.ts packages/core/src/index.ts
git commit -m "feat(core): docs directory scanner with ordering"
```

---

### Task 4: Add "Documentation" section to SKILL.md renderer

When a skill has documents, render a listing in the SKILL.md.

**Files:**

- Modify: `packages/core/src/renderer.ts`
- Modify: `packages/core/test/renderer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('renders Documentation section when skill has documents', () => {
  const skill: ExtractedSkill = {
    name: 'my-lib',
    description: 'A lib',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    documents: [
      {
        title: 'Architecture',
        content: 'Architecture overview and design decisions for the system.'
      },
      { title: 'Troubleshooting', content: 'Common issues and solutions.' }
    ]
  };
  const result = renderSkill(skill);
  expect(result.skill.content).toContain('## Documentation');
  expect(result.skill.content).toContain('**Architecture**');
  expect(result.skill.content).toContain('**Troubleshooting**');
});

it('does not render Documentation section when no documents', () => {
  const skill: ExtractedSkill = {
    name: 'my-lib',
    description: 'A lib',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };
  const result = renderSkill(skill);
  expect(result.skill.content).not.toContain('## Documentation');
});
```

- [ ] **Step 2: Add `renderDocumentation` function in renderer.ts**

```typescript
function renderDocumentation(skill: ExtractedSkill): string {
  if (!skill.documents || skill.documents.length === 0) return '';
  const lines = ['## Documentation\n'];
  for (const doc of skill.documents) {
    // Extract first sentence of content as description
    const firstSentence = doc.content.match(/^[^.!?\n]+[.!?]/)?.[0] ?? '';
    const desc = firstSentence ? ` — ${firstSentence}` : '';
    lines.push(`- **${doc.title}**${desc}`);
  }
  return lines.join('\n');
}
```

Call it in `renderSkillMd` after Quick Reference and before Links:

```typescript
// Documentation listing
const docsSection = renderDocumentation(skill);
if (docsSection) sections.push(docsSection);
```

- [ ] **Step 3: Run tests, commit**

```bash
pnpm test
git add packages/core/src/renderer.ts packages/core/test/renderer.test.ts
git commit -m "feat(core): render Documentation section in SKILL.md for doc pages"
```

---

### Task 5: Scaffold `@skillit/docusaurus` package

**Files:**

- Create: `packages/docusaurus/package.json`
- Create: `packages/docusaurus/tsconfig.json`
- Create: `packages/docusaurus/tsconfig.build.json`
- Create: `packages/docusaurus/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@skillit/docusaurus",
  "version": "0.1.0",
  "description": "Docusaurus docs adapter for AI agent skill generation",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsgo -p tsconfig.build.json",
    "type-check": "tsgo --noEmit"
  },
  "keywords": ["docusaurus", "documentation", "markdown", "skill-generation", "agent-skills"],
  "license": "MIT",
  "repository": "https://github.com/pradeepmouli/to-skills",
  "author": "Pradeep Mouli",
  "dependencies": {
    "@skillit/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Create tsconfig files**

Match the pattern from `packages/cli/tsconfig.json` (extends root, no references).

- [ ] **Step 3: Create src/index.ts stub**

```typescript
// Docusaurus docs adapter for skill generation
// Exports will be added as implementation progresses
export {};
```

- [ ] **Step 4: Install and build**

```bash
pnpm install
pnpm build
git add packages/docusaurus/
git commit -m "chore: scaffold @skillit/docusaurus package"
```

---

### Task 6: Docusaurus category reader

**Files:**

- Create: `packages/docusaurus/src/category-reader.ts`
- Create: `packages/docusaurus/test/category-reader.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readCategoryLabels } from '../src/category-reader.js';

const TMP = join(import.meta.dirname ?? __dirname, '__tmp_docusaurus__');

beforeEach(() => {
  mkdirSync(join(TMP, 'cli'), { recursive: true });
  mkdirSync(join(TMP, 'api'), { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('readCategoryLabels', () => {
  it('reads _category_.json from subdirectories', () => {
    writeFileSync(
      join(TMP, 'cli', '_category_.json'),
      JSON.stringify({ label: 'CLI Guide', position: 3 })
    );
    writeFileSync(
      join(TMP, 'api', '_category_.json'),
      JSON.stringify({ label: 'API Reference', position: 1 })
    );
    const labels = readCategoryLabels(TMP);
    expect(labels.get('cli')).toEqual({ label: 'CLI Guide', position: 3 });
    expect(labels.get('api')).toEqual({ label: 'API Reference', position: 1 });
  });

  it('returns empty map when no _category_.json files exist', () => {
    const labels = readCategoryLabels(TMP);
    expect(labels.size).toBe(0);
  });

  it('handles invalid JSON gracefully', () => {
    writeFileSync(join(TMP, 'cli', '_category_.json'), 'not json');
    const labels = readCategoryLabels(TMP);
    expect(labels.size).toBe(0);
  });
});
```

- [ ] **Step 2: Implement category-reader.ts**

```typescript
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface CategoryMeta {
  label: string;
  position?: number;
}

/**
 * Read _category_.json files from subdirectories of a docs root.
 * Returns a map of directory name → category metadata.
 */
export function readCategoryLabels(docsDir: string): Map<string, CategoryMeta> {
  const result = new Map<string, CategoryMeta>();
  if (!existsSync(docsDir)) return result;

  const entries = readdirSync(docsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const catPath = join(docsDir, entry.name, '_category_.json');
    if (existsSync(catPath)) {
      try {
        const raw = readFileSync(catPath, 'utf-8');
        const meta = JSON.parse(raw) as CategoryMeta;
        if (meta.label) {
          result.set(entry.name, meta);
        }
      } catch {
        // skip invalid JSON
      }
    }
  }

  return result;
}
```

- [ ] **Step 3: Run tests, commit**

```bash
pnpm test
git add packages/docusaurus/src/category-reader.ts packages/docusaurus/test/category-reader.test.ts
git commit -m "feat(docusaurus): _category_.json reader"
```

---

### Task 7: Docusaurus extraction entry point

**Files:**

- Modify: `packages/docusaurus/src/index.ts`
- Create: `packages/docusaurus/test/index.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { extractDocusaurusDocs } from '../src/index.js';

const TMP = join(import.meta.dirname ?? __dirname, '__tmp_docus_integration__');

beforeEach(() => {
  mkdirSync(join(TMP, 'docs', 'cli'), { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('extractDocusaurusDocs', () => {
  it('reads docs/ directory and returns ExtractedDocument[]', () => {
    writeFileSync(
      join(TMP, 'docs', 'intro.md'),
      '---\nsidebar_position: 1\n---\n\n# Introduction\n\nWelcome.'
    );
    writeFileSync(
      join(TMP, 'docs', 'cli', 'usage.md'),
      '---\nsidebar_position: 2\n---\n\n# CLI Usage\n\nRun commands.'
    );
    const docs = extractDocusaurusDocs({ projectRoot: TMP });
    expect(docs).toHaveLength(2);
    expect(docs[0].title).toBe('Introduction'); // ordered by sidebar_position
    expect(docs[1].title).toBe('CLI Usage');
  });

  it('excludes api/ directory by default', () => {
    writeFileSync(join(TMP, 'docs', 'guide.md'), '# Guide');
    mkdirSync(join(TMP, 'docs', 'api'), { recursive: true });
    writeFileSync(join(TMP, 'docs', 'api', 'generated.md'), '# API');
    const docs = extractDocusaurusDocs({ projectRoot: TMP });
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('Guide');
  });

  it('uses custom docsDir', () => {
    mkdirSync(join(TMP, 'content'), { recursive: true });
    writeFileSync(join(TMP, 'content', 'page.md'), '# Custom Page');
    const docs = extractDocusaurusDocs({ projectRoot: TMP, docsDir: 'content' });
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('Custom Page');
  });

  it('returns empty array when docs/ does not exist', () => {
    rmSync(join(TMP, 'docs'), { recursive: true, force: true });
    const docs = extractDocusaurusDocs({ projectRoot: TMP });
    expect(docs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement index.ts**

```typescript
import { join } from 'node:path';
import { scanDocs, docsToExtractedDocuments } from '@skillit/core';
import type { ExtractedDocument } from '@skillit/core';
import { readCategoryLabels } from './category-reader.js';

export { readCategoryLabels } from './category-reader.js';
export type { CategoryMeta } from './category-reader.js';

export interface DocusaurusDocsOptions {
  /** Project root directory (default: cwd) */
  projectRoot?: string;
  /** Docs directory name relative to project root (default: "docs") */
  docsDir?: string;
  /** Exclude API reference directory (default: true) */
  excludeApi?: boolean;
  /** Maximum number of docs to include (default: 20) */
  maxDocs?: number;
}

/**
 * Extract documentation from a Docusaurus-style docs directory.
 * Returns ExtractedDocument[] ready to merge into an ExtractedSkill.
 */
export function extractDocusaurusDocs(options: DocusaurusDocsOptions = {}): ExtractedDocument[] {
  const {
    projectRoot = process.cwd(),
    docsDir = 'docs',
    excludeApi = true,
    maxDocs = 20
  } = options;

  const fullDocsDir = join(projectRoot, docsDir);

  const exclude = ['**/node_modules/**', '**/.specify/**', '**/superpowers/**', '**/blog/**'];
  if (excludeApi) exclude.push('**/api/**');

  // Read category metadata for enrichment
  const _categories = readCategoryLabels(fullDocsDir);
  // Category metadata could be used to prefix titles or adjust ordering
  // For now, scanDocs handles ordering via frontmatter sidebar_position

  const parsed = scanDocs({
    docsDir: fullDocsDir,
    exclude,
    maxDocs
  });

  return docsToExtractedDocuments(parsed);
}
```

- [ ] **Step 3: Run tests, commit**

```bash
pnpm test
git add packages/docusaurus/src/index.ts packages/docusaurus/test/index.test.ts
git commit -m "feat(docusaurus): extractDocusaurusDocs entry point"
```

---

### Task 8: Wire docs scanning into TypeDoc plugin

**Files:**

- Modify: `packages/typedoc/src/plugin.ts`

- [ ] **Step 1: Add two new TypeDoc options**

After existing options:

```typescript
app.options.addDeclaration({
  name: 'skillsIncludeDocs',
  help: '[Skills] Include prose docs from docs/ directory alongside API skills',
  type: ParameterType.Boolean,
  defaultValue: false
});

app.options.addDeclaration({
  name: 'skillsDocsDir',
  help: '[Skills] Directory containing prose documentation (default: docs)',
  type: ParameterType.String,
  defaultValue: 'docs'
});
```

- [ ] **Step 2: Add docs scanning in EVENT_RESOLVE_END handler**

After skill extraction and before rendering, conditionally scan docs:

```typescript
// --- Docs scanning (opt-in) ---
const includeDocs = app.options.getValue('skillsIncludeDocs') as boolean;
if (includeDocs) {
  const docsDir = app.options.getValue('skillsDocsDir') as string;
  const fullDocsDir = join(process.cwd(), docsDir);
  if (existsSync(fullDocsDir)) {
    const parsedDocs = scanDocs({
      docsDir: fullDocsDir,
      exclude: ['**/api/**', '**/node_modules/**']
    });
    const extractedDocs = docsToExtractedDocuments(parsedDocs);
    for (const skill of skills) {
      skill.documents = [...(skill.documents ?? []), ...extractedDocs];
    }
    app.logger.info(`[skills] Included ${extractedDocs.length} docs from ${docsDir}/`);
  }
}
```

Add imports:

```typescript
import { scanDocs, docsToExtractedDocuments } from '@skillit/core';
```

- [ ] **Step 3: Build and test manually**

```bash
pnpm build
pnpm typedoc
```

- [ ] **Step 4: Commit**

```bash
git add packages/typedoc/src/plugin.ts
git commit -m "feat(typedoc): wire docs scanning with skillsIncludeDocs option"
```

---

### Task 9: Build, test, publish

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

- [ ] **Step 2: Build all packages**

```bash
pnpm build
```

- [ ] **Step 3: Test on dependabit (has real docs/)**

Enable docs scanning in dependabit's typedoc.json:

```json
{ "skillsIncludeDocs": true }
```

Run `pnpm docs:md` and verify:

- Audit shows docs were included
- `skills/dependabit/references/architecture.md` exists
- `skills/dependabit/references/troubleshooting.md` exists
- SKILL.md has a "Documentation" section listing the docs

- [ ] **Step 4: Create changeset, version, push**

```bash
cat > .changeset/markdown-docusaurus.md << 'EOF'
---
'@skillit/core': minor
'@skillit/typedoc': minor
'@skillit/docusaurus': minor
---

Markdown & Docusaurus docs extraction

- Generalized markdown doc parser (parseMarkdownDoc) with frontmatter, sections, code blocks
- Docs directory scanner (scanDocs) with sidebar_position/filename-prefix ordering
- Documentation section in SKILL.md listing available doc pages
- @skillit/docusaurus package: Docusaurus adapter with _category_.json support
- TypeDoc plugin: skillsIncludeDocs + skillsDocsDir options for opt-in docs scanning
EOF

npx changeset version
git add -A
git commit -m "chore: version packages"
git push
```

---

## Summary

| Task | What                           | Files                           |
| ---- | ------------------------------ | ------------------------------- |
| 1    | Markdown types                 | `markdown-types.ts`, `index.ts` |
| 2    | Markdown parser (pure)         | `markdown-parser.ts`, tests     |
| 3    | Docs directory scanner (I/O)   | `docs-scanner.ts`, tests        |
| 4    | SKILL.md Documentation section | `renderer.ts`, tests            |
| 5    | Scaffold @skillit/docusaurus   | package boilerplate             |
| 6    | Category reader                | `category-reader.ts`, tests     |
| 7    | Docusaurus entry point         | `index.ts`, tests               |
| 8    | Wire into TypeDoc plugin       | `plugin.ts`                     |
| 9    | Build, test, publish           | —                               |
