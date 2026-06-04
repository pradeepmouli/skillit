# Refine Multi-Source + `init` + AST-based Editing Design

**Date:** 2026-06-03
**Status:** Approved (design)
**Scope:** CLI-first. Core guidance-injection and the shared AST-edit utility are source-agnostic; the CLI source is the implemented write-back path this pass. TypeDoc and MCP participate in detection and reuse existing write-back. The MCP string-surgery → AST migration is a fast-follow.

## Goal

Make `to-skills refine` work for CLI- and TypeDoc-generated skills — not just MCP — add a `to-skills init` command that bootstraps the correct `@to-skills/*` package, generates the initial skill into a top-level `skills/` directory, then runs `refine`; and replace the fragile regex/string-surgery editing with a real AST engine (`@ast-grep/napi`). The agent eval loop consumes each source's **bundled guidance skill** as its rubric.

## Background — current state

- `refineSkill` (`@to-skills/core`) and the `RefineSource` / `ModelClient` interfaces are **already source-agnostic**: the loop audits → drafts → reviews → applies fixes without knowing the source kind.
- Write-back machinery exists per source: **MCP** `_meta`/overlay (`McpRefineSource`, `TypeScriptMcpRefineSource`); **TypeDoc** JSDoc via `insertJsDocTag` (`TypeDocRefineSource`).
- All current editing/discovery is **regex + character-offset string surgery** — `jsdoc-edit.ts` (61 lines), `meta-edit.ts` (277), `tool-discovery.ts` (140). This is the code that needed ~7 rounds of PR-review edge-case fixes (comments, template literals, trailing commas, brace counting).
- Gaps: (1) `refine` CLI is hardwired to MCP (`--mcp` required); (2) no `CliRefineSource`; (3) no guidance fed to the model; (4) no `init` command.
- Each package ships a **bundled guidance skill**: `to-skills-cli-docs`, `to-skills-docs` (JSDoc), `to-skills-mcp-docs`.

## Design principle — bundled guidance is the rubric

A source's bundled guidance skill drives **both**:

1. **What the eval loop optimizes toward** — injected into the drafter/reviewer prompts.
2. **Where annotations are written** — the CLI rubric (`to-skills-cli-docs`) says CLI docs live in `.description()`/`.option()` text and **config-surface JSDoc correlation**, so routing tags (`@useWhen`/`@avoidWhen`) are written as JSDoc on the correlated `*Options` interface.

## AST engine — `@ast-grep/napi`

A new shared dependency. All structural discovery and edits go through it instead of regex/offset surgery:

- **Parse**: `parse(Lang.TypeScript, source).root()` (`Lang.Tsx` for `.tsx`).
- **Discover**: `root.findAll('server.tool($NAME, $OPTS, $$$REST)')` — a real parser never matches inside comments, strings, or template literals, so `sanitizeComments`, word-boundary regexes, and brace-counting all disappear.
- **Edit**: `node.replace(text)` returns an `Edit` (byte offsets); `root.commitEdits(edits)` returns the new source. Insertions are computed from real `node.range()` offsets, not hand-rolled scanning.

### Shared core utility — `@to-skills/core` `refine/ast-edit.ts`

A small module wrapping `@ast-grep/napi` with the primitives every source needs:

- `upsertJsDocTag(source, declName, tag, value): string` — find the declaration (`interface`/`function`/`class`/`const` named `declName`), locate its leading `comment` trivia; merge the tag into an existing JSDoc block or insert a new `/** … */` before the declaration. **`insertJsDocTag` is reimplemented on top of this**, preserving its current public signature so `TypeDocRefineSource` and the new `CliRefineSource` share one code path (DRY).
- `findCall(source, pattern)` / `upsertObjectProperty(objNode, key, valueText)` — call + object-literal primitives that the **MCP follow-up** will use to replace `tool-discovery.ts` and `meta-edit.ts`.

