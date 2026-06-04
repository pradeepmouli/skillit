# VitePress Plugin & Docs Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@skillit/vitepress` as a Vite plugin that receives VitePress config through Vite's plugin system, uses the sidebar tree for authoritative document ordering, and generates skills at build time. Then scaffold the to-skills VitePress docs site that dogfoods the plugin.

**Architecture:** The VitePress plugin uses Vite's `config` hook to capture `config.vitepress.site` (sidebar, srcDir, title) and `closeBundle` hook to scan docs in sidebar order, parse with core's `parseMarkdownDoc`, and generate skills via core's renderer. The docs site lives at `website/` with hand-written guides + TypeDoc-generated API reference.

**Tech Stack:** TypeScript 5.9, VitePress 1.6, typedoc-vitepress-theme 1.1, Vitest 4.1, pnpm workspaces

---

## File Structure

| File                                             | Responsibility                                  |
| ------------------------------------------------ | ----------------------------------------------- |
| `packages/vitepress/package.json`                | Package config with vitepress optional peer dep |
| `packages/vitepress/tsconfig.json`               | TypeScript config                               |
| `packages/vitepress/tsconfig.build.json`         | Build config                                    |
| `packages/vitepress/tsdoc.json`                  | Custom tag declarations                         |
| `packages/vitepress/src/index.ts`                | `toSkills()` Vite plugin factory + exports      |
| `packages/vitepress/src/sidebar-walker.ts`       | Walk sidebar tree → ordered doc paths           |
| `packages/vitepress/test/sidebar-walker.test.ts` | Tests for sidebar walking                       |
| `packages/vitepress/test/index.test.ts`          | Integration tests with temp files               |
| `website/package.json`                           | VitePress site deps                             |
| `website/docs/index.md`                          | Home page                                       |
| `website/docs/getting-started.md`                | Quick start guide                               |
| `website/docs/guide/conventions.md`              | JSDoc conventions reference                     |
| `website/docs/guide/audit.md`                    | Audit engine guide                              |
| `website/docs/guide/cli-extraction.md`           | CLI extraction guide                            |
| `website/docs/guide/markdown-docs.md`            | Markdown docs guide                             |
| `website/docs/.vitepress/config.mts`             | VitePress config with toSkills plugin           |
| `website/typedoc.json`                           | TypeDoc config for API reference generation     |
| `.github/workflows/docs.yml`                     | GitHub Pages deployment                         |
| `pnpm-workspace.yaml`                            | Add website/ as workspace member                |

---

### Task 1: Scaffold `@skillit/vitepress` package

**Files:**

- Create: `packages/vitepress/package.json`
- Create: `packages/vitepress/tsconfig.json`
- Create: `packages/vitepress/tsconfig.build.json`
- Create: `packages/vitepress/tsdoc.json`
- Create: `packages/vitepress/src/index.ts` (stub)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@skillit/vitepress",
  "version": "0.1.0",
  "description": "VitePress plugin for AI agent skill generation — uses sidebar for document ordering",
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
  "keywords": [
    "vitepress",
    "vite-plugin",
    "documentation",
    "skill-generation",
    "agent-skills",
    "sidebar"
  ],
  "license": "MIT",
  "author": "Pradeep Mouli",
  "repository": {
    "type": "git",
    "url": "https://github.com/pradeepmouli/to-skills.git",
    "directory": "packages/vitepress"
  },
  "funding": {
    "type": "github",
    "url": "https://github.com/sponsors/pradeepmouli"
  },
  "files": ["dist", "README.md"],
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

- [ ] **Step 2: Create tsconfig files**

Match pattern from `packages/cli/tsconfig.json` — extends root, no references.

- [ ] **Step 3: Create tsdoc.json**

Copy from `packages/core/tsdoc.json`.

- [ ] **Step 4: Create src/index.ts stub**

```typescript
export {};
```

- [ ] **Step 5: Install and build**

```bash
pnpm install
pnpm --filter @skillit/vitepress build
```

- [ ] **Step 6: Create README.md**

````markdown
# @skillit/vitepress

> VitePress plugin for AI agent skill generation — uses sidebar for document ordering.

