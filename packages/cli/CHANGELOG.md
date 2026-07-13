# @to-skills/cli

## 0.4.1

### Patch Changes

- [#56](https://github.com/pradeepmouli/skillit/pull/56) [`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - dogfood: refine the skillit client's own command annotations
  - fix(client): isolate the copilot model backend with an empty tool whitelist
  - fix(core): upsertJsDocTag merges into single-line JSDoc without mangling
  - fix(client): extract drafted annotation from <answer> tags
  - fix(client): forbid Insight-block decoration in the claude refine backend
- Updated dependencies [[`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2), [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186)]:
  - @skillit/core@1.6.0

## 0.4.0

### Minor Changes

- [#41](https://github.com/pradeepmouli/skillit/pull/41) [`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - fix(client): guard msg.content[0] access — throw on empty or non-text response

  - fix(typedoc/refine): fix JSDoc closer indentation + use async fs I/O in TypeDocRefineSource
  - feat(client): add skillit bin with refine command
  - feat(client): add AnthropicModelClient (Sonnet drafter, Opus reviewer)
  - feat(client): scaffold @skillit/client package

- [#52](https://github.com/pradeepmouli/skillit/pull/52) [`30e9f03`](https://github.com/pradeepmouli/skillit/commit/30e9f03756bb3596e0cf90bb91beb37dd6bb9c18) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Multi-source `refine` (CLI), `skillit init`, ast-grep-based JSDoc editing, and guidance injection.
  - **core**: new `refine/ast-edit.ts` wrapping `@ast-grep/napi` — `upsertJsDocTag`/`readJsDocTags` replace the regex/offset JSDoc surgery; `insertJsDocTag` reimplemented on top of it. `RefineSource.guidance?()` and `guidance` on draft/review requests; `refineSkill` threads the source's bundled guidance skill into every draft/review. `audit-score` surfaces CLI command annotation gaps as work items.
  - **cli**: `CliRefineSource` (extract → bundled `skillit-cli-docs` guidance → JSDoc write-back onto the correlated `*Options` interface); commander program loader (`--program file#export` + `bin` auto-find); `*Options` interface JSDoc reader for loop closure.
  - **client**: `refine` is source-aware — `--source cli|mcp|typedoc` with detection from installed `@skillit/*` packages, plus `--program`; `--mcp` no longer globally required. New `skillit init` command: detect project nature → install the matching package → generate the initial skill into top-level `skills/` → refine (CLI path automated; mcp/typedoc print next-step guidance).

### Patch Changes

- [#51](https://github.com/pradeepmouli/skillit/pull/51) [`9699e6f`](https://github.com/pradeepmouli/skillit/commit/9699e6f9896f4153ecdad6b1bbc87ead20e773ef) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - fix(cli): only mark `.requiredOption()` flags as required

  `introspectCommander` conflated commander's `opt.required` (the option's _value_ is required — `<x>` vs `[x]`, true for any value-taking flag) with `opt.mandatory` (the option _itself_ must be supplied, set by `.requiredOption()`). As a result every `--flag <value>` was emitted with `Required: yes` in the generated skill. It now reads `opt.mandatory`, so optional value-taking options are correctly reported as not required.

- [#54](https://github.com/pradeepmouli/skillit/pull/54) [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Rebrand `@to-skills` → `@skillit`: package scope, a single `skillit` CLI (MCP commands now mounted as `skillit mcp …`), bundled skill names (`skillit-cli-docs`/`skillit-docs`/`skillit-mcp-docs`), and the `package.json` config key (`skillit.mcp`). No API or behavior changes.

- Updated dependencies [[`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6), [`30e9f03`](https://github.com/pradeepmouli/skillit/commit/30e9f03756bb3596e0cf90bb91beb37dd6bb9c18), [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912)]:
  - @skillit/core@1.5.0

## 0.3.14

### Patch Changes

- Updated dependencies [[`2b91bd8`](https://github.com/pradeepmouli/to-skills/commit/2b91bd8e2882ee470c00e5b12705a28c052bb5c8)]:
  - @to-skills/core@1.4.0

## 0.3.13

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.3.0

## 0.3.12

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.2.2

## 0.3.11

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.2.1

## 0.3.10

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.2.0

## 0.3.9

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.1.2

## 0.3.8

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.1.1

## 0.3.7

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.1.0

## 0.3.6

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.0.1

## 0.3.5

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@1.0.0

## 0.3.4

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.16.2

## 0.3.3

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.16.1

## 0.3.2

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.16.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.15.0

## 0.3.0

### Minor Changes

- Rename @pitfalls to @never, fold NEVER rules into When to Use section

  Breaking: @pitfalls tag renamed to @never. The tag content is unchanged — NEVER + BECAUSE format.
  NEVER rules now render inside "## When to Use" as a **NEVER:** subsection instead of a separate
  "## Pitfalls" heading, matching hand-written skill conventions.

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.14.0

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.13.4

## 0.2.11

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.13.3

## 0.2.10

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.13.2

## 0.2.9

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.13.1

## 0.2.8

### Patch Changes

- Updated dependencies [[`f9cc01d`](https://github.com/pradeepmouli/to-skills/commit/f9cc01dc46bfe00467afe4e82eec6b557ca8e3f3)]:
  - @to-skills/core@0.13.0

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.12.0

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.11.1

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.11.0

## 0.2.4

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.10.3

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.10.2

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.10.1

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.10.0

## 0.2.0

### Minor Changes

- CLI & config surface extraction
  - ExtractedConfigSurface types and config renderer in core
  - @config tag and *Options/*Config suffix detection in TypeDoc extractor
  - New @to-skills/cli package: commander introspection, --help parser, flag-to-property correlator
  - Config surfaces render as Commands and Configuration sections in SKILL.md
  - Detailed per-option documentation in references/commands.md and references/config.md

### Patch Changes

- Updated dependencies []:
  - @to-skills/core@0.9.0