`@ast-grep/napi` is a native (NAPI) module: confine all imports to this one core module so other packages depend on the wrapper, not the binding directly.

## Architecture

### A. Guidance injection (`@to-skills/core`) — source-agnostic

- Extend `RefineSource` with optional `guidance?(): string | Promise<string>` returning the bundled guidance markdown.
- Add optional `guidance?: string` to `DraftRequest` and `ReviewRequest`.
- `refineSkill` resolves `source.guidance?.()` **once** per run and threads it into every request.
- `AnthropicModelClient` includes guidance verbatim in the drafter/reviewer system prompts under a delimited "Conventions" section. Absent guidance → unchanged behavior.

### B. CLI source (`@to-skills/cli`) — `CliRefineSource implements RefineSource`

- **`extract()`**: load the consumer's commander program (see _Program loading_), run `extractCliSkill({ program, configSurfaces })`.
- **`guidance()`**: return the bundled `to-skills-cli-docs` SKILL.md body (same loader as `writeCliSkill`'s `loadBundledCliGuidanceSkill`).
- **`applyFixes(fixes)`**: resolve each command/option to its correlated `*Options` interface declaration and write the tag via the shared `upsertJsDocTag`. Unresolved targets are skipped with a stderr warning naming the command/tag (no silent drop).
- **`auditContext()`**: `{}` initially (parity with `TypeDocRefineSource`).

**Program loading — auto-find + `--program` override:**

1. `--program <file#export>` given → import that module, use the named export (a `Command` or a zero-arg factory returning one). TS source runs via the consumer repo's runner (`tsx`); the loader does not bundle one.
2. Otherwise auto-find: read `package.json` `bin`, import it, look for `buildProgram` / `createProgram` / `program` / default export. If the bin only self-executes, fail with an actionable message naming the `--program file#export` form.

**`*Options` interface resolution:** `extractCliSkill` already correlates a CLI surface to a `<command>Options` config surface (`correlateFlags`), giving the interface **name**. The interface **file** is found by an ast-grep scan over a `--source-glob` (default `**/*.ts`, excluding `node_modules`/`dist`/`*.d.ts`). `upsertJsDocTag` writes onto that declaration. No correlated interface → command's fixes skipped with a logged warning.

### C. `refine` source detection + `--source` (`@to-skills/client`)

- Detect from **installed** `@to-skills/*` packages in consumer `package.json` (deps+devDeps): `@to-skills/cli`→`cli`, `@to-skills/mcp`→`mcp`, `typedoc-plugin-to-skills`/`@to-skills/typedoc`→`typedoc`.
- `--source cli|typedoc|mcp` overrides. Ambiguous (multiple, no `--source`) → exit 1 listing candidates + the `--source` form.
- Existing MCP flags remain; CLI adds `--program`, `--source-glob`; flags validated per resolved source.

### D. `init` command (`@to-skills/client`)

`to-skills init [--source <kind>] [--program <file#export>] [--out skills]`

1. **Detect project nature** from `package.json` + source (independent of whether a `@to-skills/*` pkg is installed): commander/yargs dep or loadable `bin` → **cli**; `@modelcontextprotocol/sdk` → **mcp**; otherwise TS library → **typedoc**. `--source` overrides; genuinely ambiguous → abort with guidance.
2. **Install** the matching package: detect the package manager (`pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, else npm) and run its add-dev command. Failure surfaces the command and stops.
3. **Generate** the initial skill into top-level **`skills/<name>/`** (`<name>` from `package.json`).
4. **Invoke `refine`** for the detected source.

`init` generalizes the manual `gen-cli-skill` bootstrap scripts written during dogfooding.

## Components & files

| Package                     | Add / change                                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@to-skills/core`           | `refine/ast-edit.ts` (ast-grep wrapper: `upsertJsDocTag`, `findCall`, `upsertObjectProperty`); reimplement `insertJsDocTag` on it; `RefineSource.guidance?()`; `guidance?` on `DraftRequest`/`ReviewRequest`; `refineSkill` threads guidance. New dep `@ast-grep/napi`. |
| `@to-skills/cli`            | `CliRefineSource`; program loader (`--program` + auto-find); `*Options` interface locator (via core util)                                                                                                                                                               |
| `@to-skills/client`         | `init` command; `refine` source detection + `--source`; per-source flag validation                                                                                                                                                                                      |
| `@to-skills/client` (model) | `AnthropicModelClient` prompts include guidance                                                                                                                                                                                                                         |

## Data flow (CLI refine)

```
init/refine → detect source (installed pkgs) → CliRefineSource
  → extract(): load program (auto-find|--program) → extractCliSkill → ExtractedSkill
  → refineSkill loop:
      guidance = source.guidance()             // to-skills-cli-docs body, resolved once
      per item: model.draft({…, guidance}) → model.review({…, guidance})
      applyFixes(): resolve command→*Options interface → core upsertJsDocTag (ast-grep)
  → re-extract, re-score until grade passes or caps hit
output: skills/<name>/   (top-level)
```

## Error handling

- Program not loadable / no usable export → exit 1, message naming `--program file#export`.
- Fix target unresolved (no correlated `*Options` interface, or declaration not found in glob) → skip that fix, log a stderr warning naming command/tag. Never silently drop.
- Ambiguous source detection → exit 1 listing candidates + `--source`.
- `init` install failure → surface the exact command and stop before generate/refine.
- Missing `ANTHROPIC_API_KEY` → existing behavior preserved.

## Testing

- **core/ast-edit**: `upsertJsDocTag` inserts a new JSDoc block, merges a tag into an existing block, and replaces an existing tag value — across declarations preceded by comments, decorators, and other trivia (the cases that broke the regex version). `insertJsDocTag` keeps its existing test suite green (behavior-preserving reimplementation).
- **core/loop**: `refineSkill` threads `guidance` into draft/review when `source.guidance()` is set; no-op when absent.
- **cli**: `CliRefineSource.extract()` against a fixture commander program; `applyFixes()` writes `@useWhen` onto a fixture `*Options` interface; unresolved fix logs + skips; program loader resolves `--program file#export` and auto-finds from a fixture `bin`.
- **client**: source detection per single-package case + ambiguous; `--source` override; `init` package-manager detection with the install command stubbed; per-source flag validation.
- **model**: `AnthropicModelClient` includes guidance text in constructed prompts (assert on messages, not a live call).

## Scope & sequencing

- **This pass (CLI-first):** `@ast-grep/napi` + shared `ast-edit.ts`; reimplement `insertJsDocTag` on it; core guidance injection; `CliRefineSource`; `refine` detection + `--source`; `init` for the CLI path.
- **Reused as-is:** MCP write-back, `TypeDocRefineSource` write-back (now via the AST-based `insertJsDocTag`).
- **Fast-follow:** migrate `meta-edit.ts` + `tool-discovery.ts` to `findCall`/`upsertObjectProperty` (retire `sanitizeComments` and brace-counting); TypeDoc extraction wiring for `refine typedoc` + `init typedoc`/`init mcp` generate steps.

## Dependencies

- New runtime dep: `@ast-grep/napi` (NAPI native module), isolated to `@to-skills/core`'s `ast-edit.ts`.
- Builds on the `introspectCommander` `required`-vs-`mandatory` fix (PR #51). Rebase this branch onto master once #51 merges.

## Non-goals

- Refining non-routing content (descriptions, examples) — limited to the existing `RefineTag` set.
- A standalone `refine` runner that bundles `tsx`/a TS loader — program loading relies on the consumer repo's runner.
- Changing the loop's stop conditions or scoring.
- Migrating MCP `meta-edit`/`tool-discovery` in this pass (fast-follow).