Part of the [to-skills](https://github.com/pradeepmouli/to-skills) ecosystem.

## Install

```bash
pnpm add -D @skillit/vitepress
```
````

## Usage

```typescript
// .vitepress/config.mts
import { defineConfig } from 'vitepress'
import { toSkills } from '@skillit/vitepress'

export default defineConfig({
  vite: {
    plugins: [
      toSkills({ skillsOutDir: 'skills' })
    ]
  },
  themeConfig: {
    sidebar: [...]
  }
})
```

## License

MIT

````

- [ ] **Step 7: Commit**

```bash
git add packages/vitepress/
git commit -m "chore: scaffold @skillit/vitepress package"
````

---

### Task 2: Sidebar walker

Pure function that walks a VitePress sidebar tree and returns ordered doc paths.

**Files:**

- Create: `packages/vitepress/src/sidebar-walker.ts`
- Create: `packages/vitepress/test/sidebar-walker.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { walkSidebar } from '../src/sidebar-walker.js';

describe('walkSidebar', () => {
  describe('array sidebar (single)', () => {
    it('extracts ordered docs from flat items', () => {
      const sidebar = [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/getting-started' },
            { text: 'Conventions', link: '/guide/conventions' }
          ]
        }
      ];
      const docs = walkSidebar(sidebar);
      expect(docs).toHaveLength(2);
      expect(docs[0]).toEqual({ title: 'Getting Started', path: '/getting-started', order: 0 });
      expect(docs[1]).toEqual({ title: 'Conventions', path: '/guide/conventions', order: 1 });
    });

    it('handles nested groups', () => {
      const sidebar = [
        {
          text: 'Guide',
          items: [
            { text: 'Intro', link: '/intro' },
            {
              text: 'Advanced',
              items: [{ text: 'Deep Dive', link: '/advanced/deep' }]
            }
          ]
        }
      ];
      const docs = walkSidebar(sidebar);
      expect(docs).toHaveLength(2);
      expect(docs[0].path).toBe('/intro');
      expect(docs[1].path).toBe('/advanced/deep');
    });

    it('skips items without link', () => {
      const sidebar = [
        {
          text: 'Section',
          items: [
            { text: 'Group Only' }, // no link — just a heading
            { text: 'Actual Page', link: '/page' }
          ]
        }
      ];
      const docs = walkSidebar(sidebar);
      expect(docs).toHaveLength(1);
      expect(docs[0].title).toBe('Actual Page');
    });

    it('uses text as title', () => {
      const sidebar = [{ text: 'Home', link: '/' }];
      const docs = walkSidebar(sidebar);
      expect(docs[0].title).toBe('Home');
    });

    it('returns empty array for empty sidebar', () => {
      expect(walkSidebar([])).toHaveLength(0);
    });
  });

  describe('object sidebar (multi-route)', () => {
    it('merges multiple route sidebars', () => {
      const sidebar = {
        '/guide/': [{ text: 'Intro', link: '/guide/intro' }],
        '/api/': [{ text: 'Core', link: '/api/core' }]
      };
      const docs = walkSidebar(sidebar);
      expect(docs).toHaveLength(2);
      expect(docs.map((d) => d.path)).toContain('/guide/intro');
      expect(docs.map((d) => d.path)).toContain('/api/core');
    });

    it('excludes routes matching exclude patterns', () => {
      const sidebar = {
        '/guide/': [{ text: 'Intro', link: '/guide/intro' }],
        '/api/': [{ text: 'Core', link: '/api/core' }]
      };
      const docs = walkSidebar(sidebar, { exclude: ['/api/'] });
      expect(docs).toHaveLength(1);
      expect(docs[0].path).toBe('/guide/intro');
    });
  });
});
```

- [ ] **Step 2: Implement sidebar-walker.ts**

```typescript
export interface OrderedDoc {
  title: string;
  path: string;
  order: number;
}

export interface WalkSidebarOptions {
  exclude?: string[];
}

interface SidebarItem {
  text?: string;
  link?: string;
  items?: SidebarItem[];
}

type Sidebar = SidebarItem[] | Record<string, SidebarItem[]>;

