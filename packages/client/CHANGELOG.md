# @skillit/client

## 0.2.0

### Minor Changes

- [#41](https://github.com/pradeepmouli/skillit/pull/41) [`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - fix(client): guard msg.content[0] access — throw on empty or non-text response
  - fix(typedoc/refine): fix JSDoc closer indentation + use async fs I/O in TypeDocRefineSource
  - feat(client): add skillit bin with refine command
  - feat(client): add AnthropicModelClient (Sonnet drafter, Opus reviewer)
  - feat(client): scaffold @skillit/client package

- [#53](https://github.com/pradeepmouli/skillit/pull/53) [`95caa9e`](https://github.com/pradeepmouli/skillit/commit/95caa9e1d0ed3e6562470940b857a83bc8e4a37a) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - `refine` and `init` gain `--model-client api|claude|codex|copilot`: drive the
  audit→draft→review loop through an already-authenticated agent CLI instead of
  the Anthropic API. Per-CLI adapters (claude maps the drafter/reviewer split to
  Sonnet/Opus; codex/copilot use their default model) reuse the existing prompt
  builders and verdict parser; `--model-cli-timeout` bounds each call. Default
  remains `api`.

- [#52](https://github.com/pradeepmouli/skillit/pull/52) [`30e9f03`](https://github.com/pradeepmouli/skillit/commit/30e9f03756bb3596e0cf90bb91beb37dd6bb9c18) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Multi-source `refine` (CLI), `skillit init`, ast-grep-based JSDoc editing, and guidance injection.
  - **core**: new `refine/ast-edit.ts` wrapping `@ast-grep/napi` — `upsertJsDocTag`/`readJsDocTags` replace the regex/offset JSDoc surgery; `insertJsDocTag` reimplemented on top of it. `RefineSource.guidance?()` and `guidance` on draft/review requests; `refineSkill` threads the source's bundled guidance skill into every draft/review. `audit-score` surfaces CLI command annotation gaps as work items.
  - **cli**: `CliRefineSource` (extract → bundled `skillit-cli-docs` guidance → JSDoc write-back onto the correlated `*Options` interface); commander program loader (`--program file#export` + `bin` auto-find); `*Options` interface JSDoc reader for loop closure.
  - **client**: `refine` is source-aware — `--source cli|mcp|typedoc` with detection from installed `@skillit/*` packages, plus `--program`; `--mcp` no longer globally required. New `skillit init` command: detect project nature → install the matching package → generate the initial skill into top-level `skills/` → refine (CLI path automated; mcp/typedoc print next-step guidance).

### Patch Changes

- [#54](https://github.com/pradeepmouli/skillit/pull/54) [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Rebrand `@to-skills` → `@skillit`: package scope, a single `skillit` CLI (MCP commands now mounted as `skillit mcp …`), bundled skill names (`skillit-cli-docs`/`skillit-docs`/`skillit-mcp-docs`), and the `package.json` config key (`skillit.mcp`). No API or behavior changes.

- Updated dependencies [[`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6), [`9699e6f`](https://github.com/pradeepmouli/skillit/commit/9699e6f9896f4153ecdad6b1bbc87ead20e773ef), [`30e9f03`](https://github.com/pradeepmouli/skillit/commit/30e9f03756bb3596e0cf90bb91beb37dd6bb9c18), [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912)]:
  - @skillit/cli@0.4.0
  - @skillit/core@1.5.0
  - @skillit/mcp@0.3.0
