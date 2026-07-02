# Markdown Docs

# Markdown Docs Extraction

> TypeDoc handles your API reference. This feature handles everything else: architecture guides, tutorials, troubleshooting docs, and migration guides.

Prose documentation contains expert knowledge --- architecture decisions, troubleshooting steps, common mistakes --- that scores highest on skill quality evaluations. Without it, generated skills are pure API reference. With it, skills include the context that makes them genuinely useful.

## The Problem

TypeDoc extracts from TypeScript source. The CLI extractor handles command definitions. But your `docs/` directory is invisible to skill generation:

```
docs/
  architecture.md      ← expert knowledge, invisible to skills
  troubleshooting.md   ← high-value "when X happens, do Y"
  migration-guide.md   ← version-specific procedures
src/
  index.ts             ← TypeDoc extracts this
```

## Enabling Docs Extraction

Add `skillsIncludeDocs` to your `typedoc.json`:

```json
{
  "skillsIncludeDocs": true,
  "skillsDocsDir": "docs"
}
```

That's it. The next `pnpm typedoc` run will scan `docs/`, parse each `.md` file, and include them as reference files in the generated skill.

## How Docs Become Skill References

Each markdown file in your docs directory becomes its own reference file in the skill, token-budgeted independently:

```
docs/
  architecture.md    →  skills/my-lib/references/architecture.md
  troubleshooting.md →  skills/my-lib/references/troubleshooting.md
  migration-guide.md →  skills/my-lib/references/migration-guide.md
```

The SKILL.md lists them in a Documentation section so LLMs know they exist:

```markdown
## Documentation

- **Architecture** --- System architecture and design decisions
- **Troubleshooting** --- Common issues and solutions
- **Migration Guide** --- Upgrading from v1 to v2
```

## Document Ordering

Documents are sorted using three signals (in priority order):

**1. Frontmatter `sidebar_position`** (widely adopted from Docusaurus):

```yaml
---
title: Architecture Guide
sidebar_position: 2
description: System architecture and design decisions
---
```

**2. Numeric filename prefix:**

```
docs/
  01-intro.md          → order 1
  02-setup.md          → order 2
  03-architecture.md   → order 3
```

**3. Alphabetical by title** (fallback).

## What Gets Parsed

The markdown parser extracts structured data from each file:

- **Title** --- from frontmatter `title`, first `# heading`, or filename (kebab-case converted)
- **Description** --- from frontmatter `description` or first paragraph
- **Sections** --- heading-based structure at all levels
- **Code blocks** --- extracted separately for example detection

## Framework Adapters

### VitePress Sites (`@skillit/vitepress`)

For projects using VitePress (like this documentation site), the `@skillit/vitepress` package provides a Vite plugin that integrates with your existing build:

```typescript
// .vitepress/config.mts
import { defineConfig } from 'vitepress';
import { skillit } from '@skillit/vitepress';

export default defineConfig({
  vite: {
    plugins: [skillit({ skillsOutDir: 'skills' })]
  }
});
```

The plugin reads VitePress conventions: sidebar configuration, frontmatter ordering, and directory structure.

### Docusaurus Sites (`@skillit/docusaurus`)

For Docusaurus projects, the `@skillit/docusaurus` adapter handles Docusaurus-specific conventions:

```typescript
import { extractDocusaurusDocs } from '@skillit/docusaurus';
import { renderSkill } from '@skillit/core';

const docs = extractDocusaurusDocs({
  docsDir: 'docs',
  excludeApi: true // skip auto-generated API docs
});

const skill = {
  name: 'my-project',
  documents: docs
  // ... other skill fields
};

const rendered = renderSkill(skill);
```

Docusaurus-specific behavior:

- Reads `_category_.json` for directory labels and ordering
- Respects `sidebar_position` in frontmatter
- Excludes `docs/api/**` (TypeDoc output) and `docs/blog/**` by default
- Supports explicit `sidebars.js` ordering when provided

Install:

```bash
pnpm add -D @skillit/docusaurus
```

No Docusaurus peer dependency --- it reads markdown files and JSON configs, not the Docusaurus runtime.

### Plain Docs Directories (`scanDocs`)

For projects without a docs framework, the core `scanDocs` function works with any directory of markdown files:

```typescript
import { scanDocs, docsToExtractedDocuments } from '@skillit/core';

const docs = scanDocs({
  docsDir: 'docs',
  include: '**/*.md',
  exclude: ['**/api/**', '**/node_modules/**'],
  maxDocs: 20
});

const extractedDocs = docsToExtractedDocuments(docs);
```

This is what the TypeDoc plugin uses internally when `skillsIncludeDocs` is enabled.

## TypeDoc Options

| Option              | Type    | Default  | Description                                |
| ------------------- | ------- | -------- | ------------------------------------------ |
| `skillsIncludeDocs` | boolean | `false`  | Include prose docs from the docs directory |
| `skillsDocsDir`     | string  | `"docs"` | Directory containing prose documentation   |

## Default Exclusions

These directories are excluded by default to avoid duplicating auto-generated content:

- `**/api/**` --- TypeDoc output
- `**/node_modules/**`
- `**/.specify/**`
- `**/superpowers/**`

## Writing Docs That Generate Good References

The best docs for skill generation answer questions that API reference cannot:

- **Architecture docs** --- why the system is structured this way, key abstractions
- **Troubleshooting** --- "when X happens, do Y" procedures
- **Migration guides** --- version-specific breaking changes and upgrade steps
- **Tutorials** --- end-to-end walkthroughs with realistic scenarios

Add frontmatter with `title` and `description` to every doc page. The parser uses these for the reference file title and the SKILL.md documentation listing.

## Limitations

- **MDX components** --- React/JSX in MDX files is passed through as raw text, not rendered
- **Versioned docs** --- only the current version is extracted (`versioned_docs/` is excluded)
- **Blog posts** --- `docs/blog/` is excluded (not API or usage documentation)
- **Token budget** --- each doc page is independently token-budgeted, so very long pages may be truncated