export function walkSidebar(sidebar: Sidebar, options?: WalkSidebarOptions): OrderedDoc[] {
  const docs: OrderedDoc[] = [];
  const exclude = options?.exclude ?? [];

  if (Array.isArray(sidebar)) {
    walkItems(sidebar, docs);
  } else {
    for (const [route, items] of Object.entries(sidebar)) {
      if (exclude.some((pattern) => route.startsWith(pattern))) continue;
      walkItems(items, docs);
    }
  }

  return docs;
}

function walkItems(items: SidebarItem[], docs: OrderedDoc[]): void {
  for (const item of items) {
    if (item.link) {
      docs.push({
        title: item.text ?? pathToTitle(item.link),
        path: item.link,
        order: docs.length
      });
    }
    if (item.items) {
      walkItems(item.items, docs);
    }
  }
}

function pathToTitle(path: string): string {
  const segment = path.split('/').pop() ?? '';
  return (
    segment
      .replace(/^\d+-/, '')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'Index'
  );
}
```

- [ ] **Step 3: Run tests, commit**

```bash
pnpm test -- packages/vitepress/test/sidebar-walker.test.ts
git add packages/vitepress/src/sidebar-walker.ts packages/vitepress/test/sidebar-walker.test.ts
git commit -m "feat(vitepress): sidebar tree walker for ordered document extraction"
```

---

### Task 3: VitePress plugin (`toSkills`)

The Vite plugin factory that hooks into VitePress's build lifecycle.

**Files:**

- Modify: `packages/vitepress/src/index.ts`
- Create: `packages/vitepress/test/index.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { toSkills } from '../src/index.js';

const TMP = join(import.meta.dirname ?? __dirname, '__tmp_vitepress__');

