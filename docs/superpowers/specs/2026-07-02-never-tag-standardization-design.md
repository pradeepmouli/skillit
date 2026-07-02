# Standardize on `@never`, close skillit#87 — Design

## Problem

Two source types in skillit use two different author-facing JSDoc tag names for the exact same generated output (the `## NEVER` section):

- **TypeDoc-sourced (library) skills** — author writes `@never` on an exported symbol. `packages/typedoc/src/extractor.ts` reads it via `comment.getTag('@never')`, stores it internally as the `pitfalls` field, and `renderNeverRules()` in `packages/core/src/renderer.ts` renders `skill.pitfalls` as `## NEVER`.
- **CLI-sourced skills** — the internal field is the same (`pitfalls` → `## NEVER`), but the author-facing tag name is `@pitfalls`, not `@never`. `RefineTag` (`packages/core/src/refine/types.ts`) — the tag vocabulary `readJsDocTags` actually parses — is `'useWhen' | 'avoidWhen' | 'pitfalls' | 'remarks' | 'example'`. There is no `@never` in this list.

skillit's own bundled guidance for CLI authors, `packages/cli/skills/skillit-cli-docs/SKILL.md`, is internally self-contradictory: its prose says the routing tags are `` `@useWhen`, `@avoidWhen`, `@pitfalls` ``, but the code example directly below it shows `@never` instead of `@pitfalls`.

Any CLI author who follows that example literally — which is exactly what `lspeasy`'s `@lsproxy/cli` authors did (their `KNOWN_ISSUES.md` calls it "the `@never` tag (skillit's anti-pattern convention)") — writes a tag `readJsDocTags` doesn't recognize. This isn't merely dropped silently: tracing the parser (`packages/core/src/refine/ast-edit.ts:335-344`), an unrecognized `@tag` line doesn't start a new capture — it gets appended as a **continuation of whatever the previous recognized tag was** (e.g., glommed onto the end of `@avoidWhen`'s text), silently corrupting that tag's content too.

