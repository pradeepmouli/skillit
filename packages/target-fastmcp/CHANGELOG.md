# @to-skills/target-fastmcp

## 1.0.0

### Major Changes

- [#95](https://github.com/pradeepmouli/skillit/pull/95) [`1121aaf`](https://github.com/pradeepmouli/skillit/commit/1121aaf9da3f4f2609165b9a8d30af173cc45a97) Thanks [@copilot-swe-agent](https://github.com/apps/copilot-swe-agent)! - - Fix PR review issues in config loading and init guidance
  - Address remaining PR review suggestions
  - Address follow-up PR review nits
  - Address PR comment code cleanup
  - Add defineConfig alias for skillit config helper

### Patch Changes

- Updated dependencies [[`1121aaf`](https://github.com/pradeepmouli/skillit/commit/1121aaf9da3f4f2609165b9a8d30af173cc45a97), [`a1c6af7`](https://github.com/pradeepmouli/skillit/commit/a1c6af7249054dc6ab8ebf99c2a6b9bfc8bee93c)]:
  - @skillit/core@3.0.0
  - @skillit/mcp@1.0.0

## 0.3.3

### Patch Changes

- Updated dependencies [[`820abae`](https://github.com/pradeepmouli/skillit/commit/820abae1d853395efdca25230d11074cda7b6d6b), [`7d1596f`](https://github.com/pradeepmouli/skillit/commit/7d1596fa37a412f048253111a7618748ccefe67b)]:
  - @skillit/core@2.1.0
  - @skillit/mcp@0.4.1

## 0.3.2

### Patch Changes

- [#56](https://github.com/pradeepmouli/skillit/pull/56) [`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - dogfood: refine the skillit client's own command annotations
  - fix(client): isolate the copilot model backend with an empty tool whitelist
  - fix(core): upsertJsDocTag merges into single-line JSDoc without mangling
  - fix(client): extract drafted annotation from <answer> tags
  - fix(client): forbid Insight-block decoration in the claude refine backend
- Updated dependencies [[`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2), [`126416e`](https://github.com/pradeepmouli/skillit/commit/126416e59bd35e798f4655ebac8c4ab2243ccdea), [`62c0e2a`](https://github.com/pradeepmouli/skillit/commit/62c0e2a5f4ec05af30f262d24f53631d190eadb9), [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186), [`3d5d8eb`](https://github.com/pradeepmouli/skillit/commit/3d5d8eb9df812c628a118764ccdf3a5d4478b4db), [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a), [`9d67124`](https://github.com/pradeepmouli/skillit/commit/9d671242bf95a5bb49dd2121c37c08008c1a8279), [`de239d9`](https://github.com/pradeepmouli/skillit/commit/de239d97f22ab00254c8de313d9a8c41f3bdc101)]:
  - @skillit/core@2.0.0
  - @skillit/mcp@0.4.0

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
  - @skillit/mcp@0.3.0

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
  - @to-skills/mcp@0.2.0
