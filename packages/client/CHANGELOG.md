# @skillit/client

## 0.3.1

### Patch Changes

- [#74](https://github.com/pradeepmouli/skillit/pull/74) [`354e3c1`](https://github.com/pradeepmouli/skillit/commit/354e3c10c2f345a96b5f3164c8f660f9fc92e48b) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - fix: add repository field required for npm provenance validation

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

- [#61](https://github.com/pradeepmouli/skillit/pull/61) [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: agent-bootstrap Phase 0 core affordances
  - **`skillit gen`** — new first-class, deterministic, side-effect-free command that (re)generates the skill from current source (cli + config). It shares ONE generate path with the rest of the client (`packages/client/src/generate.ts`).
  - **`skillit init` is now install/wire only** — it no longer generates or refines. After `init`, run `skillit gen`. (Behavior change for `init`.)
  - **`skillit audit --json`** — new command wrapping `auditSkill` + `estimateSkillJudgeScore`, emitting the full `AuditResult` + `SkillJudgeEstimate` plus a resolved on-disk location per improvement target.
  - **`RefineSource.resolveTargetLocation`** — new optional method on the core `RefineSource` contract, implemented for typedoc, cli, config, and mcp (build) sources.

- [#67](https://github.com/pradeepmouli/skillit/pull/67) [`9d67124`](https://github.com/pradeepmouli/skillit/commit/9d671242bf95a5bb49dd2121c37c08008c1a8279) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: ship the `/skillit-bootstrap` agent skill (Phase 1)
  - New bundled Claude Code skill `skillit-bootstrap` (`packages/client/skills/`)
    that orchestrates the agent-bootstrap loop — `skillit gen` → `skillit audit
--json` → agent enriches repo source → regenerate — for the **cli** and
    **typedoc** source kinds. The agent never writes a `SKILL.md`; it edits only
    source surfaces (JSDoc / README / examples / package.json). `@skillit/client`
    now ships its `skills/` directory.
  - **fix(cli):** `CliRefineSource` now reads package.json metadata + README
    (description, keywords, repository) into its audit context. Previously it
    returned an empty context, so the F1/F3 (description/README) audit findings
    were unaddressable and a cli-source skill could not reach grade B.
  - **core:** new shared `readPackageMetadata()` / `findNearestPackageDir()`
    exports (the single package-metadata reader used by both the config and cli
    sources).
  - **typedoc + client:** `skillit gen --source typedoc` and `skillit audit
--source typedoc` are now wired, so the bootstrap skill's typedoc claim is
    real. `gen` drives the existing `@skillit/typedoc` plugin pipeline
    (`load(app)` + `convert()`); `audit` reuses `extractSkills`. New
    `@skillit/typedoc` exports: `generateTypeDocSkills`, `extractTypeDocSkills`,
    `createTypeDocRefineSource`.
  - config / mcp orchestration and the mechanical no-hand-edit guard are deferred
    to later phases; the CLI commands remain for headless/CI use.

- [#68](https://github.com/pradeepmouli/skillit/pull/68) [`de239d9`](https://github.com/pradeepmouli/skillit/commit/de239d97f22ab00254c8de313d9a8c41f3bdc101) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: bootstrap config + mcp source kinds (Phase 2)
  - `/skillit-bootstrap` now orchestrates `config` and `mcp` (build mode) in
    addition to `cli` and `typedoc`. Updated skill scope, inputs
    (`--config-type` / `--mcp` / `--server`), per-kind surface routing (config
    per-option JSDoc — `@useWhen`/`@avoidWhen`/**`@pitfalls`**/`@remarks` + a
    `<config>.example.ts`; mcp handler JSDoc + `_meta.toSkills`), and kind-aware
    grade targets (config → B, mcp → B/A).
  - **mcp:** `skillit gen --source mcp` and `skillit audit --source mcp` are now
    wired (build + runtime). New `@skillit/mcp` exports: `createMcpRefineSource`,
    `generateMcpSkill`, `selectServerEntry`. The build/runtime dispatch is shared
    by `refine` and `audit` (DRY); `@skillit/mcp` (and its SDK) load lazily off
    the CLI startup path.
  - **fix(mcp):** the MCP `RefineSource`s now read `package.json` + README metadata
    (description, keywords, repository) into their audit context via the shared
    `readPackageMetadata` reader. Previously they returned an empty context, so the
    description/README audit findings were unaddressable and an mcp-source skill
    could not clear them — the same gap fixed for `CliRefineSource` in the prior
    release.
  - **config:** already wired into `gen`/`audit`; Phase 2 brings it into the
    bootstrap loop. (Dogfood note: the config surface authors pitfalls as
    `@pitfalls`, not `@never`.)

### Patch Changes

- [#56](https://github.com/pradeepmouli/skillit/pull/56) [`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - dogfood: refine the skillit client's own command annotations
  - fix(client): isolate the copilot model backend with an empty tool whitelist
  - fix(core): upsertJsDocTag merges into single-line JSDoc without mangling
  - fix(client): extract drafted annotation from <answer> tags
  - fix(client): forbid Insight-block decoration in the claude refine backend

- [#69](https://github.com/pradeepmouli/skillit/pull/69) [`3d5d8eb`](https://github.com/pradeepmouli/skillit/commit/3d5d8eb9df812c628a118764ccdf3a5d4478b4db) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - refactor: consolidate project metadata onto the ExtractedSkill IR

  `auditSkill(skill, context)` is now `auditSkill(skill)` — the deterministic audit
  is a pure function of the IR. `ExtractedSkill` gains `readme?: ParsedReadme`;
  every source populates it (plus the existing identity fields) in `extract()`. The
  separate `AuditContext` type and the `RefineSource.auditContext()` method are
  **removed** — they were a parallel metadata channel that three sources
  independently forgot, leaving package-description/README findings unaddressable.
  Project metadata now has one source of truth (the IR), consumed by both the
  renderer and the audit; repo-reading stays at the agent layer.

  BREAKING (`@skillit/core`): `auditSkill` is single-arg; `AuditContext` and
  `RefineSource.auditContext()` are gone. Callers pass metadata via the skill IR.

- Updated dependencies [[`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2), [`126416e`](https://github.com/pradeepmouli/skillit/commit/126416e59bd35e798f4655ebac8c4ab2243ccdea), [`62c0e2a`](https://github.com/pradeepmouli/skillit/commit/62c0e2a5f4ec05af30f262d24f53631d190eadb9), [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186), [`3d5d8eb`](https://github.com/pradeepmouli/skillit/commit/3d5d8eb9df812c628a118764ccdf3a5d4478b4db), [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a), [`9d67124`](https://github.com/pradeepmouli/skillit/commit/9d671242bf95a5bb49dd2121c37c08008c1a8279), [`de239d9`](https://github.com/pradeepmouli/skillit/commit/de239d97f22ab00254c8de313d9a8c41f3bdc101)]:
  - @skillit/cli@0.5.0
  - @skillit/core@2.0.0
  - @skillit/mcp@0.4.0
  - @skillit/typedoc@1.2.0

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
