# @skillit/client

## 0.3.0

### Minor Changes

- [#58](https://github.com/pradeepmouli/skillit/pull/58) [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: refine TypeScript config surfaces (`--source config`)
  - `@skillit/core` adds `ConfigRefineSource` + `extractConfigSurface`: extract a
    config type's options (incl. nested dot-path keys) and refine their per-option
    routing JSDoc (`@useWhen`/`@avoidWhen`/`@pitfalls`) in place via
    `upsertPropertyJsDocTag`. The audit credits per-option config tags and
    audit-score emits per-option `config-option` targets so the refine loop
    converges on a config skill.
  - `@skillit/client` wires `skillit refine --source config --config-type <file#export>`
    and `skillit init --source config` (generate → refine in place → regenerate;
    installs nothing — config is built into the client).
  - `ConfigRefineSource` enriches the skill + audit context from the nearest
    package.json (description/keywords/repository) and a sibling README, and drafts
    a type-correct example to a sibling `<config>.example.ts` (only if absent),
    read back as the skill's usage example. `guidance()` scopes drafting to the
    single named option.
  - audit-score surfaces config per-option routing coverage and the example
    independent of dimension thresholds, so the loop documents the whole surface
    rather than stopping once the rubric is satisfied.
  - `--ground <glob>` (repeatable) feeds the code that CONSUMES the config to the
    draft model as a token-capped implementation reference, so it states correct
    runtime behavior instead of guessing from the type; without it the model is
    instructed not to assert unverifiable runtime semantics.
  - fixes surfaced by dogfooding against a real generic config:
    - normalize multi-line option types to one line (mapped types can't corrupt
      the options table);
    - prefix every line when creating a JSDoc block with multi-line content
      (no column-0 continuation bullets, which also broke later merges);
    - escape the comment-close sequence in written tag content so a value
      containing it (e.g. a `**`-glob) can't terminate the block and corrupt the
      file; unescape on read;
    - don't truncate per-option targets at the class cap;
    - the rendered skill describes the config surface, not the package blurb.

### Patch Changes

- [#56](https://github.com/pradeepmouli/skillit/pull/56) [`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - dogfood: refine the skillit client's own command annotations
  - fix(client): isolate the copilot model backend with an empty tool whitelist
  - fix(core): upsertJsDocTag merges into single-line JSDoc without mangling
  - fix(client): extract drafted annotation from <answer> tags
  - fix(client): forbid Insight-block decoration in the claude refine backend
- Updated dependencies [[`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2), [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186)]:
  - @skillit/cli@0.4.1
  - @skillit/core@1.6.0
  - @skillit/mcp@0.3.1

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
