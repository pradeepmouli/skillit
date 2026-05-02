# Feature Specification: Skill Install Pipeline + Post-Process Quality

**Feature Branch**: `003-skill-install-quality`
**Created**: 2026-05-01
**Status**: Draft
**Input**: Three related issues identified from rune-langium consumer experience: (1) generated skills are never copied to agent discovery directories, (2) SKILL.md reference links break when token budgets split files, (3) audit output lacks actionable fix suggestions.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — SKILL.md reference links match actual file layout (Priority: P1)

A developer generates skills for a library with 50+ exported functions. The token budget splits `references/functions.md` into `references/functions/group-a.md`, `references/functions/group-b.md`, etc. Today, the SKILL.md body still says "Load `references/functions.md`" — the link is wrong and agents can't find the reference files. Additionally, SKILL.md emits "Load `references/variables.md`" instructions even when no variables were exported. After this story ships, the renderer knows the actual reference file layout and emits only correct, existing links.

**Why this priority**: Broken reference links directly degrade skill quality for any non-trivial library. This is the root cause of rune-langium's custom `postprocess-skills.mjs` cleanup script. Fixing this at the source eliminates the need for consumer-side workarounds.

**Independent Test**: Generate a skill for a package with 50+ functions at `maxTokens: 2000` (forces splitting). Assert SKILL.md contains `references/functions/` (directory form), not `references/functions.md` (file form). Also assert no reference lines point to non-existent files. Generate a skill with zero exported variables and assert no "references/variables.md" line appears.

**Acceptance Scenarios**:

1. **Given** a skill where `references/functions.md` fits within the token budget, **When** rendered, **Then** SKILL.md links to `references/functions.md`.
2. **Given** a skill where functions exceed the token budget and split into `references/functions/*.md`, **When** rendered, **Then** SKILL.md links to `references/functions/` (directory) or lists the split files individually.
3. **Given** a skill with no exported variables (empty variables section), **When** rendered, **Then** SKILL.md does NOT contain a "Load `references/variables.md`" instruction.
4. **Given** a skill with no exported classes, **When** rendered, **Then** no `references/classes.md` or `references/classes/` link appears in SKILL.md.

---

### User Story 2 — Generated skills are automatically installed into agent discovery directories (Priority: P1)

A developer runs `pnpm typedoc` (or `to-skills-cli extract`). Today, skills land in `skills/<name>/` and they must manually copy them to `.claude/skills/<name>/`, `.agents/skills/<name>/`, etc. After this story ships, an optional `installTargets` configuration copies generated skills into configured agent harness directories automatically.

**Why this priority**: Without this, every consumer must write their own copy/install script or the generated skills are invisible to agents. This is the #1 adoption blocker for first-time users.

**Independent Test**: Configure `installTargets: ['.claude/skills', '.agents/skills']` in typedoc.json or CLI options. Run skill generation. Assert skills exist in both target directories with correct structure (SKILL.md + references/).

**Acceptance Scenarios**:

1. **Given** a typedoc.json with `"skillsInstallTargets": [".claude/skills", ".agents/skills"]`, **When** `pnpm typedoc` runs, **Then** each generated skill is copied to `.claude/skills/<skill-name>/` and `.agents/skills/<skill-name>/` in addition to `skillsOutDir`.
2. **Given** no `skillsInstallTargets` configured, **When** `pnpm typedoc` runs, **Then** behavior is unchanged (skills only in `skillsOutDir`) — opt-in, not breaking.
3. **Given** a stale skill from a previous run exists in an install target, **When** generation runs, **Then** the stale directory is cleaned and replaced.
4. **Given** an install target directory that doesn't exist, **When** generation runs, **Then** the directory is created automatically.

---

### User Story 3 — Bundled guidance skills are published and installable for all pipelines (Priority: P1)

Today the `to-skills-docs` skill in `packages/typedoc-plugin/skills/` covers TypeDoc/JSDoc conventions but is excluded from the npm package. Additionally, there is no equivalent guidance skill for the other two generation pipelines: CLI introspection (`@to-skills/cli` — Commander programs, `--help` text) and MCP extraction (`@to-skills/mcp` — `_meta.toSkills` annotations, tool descriptions, parameter schemas). After this story ships, each package bundles its own guidance skill covering the documentation surfaces it controls, and all are published and auto-installable.

**Why this priority**: Without pipeline-specific guidance being discoverable, consumers of any pipeline have no actionable advice on how to improve the source material that feeds skill generation. TypeDoc users need JSDoc tag guidance; MCP server authors need `_meta.toSkills` annotation guidance; CLI authors need `--help` text and description quality guidance.

