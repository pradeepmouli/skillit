# @to-skills/target-fastmcp

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
