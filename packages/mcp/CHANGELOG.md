# @to-skills/mcp

## 2.0.0

### Major Changes

- [#104](https://github.com/pradeepmouli/skillit/pull/104) [`6952e4a`](https://github.com/pradeepmouli/skillit/commit/6952e4ab788e3173b790ab73eb0aa85f89d0d0d7) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Standardize the anti-pattern JSDoc tag on `@never` across every source type, and fix `skillit gen --source cli` to correlate JSDoc from typed CLI option interfaces (closes [pradeepmouli/skillit#87](https://github.com/pradeepmouli/skillit/issues/87)).

  **Breaking:**

  - `@skillit/core`: renamed `RefineTag`'s `'pitfalls'` member to `'never'`, and the `ExtractedConfigSurface.pitfalls`/`ExtractedConfigOption.pitfalls`/`ExtractedSkill.pitfalls` fields to `.never`. CLI-sourced skills previously had to use `@pitfalls` as the JSDoc tag name on `<Command>Options` interfaces — despite skillit's own bundled docs showing `@never` in the worked example. Both now use `@never`, matching the convention TypeDoc-sourced skills already used.
  - `@skillit/mcp`: renamed the flat `_meta.pitfalls` wire convention to `_meta.never`. Any MCP server annotating tools with `_meta: { pitfalls: "..." }` must update to `_meta: { never: "..." }`.

  **Fixed:**

  - `skillit gen --source cli` (via `generateCliSkill`) now correlates `@useWhen`/`@avoidWhen`/`@never`/`@remarks`/`@example` JSDoc from `<Command>Options`/`<Command>Opts`/`<Command>CommandOpts` interfaces onto the generated skill — previously only `skillit refine --source cli` did this, so `gen` silently produced skills missing their `## NEVER` section even when the JSDoc was correctly authored.
  - Fixed a self-contradiction in the bundled `skillit-cli-docs` guidance skill: its prose told authors to use `@pitfalls` while its own code example used `@never`.

### Patch Changes

- Updated dependencies [[`6952e4a`](https://github.com/pradeepmouli/skillit/commit/6952e4ab788e3173b790ab73eb0aa85f89d0d0d7)]:
  - @skillit/core@4.0.0
  - @skillit/target-mcp-protocol@5.0.0

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
  - @skillit/target-mcp-protocol@4.0.0

## 0.4.1

### Patch Changes

- [#82](https://github.com/pradeepmouli/skillit/pull/82) [`820abae`](https://github.com/pradeepmouli/skillit/commit/820abae1d853395efdca25230d11074cda7b6d6b) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Skill generation now auto-populates a `## See Also` section linking to skills bundled in direct dependencies.

  When a dependency ships a skill (detected via `node_modules/<dep>/skills/*/SKILL.md` or `package.json#skillit.skills`), its name, path, and description appear in `## See Also` of the consuming package's skill. This prevents agents using only a CLI skill from missing critical context — like `## NEVER` rules — documented in a core library skill.

  **New exports from `@skillit/core`:**

  - `DepSkillRef` — cross-reference type (`name`, `path`, `description?`)
  - `discoverDepSkills(pkgDir)` / `discoverDepSkillsSync(pkgDir)` — dep-skill discovery helpers
  - `ExtractedSkill.seeAlso?` and `ExtractedSkill.rootDir?` — new IR fields

  **New audit check W12:** warns when a dep has a skill not referenced in `## See Also`; contributes +3 to D3 (Anti-Patterns) when passing.

- Updated dependencies [[`820abae`](https://github.com/pradeepmouli/skillit/commit/820abae1d853395efdca25230d11074cda7b6d6b), [`7d1596f`](https://github.com/pradeepmouli/skillit/commit/7d1596fa37a412f048253111a7618748ccefe67b)]:
  - @skillit/core@2.1.0
  - @skillit/target-mcp-protocol@3.0.1

## 0.4.0

### Minor Changes

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

- [#61](https://github.com/pradeepmouli/skillit/pull/61) [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: agent-bootstrap Phase 0 core affordances

  - **`skillit gen`** — new first-class, deterministic, side-effect-free command that (re)generates the skill from current source (cli + config). It shares ONE generate path with the rest of the client (`packages/client/src/generate.ts`).
  - **`skillit init` is now install/wire only** — it no longer generates or refines. After `init`, run `skillit gen`. (Behavior change for `init`.)
  - **`skillit audit --json`** — new command wrapping `auditSkill` + `estimateSkillJudgeScore`, emitting the full `AuditResult` + `SkillJudgeEstimate` plus a resolved on-disk location per improvement target.
  - **`RefineSource.resolveTargetLocation`** — new optional method on the core `RefineSource` contract, implemented for typedoc, cli, config, and mcp (build) sources.

- Updated dependencies [[`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2), [`126416e`](https://github.com/pradeepmouli/skillit/commit/126416e59bd35e798f4655ebac8c4ab2243ccdea), [`62c0e2a`](https://github.com/pradeepmouli/skillit/commit/62c0e2a5f4ec05af30f262d24f53631d190eadb9), [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186), [`3d5d8eb`](https://github.com/pradeepmouli/skillit/commit/3d5d8eb9df812c628a118764ccdf3a5d4478b4db), [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a), [`9d67124`](https://github.com/pradeepmouli/skillit/commit/9d671242bf95a5bb49dd2121c37c08008c1a8279)]:
  - @skillit/core@2.0.0
  - @skillit/target-mcp-protocol@3.0.0

## 0.3.0

### Minor Changes

- [#41](https://github.com/pradeepmouli/skillit/pull/41) [`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - fix(client): guard msg.content[0] access — throw on empty or non-text response
  - fix(typedoc/refine): fix JSDoc closer indentation + use async fs I/O in TypeDocRefineSource
  - feat(client): add skillit bin with refine command
  - feat(client): add AnthropicModelClient (Sonnet drafter, Opus reviewer)
  - feat(client): scaffold @skillit/client package

### Patch Changes

- [#54](https://github.com/pradeepmouli/skillit/pull/54) [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Rebrand `@to-skills` → `@skillit`: package scope, a single `skillit` CLI (MCP commands now mounted as `skillit mcp …`), bundled skill names (`skillit-cli-docs`/`skillit-docs`/`skillit-mcp-docs`), and the `package.json` config key (`skillit.mcp`). No API or behavior changes.

- Updated dependencies [[`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6), [`30e9f03`](https://github.com/pradeepmouli/skillit/commit/30e9f03756bb3596e0cf90bb91beb37dd6bb9c18), [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912)]:
  - @skillit/core@1.5.0
  - @skillit/target-mcp-protocol@2.0.0

## 0.2.0

### Minor Changes

- [#20](https://github.com/pradeepmouli/to-skills/pull/20) [`2b91bd8`](https://github.com/pradeepmouli/to-skills/commit/2b91bd8e2882ee470c00e5b12705a28c052bb5c8) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Extract and bundle MCP servers as Agent Skills (`@to-skills/mcp` + invocation-target adapters)

  New host package and three invocation-target adapters land at `0.1.0`:

  - `@to-skills/mcp` — CLI + programmatic API for extracting a SKILL.md from a live Model Context Protocol server (stdio or HTTP) and bundling a server's own skill into its npm package via a `to-skills.mcp` field. Ships `to-skills-mcp extract` and `to-skills-mcp bundle` subcommands plus `extractMcpSkill` / `bundleMcpSkill` programmatic entry points. Adds an in-package `llms.txt` emitter wired to the `--llms-txt` flag.
  - `@to-skills/target-mcp-protocol` — default invocation-target adapter; emits `mcp:` frontmatter for MCP-native agent harnesses (Claude Code, Cursor, OpenCode, Codex).
  - `@to-skills/target-mcpc` — CLI-as-proxy adapter for Apify's `mcpc@^2.1`. Renders shell-command skills consumable by any harness with a shell tool.
  - `@to-skills/target-fastmcp` — CLI-as-proxy adapter for the Python `fastmcp@^2` CLI; mirrors the mcpc adapter's shape with Python-side install instructions.

  `@to-skills/core` extensions (backward-compatible — existing extractors continue to produce non-MCP skills unchanged):

  - New IR fields on `ExtractedSkill`: `resources?: ExtractedResource[]`, `prompts?: ExtractedPrompt[]`, `setup?: SkillSetup`.
  - New types: `ExtractedResource`, `ExtractedPrompt`, `ExtractedPromptArgument`, `SkillSetup`, `AdapterFingerprint`, `InvocationAdapter`, `AdapterRenderContext`.
  - `renderSkill` extension points: `invocation` adapter dispatch with per-adapter context (`launchCommand`, `httpEndpoint`, `packageName`, `binName`); `additionalFrontmatter` for adapters that delegate body rendering to core; `bodyPrefix` for prepending Setup sections; `skipDefaultFunctionsRef` for adapters owning the Tools section; `canonicalize: false` for adapters that wrap core's renderer and post-process references.
  - New helpers: `canonicalize` (alphabetized frontmatter + stable line endings + heading normalization for content-identical re-runs), `renderResourcesReference` and `renderPromptsReference` for MCP-side reference files.

  See [`specs/001-mcp-extract-bundle/`](https://github.com/pradeepmouli/to-skills/tree/master/specs/001-mcp-extract-bundle) for the full spec, [`packages/mcp/README.md`](https://github.com/pradeepmouli/to-skills/blob/master/packages/mcp/README.md) for usage, and [`packages/mcp/docs/adapter-authoring.md`](https://github.com/pradeepmouli/to-skills/blob/master/packages/mcp/docs/adapter-authoring.md) for building custom invocation adapters.

### Patch Changes

- Updated dependencies [[`2b91bd8`](https://github.com/pradeepmouli/to-skills/commit/2b91bd8e2882ee470c00e5b12705a28c052bb5c8)]:
  - @to-skills/core@1.4.0
  - @to-skills/target-mcp-protocol@1.0.0