Separately, and independently confirmed by baselining `lspeasy`'s generated `lsproxy-cli` skill (skill-judge score: 55/120, F — zero `## NEVER` section despite the author having written `@never`-tagged interfaces): `generateCliSkill` (`packages/client/src/generate.ts`, the `skillit gen --source cli` path) calls `extractCliSkill` directly with **no** `configSurfaces` at all. `CliRefineSource` (`packages/cli/src/refine-source.ts`, the `skillit refine --source cli` path) already solves this correctly — it reads the consumer's TS source via a glob, matches `<Command>Options`/`<Command>Opts`/`<Command>CommandOpts` interfaces, and builds `configSurfaces` before calling `extractCliSkill`. `gen` and `refine` are asymmetric: only `refine` correlates JSDoc onto the generated skill. This is filed upstream as [pradeepmouli/skillit#87](https://github.com/pradeepmouli/skillit/issues/87).

Fixing #87 alone (wiring `configSurfaces` into `generateCliSkill`) without also fixing the tag-name contradiction would leave the bug half-fixed for anyone following the documented `@never` convention — the correlation would run, but still fail to recognize `@never`-tagged interfaces.

## Goals

1. One JSDoc tag name, `@never`, for anti-pattern content — for every source type (TypeDoc, CLI, MCP), and consistently in every doc/comment that references it.
2. `skillit gen --source cli` produces the same JSDoc-correlated output `skillit refine --source cli` does.

## Non-goals

- The `references/commands.md` truncation/duplication bug observed in `lspeasy`'s generated skill (SKILL.md inline-dumps almost the entire command tree despite a `references/` dir existing) — separate issue. Check after this ships whether it's already fixed on `@skillit/core@3.0.0` (the workaround comment in `lspeasy`'s `gen-skill.ts` cites `@skillit/core@1.5.0`).
- The `lsproxy`/`lspeasy` monorepo cross-package reference-resolution gap (diagnosed and logged in `lspeasy/KNOWN_ISSUES.md` during this investigation) — separate, deferred follow-up in the `lspeasy` repo.
- Migrating `lspeasy`'s `apps/cli` off its custom `gen-skill.ts`/`skillit-postinstall.cjs` scripts, and adding skill generation to `packages/core` — separate follow-up work in the `lspeasy` repo, sequenced after this ships and publishes.

## Design

### 1. Rename `RefineTag`'s `'pitfalls'` member to `'never'`

`packages/core/src/refine/types.ts`:

```ts
export type RefineTag = 'useWhen' | 'avoidWhen' | 'never' | 'remarks' | 'example';
```

This one change is sufficient to make `@never` the recognized JSDoc tag for CLI-sourced skills, because `readJsDocTags` (`packages/core/src/refine/ast-edit.ts`) matches a JSDoc line's tag name (`tagMatch[1]`) directly against `RefineTag`'s values — there's no separate string-literal mapping layer to update.

Every place that keys into `Partial<Record<RefineTag, ...>>` with `'pitfalls'` (e.g., `readTagsAcross` in `packages/cli/src/refine-source.ts`, `tags.pitfalls` accesses) must be updated to `'never'`/`.never` in the same pass, since `RefineTag` is a discriminated string union, not a separate alias.

### 2. Rename the IR fields that hold the collected content

`packages/core/src/types.ts`:

- `ExtractedConfigSurface.pitfalls?: string[]` → `.never?: string[]`
- `ExtractedSkill.pitfalls?: string[]` → `.never?: string[]`

Consumers to update: `packages/core/src/renderer.ts` (`renderNeverRules`), `packages/core/src/audit.ts` (W9 check + any `skill.pitfalls`/`configSurface.pitfalls` reads), `packages/core/src/audit-score.ts`, `packages/core/src/config-extract.ts`, `packages/core/src/config-renderer.ts`, `packages/core/src/config-types.ts`, `packages/core/src/refine/select-targets.ts`, `packages/core/src/refine/config-source.ts`, `packages/core/src/refine/loop.ts`, `packages/typedoc/src/extractor.ts`, `packages/typedoc/src/plugin.ts`, `packages/cli/src/correlator.ts`, `packages/cli/src/refine-source.ts`, `packages/cli/src/options-jsdoc.ts`, `packages/client/src/commands/refine.ts`, and every file under `packages/mcp/src` that touches `pitfalls` (see #3).

Doc comments that describe the JSDoc surface (e.g., "Mirrors the `@never` JSDoc pattern" in `config-types.ts`, "You want JSDoc `@useWhen`/`@avoidWhen`/`@never` tags..." in `correlator.ts`) already say `@never` — leave those as confirmation the rename is correct; only field-name references (`.pitfalls`) need changing.

### 3. Rename MCP's flat wire convention

`_meta.pitfalls` → `_meta.never`, matching the same treatment given to `_meta.toSkills` earlier in this session (pre-1.0 ecosystem, no known third-party servers depend on the old name yet).

Files: `ExtractedFunctionMcpMetadata`'s nested type (in `packages/core/src/types.ts`), `packages/mcp/src/introspect/tools.ts` (`readToolMetadata`'s flat-field list and `hasMetaSkillit` marker construction — no change needed there, just the `pitfalls` key itself), `packages/mcp/src/extract.ts`, `packages/mcp/src/refine/runtime/merge-overlay.ts`, `packages/mcp/src/refine/runtime/overlay.ts` (`OverlayAnnotations.pitfalls`), `packages/mcp/src/audit/rule-m3.ts` if it reads `.pitfalls`.

Also update `packages/mcp/skills/skillit-mcp-docs/SKILL.md` if it mentions `pitfalls` as a `_meta` field name (it currently lists `useWhen`, `avoidWhen`, `pitfalls`, `remarks`, `example` as the flat fields — change to `never`).

### 4. Fix the self-contradictory bundled doc

`packages/cli/skills/skillit-cli-docs/SKILL.md` — change the prose line from:

> For routing tags (`@useWhen`, `@avoidWhen`, `@pitfalls`), add them...

to:

> For routing tags (`@useWhen`, `@avoidWhen`, `@never`), add them...

The code example already shows `@never` — no change needed there. Now prose and example agree.

### 5. Close #87 — wire `configSurfaces` into `generateCliSkill`

Extract `CliRefineSource`'s correlation logic — `interfaceNameCandidates()`, `readTagsAcross()`, `readSources()`, and the module-level `fileDeclaresInterface()` helper (`packages/cli/src/refine-source.ts`) — into a standalone exported function in `packages/cli/src`, e.g.:

```ts
export async function correlateConfigSurfaces(
  surfaces: readonly { name: string }[],
  sourceGlob: string
): Promise<ExtractedConfigSurface[]>;
```

`CliRefineSource.extract()` calls this new function instead of duplicating the logic inline. `generateCliSkill` (`packages/client/src/generate.ts`) calls it too, right after `introspectCommander`/`loadProgram` produces the surfaces and before `extractCliSkill`, using the same default glob `refine` already uses: `sourceGlob = join(cwd, '**', '*.ts')`. No new required CLI flag — this matches `refine`'s existing default-with-no-required-input behavior. (A future `--source-glob` override for `gen --source cli`, mirroring `refine`'s `--source-glob`, is a reasonable follow-up but not required to close #87 — YAGNI for this spec.)

## Rename mechanics

`lsproxy` (this repo's own dogfood target — see the parallel `lspeasy`/`sittir` investigation) reliably resolves same-package cross-file references: a dry-run rename of `ExtractedSkill.pitfalls` found `types.ts` (declaration) + `audit.ts` + `renderer.ts`, identical cold vs. warm, all within `packages/core`. It does **not** reach cross-package usages (`packages/typedoc`, `packages/cli`, `packages/mcp`, `packages/client` consuming `@skillit/core` via a workspace-symlinked `node_modules` dependency) — a diagnosed, structural tsserver limitation (no composite `tsconfig` project references connecting the packages), now logged in `lspeasy/KNOWN_ISSUES.md` as a separate follow-up.

Procedure: run `lsproxy textDocument rename --dry-run` per rename target to capture the same-package edits, apply them, then hand-patch the remaining cross-package files using the pre-mapped file list (`packages/typedoc/src/extractor.ts`, `packages/typedoc/src/plugin.ts`, `packages/cli/src/*.ts`, `packages/mcp/src/**/*.ts`, `packages/client/src/commands/refine.ts`, plus every `*.test.ts` file referencing `pitfalls`). `pnpm build && pnpm test` is the completeness gate — a missed rename surfaces as a TS type error (strict mode, no `any`), not a silent gap.

## Testing

- Existing test suite already exercises every renamed field (renderer tests, audit tests, extract tests across typedoc/cli/mcp, refine-loop tests) — a full green build+test run after the rename is the primary verification that nothing was missed.
- **New regression test for #87**: assert that `generateCliSkill` produces a `## NEVER` section in its output when the consumer's TS source (via `sourceGlob`) contains a `@never`-tagged `<Command>Options` interface matching a command in the program. This is the test that would have caught #87 originally, and the one that proves the fix.
- Update `packages/mcp/skills/skillit-mcp-docs/SKILL.md`'s own worked example if it lists `pitfalls` as a flat `_meta` field name.

## Changeset

- `@skillit/core`: **major** — renamed public type fields (`ExtractedConfigSurface.pitfalls`/`ExtractedSkill.pitfalls` → `.never`) and the `RefineTag` union member; both are consumer-visible breaking changes.
- `@skillit/mcp`: **major** — the `_meta.pitfalls` → `_meta.never` wire convention rename breaks any third-party MCP server already annotating with the old key.
- `@skillit/cli`: **minor** — inherits the field rename transitively (breaking in principle, but pre-1.0 ecosystem with no known external consumers of the renamed CLI-specific surfaces beyond what core/mcp already cover) and gains the new `configSurfaces` correlation in `generateCliSkill`.
- `@skillit/client`: **minor** — `skillit gen --source cli` now produces JSDoc-correlated `## NEVER` output it didn't before; net-new user-visible behavior, not a removal.
- `@skillit/typedoc`, `@skillit/typedoc-plugin`, `@skillit/vitepress`, `@skillit/docusaurus`: **patch** — unaffected functionally; only pass through the renamed internal field.
