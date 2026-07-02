---
'@skillit/core': major
'@skillit/vitepress': minor
'@skillit/mcp': patch
'@skillit/cli': patch
'@skillit/client': patch
'@skillit/typedoc': patch
'@skillit/typedoc-plugin': patch
---

DRY cleanup for the dep-skill wiring, and a sweep of leftover pre-rebrand `toSkills` naming.

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
