---
'@to-skills/core': minor
'@to-skills/cli': minor
'@to-skills/client': minor
---

Multi-source `refine` (CLI), `to-skills init`, ast-grep-based JSDoc editing, and guidance injection.

- **core**: new `refine/ast-edit.ts` wrapping `@ast-grep/napi` — `upsertJsDocTag`/`readJsDocTags` replace the regex/offset JSDoc surgery; `insertJsDocTag` reimplemented on top of it. `RefineSource.guidance?()` and `guidance` on draft/review requests; `refineSkill` threads the source's bundled guidance skill into every draft/review. `audit-score` surfaces CLI command annotation gaps as work items.
- **cli**: `CliRefineSource` (extract → bundled `to-skills-cli-docs` guidance → JSDoc write-back onto the correlated `*Options` interface); commander program loader (`--program file#export` + `bin` auto-find); `*Options` interface JSDoc reader for loop closure.
- **client**: `refine` is source-aware — `--source cli|mcp|typedoc` with detection from installed `@to-skills/*` packages, plus `--program`; `--mcp` no longer globally required. New `to-skills init` command: detect project nature → install the matching package → generate the initial skill into top-level `skills/` → refine (CLI path automated; mcp/typedoc print next-step guidance).
