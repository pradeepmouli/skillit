# Research: 003-skill-install-quality

## R1: Reference link correctness — render-before-link problem

**Decision**: Render references first, then pass the actual reference file manifest to `renderSkillMd()` so `renderLoadingTriggers()` can emit correct links.

**Rationale**: Currently `renderSkillMd()` is called with `refCategories` (just category names like `'functions'`) before `addGroupedReferences()` runs. The loading triggers always emit `references/functions.md` even when the token budget splits into `references/functions/*.md`. The fix requires reversing the render order: build reference files first, collect their actual filenames into a manifest, then pass the manifest to `renderSkillMd()`.

**Alternatives considered**:

- Post-render fixup pass: Search-and-replace links after both are rendered. Rejected — fragile, same problem as rune-langium's `postprocess-skills.mjs`.
- Predict splitting in advance: Estimate tokens before rendering references. Rejected — duplicates the logic already in `addGroupedReferences()`.

**Implementation detail**: Replace `refCategories: string[]` with a richer structure:

```typescript
interface RefManifest {
  category: string; // 'functions', 'classes', etc.
  layout: 'file' | 'directory'; // single .md or subdirectory
  files: string[]; // actual relative paths
}
```

Build this from the reference `RenderedFile[]` array after rendering. Pass to `renderLoadingTriggers()` which uses `layout` to emit correct link form.

## R2: Install targets — copy vs symlink

**Decision**: Copy (not symlink) rendered skills to install targets.

**Rationale**: Symlinks are platform-fragile (Windows requires dev mode), break when `outDir` is cleaned on next run, and confuse git (uncommitted symlinks in `.claude/skills/`). A copy is deterministic and the file sizes are trivially small (SKILL.md + references/ = a few KB per skill).

**Alternatives considered**:

- Symlink: Saves disk space, keeps targets in sync. Rejected — Windows compat, fragility on re-run.
- Hard link: Same issues as symlink on cross-device mounts.

## R3: Curated router detection — where to check

**Decision**: Check for curated skills in `writeSkills()` (writer layer), not in `renderRouterSkill()` (renderer layer).

**Rationale**: `renderRouterSkill()` is a pure function that operates on in-memory `ExtractedSkill[]` with no filesystem access and no awareness of `outDir`. The writer already does `rmSync(skillDir)` before writing each skill. The curated check fits naturally here: before `rmSync`, read existing SKILL.md frontmatter; if `curated: true`, skip this skill directory entirely.

**Alternatives considered**:

- Pass `outDir` into `renderRouterSkill()` and check there. Rejected — breaks pure-function boundary, mixes I/O into rendering.
- New `isCurated()` predicate in `renderSkills()`. Rejected — `renderSkills()` also has no filesystem access by design.

**Implementation detail**: In `writeSkills()`, for each skill to write, check if `join(outDir, skill.skill.filename)` already exists. If it does, parse its YAML frontmatter. If `curated: true` is present, skip the entire skill directory (don't `rmSync`, don't write). Log an info message.

## R4: Bundled skill version comparison — semver strategy

**Decision**: Use `semver.gte()` from the existing Node.js ecosystem, or a lightweight string comparison since versions follow strict `MAJOR.MINOR.PATCH` format.

**Rationale**: Bundled guidance skills use simple semver (`1.3.0`, `1.4.0`). No pre-release tags needed. A simple `>` comparison on `semver.parse()` is sufficient. The project already uses no semver library — implement a minimal 3-segment numeric compare to avoid adding a dependency.

**Alternatives considered**:

- Full `semver` npm package. Rejected — over-engineered for comparing two version strings.
- Always overwrite. Rejected — user requested version-aware updates.

## R5: MCP audit `suggestion` field — extending McpAuditIssue

**Decision**: Add `readonly suggestion?: string` to `McpAuditIssue` in `packages/core/src/types.ts` (the forward-declaration). The MCP audit rules populate it.

**Rationale**: `McpAuditIssue` is forward-declared in core (same pattern as `McpAuditSeverity`). Adding `suggestion` there keeps the contract visible to downstream consumers who import from core. The MCP audit engine (`packages/mcp/src/audit/`) populates the field.

**Alternatives considered**:

- Separate `McpAuditSuggestion` type. Rejected — the suggestion is a string, not a complex type.
- Only in MCP types. Rejected — breaks the forward-declaration pattern established in 002-mcp-hardening.

## R6: CLI audit — comprehensive coverage of CLI documentation surfaces

**Decision**: Create a CLI audit covering all 8 documentation surfaces that the CLI extraction pipeline reads. Not a full 24-rule system like TypeDoc, but covering every surface that contributes to generated skill quality:

| Code | Surface                   | What it checks                                               |
| ---- | ------------------------- | ------------------------------------------------------------ |
| C1   | Command description       | `.description()` exists and is >10 chars                     |
| C2   | Option description        | `.option()` has description (pre-correlation)                |
| C3   | Usage / examples          | `.usage()` exists or help text has Examples section          |
| C4   | Argument description      | `.argument()` has description                                |
| C5   | Subcommand description    | Nested command has `.description()`                          |
| C6   | Environment variable docs | Option with `.env()` has the env var name documented         |
| C7   | Post-correlation gap      | Neither CLI help nor config interface provided a description |
| C8   | Decision routing          | No `@useWhen` from either CLI or config surface              |

**Rationale**: The CLI pipeline reads 6 distinct documentation surfaces (command descriptions, option descriptions, usage strings, argument descriptions, subcommand descriptions, env vars) plus 2 correlation-dependent surfaces (post-correlation descriptions, useWhen tags). Each is a potential quality gap. The audit must cover all of them to enable a complete eval loop — an agent that fixes C1-C3 but misses C4/C7 will produce skills with silent documentation gaps.

**Alternatives considered**:

- Minimal C1-C3 only. Rejected — leaves argument descriptions, subcommand descriptions, correlation gaps, and env var documentation unchecked. The agent loop can't converge if the audit doesn't catch all surfaces.
- Full 24-rule TypeDoc-style audit. Rejected — CLI has fewer surfaces. 8 rules is comprehensive without being bloated.

## R7: Guidance skill content — what to cover per pipeline

**Decision**: Each bundled guidance skill covers the documentation surfaces its pipeline consumes:

| Pipeline | Skill Name           | Key Surfaces                                                                                                                                                                                                                   |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeDoc  | `to-skills-docs`     | JSDoc tags (`@useWhen`, `@avoidWhen`, `@never`, `@remarks`), package.json fields, README structure                                                                                                                             |
| MCP      | `to-skills-mcp-docs` | `_meta.toSkills` annotation shape, tool description quality, parameter schema descriptions, input schema best practices                                                                                                        |
| CLI      | `to-skills-cli-docs` | Commander `.description()`, `.option()` descriptions, `.argument()` descriptions, `.usage()` strings, subcommand descriptions, `.env()` documentation, config interface JSDoc correlation, `@useWhen`/`@avoidWhen` on commands |

**Rationale**: Each pipeline reads different source material. A TypeDoc user writing JSDoc needs different guidance than an MCP server author writing tool descriptions. The existing `to-skills-docs` skill is the template for structure and tone.

## R8: `renderLoadingTriggers` — trigger text per layout

**Decision**: The trigger text changes based on layout:

- `file`: `read \`references/functions.md\`` (current)
- `directory`: `browse \`references/functions/\` for per-group reference files`

**Rationale**: Agents need to know whether to `Read` a single file or `ls` + `Read` from a directory. The current text always says `.md` which is wrong when splitting occurs.

## R9: Install target deduplication

**Decision**: Resolve all install target paths to absolute, then deduplicate using `Set`. Also deduplicate against `outDir` — if an install target resolves to the same path as `outDir`, skip it (already written there).

**Rationale**: Users might specify both `skills/` as `outDir` and `.claude/skills` + `skills/` as install targets. Without dedup, the same directory gets `rmSync`'d and rewritten twice.

## R10: CLI parser/renderer gaps uncovered by audit rules

Three gaps found when tracing audit rules back to extraction and rendering:

### R10a: Help parser skips `Arguments:` section

**Decision**: Enhance `parseHelpOutput` to recognize `Arguments:` as a parseable section (like `Options:`), extracting argument name + description pairs.

**Rationale**: Line 73 in `help-parser.ts` treats `Arguments:` as a generic section header that ends the options block. Many CLIs (Commander, Click, argparse) emit:

```
Arguments:
  file        Input file to process
  output      Output directory
```

The parser already has the infrastructure to parse indented `name  description` lines (same pattern as options). Without this, C4 audit rule would false-positive on all help-text-parsed CLIs.

**Implementation**: Add an `inArgumentsBlock` state flag (mirrors `inOptionsBlock`). When `Arguments:` header detected, set flag. Parse subsequent indented lines as `name  description` pairs into `ExtractedConfigArgument[]` with descriptions filled in.

### R10b: Renderer drops `envVar` field

**Decision**: Render `envVar` in both inline options table and reference detail.

**Rationale**: `ExtractedConfigOption.envVar` is populated by Commander introspection (line 48 of `introspect-commander.ts`) but never rendered. The options table should show `Also: $ENV_VAR` in the Description column. The reference detail should add a `**Env:** \`ENV_VAR\`` line.

### R10c: Trailing dash on empty argument description

**Decision**: In `renderCommandsSection`, conditionally render the `—` separator only when `arg.description` is non-empty.

**Rationale**: Line 63 of `config-renderer.ts` emits `` `name` — ${arg.description} `` which produces `` `name` —  `` when description is empty. Trivial fix: `const desc = arg.description ? ` — ${arg.description}` : '';`
