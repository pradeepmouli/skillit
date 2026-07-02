---
'@skillit/core': major
'@skillit/mcp': major
'@skillit/cli': minor
'@skillit/client': minor
'@skillit/typedoc': patch
'typedoc-plugin-skillit': patch
'@skillit/vitepress': patch
'@skillit/docusaurus': patch
---

Standardize the anti-pattern JSDoc tag on `@never` across every source type, and fix `skillit gen --source cli` to correlate JSDoc from typed CLI option interfaces (closes [pradeepmouli/skillit#87](https://github.com/pradeepmouli/skillit/issues/87)).

**Breaking:**

- `@skillit/core`: renamed `RefineTag`'s `'pitfalls'` member to `'never'`, and the `ExtractedConfigSurface.pitfalls`/`ExtractedConfigOption.pitfalls`/`ExtractedSkill.pitfalls` fields to `.never`. CLI-sourced skills previously had to use `@pitfalls` as the JSDoc tag name on `<Command>Options` interfaces — despite skillit's own bundled docs showing `@never` in the worked example. Both now use `@never`, matching the convention TypeDoc-sourced skills already used.
- `@skillit/mcp`: renamed the flat `_meta.pitfalls` wire convention to `_meta.never`. Any MCP server annotating tools with `_meta: { pitfalls: "..." } }` must update to `_meta: { never: "..." } }`.

**Fixed:**

- `skillit gen --source cli` (via `generateCliSkill`) now correlates `@useWhen`/`@avoidWhen`/`@never`/`@remarks`/`@example` JSDoc from `<Command>Options`/`<Command>Opts`/`<Command>CommandOpts` interfaces onto the generated skill — previously only `skillit refine --source cli` did this, so `gen` silently produced skills missing their `## NEVER` section even when the JSDoc was correctly authored.
- Fixed a self-contradiction in the bundled `skillit-cli-docs` guidance skill: its prose told authors to use `@pitfalls` while its own code example used `@never`.
