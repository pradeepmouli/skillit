# VitePress Plugin & Docs Site — Design Spec

## Problem

to-skills has no documentation site. The generated skills serve as API reference but there's no prose documentation — getting started guide, conventions reference, architecture overview, or CLI usage guide. Additionally, the `@skillit/docusaurus` adapter is a passive file reader that misses Docusaurus/VitePress config context. Since we chose VitePress, we need a proper VitePress plugin that receives site config (including sidebar ordering) through Vite's plugin system.

## Solution

Two deliverables:

1. **`@skillit/vitepress`** — a Vite plugin registered in `.vitepress/config.mts` that receives VitePress config through Vite's plugin hooks, uses the sidebar tree for authoritative document ordering, scans markdown docs, and generates skills at build time.

2. **VitePress docs site for to-skills** — prose documentation deployed to GitHub Pages, with TypeDoc-generated API reference alongside hand-written guides. Uses `@skillit/vitepress` to dogfood skill generation from its own docs.

## Architecture

### `@skillit/vitepress` Package

```
packages/vitepress/
  src/
    index.ts              # toSkills() — Vite plugin factory
    sidebar-walker.ts     # Walk sidebar tree → ordered doc paths
  test/
    sidebar-walker.test.ts
    index.test.ts
  package.json
  tsconfig.json
  tsconfig.build.json
  tsdoc.json
```

**Registration:**

```typescript
// .vitepress/config.mts
import { defineConfig } from 'vitepress';
import { toSkills } from '@skillit/vitepress';

export default defineConfig({
  vite: {
    plugins: [toSkills({ skillsOutDir: 'skills' })]
  },
  themeConfig: {
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Conventions', link: '/guide/conventions' }
        ]
      }
    ]
  }
});
```

**Vite Plugin Hooks:**

1. **`config` hook** — Captures VitePress context from `config.vitepress.site`:
   - `themeConfig.sidebar` — the authoritative sidebar tree with ordering
   - `srcDir` — where markdown source files live
   - `title` / `description` — site metadata

2. **`closeBundle` hook** — After build completes:
   - Walk the sidebar tree to get ordered doc paths
   - Read and parse each markdown file using core's `parseMarkdownDoc`
   - Convert to `ExtractedDocument[]`
   - Build an `ExtractedSkill` with populated `documents`
   - Render via core's `renderSkill` and write via `writeSkills`
   - Log output summary

**VitePress Config Access:**

VitePress attaches its site config to the Vite config object. From a Vite plugin's `config` hook:

```typescript
const { themeConfig } = (config as any).vitepress.site;
const sidebar = themeConfig.sidebar; // SidebarItem[] or Record<string, SidebarItem[]>
```

This is the same pattern used by `vite-plugin-vitepress-auto-sidebar`.

### Sidebar-Driven Ordering

The sidebar tree defines document order — no frontmatter heuristics needed.

```typescript
// VitePress sidebar structure
interface SidebarItem {
  text?: string;
  link?: string;
  items?: SidebarItem[];
  collapsed?: boolean;
}

// Can be array (single sidebar) or object (multi-sidebar by route)
type Sidebar = SidebarItem[] | Record<string, SidebarItem[]>;
```

The `sidebar-walker.ts` module walks the tree depth-first, collecting `{ text, link }` pairs in order:

```typescript
interface OrderedDoc {
  title: string; // from sidebar text
  path: string; // from sidebar link, resolved to file path
  order: number; // position in sidebar (0-indexed)
}

function walkSidebar(sidebar: Sidebar, srcDir: string): OrderedDoc[];
```

For multi-sidebar (object form), all route sidebars are merged, with each route's docs in order.

### Plugin Options

```typescript
export interface ToSkillsVitePressOptions {
  /** Output directory for generated skills (default: "skills") */
  skillsOutDir?: string;
  /** Skill name (default: from package.json name) */
  name?: string;
  /** Maximum token budget per reference file (default: 4000) */
  maxTokens?: number;
  /** Exclude API reference directory (default: true) */
  excludeApi?: boolean;
  /** Additional paths to exclude from skill generation */
  exclude?: string[];
  /** License for generated skills */
  license?: string;
}
```

### Plugin Output

The plugin produces one skill per VitePress site:

```
skills/<name>/
  SKILL.md                    # Discovery file with site overview
  references/
    getting-started.md        # One reference per doc page
    conventions.md
    audit.md
    cli.md
    ...
```

The SKILL.md includes:

- Site title and description as the skill description
- `## Documentation` section listing all docs with first-sentence descriptions
- Quick Reference listing doc page titles grouped by sidebar section

Each doc page becomes a reference file, token-budgeted independently.

---

## VitePress Docs Site for to-skills

### Directory Structure