**Independent Test**: Run `npm pack` for each of `typedoc-plugin-to-skills`, `@to-skills/cli`, and `@to-skills/mcp`. Verify each tarball contains its bundled guidance skill. Configure `installTargets` and verify all applicable guidance skills appear alongside generated skills.

**Acceptance Scenarios**:

1. **Given** `typedoc-plugin-to-skills` is installed via npm, **When** the consumer inspects the package, **Then** `skills/to-skills-docs/SKILL.md` is present with TypeDoc/JSDoc conventions.
2. **Given** `@to-skills/mcp` is installed via npm, **When** the consumer inspects the package, **Then** `skills/to-skills-mcp-docs/SKILL.md` is present with MCP annotation conventions (`_meta.toSkills` structure, tool description quality, parameter schema best practices).
3. **Given** `@to-skills/cli` is installed via npm, **When** the consumer inspects the package, **Then** `skills/to-skills-cli-docs/SKILL.md` is present with CLI documentation conventions (`--help` text quality, Commander description fields, config interface JSDoc).
4. **Given** `skillsInstallTargets: [".claude/skills"]`, **When** any pipeline runs, **Then** its bundled guidance skill is installed alongside generated skills.
5. **Given** the consumer already has a custom guidance skill in the install target (no `version` in frontmatter, or a different `name`), **When** the install runs, **Then** the bundled version does NOT overwrite it (skip with log message).
6. **Given** a previously installed guidance skill with `version: 1.3.0` in frontmatter, **When** the package is upgraded and the bundled skill has `version: 1.4.0`, **Then** the installed copy is replaced with the newer version.
7. **Given** a previously installed guidance skill with the same version as the bundled one, **When** the install runs, **Then** the installed copy is left unchanged (no-op).

---

### User Story 4 — Router skill respects curated overrides (Priority: P2)

A monorepo maintainer curates a hand-written router skill (e.g., `skills/rune-langium/SKILL.md`) that provides better routing guidance than the auto-generated one. Today, `renderRouterSkill()` overwrites it every run, and rune-langium works around this by copying the curated version back in a post-process script. After this story ships, the renderer detects an existing curated router and preserves it.

**Why this priority**: Router skills are the entry point for agents in monorepos. Auto-generated ones use generic templates; hand-curated ones encode project-specific expertise. Overwriting curated content is destructive and forces workarounds.

**Independent Test**: Place a hand-curated `skills/<project>/SKILL.md` with `curated: true` in its YAML frontmatter. Run typedoc. Assert the file is preserved unchanged. Assert package-specific skills are still generated/updated normally.

**Acceptance Scenarios**:

1. **Given** a curated `skills/my-project/SKILL.md` with `curated: true` in frontmatter, **When** typedoc runs, **Then** the file is preserved and not overwritten.
2. **Given** no existing router skill, **When** typedoc runs on a monorepo, **Then** an auto-generated router skill is created as today.
3. **Given** a curated router skill AND new packages added to the monorepo, **When** typedoc runs, **Then** per-package skills are generated/updated but the router is not touched.

---

### User Story 5 — Audit suggestions include actionable fix text across all pipelines (Priority: P2)

A developer runs `pnpm typedoc` and sees audit output: `[FATAL] F4: Missing JSDoc on export renderSkill`. An MCP server author runs `to-skills-mcp extract` and sees `[WARNING] M1: Tool 'search' has empty description`. A CLI author sees `[ERROR] Missing --help description on 'build' command`. Today, all three pipelines tell users _what's wrong_ but not _how to fix it_. After this story ships, each audit finding across all pipelines includes a suggested fix template using skill-creator heuristics — problem-oriented descriptions, NEVER+BECAUSE+FIX format for pitfalls, scenario-based `@useWhen`, and pipeline-specific conventions (JSDoc tags for TypeDoc, `_meta.toSkills` for MCP, `--help` text for CLI).

**Why this priority**: The audit is the primary feedback loop for skill quality across all pipelines. Adding suggestions turns it from "here's what's wrong" to "here's how to fix it" — enabling the iterative eval loop where an agent generates skills, reviews audit output, improves source docs, and regenerates until quality converges.

**Independent Test**: Generate audit output for each pipeline with documentation gaps. Assert TypeDoc F4 findings include JSDoc templates. Assert MCP M1 findings include tool description guidance. Assert CLI findings include `--help` text templates. All suggestion formats should be actionable enough that an agent can apply them directly to source code.

**Acceptance Scenarios**:

1. **Given** a TypeDoc export `renderSkill` with no JSDoc, **When** audit runs, **Then** the F4 finding includes: `Suggested: /** [One sentence: what problem renderSkill solves for the caller] */`.
2. **Given** a TypeDoc function with `@param options` but no description, **When** audit runs, **Then** the E1 finding includes: `Suggested: @param options — [What the caller controls with this parameter]`.
3. **Given** a TypeDoc function with no `@returns`, **When** audit runs, **Then** the E2 finding includes: `Suggested: @returns [What the caller gets back and what they do with it]`.
4. **Given** no `@useWhen` on any TypeDoc export, **When** audit runs, **Then** the W7 finding includes: `Suggested: Add @useWhen to 3-5 key exports with scenario descriptions`.
5. **Given** an MCP tool with an empty description, **When** MCP audit runs, **Then** the M1 finding includes: `Suggested: Add a one-sentence description of what this tool does and when to use it`.
6. **Given** an MCP tool with malformed `_meta.toSkills`, **When** MCP audit runs, **Then** the M3 finding includes: `Suggested: _meta.toSkills.useWhen should be string[] — e.g. ["when the user needs to search by keyword"]`.
7. **Given** a CLI command with no description, **When** CLI audit runs, **Then** the C1 finding includes: `Suggested: .description("[One sentence: what this command does and why]")`.
8. **Given** a CLI positional argument with no description, **When** CLI audit runs, **Then** the C4 finding includes: `Suggested: .argument('<[name]>', '[What this argument represents]')`.
9. **Given** a CLI option with empty description after correlation (neither `--help` nor config interface provided one), **When** CLI audit runs, **Then** the C7 finding includes a suggestion to add a description to either the config interface JSDoc or the `.option()` call.

---

### User Story 6 — CLI `--install-target` flag for MCP skills (Priority: P2)

A developer using `to-skills-mcp extract --command npx --arg -y --arg @some/server` wants the extracted MCP skill installed directly into agent directories. Today they must manually copy from `skills/`. After this story ships, `--install-target .claude/skills` copies the result automatically.

**Why this priority**: MCP skills are the fastest-growing use case. Making install frictionless for CLI users completes the end-to-end pipeline.

**Independent Test**: Run `to-skills-mcp extract --command ... --install-target .claude/skills`. Assert the skill appears in `.claude/skills/<name>/` with correct SKILL.md and references/.

**Acceptance Scenarios**:

1. **Given** an MCP extract command with `--install-target .claude/skills`, **When** extract completes, **Then** the skill appears at `.claude/skills/<server-name>/SKILL.md`.
2. **Given** multiple `--install-target` flags, **When** extract completes, **Then** the skill is installed to all specified targets.
3. **Given** no `--install-target` flag, **When** extract completes, **Then** behavior is unchanged (skills only in `skillsOutDir`).

---

### Edge Cases

- **Install target doesn't exist**: Create it (mkdir -p), consistent with how `writeSkills` already creates directories.
- **Relative vs absolute paths**: Install targets are resolved relative to cwd, same as `skillsOutDir`.
- **Multiple install targets point to same dir**: Deduplicate before writing to avoid redundant work.
- **Skill name collision across packages**: Each skill writes to `<install-target>/<skill-name>/` — if two packages produce the same skill name, the last one wins (same as current behavior in `skillsOutDir`).
- **Reference link rewriting — nested splits**: If `functions/` is split AND some groups are further split, ensure links handle the full depth. Current implementation only splits to 2 levels.
- **Curated router detection**: Use `curated: true` in YAML frontmatter (explicit, machine-readable). Fall back to detecting `<!-- curated -->` HTML comment for backward compatibility.
- **Bundled skill conflicts**: If the consumer has their own `to-skills-docs` skill in the install target (no `version` field or a different `name`), don't overwrite — skip with a log message. If the existing copy has a `version` field matching the bundled skill's name, compare versions and replace only when the bundled version is newer.
- **Empty reference sections**: If a package exports only functions (no classes, types, variables), only `references/functions.md` should appear in SKILL.md loading instructions. Zero-item sections produce zero reference links.
- **Router skill with no monorepo**: When only one package is processed, no router skill is generated (existing behavior, preserved).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-Q001**: The SKILL.md renderer MUST NOT emit reference loading instructions for sections that produce no output files (no functions → no "Load references/functions.md" line).
- **FR-Q002**: The SKILL.md renderer MUST emit correct links when token budgets split a section into a directory of files (e.g., `references/functions/` instead of `references/functions.md`).
- **FR-Q003**: `writeSkills()` MUST accept an optional `installTargets?: string[]` parameter. When provided, each rendered skill is copied to each target directory in addition to `outDir`.
- **FR-Q004**: The TypeDoc plugin MUST register a `skillsInstallTargets` option (type: array of strings, default: `[]`). When non-empty, skills are installed to those directories after generation.
- **FR-Q005**: Each pipeline package (`typedoc-plugin-to-skills`, `@to-skills/cli`, `@to-skills/mcp`) MUST include its `skills/` directory in its package.json `"files"` so bundled guidance skills are published to npm.
- **FR-Q006**: When `installTargets` is configured, the pipeline's bundled guidance skill MUST be installed alongside generated skills. If the target already contains a copy with a `version` frontmatter field, replace only when the bundled version is newer (semver comparison). If the existing copy has no `version` or a different `name`, skip with a log message.
- **FR-Q007**: `renderRouterSkill()` MUST detect and preserve curated router skills (identified by `curated: true` in frontmatter).
- **FR-Q008**: The audit output across all pipelines MUST include actionable fix suggestion templates: TypeDoc audit (F1-F4, E1-E5), MCP audit (M1-M3+), and CLI audit findings. Suggestions MUST be specific enough for an agent in an eval loop to apply them directly to source code without human intervention.
- **FR-Q009**: MCP extract CLI MUST support `--install-target <dir>` flag (repeatable) with the same install semantics as FR-Q003.
- **FR-Q010**: Install targets MUST be created automatically if they don't exist (mkdir -p pattern).
- **FR-Q011**: The help-text parser MUST parse `Arguments:` sections to extract positional argument descriptions (currently skipped, leaving all argument descriptions empty).
- **FR-Q012**: The config renderer MUST render `envVar` when present on an option — both in the inline options table (as a column or parenthetical) and in the reference detail view.
- **FR-Q013**: The config renderer MUST suppress trailing `—` when argument description is empty (render name only, no dangling dash).

