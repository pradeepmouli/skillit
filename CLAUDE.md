# to-skills Development Guidelines

## Project Overview

Generate AI agent skills (SKILL.md) from TypeScript API documentation. TypeDoc plugin + CLI + Docusaurus/VitePress integrations.

## Tech Stack

- TypeScript 5, Node.js >=20
- Vitest (testing), oxlint/oxfmt (lint/format)
- pnpm workspaces (monorepo), changesets (releases)

## Project Structure

```text
packages/core/           # Shared types, renderer, token budgeting
packages/typedoc/        # TypeDoc plugin (@to-skills/typedoc)
packages/typedoc-plugin/ # Auto-discovered TypeDoc plugin (typedoc-plugin-to-skills)
packages/cli/            # CLI extraction (@to-skills/cli)
packages/docusaurus/     # Docusaurus integration (@to-skills/docusaurus)
packages/vitepress/      # VitePress integration (@to-skills/vitepress)
website/                 # Documentation site
skills/                  # Bundled skill outputs
```

## Commands

```bash
pnpm install        # Install dependencies
pnpm test           # Run tests
pnpm run type-check # TypeScript strict mode
pnpm run build      # Build all packages
pnpm run lint       # oxlint
pnpm run format     # oxfmt
```

## Code Style

- TypeScript strict mode, no `any`
- oxlint for linting, oxfmt for formatting
- Conventional commits

## Key Patterns

- **Skill renderer** — `renderSkill()` produces SKILL.md + reference files from ExtractedSkill
- **Token budgeting** — per-reference-file token limits to fit LLM context windows
- **Plugin architecture** — TypeDoc plugin hooks into reflection events to extract API metadata
- **llms.txt generation** — optional companion output alongside skills

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## Active Technologies

- TypeScript 5.x, Node.js >=20 + TypeDoc >=0.28, Vitest, pnpm workspaces (003-skill-install-quality)
- Filesystem only (read/write SKILL.md + references/) (003-skill-install-quality)
- none (same as parent feature — filesystem-only, no DB) (002-mcp-hardening)

- TypeScript 5.x, Node.js ≥20 (matches existing workspace root and `@to-skills/cli`) (001-mcp-extract-bundle)
- none (filesystem only — reads `package.json`, `mcp.json` / `claude_desktop_config.json`; writes `skills/<name>/SKILL.md` + `references/*.md`) (001-mcp-extract-bundle)

## Recent Changes

- 001-mcp-extract-bundle: Added TypeScript 5.x, Node.js ≥20 (matches existing workspace root and `@to-skills/cli`)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
