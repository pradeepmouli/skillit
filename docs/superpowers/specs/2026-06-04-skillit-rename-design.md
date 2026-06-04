# Rename `@to-skills` → `@skillit` Design

**Date:** 2026-06-04
**Status:** Approved (design)
**Scope:** Whole-repo rebrand of the published package scope, the CLI, bundled skill names, and the repo. No backward compatibility required — the `@to-skills/*` packages are published but have no real consumers (only the author's own dogfooding), so this is a clean break.

## Goal

Rebrand the project from `@to-skills` to the newly-registered npm org `@skillit`: rename all packages, consolidate the CLI under a single `skillit` binary, rebrand the bundled guidance skills and generated artifacts, and rename the GitHub repo — then publish under the new scope and deprecate the old packages.

## Decisions (settled during brainstorming)

1. **Package scope:** every `@to-skills/*` → `@skillit/*` (core, cli, mcp, client, docusaurus, vitepress, target-mcpc, target-mcp-protocol, target-fastmcp, typedoc).
2. **TypeDoc packages:** `@to-skills/typedoc` → `@skillit/typedoc`; unscoped `typedoc-plugin-to-skills` → `typedoc-plugin-skillit` (kept as a convention-named alias — TypeDoc ≥0.22 loads plugins explicitly via `--plugin`, so the name prefix is a findability convenience, not a hard requirement).
3. **CLI:** collapse the two bins (`to-skills` from client, `to-skills-mcp` from mcp) into a **single `skillit` binary**, with the MCP commands mounted as a `skillit mcp …` subcommand group. `@skillit/mcp` no longer ships a standalone bin.
4. **Bundled skill dirs:** `to-skills-cli-docs` → `skillit-cli-docs`, `to-skills-docs` → `skillit-docs`, `to-skills-mcp-docs` → `skillit-mcp-docs`.
5. **Program name:** `new Command('to-skills')` → `new Command('skillit')`.
6. **Versions:** carried over per-package (core 1.4.0, cli 0.3.14, mcp 0.2.0, client 0.1.0, typedoc 1.0.9, plugin 1.3.1) — preserves changelog continuity.
7. **Repo:** rename `pradeepmouli/to-skills` → `pradeepmouli/skillit` (GitHub 301-redirects the old URL); update all in-repo `repository` URLs, README badges, CLAUDE.md, docs-site links.
8. **Old npm packages:** `npm deprecate` each `@to-skills/*` + `typedoc-plugin-to-skills` with a "renamed to @skillit/\*" message. No forwarder/shim releases.
9. **Pending version PR:** close `changeset-release/master` (#42) — it would publish the old scope.
10. **Consumer config key:** the `package.json` config key `"to-skills"` (read by the MCP bundle as `pkg["to-skills"].mcp.skillName`) → `"skillit"`. Footprint: 4 literals in `packages/mcp/src/bundle/config.ts` (the key read + two `McpError` messages + a doc comment) and the contract doc `specs/001-mcp-extract-bundle/contracts/package-json-config.md`. Internal locals named `toSkills`/`toSkillsIndent` (e.g. in `core/src/writer.ts`) are cosmetic and out of scope — leave them unless trivially in the path of a rename-symbol pass.

## Migration mechanics

- **Manifests:** `packages/*/package.json` `name`, `workspace:*` deps, `bin`, `repository` URLs.
- **Module specifiers:** `from '@to-skills/...'` → `from '@skillit/...'` via **ast-grep** (string-literal-precise; ignores comments/unrelated text). Never plain global sed.
- **Branded code identifiers:** any exported/internal symbol carrying `ToSkills`/`toSkills` renamed via **lspeasy rename-symbol** (semantic, updates all references). NOT applicable to module specifiers/package names (those are strings, handled above).
- **Directory renames:** bundled skill dirs via `git mv`; update the loader URLs (`new URL('../skills/skillit-*/SKILL.md', import.meta.url)`).
- **Strings/docs:** program name, skill metadata (`name`/`keywords`/`description`), README, `website/`, CLAUDE.md; regenerate any committed `skills/` artifacts.
- **Repo-rule reminder:** the commit hook bans the literal `re`+`.exec(`; lint-staged runs oxfmt/oxlint on commit.

## The one real code change — `skillit mcp` fold

Today `@to-skills/mcp` builds its CLI inline in its `bin.ts` and ships the `to-skills-mcp` bin. To expose it as `skillit mcp …`:

- `@skillit/mcp` exports a command builder (e.g. `buildMcpCommand(): Command`) that returns a `mcp` command with the existing subcommands (refine, extract/bundle, etc.) attached.
- `@skillit/client`'s `skillit` program does `program.addCommand(buildMcpCommand())`.
- `@skillit/mcp` drops its standalone `bin` entry (no `to-skills-mcp`/`skillit-mcp`).

**Precondition — confirmed:** the mcp command construction already lives in `packages/mcp/src/cli.ts` as `buildProgram()` (imported by `bin.ts`), not inline in the bin. So exposing it is a thin wrapper: export a `buildMcpCommand()` that produces a `Command('mcp')` carrying the same subcommands `buildProgram` builds (or re-shape `buildProgram` to accept a command name). The mcp package's library exports (`extractMcpSkill`, `McpRefineSource`, etc.) are unaffected. The bin's `McpError`→exit-code mapping must be preserved on the mounted path (the `skillit` top-level error handler maps mcp errors the same way `mcp/bin.ts` does today).

## Components & files (by area)

| Area                                                            | Change                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| All `packages/*/package.json`                                   | `name`, `workspace:*` deps, `repository` URLs                                     |
| `packages/client/package.json`                                  | `bin`: `{ "skillit": "./dist/bin.js" }`                                           |
| `packages/mcp/package.json`                                     | remove `bin`; keep library exports                                                |
| `packages/client/src/bin.ts`                                    | `new Command('skillit')`; `addCommand(buildMcpCommand())`                         |
| `packages/mcp/src/bin.ts` + new `commands/`                     | extract `buildMcpCommand()`; bin.ts (if kept for internal use) calls it           |
| all `**/*.ts` imports                                           | `@to-skills/*` → `@skillit/*` (ast-grep)                                          |
| `packages/{cli,mcp,typedoc-plugin,typedoc}/skills/`             | `git mv` skill dirs to `skillit-*`; update loader URLs                            |
| skill metadata / renderers                                      | rebrand `name`/`keywords`/`description` strings                                   |
| `packages/mcp/src/bundle/config.ts`                             | config key `pkg['to-skills']` → `pkg['skillit']` + 2 error messages + doc comment |
| `specs/001-mcp-extract-bundle/contracts/package-json-config.md` | rebrand the `to-skills.mcp` config schema → `skillit.mcp`                         |
| `README.md`, `website/`, `CLAUDE.md`                            | brand + URL updates                                                               |
| `.changeset/`                                                   | new changeset; close #42                                                          |

## Sequencing (chunks; gates green after each)

1. **Scope + manifests + specifiers + identifiers** — rename all package names + `workspace:*` deps; ast-grep the import specifiers; lspeasy rename-symbol branded identifiers. `pnpm install`, build, test/type-check/lint green.
2. **`skillit mcp` bin fold** — extract `buildMcpCommand()` in `@skillit/mcp`; mount in `skillit` bin; drop mcp's standalone bin; `new Command('skillit')`. Update/extend CLI tests.
3. **Skill dirs + loaders + program-name strings** — `git mv` `skillit-*` skill dirs; fix loader URLs; rebrand skill metadata; regenerate committed `skills/` artifacts.
4. **Docs** — README, `website/`, CLAUDE.md, `repository` URLs/badges.
5. **Release** — changeset (carry versions), close #42, repo rename, `pnpm` publish `@skillit/*` + `typedoc-plugin-skillit`, `npm deprecate` the old packages.

## Error handling / risks

- **Missed references** → after the sweep, `rg 'to-skills|@to-skills'` (excluding dist/node_modules/CHANGELOG history) must return only intentional historical mentions (e.g. CHANGELOG entries). A zero-unintended-hits check is a gate.
- **`workspace:*` resolution** → run `pnpm install` after the manifest rename so the lockfile re-links the renamed packages before building.
- **mcp fold breakage** → covered by extending the existing refine/CLI tests to exercise `skillit mcp refine`.
- **Publish ordering** → publish in dependency order (core first) or rely on the existing changesets publish pipeline.
- **Repo rename** → performed on GitHub (author or `gh repo rename skillit`); in-repo URL updates land in chunk 4.

## Non-goals

- Backward-compat shims / forwarder packages (no consumers).
- API/behavior changes — this is a pure rename; functionality is unchanged.
- Renaming the consumer dogfood repos (sittir/lspeasy) — they re-point to `@skillit/cli` separately (existing tasks #30/#31).
- Changing the docs-site framework or content beyond brand/URL strings.

## Tooling

- **ast-grep** — import/export module-specifier rewrites.
- **lspeasy `rename symbol`** — branded TS identifiers (semantic, reference-aware).
- **`git mv`** — directory renames.
- **changesets / pnpm** — version + publish; **npm deprecate** — old packages.