### Key Entities

- **RenderedSkill**: Existing entity — gains awareness of reference file layout (single file vs split directory) to inform SKILL.md link generation.
- **InstallTarget**: A filesystem path where rendered skills are copied after generation. Resolved relative to cwd. Each target receives the full skill directory tree (SKILL.md + references/).
- **AuditFinding**: Existing entity — gains a `suggestion?: string` field containing a fix template.
- **CuratedSkill**: A hand-written SKILL.md identified by `curated: true` in frontmatter, preserved across re-generation.
- **BundledSkillVersion**: The `version` field in a bundled skill's YAML frontmatter (e.g., `version: 1.4.0`). Used for semver comparison to determine whether an installed copy should be replaced on plugin upgrade.
- **BundledGuidanceSkill**: A pipeline-specific documentation skill shipped with each package — `to-skills-docs` (TypeDoc/JSDoc), `to-skills-mcp-docs` (MCP annotations), `to-skills-cli-docs` (CLI help text). Each covers the documentation surfaces that its pipeline consumes.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-Q001**: rune-langium's `postprocess-skills.mjs` becomes unnecessary — all three of its fixups (reference link rewriting, phantom section pruning, router skill override) are handled by core.
- **SC-Q002**: Generated skills appear in configured agent directories without manual copying when `skillsInstallTargets` is set.
- **SC-Q003**: No SKILL.md contains links to non-existent reference files after generation (zero broken links).
- **SC-Q004**: `npm pack` for each pipeline package includes its bundled guidance skill in the tarball (`to-skills-docs`, `to-skills-mcp-docs`, `to-skills-cli-docs`).
- **SC-Q005**: Audit output across all three pipelines (TypeDoc, MCP, CLI) includes at least one suggested fix template per Fatal and Error finding, actionable enough for an eval loop agent to apply directly.
- **SC-Q006**: Curated router skills survive re-generation without any post-process scripts.
- **SC-Q007**: All existing tests pass with no regressions.

## Assumptions

- Consumers use one or more of the standard agent discovery directories (`.claude/skills/`, `.agents/skills/`, `.github/skills/`, `.codex/skills/`, `.gemini/skills/`). The install mechanism is directory-agnostic — any path works.
- The `curated: true` frontmatter marker is a new convention; existing curated skills (like rune-langium's) will need to add it once. The `<!-- curated -->` HTML comment provides backward compatibility.
- Audit suggestion templates are static strings with placeholder brackets (e.g., `[what problem X solves]`), not LLM-generated content. They provide structure, not prose. The eval loop pattern is: generate skill → run audit → read suggestions → apply fixes to source → regenerate → repeat until audit is clean.
- The reference link fix is computed during the render phase by making the SKILL.md body generation aware of the reference file manifest. This avoids a post-render fixup pass.
- The bundled `to-skills-docs` skill is the same content currently at `packages/typedoc-plugin/skills/to-skills-docs/SKILL.md`. The `to-skills-mcp-docs` and `to-skills-cli-docs` guidance skills are new content covering MCP annotation conventions and CLI help text quality respectively — they follow the same structure as `to-skills-docs` but cover different documentation surfaces.
