# @to-skills/core

## 2.0.0

### Major Changes

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

### Minor Changes

- [#58](https://github.com/pradeepmouli/skillit/pull/58) [`de4b5dc`](https://github.com/pradeepmouli/skillit/commit/de4b5dc92a8cd422e69b3adc640debce50885186) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: refine TypeScript config surfaces (`--source config`)
  - `@skillit/core` adds `ConfigRefineSource` + `extractConfigSurface`: extract a
    config type's options (incl. nested dot-path keys) and refine their per-option
    routing JSDoc (`@useWhen`/`@avoidWhen`/`@pitfalls`) in place via
    `upsertPropertyJsDocTag`. The audit credits per-option config tags and
    audit-score emits per-option `config-option` targets so the refine loop
    converges on a config skill.
  - `@skillit/client` wires `skillit refine --source config --config-type <file#export>`
    and `skillit init --source config` (generate → refine in place → regenerate;
    installs nothing — config is built into the client).
  - `ConfigRefineSource` enriches the skill + audit context from the nearest
    package.json (description/keywords/repository) and a sibling README, and drafts
    a type-correct example to a sibling `<config>.example.ts` (only if absent),
    read back as the skill's usage example. `guidance()` scopes drafting to the
    single named option.
  - audit-score surfaces config per-option routing coverage and the example
    independent of dimension thresholds, so the loop documents the whole surface
    rather than stopping once the rubric is satisfied.
  - `--ground <glob>` (repeatable) feeds the code that CONSUMES the config to the
    draft model as a token-capped implementation reference, so it states correct
    runtime behavior instead of guessing from the type; without it the model is
    instructed not to assert unverifiable runtime semantics.
  - fixes surfaced by dogfooding against a real generic config:
    - normalize multi-line option types to one line (mapped types can't corrupt
      the options table);
    - prefix every line when creating a JSDoc block with multi-line content
      (no column-0 continuation bullets, which also broke later merges);
    - escape the comment-close sequence in written tag content so a value
      containing it (e.g. a `**`-glob) can't terminate the block and corrupt the
      file; unescape on read;
    - don't truncate per-option targets at the class cap;
    - the rendered skill describes the config surface, not the package blurb.

- [#61](https://github.com/pradeepmouli/skillit/pull/61) [`5920b77`](https://github.com/pradeepmouli/skillit/commit/5920b77af23641357912552eaf035055a5c61b8a) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: agent-bootstrap Phase 0 core affordances
  - **`skillit gen`** — new first-class, deterministic, side-effect-free command that (re)generates the skill from current source (cli + config). It shares ONE generate path with the rest of the client (`packages/client/src/generate.ts`).
  - **`skillit init` is now install/wire only** — it no longer generates or refines. After `init`, run `skillit gen`. (Behavior change for `init`.)
  - **`skillit audit --json`** — new command wrapping `auditSkill` + `estimateSkillJudgeScore`, emitting the full `AuditResult` + `SkillJudgeEstimate` plus a resolved on-disk location per improvement target.
  - **`RefineSource.resolveTargetLocation`** — new optional method on the core `RefineSource` contract, implemented for typedoc, cli, config, and mcp (build) sources.

- [#67](https://github.com/pradeepmouli/skillit/pull/67) [`9d67124`](https://github.com/pradeepmouli/skillit/commit/9d671242bf95a5bb49dd2121c37c08008c1a8279) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - feat: ship the `/skillit-bootstrap` agent skill (Phase 1)
  - New bundled Claude Code skill `skillit-bootstrap` (`packages/client/skills/`)
    that orchestrates the agent-bootstrap loop — `skillit gen` → `skillit audit
--json` → agent enriches repo source → regenerate — for the **cli** and
    **typedoc** source kinds. The agent never writes a `SKILL.md`; it edits only
    source surfaces (JSDoc / README / examples / package.json). `@skillit/client`
    now ships its `skills/` directory.
  - **fix(cli):** `CliRefineSource` now reads package.json metadata + README
    (description, keywords, repository) into its audit context. Previously it
    returned an empty context, so the F1/F3 (description/README) audit findings
    were unaddressable and a cli-source skill could not reach grade B.
  - **core:** new shared `readPackageMetadata()` / `findNearestPackageDir()`
    exports (the single package-metadata reader used by both the config and cli
    sources).
  - **typedoc + client:** `skillit gen --source typedoc` and `skillit audit
--source typedoc` are now wired, so the bootstrap skill's typedoc claim is
    real. `gen` drives the existing `@skillit/typedoc` plugin pipeline
    (`load(app)` + `convert()`); `audit` reuses `extractSkills`. New
    `@skillit/typedoc` exports: `generateTypeDocSkills`, `extractTypeDocSkills`,
    `createTypeDocRefineSource`.
  - config / mcp orchestration and the mechanical no-hand-edit guard are deferred
    to later phases; the CLI commands remain for headless/CI use.

### Patch Changes

- [#56](https://github.com/pradeepmouli/skillit/pull/56) [`f64f0af`](https://github.com/pradeepmouli/skillit/commit/f64f0afd2765a9546b8f3444902ba87b11ac6df2) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - dogfood: refine the skillit client's own command annotations
  - fix(client): isolate the copilot model backend with an empty tool whitelist
  - fix(core): upsertJsDocTag merges into single-line JSDoc without mangling
  - fix(client): extract drafted annotation from <answer> tags
  - fix(client): forbid Insight-block decoration in the claude refine backend

- [#60](https://github.com/pradeepmouli/skillit/pull/60) [`126416e`](https://github.com/pradeepmouli/skillit/commit/126416e59bd35e798f4655ebac8c4ab2243ccdea) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - fix(core): config refine grounding now includes the config module's own declarations

  `ConfigRefineSource` grounding previously fed only the external `--ground`
  globs (the consuming code) and explicitly skipped the config file. But config
  modules routinely hold the non-type declarations the model needs to be
  accurate — preset/override tables, defaults, `defineConfig`/validation (e.g.
  z2f's `SHADCN_OVERRIDES`). Excluding the config file forced the model to guess
  those runtime values, producing factually-wrong routing prose.

  The config module is now prepended to grounding, with only the refine routing
  tags this source writes back across iterations stripped out (`stripRefineTags`)
  — so our own accumulated annotations aren't fed back as "implementation", while
  hand-authored docs (the real runtime-behavior grounding) are preserved.

- [#60](https://github.com/pradeepmouli/skillit/pull/60) [`62c0e2a`](https://github.com/pradeepmouli/skillit/commit/62c0e2a5f4ec05af30f262d24f53631d190eadb9) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - fix(core): correct config-refine JSDoc indentation and per-option coverage ordering

  Two refinements surfaced by review of the config refine pipeline:
  - `upsertTagOnAnchor` derived the JSDoc indent from the declaration's column.
    For a property documented on the same line (`/** desc */ outDir`), that column
    is the text _after_ the comment, so every rebuilt continuation line was
    massively over-indented and the declaration was packed onto the closing `*/`
    line. The indent now comes from the comment node, and a same-line declaration
    is spliced onto its own line.
  - `selectWorkItems` sorted purely by points descending, so on a wide config
    surface all `@pitfalls` targets (higher points) filled every bounded iteration
    before any `@useWhen`/`@avoidWhen` target was drafted — letting the loop's
    score plateau stop early with those dimensions still failing. It now
    round-robins across tags so each iteration spreads over all still-failing
    dimensions. With one target per group this is identical to the old order.
  - The refine loop's plateau check stopped on any flat-score iteration, but
    per-option coverage targets are score-neutral once the routing thresholds
    pass — so wide surfaces halted before every option was documented. The check
    is now coverage-aware: it only plateaus when the score is flat AND the
    available-work backlog is not shrinking, so score-neutral completeness work
    runs to exhaustion (bounded by `maxIterations`) while the genuinely-stuck case
    still stops early.

## 1.5.0

### Minor Changes

- [#41](https://github.com/pradeepmouli/skillit/pull/41) [`989f899`](https://github.com/pradeepmouli/skillit/commit/989f899fd506f422d67c808bce8b5302f11986c6) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - - fix(client): guard msg.content[0] access — throw on empty or non-text response
  - fix(typedoc/refine): fix JSDoc closer indentation + use async fs I/O in TypeDocRefineSource
  - feat(client): add skillit bin with refine command
  - feat(client): add AnthropicModelClient (Sonnet drafter, Opus reviewer)
  - feat(client): scaffold @skillit/client package

- [#52](https://github.com/pradeepmouli/skillit/pull/52) [`30e9f03`](https://github.com/pradeepmouli/skillit/commit/30e9f03756bb3596e0cf90bb91beb37dd6bb9c18) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Multi-source `refine` (CLI), `skillit init`, ast-grep-based JSDoc editing, and guidance injection.
  - **core**: new `refine/ast-edit.ts` wrapping `@ast-grep/napi` — `upsertJsDocTag`/`readJsDocTags` replace the regex/offset JSDoc surgery; `insertJsDocTag` reimplemented on top of it. `RefineSource.guidance?()` and `guidance` on draft/review requests; `refineSkill` threads the source's bundled guidance skill into every draft/review. `audit-score` surfaces CLI command annotation gaps as work items.
  - **cli**: `CliRefineSource` (extract → bundled `skillit-cli-docs` guidance → JSDoc write-back onto the correlated `*Options` interface); commander program loader (`--program file#export` + `bin` auto-find); `*Options` interface JSDoc reader for loop closure.
  - **client**: `refine` is source-aware — `--source cli|mcp|typedoc` with detection from installed `@skillit/*` packages, plus `--program`; `--mcp` no longer globally required. New `skillit init` command: detect project nature → install the matching package → generate the initial skill into top-level `skills/` → refine (CLI path automated; mcp/typedoc print next-step guidance).

### Patch Changes

- [#54](https://github.com/pradeepmouli/skillit/pull/54) [`314f9b0`](https://github.com/pradeepmouli/skillit/commit/314f9b0218304e40d6fa6da628fcb112d2940912) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Rebrand `@to-skills` → `@skillit`: package scope, a single `skillit` CLI (MCP commands now mounted as `skillit mcp …`), bundled skill names (`skillit-cli-docs`/`skillit-docs`/`skillit-mcp-docs`), and the `package.json` config key (`skillit.mcp`). No API or behavior changes.

## 1.4.0

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

## 1.3.0

### Minor Changes

- Router pulls expert data from packages: @remarks, key exports, top NEVERs

  Routing Logic now includes @remarks intro (thinking framework), key API names,
  and a Critical Patterns section with the top NEVER from each package.

## 1.2.2

### Patch Changes

- Fix router example invocations — natural "I need to..." phrasing

## 1.2.1

### Patch Changes

- Router skill: deduplicate sections, natural example queries

  Each section now has distinct content:
  - When to Use: package descriptions (broad)
  - Decision Tree: numbered routing
  - Routing Logic: @useWhen detail (only place)
  - Examples: natural user queries, not @useWhen echo

## 1.2.0

### Minor Changes

- Router skill follows Axiom pattern: decision tree, anti-rationalization, example invocations

  Full router structure: assertive opening → When to Use triggers → numbered Decision Tree →
  per-package Routing Logic → Anti-Rationalization table (from @avoidWhen) →
  Example Invocations (from @useWhen) → NEVER rules.

## 1.1.2

### Patch Changes

- Router skill: add NEVER rules, domain keywords from all packages, multi-package guidance

## 1.1.1

### Patch Changes

- Fix router skill: full routing entries, peer skill links, WHEN triggers in description

## 1.1.0

### Minor Changes

- Generate router skill for monorepos with 2+ packages

  When renderSkills produces multiple skills, generates a peer router SKILL.md
  that routes agents to the correct package skill based on their task.

## 1.0.1

### Patch Changes

- Smart Quick Reference: only show annotated exports for large packages

  For packages with 30+ exports, Quick Reference now shows only exports with
  @useWhen, @category, or @remarks (author-marked as important). Others get
  a count-only summary pointing to references/. Small packages (<30) still
  show everything.

## 1.0.0

### Major Changes

- Switch When to Use from tables to bullet lists, matching published skill conventions

  BREAKING: When to Use section now uses bullet lists instead of markdown tables.
  - Multi-source attribution: "Display images → use `Sprite`" (not table rows)
  - Avoid when: "**Do NOT use when:**" bullet list
  - NEVER rules: own "## NEVER" section (not folded into When to Use)
  - parseBulletList joins non-bulleted paragraphs (fixes multi-row table corruption)
  - Description: package.json tagline + first @useWhen (truncated to 80 chars) + keywords

## 0.16.2

### Patch Changes

- Description uses keywords, not @useWhen sentences

  @useWhen content stays in the body "When to Use" section (decision tables).
  Description field uses package.json tagline + domain keywords for agent activation.
  Prevents run-on descriptions from concatenating full @useWhen sentences.

## 0.16.1

### Patch Changes

- Description from package.json only, Quick Start extracts first code block when too long
  - buildDescription uses package.json tagline (not @packageDocumentation summary)
  - @packageDocumentation summary stays in body intro only
  - Quick Start cap extracts first complete code block instead of truncating to pointer

## 0.16.0

### Minor Changes

- Audit recommends primary sources when secondary sources are insufficient
  - A4: when README Quick Start >20 lines and no @example exists, recommend adding @example (warning)
  - W5: when README Features missing, recommend @packageDocumentation @remarks as primary alternative
  - W6: when README Troubleshooting missing, recommend @never tags as primary alternative
  - Quick Start capped at 30 lines in SKILL.md body with pointer to references

## 0.15.0

### Minor Changes

- Quick Reference cap, word-boundary truncation, per-skill README resolution
  - Quick Reference capped at 30 lines with pointer to references/ for full API
  - Description truncation falls back to word boundary instead of mid-word cut
  - README resolved per-skill in "resolve" entryPointStrategy (no more shared root README)

## 0.14.0

### Minor Changes

- Rename @pitfalls to @never, fold NEVER rules into When to Use section

  Breaking: @pitfalls tag renamed to @never. The tag content is unchanged — NEVER + BECAUSE format.
  NEVER rules now render inside "## When to Use" as a **NEVER:** subsection instead of a separate
  "## Pitfalls" heading, matching hand-written skill conventions.

## 0.13.4

### Patch Changes

- Fix description truncation inside backtick-quoted identifiers (e.g. `?z2f`)
  - truncateDescription regex now skips .!? inside backticks
  - buildDescription combines package.json tagline with JSDoc keywords when both exist

## 0.13.3

### Patch Changes

- Compare first sentences when choosing between package.json and JSDoc descriptions

## 0.13.2

### Patch Changes

- Prefer longer JSDoc description over package.json for richer trigger keywords

## 0.13.1

### Patch Changes

- Fix @remarks not extracted in single-package mode, deduplicate examples.md
  - extractModule now extracts @remarks from module comment (was only in mergeModules)
  - examples.md only created for 2+ examples (first example is Quick Start in SKILL.md body)

## 0.13.0

### Minor Changes

- [`f9cc01d`](https://github.com/pradeepmouli/to-skills/commit/f9cc01dc46bfe00467afe4e82eec6b557ca8e3f3) Thanks [@pradeepmouli](https://github.com/pradeepmouli)! - Surface @remarks as thinking framework, fix decision table Why column, broaden Quick Start aliases
  - Extract @remarks from @packageDocumentation and render in SKILL.md body (architectural context, trade-offs)
  - Decision table uses 2-column format (Task | Use) when no explicit reasons exist via " — " delimiter
  - When explicit " — " reasons exist, 3-column format (Task | Use | Why) with the author's reasoning
  - Add "cli usage", "basic usage", "installation" as Quick Start heading aliases

## 0.12.0

### Minor Changes

- Add loading triggers for reference files and populate decision table Why column
  - SKILL.md now has a "## References" section with scenario-based loading triggers
    telling agents when to read each reference file (functions, classes, config, docs, etc.)
  - Decision table "Why" column uses the source function/class description instead of blank "—"
  - Fixes the [#1](https://github.com/pradeepmouli/to-skills/issues/1) skill-judge structural failure: orphaned references (Pattern 3)

## 0.11.1

### Patch Changes

- Fix pitfall multi-line formatting, description keyword-stuffing, redundant keyword bullets
  - parseBulletList now joins continuation lines into preceding bullet (fixes split NEVER rules)
  - Description uses @useWhen triggers instead of mechanical keyword list when available
  - "When to Use" section skips keyword bullet when @useWhen decision tables exist

## 0.11.0

### Minor Changes

- Document extraction overhaul, auto-tag registration, self-documenting params
  - Extract @document children recursively (was only top-level)
  - Deduplicate document titles using frontmatter category
  - Render {@link Foo} as `Foo` in extracted docs
  - Extract API references from "## API reference" sections for cross-linking
  - Organize doc references by category with per-category index files
  - Progressive disclosure in SKILL.md Documentation section
  - Auto-register custom blockTags and auto-move from modifierTags with warning
  - Wire avoidWhenSources for decision table rendering
  - Skip self-documenting params/returns in audit
  - Fix emoji-prefixed README headings
  - Add skill-judge as mandatory end gate in bundled skill workflow

## 0.10.3

### Patch Changes

- Split oversized reference files by category/module into subdirectories

  When rendered content exceeds the token budget and items have @category
  or sourceModule grouping, emit one reference file per group in
  references/<kind>/<group>.md instead of truncating into one file.

## 0.10.2

### Patch Changes

- Aggregate @useWhen/@avoidWhen/@pitfalls from classes, not just functions. Added tags field to ExtractedClass.

## 0.10.1

### Patch Changes

- Cap inline config surfaces at 5 in SKILL.md — large projects render a summary list

## 0.10.0

### Minor Changes

- Markdown & Docusaurus docs extraction
  - Generalized markdown doc parser (parseMarkdownDoc) with frontmatter, sections, code blocks
  - Docs directory scanner (scanDocs) with sidebar_position/filename-prefix ordering
  - Documentation section in SKILL.md listing available doc pages
  - @to-skills/docusaurus package: Docusaurus adapter with _category_.json support
  - TypeDoc plugin: skillsIncludeDocs + skillsDocsDir options for opt-in docs scanning

## 0.9.0

### Minor Changes

- CLI & config surface extraction
  - ExtractedConfigSurface types and config renderer in core
  - @config tag and *Options/*Config suffix detection in TypeDoc extractor
  - New @to-skills/cli package: commander introspection, --help parser, flag-to-property correlator
  - Config surfaces render as Commands and Configuration sections in SKILL.md
  - Detailed per-option documentation in references/commands.md and references/config.md

## 0.8.0

### Minor Changes

- JSDoc tag conventions for skill-judge compliance
  - Extract and render @useWhen, @avoidWhen, @pitfalls custom tags into SKILL.md sections
  - Extract @remarks for expert knowledge in references
  - @category-based grouping (overrides filename-derived sourceModule)
  - W7-W11 audit checks for tag presence
  - Bundled skill updated with tag documentation and examples
  - Projected skill-judge score: F (~42) → C+ (~94) with full adoption

## 0.7.0

### Minor Changes

- Add documentation audit engine with 20 checks, README parser, and bundled Claude Code skill
  - 20 audit checks across 4 severity levels (fatal/error/warning/alert)
  - README parser extracts blockquote, first paragraph, Quick Start, Features, Pitfalls
  - Human-readable and JSON audit output formatters
  - Audit runs automatically during `pnpm typedoc` (configurable via skillsAudit option)
  - 3 new TypeDoc options: skillsAudit, skillsAuditFailOnError, skillsAuditJson
  - Bundled `to-skills-docs` Claude Code skill for convention documentation and fix-it workflow

## 0.6.0

### Minor Changes

- Skill quality improvements: contextual descriptions, module-grouped references, empty description suppression, submodule flattening
  - SKILL.md description answers "what does this library do" instead of listing function names
  - When to Use shows keyword-based context instead of tautological "Calling fn()"
  - Quick Reference and references grouped by source module
  - Quick Start example in SKILL.md from module-level @example
  - Empty description trailing dashes suppressed
  - Nested submodule children flattened during extraction
  - sourceModule field on all extracted items for grouping
  - packageDescription from package.json flows through to SKILL.md

## 0.5.0

### Minor Changes

- Improve extraction coverage and rendering quality
  - Extract and render interface properties in types reference (previously empty for interfaces)
  - Extract and render variables/constants (previously silently dropped)
  - Extract and render function overloads (previously only first signature)
  - Render @deprecated, @since, @throws, @see tags in function references
  - Extract @returns prose descriptions
  - Extract class inheritance (extends/implements)

## 0.4.2

### Patch Changes

- Restore tsgo as build compiler, add types: ["node"] to tsconfig

## 0.4.1

### Patch Changes

- Fix skill name generation for PascalCase/camelCase module names

  toSkillName now converts camelCase/PascalCase to kebab-case before
  lowercasing. JsonSchema → json-schema, ZodBuilder → zod-builder.

## 0.4.0

### Minor Changes

- Progressive disclosure: SKILL.md is now a lean discovery document, with full API details in references/

  Skills now generate a file tree instead of a single monolithic file:
  - `SKILL.md` — frontmatter, overview, when-to-use, quick reference (~500 tokens)
  - `references/functions.md` — full function signatures, params, examples
  - `references/classes.md` — class details with constructors, methods, properties
  - `references/types.md` — type definitions and enums
  - `references/examples.md` — usage examples

  Agents load SKILL.md first (cheap), then fetch references on demand.

## 0.3.1

### Patch Changes

- Fix skill name derivation — prefer package.json name over TypeDoc project name, fix CI build order

## 0.3.0

### Minor Changes

- Enrich skills with package.json metadata and TypeDoc projectDocuments
  - Extract keywords, repository URL, author from package.json
  - Keywords incorporated into skill description triggers
  - Repository and author rendered as Links section
  - projectDocuments content merged into skill body
  - Added ExtractedDocument type for hand-written documentation

## 0.2.0

### Minor Changes

- Initial release of @to-skills/core — shared types, SKILL.md renderer, llms.txt renderer, and token budgeting for the to-skills plugin ecosystem.
