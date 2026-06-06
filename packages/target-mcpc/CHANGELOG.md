# @to-skills/target-mcpc

## 0.3.2

### Patch Changes

- [#56](https://github.com/pradeepmouli/skillit/pull/56) [`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - dogfood: refine the skillit client's own command annotations
  - fix(client): isolate the copilot model backend with an empty tool whitelist
  - fix(core): upsertJsDocTag merges into single-line JSDoc without mangling
  - fix(client): extract drafted annotation from <answer> tags
  - fix(client): forbid Insight-block decoration in the claude refine backend
- Updated dependencies [[`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2), [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186)]:
  - @skillit/core@1.6.0
  - @skillit/mcp@0.3.1

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
