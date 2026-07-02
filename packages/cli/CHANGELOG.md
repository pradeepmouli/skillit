# @to-skills/cli

## 1.0.0

### Major Changes

- [#95](https://github.com/pradeepmouli/skillit/pull/95) [`1121aaf`](https://github.com/pradeepmouli/skillit/commit/1121aaf9da3f4f2609165b9a8d30af173cc45a97) Thanks [@copilot-swe-agent](https://github.com/apps/copilot-swe-agent)! - - Fix PR review issues in config loading and init guidance
  - Address remaining PR review suggestions
  - Address follow-up PR review nits
  - Address PR comment code cleanup
  - Add defineConfig alias for skillit config helper

### Patch Changes

- [#102](https://github.com/pradeepmouli/skillit/pull/102) [`a1c6af7`](https://github.com/pradeepmouli/skillit/commit/a1c6af7249054dc6ab8ebf99c2a6b9bfc8bee93c) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - DRY cleanup for the dep-skill wiring, and a sweep of leftover pre-rebrand `toSkills` naming.

  **Breaking (internal IR / adapter API):**

  - `@skillit/core`: renamed the `ExtractedFunctionMcpMetadata.toSkills` field to `.skillit` (matches the `@skillit/*` scope). Consumers reading `fn.mcpMetadata?.toSkills` must update to `fn.mcpMetadata?.skillit`.
  - `@skillit/vitepress`: renamed the exported plugin factory `toSkills()` to `skillit()`, and `ToSkillsVitePressOptions` to `SkillitVitePressOptions`.

  **Fixes:**

  - `@skillit/mcp`: fixed a real (previously undetected) bug in the `_meta` annotation reader's own test fixture — an integration test gated behind `RUN_INTEGRATION_TESTS=true` was asserting against the old nested `_meta.toSkills.{useWhen: [...]}` wire shape, which the flat-string reader no longer accepts. The fixture and test now use the current flat `_meta.useWhen` string format and the test passes.
  - `@skillit/mcp`: `skillit-mcp-docs` bundled skill guidance was telling agents to annotate MCP tools with the deprecated nested `_meta.toSkills.useWhen = [...]` shape; corrected to the current flat `_meta.useWhen = "..."` string convention.
  - Fixed a stale `toSkillsVitePlugin({ docsDir })` code example (a function/option that never existed) in the VitePress docs guide.

  **Cleanup:**

  - `@skillit/core`, `@skillit/client`, `@skillit/mcp`, `@skillit/typedoc`: extracted `attachDepSkills(skill, pkgDir)` to replace 5 duplicated `rootDir`/`seeAlso`-wiring call sites.
  - Renamed the bundled-guidance frontmatter marker key from `toSkills:` to `skillit:` across all bundled `SKILL.md` files.
  - Synced `.github/copilot-instructions.md` branding with `CLAUDE.md` (was still `to-skills`/`@to-skills/*`).

- Updated dependencies [[`1121aaf`](https://github.com/pradeepmouli/skillit/commit/1121aaf9da3f4f2609165b9a8d30af173cc45a97), [`a1c6af7`](https://github.com/pradeepmouli/skillit/commit/a1c6af7249054dc6ab8ebf99c2a6b9bfc8bee93c)]:
  - @skillit/core@3.0.0

## 0.6.0

### Minor Changes

- [#76](https://github.com/pradeepmouli/skillit/pull/76) [`7d1596f`](https://github.com/pradeepmouli/skillit/commit/7d1596fa37a412f048253111a7618748ccefe67b) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Add npx invocation mode for CLI skills on public packages.

  - `skillit gen --source cli` now defaults to `npx <packageName>` as the invocation prefix for public packages that declare a `bin` field in `package.json` (mirrors `npm install -g` detection: `bin` present + not `"private": true`).
  - Add `--invocation npx|global` flag to `skillit gen` to override the auto-detected mode.
  - README sections (features, troubleshooting, quick start) are now included in generated CLI skills, with the bare binary name substituted by `npx <packageName>` in npx mode.
  - New `applyNpxMode` / `resolveInvocationMode` helpers exported from `@skillit/cli`.
  - New `PackageMetadata` fields: `fullPackageName`, `bin`, `isPrivate`.
  - New `ExtractedSkill` field: `cliInvocationPrefix`.
  - `CliRefineSource` and `CliRefineSourceOptions` support `invocationMode` override.

### Patch Changes

- [#75](https://github.com/pradeepmouli/skillit/pull/75) [`df9d69e`](https://github.com/pradeepmouli/skillit/commit/df9d69e1630faf5bd33cd09bdb6382ebbd42ee19) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - fix(program-loader): duck-type Commander check for cross-realm instances

  `instanceof Command` fails when the consumer's `commander` package is a
  different module instance (e.g. separate monorepos with separate
  `node_modules`). Structural duck-type check on `name`, `commands`, and
  `parseAsync` is cross-realm safe.

- Updated dependencies [[`820abae`](https://github.com/pradeepmouli/skillit/commit/820abae1d853395efdca25230d11074cda7b6d6b), [`7d1596f`](https://github.com/pradeepmouli/skillit/commit/7d1596fa37a412f048253111a7618748ccefe67b)]:
  - @skillit/core@2.1.0

## 0.5.0

### Minor Changes

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

- [#61](https://github.com/pradeepmouli/skillit/pull/61) [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: agent-bootstrap Phase 0 core affordances

  - **`skillit gen`** — new first-class, deterministic, side-effect-free command that (re)generates the skill from current source (cli + config). It shares ONE generate path with the rest of the client (`packages/client/src/generate.ts`).
  - **`skillit init` is now install/wire only** — it no longer generates or refines. After `init`, run `skillit gen`. (Behavior change for `init`.)
  - **`skillit audit --json`** — new command wrapping `auditSkill` + `estimateSkillJudgeScore`, emitting the full `AuditResult` + `SkillJudgeEstimate` plus a resolved on-disk location per improvement target.
  - **`RefineSource.resolveTargetLocation`** — new optional method on the core `RefineSource` contract, implemented for typedoc, cli, config, and mcp (build) sources.

- Updated dependencies [[`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2), [`126416e`](https://github.com/pradeepmouli/skillit/commit/126416e59bd35e798f4655ebac8c4ab2243ccdea), [`62c0e2a`](https://github.com/pradeepmouli/skillit/commit/62c0e2a5f4ec05af30f262d24f53631d190eadb9), [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186), [`3d5d8eb`](https://github.com/pradeepmouli/skillit/commit/3d5d8eb9df812c628a118764ccdf3a5d4478b4db), [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a), [`9d67124`](https://github.com/pradeepmouli/skillit/commit/9d671242bf95a5bb49dd2121c37c08008c1a8279)]:
  - @skillit/core@2.0.0

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
