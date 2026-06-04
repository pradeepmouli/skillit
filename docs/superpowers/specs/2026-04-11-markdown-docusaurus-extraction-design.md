# Markdown & Docusaurus Docs Extraction — Design Spec

## Problem

The TypeDoc plugin extracts API reference from TypeScript source. The CLI extractor handles command definitions. But prose documentation — architecture guides, troubleshooting docs, CLI usage guides, migration docs, tutorials — lives in `docs/` directories as markdown files and is invisible to skill generation.

These docs contain expert knowledge (architecture decisions, troubleshooting steps, common mistakes) that scores highest on skill-judge D1 (Knowledge Delta) and D2 (Mindset/Procedures). Without them, generated skills are pure API reference.

## Solution

Two additions:

1. **Generalized markdown parser + directory scanner in `@skillit/core`** — reads a directory of `.md` files, parses YAML frontmatter + heading-based sections, produces ordered `ExtractedDocument[]` that feed into the existing `ExtractedSkill.documents` field.

2. **`@skillit/docusaurus` package** — thin adapter that adds Docusaurus-specific conventions (`sidebar_position`, `_category_.json`, `sidebars.js` ordering, `docs/` default directory).

## Architecture

```
@skillit/core
  ├── readme-parser.ts (existing — README-specific)
  ├── markdown-parser.ts (NEW — generic doc page parsing)
  └── docs-scanner.ts (NEW — directory scanning + ordering)

@skillit/docusaurus (NEW package)
  └── Docusaurus adapter:
      - _category_.json reading
      - sidebar_position ordering
      - sidebars.js parsing (optional)
      - Calls core's docs-scanner with Docusaurus defaults
```

---

## Data Model

### ParsedMarkdownDoc (core)

```typescript
/** A parsed markdown documentation page */
export interface ParsedMarkdownDoc {
  /** YAML frontmatter fields */
  frontmatter?: Record<string, unknown>;
  /** Document title (from # heading or frontmatter title) */
  title: string;
  /** Document description (from frontmatter description or first paragraph) */
  description?: string;
  /** File path relative to docs root */
  relativePath: string;
  /** Ordered sections extracted from headings */
  sections: ParsedSection[];
  /** Full raw content */
  rawContent: string;
  /** Sort order (from frontmatter sidebar_position, filename prefix, or alphabetical) */
  order: number;
}

/** A section within a markdown document */
export interface ParsedSection {
  /** Heading text */
  heading: string;
  /** Heading level (2 for ##, 3 for ###, etc.) */
  level: number;
  /** Content between this heading and the next same-or-higher level heading */
  content: string;
  /** Fenced code blocks extracted from content */
  codeBlocks: string[];
}
```

### DocsExtractionOptions (core)

```typescript
/** Options for scanning a docs directory */
export interface DocsExtractionOptions {
  /** Directory containing .md files */
  docsDir: string;
  /** Glob pattern for inclusion (default: "**/*.md") */
  include?: string;
  /** Glob patterns for exclusion */
  exclude?: string[];
  /** Maximum number of documents to include (default: 20) */
  maxDocs?: number;
}
```

Default exclusions: `**/api/**`, `**/node_modules/**`, `**/.specify/**`, `**/superpowers/**`

These are auto-generated directories that would duplicate TypeDoc output.

### No new fields on ExtractedSkill

The existing `documents?: ExtractedDocument[]` field is the output target:

```typescript
export interface ExtractedDocument {
  title: string;
  content: string;
}
```

Each `ParsedMarkdownDoc` maps to one `ExtractedDocument`:

- `title` ← `ParsedMarkdownDoc.title`
- `content` ← `ParsedMarkdownDoc.rawContent` (or a summarized version for token budgeting)

---

## Core: Markdown Parser

### `parseMarkdownDoc(markdown: string, filePath?: string): ParsedMarkdownDoc`

Parses a single markdown file into structured sections.

**YAML Frontmatter:**

```yaml
---
title: Architecture Guide
sidebar_position: 2
description: System architecture and design decisions
---
```