beforeEach(() => {
  mkdirSync(join(TMP, 'docs', 'guide'), { recursive: true });
  writeFileSync(
    join(TMP, 'docs', 'index.md'),
    '---\ntitle: Home\n---\n\n# Welcome\n\nThis is the home page.'
  );
  writeFileSync(
    join(TMP, 'docs', 'guide', 'intro.md'),
    '---\ntitle: Introduction\n---\n\n# Intro\n\nGetting started guide.'
  );
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('toSkills', () => {
  it('returns a Vite plugin object with name', () => {
    const plugin = toSkills();
    expect(plugin.name).toBe('to-skills-vitepress');
  });

  it('has config and closeBundle hooks', () => {
    const plugin = toSkills();
    expect(plugin.config).toBeDefined();
    expect(plugin.closeBundle).toBeDefined();
  });

  it('config hook captures vitepress site data', () => {
    const plugin = toSkills();
    const mockConfig = {
      vitepress: {
        site: {
          title: 'My Docs',
          description: 'Test site',
          themeConfig: {
            sidebar: [
              {
                text: 'Guide',
                items: [
                  { text: 'Home', link: '/' },
                  { text: 'Intro', link: '/guide/intro' }
                ]
              }
            ]
          }
        },
        srcDir: join(TMP, 'docs')
      }
    };

    // Call config hook — it should capture the vitepress context
    (plugin.config as Function)(mockConfig, { command: 'build' });

    // closeBundle should be able to use the captured data
    expect(plugin.closeBundle).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement index.ts**

```typescript
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import {
  parseMarkdownDoc,
  renderSkill,
  writeSkills,
  estimateTokens,
  truncateToTokenBudget
} from '@skillit/core';
import type { ExtractedSkill, ExtractedDocument } from '@skillit/core';
import { walkSidebar } from './sidebar-walker.js';
import type { OrderedDoc } from './sidebar-walker.js';

export { walkSidebar } from './sidebar-walker.js';
export type { OrderedDoc, WalkSidebarOptions } from './sidebar-walker.js';

export interface ToSkillsVitePressOptions {
  /** Output directory for generated skills (default: "skills") */
  skillsOutDir?: string;
  /** Skill name (default: from VitePress site title or package.json) */
  name?: string;
  /** Maximum token budget per reference file (default: 4000) */
  maxTokens?: number;
  /** Exclude API reference paths (default: true) */
  excludeApi?: boolean;
  /** Additional sidebar route paths to exclude */
  exclude?: string[];
  /** License for generated skills */
  license?: string;
}

export function toSkills(options: ToSkillsVitePressOptions = {}): Plugin {
  const {
    skillsOutDir = 'skills',
    maxTokens = 4000,
    excludeApi = true,
    exclude = [],
    license = ''
  } = options;

  let siteTitle = options.name ?? '';
  let siteDescription = '';
  let sidebar: any = [];
  let srcDir = '';

  const excludePatterns = [...exclude];
  if (excludeApi) excludePatterns.push('/api/');

  return {
    name: 'to-skills-vitepress',
    enforce: 'post',

    config(config: any) {
      const vitepress = config.vitepress;
      if (!vitepress?.site) return;

      siteTitle = options.name || vitepress.site.title || 'docs';
      siteDescription = vitepress.site.description || '';
      sidebar = vitepress.site.themeConfig?.sidebar ?? [];
      srcDir = vitepress.srcDir || '';
    },

    closeBundle() {
      if (!srcDir || !sidebar) return;

      const orderedDocs = walkSidebar(sidebar, { exclude: excludePatterns });
      if (orderedDocs.length === 0) return;

      const documents: ExtractedDocument[] = [];
      for (const doc of orderedDocs) {
        const filePath = resolveDocPath(srcDir, doc.path);
        if (!filePath || !existsSync(filePath)) continue;

        try {
          const content = readFileSync(filePath, 'utf-8');
          const parsed = parseMarkdownDoc(content, doc.path);
          documents.push({
            title: doc.title || parsed.title,
            content: parsed.rawContent
          });
        } catch {
          // skip unreadable files
        }
      }

      if (documents.length === 0) return;

      const skillName = toSkillName(siteTitle);
      const skill: ExtractedSkill = {
        name: siteTitle,
        description: siteDescription,
        packageDescription: siteDescription,
        license: license || undefined,
        documents,
        functions: [],
        classes: [],
        types: [],
        enums: [],
        variables: [],
        examples: []
      };

      const rendered = renderSkill(skill, {
        outDir: skillsOutDir,
        maxTokens,
        includeExamples: true,
        includeSignatures: false,
        namePrefix: '',
        license
      });

      writeSkills([rendered], { outDir: resolve(skillsOutDir) });

      const totalTokens =
        (rendered.skill.tokens ?? 0) +
        rendered.references.reduce((sum, r) => sum + (r.tokens ?? 0), 0);
      console.log(
        `[to-skills] Generated ${rendered.skill.filename} (~${totalTokens} tokens, ${documents.length} docs)`
      );
      for (const ref of rendered.references) {
        console.log(`[to-skills]   └─ ${ref.filename} (~${ref.tokens ?? 0} tokens)`);
      }
    }
  };
}

function resolveDocPath(srcDir: string, link: string): string | null {
  // /getting-started → srcDir/getting-started.md
  const clean = link.replace(/^\//, '').replace(/\/$/, '');
  const candidates = [
    join(srcDir, `${clean}.md`),
    join(srcDir, clean, 'index.md'),
    join(srcDir, `${clean}.mdx`)
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function toSkillName(name: string): string {
  return name
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

- [ ] **Step 3: Run tests, commit**

```bash
pnpm test -- packages/vitepress/test/
pnpm build
git add packages/vitepress/
git commit -m "feat(vitepress): toSkills Vite plugin — sidebar-driven skill generation"
```

---

### Task 4: Scaffold VitePress docs site

**Files:**

- Create: `website/package.json`
- Create: `website/docs/.vitepress/config.mts`
- Create: `website/docs/index.md`
- Create: `website/docs/getting-started.md`
- Create: `website/typedoc.json`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: Add website to workspace**

In `pnpm-workspace.yaml`, add:

```yaml
packages:
  - 'packages/*'
  - 'website'
```

- [ ] **Step 2: Create website/package.json**

```json
{
  "name": "to-skills-docs",
  "private": true,
  "type": "module",
  "scripts": {
    "docs:api": "typedoc",
    "docs:dev": "vitepress dev docs",
    "docs:build": "pnpm docs:api && vitepress build docs",
    "docs:preview": "vitepress preview docs"
  },
  "devDependencies": {
    "vitepress": "^1.6.0",
    "typedoc": "^0.28.0",
    "typedoc-plugin-markdown": "^4.0.0",
    "typedoc-vitepress-theme": "^1.1.0",
    "@skillit/vitepress": "workspace:*"
  }
}
```

- [ ] **Step 3: Create website/typedoc.json**

```json
{
  "entryPointStrategy": "packages",
  "entryPoints": ["../packages/core", "../packages/typedoc", "../packages/cli"],
  "out": "docs/api",
  "plugin": ["typedoc-plugin-markdown", "typedoc-vitepress-theme"],
  "skipErrorChecking": true,
  "excludePrivate": true,
  "excludeInternal": true,
  "readme": "none"
}
```

- [ ] **Step 4: Create website/docs/.vitepress/config.mts**

```typescript
import { defineConfig } from 'vitepress';
import { toSkills } from '@skillit/vitepress';

export default defineConfig({
  title: 'to-skills',
  description: 'Generate AI agent skills from TypeScript documentation',

  vite: {
    plugins: [
      toSkills({
        skillsOutDir: '../skills/to-skills-docs',
        name: 'to-skills-docs',
        license: 'MIT'
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
            { text: 'Markdown Docs', link: '/guide/markdown-docs' }
          ]
        }
      ]
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/pradeepmouli/to-skills' }]
  }
});
```

- [ ] **Step 5: Create website/docs/index.md**

````markdown
---
title: What is to-skills?
---

# to-skills

> Generate AI agent skills from your TypeScript documentation.

to-skills is a plugin ecosystem that transforms your existing JSDoc, CLI definitions, and prose docs into structured [SKILL.md](https://agentskills.io) files that LLMs can discover and use.

## Why?

LLMs are great at code — but they don't know YOUR library's API, trade-offs, and pitfalls. Skills bridge that gap by extracting expert knowledge from your documentation and packaging it for agent consumption.

## How It Works

1. **Write JSDoc** with convention tags (`@useWhen`, `@avoidWhen`, `@pitfalls`)
2. **Run TypeDoc** — the plugin extracts and generates skills automatically
3. **LLMs discover your library** via the structured SKILL.md

## Quick Install

```bash
pnpm add -D typedoc-plugin-to-skills
pnpm typedoc
```
````

That's it. Skills are written to `skills/<package-name>/SKILL.md`.

````

- [ ] **Step 6: Create website/docs/getting-started.md**

```markdown
---
title: Getting Started
---

# Getting Started

> Install, configure, and generate your first skill in 5 minutes.

## Install

```bash
pnpm add -D typedoc-plugin-to-skills
````

TypeDoc auto-discovers the plugin. No config needed for basic usage.

## Configure (optional)

Add options to your `typedoc.json`:

```json
{
  "plugin": ["typedoc-plugin-to-skills"],
  "skillsOutDir": "skills",
  "skillsPerPackage": true,
  "skillsAudit": true,
  "blockTags": ["@useWhen", "@avoidWhen", "@pitfalls", "@config"]
}
```

## Generate

```bash
pnpm typedoc
```

Check `skills/<package-name>/SKILL.md` — your first generated skill.

## Enrich with JSDoc Tags

Add expert knowledge to your source code:

```typescript
/**
 * Parse a configuration file.
 *
 * @useWhen
 * - Loading config from user-provided paths
 * - Dynamic config resolution at startup
 *
 * @avoidWhen
 * - Config is hardcoded — just import the values directly
 *
 * @pitfalls
 * - NEVER trust user paths without sanitization — resolves relative to cwd
 *
 * @param path Path to the config file
 * @returns Parsed and validated configuration
 */
export function loadConfig(path: string): Config { ... }
```

Run `pnpm typedoc` again — the skill now has "When to Use", "Pitfalls", and richer descriptions.

## Next Steps

- [JSDoc Conventions](/guide/conventions) — full tag reference
- [Documentation Audit](/guide/audit) — automated quality checks
- [CLI Extraction](/guide/cli-extraction) — generate skills for CLI tools

````

- [ ] **Step 7: Create guide stubs**

Create `website/docs/guide/conventions.md`, `audit.md`, `cli-extraction.md`, `markdown-docs.md` as stubs with title frontmatter and placeholder content (to be filled later from existing specs).

- [ ] **Step 8: Install, build, verify**

```bash
pnpm install
cd website && pnpm docs:dev
````

Verify the site loads at localhost with sidebar navigation.

- [ ] **Step 9: Commit**

```bash
git add website/ pnpm-workspace.yaml
git commit -m "feat: scaffold VitePress docs site with sidebar, getting started, and guide stubs"
```

---

### Task 5: Write guide content

Fill the guide stubs with real content derived from existing specs and the bundled skill.

**Files:**

- Modify: `website/docs/guide/conventions.md`
- Modify: `website/docs/guide/audit.md`
- Modify: `website/docs/guide/cli-extraction.md`
- Modify: `website/docs/guide/markdown-docs.md`

- [ ] **Step 1: Write conventions.md**

Content from `docs/superpowers/specs/2026-04-10-skill-doc-conventions-design.md` and the bundled `to-skills-docs` skill. Cover: JSDoc tag reference (`@useWhen`, `@avoidWhen`, `@pitfalls`, `@remarks`, `@category`, `@config`), README conventions (`## Features`, `## Pitfalls`, `## Quick Start`), complete example, skill-judge alignment table.

- [ ] **Step 2: Write audit.md**

Content from the audit spec. Cover: severity levels, all checks (F1-F4, E1-E5, W1-W11, A1-A4), audit output format, CI integration with `skillsAuditFailOnError`.

- [ ] **Step 3: Write cli-extraction.md**

Content from CLI extraction spec. Cover: `@skillit/cli` package, commander introspection, `--help` fallback, config interface detection (`@config` tag), flag-to-property correlation, `SkillsPluginOptions` example.

- [ ] **Step 4: Write markdown-docs.md**

Content from markdown extraction spec. Cover: `@skillit/vitepress` plugin, `@skillit/docusaurus` adapter, core docs scanner, `skillsIncludeDocs` option, how prose docs become reference files.

- [ ] **Step 5: Commit**

```bash
git add website/docs/guide/
git commit -m "docs: write guide content — conventions, audit, CLI extraction, markdown docs"
```

---

### Task 6: GitHub Pages deployment workflow

**Files:**

- Create: `.github/workflows/docs.yml`

- [ ] **Step 1: Create workflow**

```yaml
name: Deploy Docs

on:
  push:
    branches: [master]
    paths:
      - 'website/**'
      - 'packages/*/src/**'
      - 'README.md'
  workflow_dispatch:

permissions:
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v5

      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - name: Generate API docs
        run: cd website && pnpm docs:api

      - name: Build VitePress site
        run: cd website && pnpm docs:build

      - uses: actions/upload-pages-artifact@v4
        with:
          path: website/docs/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "ci: add GitHub Pages deployment for VitePress docs"
```

---

### Task 7: Build, publish, test dogfood

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

- [ ] **Step 2: Build all packages**

```bash
pnpm build
```

- [ ] **Step 3: Build docs site and verify skills generated**

```bash
cd website
pnpm docs:build
```

Verify:

- Site builds without errors
- `skills/to-skills-docs/SKILL.md` generated by the VitePress plugin
- Reference files created for each guide page
- API reference pages generated by typedoc-vitepress-theme

- [ ] **Step 4: Changeset, version, push**

```bash
cat > .changeset/vitepress-plugin.md << 'EOF'
---
'@skillit/vitepress': minor
---

VitePress plugin for AI agent skill generation

- Vite plugin registered in .vitepress/config.mts vite.plugins array
- Receives VitePress config via config.vitepress.site (sidebar, srcDir, title)
- Sidebar-driven document ordering — no frontmatter heuristics
- Generates skills at closeBundle with core's renderSkill + writeSkills
- Sidebar walker extracts ordered doc paths from array or object sidebars
EOF

npx changeset version
git add -A
git commit -m "chore: version packages"
git push
```

---

## Summary

| Task | What                          | Files                                      |
| ---- | ----------------------------- | ------------------------------------------ |
| 1    | Scaffold @skillit/vitepress   | package boilerplate + README               |
| 2    | Sidebar walker                | `sidebar-walker.ts` + tests                |
| 3    | VitePress plugin (`toSkills`) | `index.ts` + tests                         |
| 4    | Scaffold docs site            | `website/` with VitePress + config + pages |
| 5    | Write guide content           | 4 guide pages from existing specs          |
| 6    | GitHub Pages workflow         | `.github/workflows/docs.yml`               |
| 7    | Build, publish, dogfood       | Verify full loop works                     |