```
website/
  docs/
    index.md                      # Home — what is to-skills, install in 60 seconds
    getting-started.md            # Quick start guide
    guide/
      conventions.md              # JSDoc tag conventions (@useWhen, @avoidWhen, @pitfalls)
      audit.md                    # Documentation audit (fatal/error/warning/alert)
      cli-extraction.md           # CLI + config surface extraction
      markdown-docs.md            # Prose docs extraction
      skill-judge.md              # How to score well on skill-judge
    api/                          # Auto-generated by typedoc-vitepress-theme
      typedoc-sidebar.json        # Generated sidebar for API section
  .vitepress/
    config.mts                    # Site config
  package.json                    # Site-specific deps (vitepress, typedoc-vitepress-theme)
```

### Config File

```typescript
// website/.vitepress/config.mts
import { defineConfig } from 'vitepress';
import { toSkills } from '@skillit/vitepress';
import typedocSidebar from '../docs/api/typedoc-sidebar.json';

export default defineConfig({
  title: 'to-skills',
  description: 'Generate AI agent skills from TypeScript documentation',

  vite: {
    plugins: [
      toSkills({
        skillsOutDir: '../skills',
        name: 'to-skills-docs'
      })
    ]
  },

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API', link: '/api/' }
    ],
    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is to-skills?', link: '/' },
            { text: 'Getting Started', link: '/getting-started' }
          ]
        },
        {
          text: 'Guide',
          items: [
            { text: 'JSDoc Conventions', link: '/guide/conventions' },
            { text: 'Documentation Audit', link: '/guide/audit' },
            { text: 'CLI Extraction', link: '/guide/cli-extraction' },
            { text: 'Markdown Docs', link: '/guide/markdown-docs' },
            { text: 'Skill Quality', link: '/guide/skill-judge' }
          ]
        }
      ],
      '/api/': typedocSidebar
    }
  }
});
```

### TypeDoc Integration

The `typedoc-vitepress-theme` package generates markdown API docs + a `typedoc-sidebar.json` that VitePress consumes. A build script runs TypeDoc before VitePress:

```json
{
  "scripts": {
    "docs:api": "typedoc --out docs/api --plugin typedoc-plugin-markdown --plugin typedoc-vitepress-theme",
    "docs:build": "pnpm docs:api && vitepress build docs",
    "docs:dev": "vitepress dev docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

### Deployment

GitHub Actions workflow:

```yaml
name: Deploy Docs
on:
  push:
    branches: [master]
    paths: ['website/**', 'packages/*/src/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: cd website && pnpm docs:build
      - uses: actions/upload-pages-artifact@v4
        with: { path: website/docs/.vitepress/dist }
      - uses: actions/deploy-pages@v4
```

### Content Plan

Each guide page follows the same conventions we defined for to-skills users:

- Frontmatter with `title` and `description`
- `> blockquote` summary
- Prose introduction
- Code examples
- `## Pitfalls` where applicable

Content is derived from our existing specs and bundled skill — reorganized as a proper documentation site.

---

## Dogfood Loop

When the site builds:

1. `typedoc-vitepress-theme` generates API reference into `docs/api/`
2. VitePress builds the site from `docs/`
3. `@skillit/vitepress` plugin runs at `closeBundle`:
   - Reads sidebar from VitePress config
   - Scans guide pages in sidebar order
   - Generates `skills/to-skills-docs/SKILL.md` with all prose docs as references
4. The generated skill coexists with `skills/to-skills-core/`, `skills/to-skills-typedoc/`, `skills/to-skills-cli/` (from TypeDoc plugin)

Result: **four skills** for to-skills:

- `to-skills-core` — API reference (from TypeDoc)
- `to-skills-typedoc` — plugin config + extractSkills (from TypeDoc)
- `to-skills-cli` — CLI extraction API (from TypeDoc)
- `to-skills-docs` — prose documentation (from VitePress plugin)

---

## Package Dependencies

### `@skillit/vitepress`

```json
{
  "name": "@skillit/vitepress",
  "dependencies": {
    "@skillit/core": "workspace:*"
  },
  "peerDependencies": {
    "vitepress": ">=1.0.0"
  },
  "peerDependenciesMeta": {
    "vitepress": { "optional": true }
  }
}
```

VitePress is an optional peer dep — the plugin's types reference VitePress config but it doesn't import VitePress at runtime (it receives config through Vite's hook system).

### `website/`

```json
{
  "private": true,
  "devDependencies": {
    "vitepress": "^2.0.0",
    "typedoc": "^0.28.0",
    "typedoc-plugin-markdown": "^4.0.0",
    "typedoc-vitepress-theme": "^2.0.0",
    "@skillit/vitepress": "workspace:*"
  }
}
```

---

## What This Does NOT Cover

- **Custom VitePress theme** — uses the default theme. Custom components can be added later.
- **Search** — VitePress has built-in local search. No Algolia setup needed initially.
- **Versioned docs** — single version for now. VitePress versioning can be added later.
- **Blog** — no blog section. Pure documentation.
- **i18n** — English only.
- **Workspace membership** — `website/` is added to `pnpm-workspace.yaml` as a workspace member so it can reference `@skillit/vitepress` via `workspace:*`.