Extracted as `frontmatter` record. `title` and `description` are also promoted to top-level fields.

**Title resolution priority:**

1. Frontmatter `title` field
2. First `# heading` in content
3. Filename (converted from kebab-case: `getting-started.md` → `Getting Started`)

**Description resolution priority:**

1. Frontmatter `description` field
2. First non-heading paragraph (same logic as `parseReadme.firstParagraph`)

**Section extraction:**

- Walk headings at all levels (##, ###, ####)
- Each heading starts a section
- Section content = everything between this heading and the next same-or-higher level heading
- Code blocks within each section are also captured separately (for example extraction)

**Sort order resolution:**

1. Frontmatter `sidebar_position` (Docusaurus convention, widely adopted)
2. Numeric prefix in filename: `01-intro.md` → order 1, `02-setup.md` → order 2
3. Default: `Infinity` (sorts last, then alphabetical by title)

### Relationship to `parseReadme`

`parseReadme` is a specialized parser for READMEs — it looks for specific named sections (Quick Start, Features, Pitfalls) and returns a flat `ParsedReadme` type.

`parseMarkdownDoc` is generic — it extracts ALL sections without knowing their names. Different concerns, coexist cleanly. No refactoring of `parseReadme` needed.

---

## Core: Docs Scanner

### `scanDocs(options: DocsExtractionOptions): ParsedMarkdownDoc[]`

Reads a directory of `.md` files and returns parsed, ordered documents.

**Steps:**

1. Glob for `*.md` files in `docsDir` (respecting include/exclude)
2. Parse each with `parseMarkdownDoc`
3. Sort by `order` field (sidebar_position > filename prefix > alphabetical)
4. Truncate to `maxDocs` (default 20)

**Returns** an ordered array of `ParsedMarkdownDoc`.

**Note on filesystem access:** `scanDocs` requires `fs` and `glob`. Core already uses `fs` in `writer.ts`, so this is consistent. The markdown parser (`parseMarkdownDoc`) is pure — it takes a string. The scanner (`scanDocs`) handles I/O.

### `docsToExtractedDocuments(docs: ParsedMarkdownDoc[]): ExtractedDocument[]`

Converts parsed docs to `ExtractedDocument[]` for the skill:

```typescript
function docsToExtractedDocuments(docs: ParsedMarkdownDoc[]): ExtractedDocument[] {
  return docs.map((doc) => ({
    title: doc.title,
    content: doc.rawContent
  }));
}
```

The existing renderer already handles `ExtractedDocument[]` → `references/<title>.md` files with token budgeting.

---

## `@skillit/docusaurus` Package

### Structure

```
packages/docusaurus/
  src/
    index.ts           # Public API: extractDocusaurusDocs()
    category-reader.ts # Read _category_.json files
    sidebar-reader.ts  # Read sidebars.js ordering (optional)
  test/
    category-reader.test.ts
    sidebar-reader.test.ts
  package.json
```

### `extractDocusaurusDocs(options?): ExtractedDocument[]`

Thin wrapper around core's `scanDocs` with Docusaurus defaults:

```typescript
interface DocusaurusOptions {
  /** Docs directory (default: "docs") */
  docsDir?: string;
  /** Path to sidebars config (auto-detected) */
  sidebarsPath?: string;
  /** Exclude auto-generated API docs (default: true) */
  excludeApi?: boolean;
}
```

**Docusaurus-specific behavior:**

1. **Default directory:** `docs/` (Docusaurus convention)

2. **`_category_.json` reading:** Each subdirectory may have a `_category_.json`:

   ```json
   {
     "label": "CLI Guide",
     "position": 3
   }
   ```

   The `label` enriches the document title prefix. The `position` influences sort order for all docs in that directory.

3. **Default exclusions:** `docs/api/**` (TypeDoc output), `docs/blog/**` (Docusaurus blog)

4. **Ordering cascade:**
   - `sidebar_position` in frontmatter (per-doc)
   - `_category_.json` position (per-directory)
   - Numeric filename prefix
   - Alphabetical

5. **`sidebars.js` parsing (optional):** If a `sidebarsPath` is provided, read it for explicit ordering. This is optional because many Docusaurus sites use auto-generated sidebars (from directory structure + frontmatter), not explicit `sidebars.js`.

### Dependencies

```json
{
  "name": "@skillit/docusaurus",
  "dependencies": {
    "@skillit/core": "workspace:*"
  }
}
```

No Docusaurus peer dependency needed — we're just reading markdown files and JSON configs, not running Docusaurus.

---

## Integration Points

### With TypeDoc plugin

The TypeDoc plugin can optionally invoke docs scanning after skill extraction:

```typescript
// In plugin.ts, after skill extraction and rendering:
try {
  const { scanDocs, docsToExtractedDocuments } = await import('@skillit/core');
  const docsDir = join(process.cwd(), 'docs');
  if (existsSync(docsDir)) {
    const docs = scanDocs({ docsDir, exclude: ['**/api/**'] });
    const extractedDocs = docsToExtractedDocuments(docs);
    // Merge into skill.documents
    for (const skill of skills) {
      skill.documents = [...(skill.documents ?? []), ...extractedDocs];
    }
  }
} catch {
  // Docs scanning failed — continue without
}
```

This is opt-in via a new TypeDoc option:

```typescript
app.options.addDeclaration({
  name: 'skillsIncludeDocs',
  help: '[Skills] Include prose docs from docs/ directory',
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

### With CLI extractor

`@skillit/cli` can also merge docs:

```typescript
const cliSkill = await extractCliSkill({ program, metadata });

// Optionally merge prose docs
const docs = scanDocs({ docsDir: 'docs' });
cliSkill.documents = docsToExtractedDocuments(docs);
```

### With Docusaurus

`@skillit/docusaurus` is standalone — it reads the docs directory and produces `ExtractedDocument[]`. A project can use it directly:

```typescript
import { extractDocusaurusDocs } from '@skillit/docusaurus';
import { renderSkill } from '@skillit/core';

const docs = extractDocusaurusDocs({ docsDir: 'docs' });
const skill = { name: 'my-project', documents: docs /* ... */ };
const rendered = renderSkill(skill);
```

---

## Rendering

The existing renderer already handles `ExtractedDocument[]`:

```typescript
// In renderer.ts (existing code):
if (skill.documents && skill.documents.length > 0) {
  for (const doc of skill.documents) {
    const content = `# ${doc.title}\n\n${doc.content}`;
    references.push({
      filename: `${basePath}/references/${toFilename(doc.title)}.md`,
      content: truncateToTokenBudget(content, opts.maxTokens),
      tokens: estimateTokens(content)
    });
  }
}
```

Each doc page becomes its own reference file, token-budgeted independently. No renderer changes needed.

The SKILL.md should list available docs. The renderer could add a "Documentation" section listing document titles. This is a minor addition to `renderSkillMd`:

```markdown
## Documentation

- **Architecture** — System architecture and design decisions
- **Troubleshooting** — Common issues and solutions
- **CLI Guide** — Command reference and configuration
```

---

## Audit Additions

| Code | Severity | Check                                                           |
| ---- | -------- | --------------------------------------------------------------- |
| DW1  | warning  | `docs/` directory exists but `skillsIncludeDocs` is not enabled |
| DW2  | warning  | Doc page has no frontmatter title or # heading                  |
| DA1  | alert    | Doc page has no description (frontmatter or first paragraph)    |

---

## What This Does NOT Cover

- **MDX component resolution** — MDX-specific components (React) are passed through as raw text. The markdown parser doesn't execute JSX.
- **Docusaurus plugin API** — we're not a Docusaurus plugin. We read the source markdown files, not the built output.
- **Versioned docs merging** — only the current version's docs are extracted. `versioned_docs/` is excluded by default.
- **Blog posts** — `docs/blog/` is excluded. Blog content isn't API or usage documentation.
- **Bidirectional flow** — generating Docusaurus docs FROM skill annotations (the "ideal flow" discussed earlier) is out of scope.
