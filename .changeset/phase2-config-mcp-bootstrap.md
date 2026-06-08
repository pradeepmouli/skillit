---
'@skillit/client': minor
'@skillit/mcp': minor
---

feat: bootstrap config + mcp source kinds (Phase 2)

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
