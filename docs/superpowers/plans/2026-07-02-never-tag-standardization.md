# Standardize on `@never`, close skillit#87 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `pitfalls` JSDoc tag/field family to `never` everywhere in skillit (JSDoc tag name, `RefineTag` enum, IR fields, MCP wire convention), fix skillit's own self-contradictory bundled docs, and wire `configSurfaces` correlation into `generateCliSkill` so `skillit gen --source cli` produces the same `## NEVER` output `skillit refine --source cli` already does (closing [pradeepmouli/skillit#87](https://github.com/pradeepmouli/skillit/issues/87)).

**Architecture:** This is primarily a rename across a strict-TypeScript codebase — the compiler is the exhaustiveness check for every typed property access. Rename the type declarations first, then run `pnpm run type-check` repeatedly and fix every reported error using the mechanical rule `pitfalls → never` (as identifier, property key, or type-checked string literal). A `rg` sweep catches string literals and markdown docs the compiler can't see. The final task extracts shared JSDoc-correlation logic and wires it into the previously-broken code path.

**Tech Stack:** TypeScript 5 (strict, no `any`), pnpm workspaces, Vitest, oxlint/oxfmt, changesets. LSP-driven rename via `lsproxy` (globally installed, config at `~/.claude/lsp.json`) for same-package edits.

## Global Constraints

- TypeScript strict mode, no `any` — every rename must type-check clean, not just compile with casts.
- `pnpm run build && pnpm test` must be fully green before any task is considered done.
- Do not touch: the `references/commands.md` truncation bug, the lsproxy monorepo cross-package reference gap, or any `lspeasy` repo changes — all out of scope for this plan.
- Commit after each task.

---

### Task 1: Rename `RefineTag`'s `'pitfalls'` member to `'never'`

**Files:**

- Modify: `packages/core/src/refine/types.ts:4`
- Modify (compiler-driven fixes): `packages/core/src/refine/ast-edit.ts`, `packages/core/src/refine/select-targets.ts`, `packages/core/src/refine/config-source.ts`, `packages/core/src/refine/loop.ts`, `packages/cli/src/options-jsdoc.ts`, `packages/cli/src/refine-source.ts`, `packages/cli/src/correlator.ts`, `packages/client/src/commands/refine.ts`
- Test (compiler-driven fixes): `packages/core/src/refine/__tests__/ast-edit.test.ts`, `packages/core/src/refine/__tests__/select-targets.test.ts`, `packages/core/src/refine/__tests__/config-source.test.ts`

**Interfaces:**

- Produces: `RefineTag = 'useWhen' | 'avoidWhen' | 'never' | 'remarks' | 'example'` — every later task's `readJsDocTags`/`readOptionsTags` calls rely on this union including `'never'`.

- [ ] **Step 1: Rename the `RefineTag` union member**

In `packages/core/src/refine/types.ts`, change line 4 from:

```ts
export type RefineTag = 'useWhen' | 'avoidWhen' | 'pitfalls' | 'remarks' | 'example';
```

to:

```ts
export type RefineTag = 'useWhen' | 'avoidWhen' | 'never' | 'remarks' | 'example';
```

- [ ] **Step 2: Fix the compile-time exhaustiveness guard in `ast-edit.ts`**

`packages/core/src/refine/ast-edit.ts` has a `REFINE_TAGS` array with a `satisfies readonly RefineTag[]` constraint plus a `MissingTags`/`_exhaustive: never` compile-time check — it is _designed_ to fail to compile the moment `RefineTag` and this array disagree. Change:

```ts
const REFINE_TAGS = [
  'useWhen',
  'avoidWhen',
  'pitfalls',
  'remarks',
  'example'
] as const satisfies readonly RefineTag[];
```

to:

```ts
const REFINE_TAGS = [
  'useWhen',
  'avoidWhen',
  'never',
  'remarks',
  'example'
] as const satisfies readonly RefineTag[];
```

Also check the same file for any other bare `'pitfalls'` string literal (e.g., in a comment like `` `@pitfalls` on a wide config surface ``) and update the tag name in prose to `` `@never` `` for consistency — these are documentation comments, not type-checked, so they won't surface as compile errors; find them with:

```bash
rg -n "pitfalls" packages/core/src/refine/ast-edit.ts
```

- [ ] **Step 3: Run type-check and fix every reported error**

```bash
pnpm --filter @skillit/core run type-check 2>&1 | head -100
```

Expected: a list of TS errors, each naming a file from the "Files" list above where a `'pitfalls'` string literal or `.pitfalls` access is no longer assignable to the now-renamed `RefineTag` (or a function parameter typed against it). For each error, apply the mechanical rule: `'pitfalls'` → `'never'` (string literal), `.pitfalls` → `.never` (property access), `tags.pitfalls` → `tags.never` (object key). Concretely, in `packages/core/src/refine/select-targets.ts`, a line reading:

```ts
    'pitfalls',
```

(inside an array literal of tag names) becomes:

```ts
    'never',
```

Re-run the command above after each fix until it exits clean (no output, exit code 0).

- [ ] **Step 4: Repeat for `@skillit/cli` and `@skillit/client`**

```bash
pnpm --filter @skillit/cli run type-check 2>&1 | head -100
```

Fix every reported error in `packages/cli/src/options-jsdoc.ts`, `packages/cli/src/refine-source.ts`, `packages/cli/src/correlator.ts` using the same mechanical rule. For example, in `packages/cli/src/refine-source.ts`, the block:

```ts
if (tags.pitfalls !== undefined) {
  configSurface.pitfalls = [tags.pitfalls];
  hasContent = true;
}
```

becomes:

```ts
if (tags.never !== undefined) {
  configSurface.never = [tags.never];
  hasContent = true;
}
```

(Note: `configSurface.pitfalls` here will _also_ need renaming as part of Task 2 below — if Task 2 hasn't landed yet, this specific line will still show a type error until both renames are applied. That's expected; leave it and continue — Task 2 fixes it.)

Then:

```bash
pnpm --filter @skillit/client run type-check 2>&1 | head -100
```

Fix `packages/client/src/commands/refine.ts` similarly. This file also has a doc-comment JSDoc tag on its own exported option type using the old convention:

```ts
 * @pitfalls - **`introspectCommander`** — Never pass a Commander program before its subcommands have been registered; the result will be an empty array with no warning, silently producing a skill with no commands.
```

Change the tag name (not the content) to:

```ts
 * @never - **`introspectCommander`** — Never pass a Commander program before its subcommands have been registered; the result will be an empty array with no warning, silently producing a skill with no commands.
```

- [ ] **Step 5: Fix the test files**

```bash
pnpm --filter @skillit/core exec vitest run src/refine/__tests__/ast-edit.test.ts src/refine/__tests__/select-targets.test.ts src/refine/__tests__/config-source.test.ts 2>&1 | tail -60
```

Expected initially: failures or type errors referencing `'pitfalls'`/`.pitfalls`. Open each failing test and apply the same mechanical rule to test fixtures and assertions (e.g., `expect(tags.pitfalls).toBe(...)` → `expect(tags.never).toBe(...)`, JSDoc comment fixtures like `` `@pitfalls foo` `` inside test source strings → `` `@never foo` ``). Re-run until all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/refine packages/cli/src/options-jsdoc.ts packages/cli/src/refine-source.ts packages/cli/src/correlator.ts packages/client/src/commands/refine.ts
git commit -m "refactor(core): rename RefineTag 'pitfalls' member to 'never'"
```

---

### Task 2: Rename `ExtractedConfigSurface.pitfalls`, `ExtractedConfigOption.pitfalls`, and `ExtractedSkill.pitfalls` to `.never`

**Files:**

- Modify: `packages/core/src/config-types.ts:58` (`ExtractedConfigSurface.pitfalls`), `packages/core/src/config-types.ts:139` (`ExtractedConfigOption.pitfalls`)
- Modify: `packages/core/src/types.ts:80` (`ExtractedSkill.pitfalls`)
- Modify (compiler-driven fixes): `packages/core/src/renderer.ts`, `packages/core/src/audit.ts`, `packages/core/src/audit-score.ts`, `packages/core/src/config-extract.ts`, `packages/core/src/config-renderer.ts`, `packages/typedoc/src/extractor.ts`, `packages/typedoc/src/plugin.ts`
- Test (compiler-driven fixes): `packages/core/src/__tests__/config-extract.test.ts`

**Interfaces:**

- Consumes: `RefineTag` from Task 1 (already includes `'never'`).
- Produces: `ExtractedSkill.never?: string[]`, `ExtractedConfigSurface.never?: string[]`, `ExtractedConfigOption.never?: string[]` — consumed by `renderNeverRules()` (Task 2 itself) and by Task 6's new `correlateConfigSurfaces` helper.

- [ ] **Step 1: Rename the three IR field declarations**

In `packages/core/src/config-types.ts`, change (line 54-58):

```ts
  /**
   * Known pitfalls, footguns, or common mistakes for this surface.
   * Mirrors the @never JSDoc pattern used elsewhere in ExtractedSkill.
   */
  pitfalls?: string[];
```

to:

```ts
  /**
   * Known pitfalls, footguns, or common mistakes for this surface.
   * Mirrors the @never JSDoc pattern used elsewhere in ExtractedSkill.
   */
  never?: string[];
```

And (line 135-139):

```ts
  /**
   * Known pitfalls or common mistakes when using this option.
   * Mirrors the @never JSDoc pattern.
   */
  pitfalls?: string[];
```

to:

```ts
  /**
   * Known pitfalls or common mistakes when using this option.
   * Mirrors the @never JSDoc pattern.
   */
  never?: string[];
```

In `packages/core/src/types.ts`, change line 79-80:

```ts
  /** Aggregated @never from all exports */
  pitfalls?: string[];
```

to:

```ts
  /** Aggregated @never from all exports */
  never?: string[];
```

- [ ] **Step 2: Fix `renderer.ts`'s `renderNeverRules`**

`packages/core/src/renderer.ts` around line 1335-1341 currently reads:

```ts
function renderNeverRules(skill: ExtractedSkill): string {
  if (!skill.pitfalls || skill.pitfalls.length === 0) return '';
  const lines: string[] = [];
  for (const item of skill.pitfalls) {
    lines.push(`- ${item}`);
  }
  return '## NEVER\n\n' + lines.join('\n');
}
```

Change to:

```ts
function renderNeverRules(skill: ExtractedSkill): string {
  if (!skill.never || skill.never.length === 0) return '';
  const lines: string[] = [];
  for (const item of skill.never) {
    lines.push(`- ${item}`);
  }
  return '## NEVER\n\n' + lines.join('\n');
}
```

- [ ] **Step 3: Run type-check and fix every reported error in `@skillit/core`**

```bash
pnpm --filter @skillit/core run type-check 2>&1 | head -150
```

Fix each error in `packages/core/src/audit.ts`, `packages/core/src/audit-score.ts`, `packages/core/src/config-extract.ts`, `packages/core/src/config-renderer.ts` using the mechanical rule `.pitfalls` → `.never`, `'pitfalls'` → `'never'` (in type-checked positions).

Concrete example — `packages/core/src/audit.ts` around line 603-609, the `hasRoutingTag` helper:

```ts
function hasRoutingTag(skill: ExtractedSkill, tag: 'useWhen' | 'avoidWhen' | 'pitfalls'): boolean {
  if ((skill[tag] ?? []).length > 0) return true;
  return (skill.configSurfaces ?? []).some(
    (surface) =>
      (surface[tag] ?? []).length > 0 ||
      surface.options.some((option) => (option[tag] ?? []).length > 0)
```

becomes:

```ts
function hasRoutingTag(skill: ExtractedSkill, tag: 'useWhen' | 'avoidWhen' | 'never'): boolean {
  if ((skill[tag] ?? []).length > 0) return true;
  return (skill.configSurfaces ?? []).some(
    (surface) =>
      (surface[tag] ?? []).length > 0 ||
      surface.options.some((option) => (option[tag] ?? []).length > 0)
```

And its two call sites in the same file — `hasRoutingTag(skill, 'pitfalls')` → `hasRoutingTag(skill, 'never')`, and `(skill.pitfalls ?? []).length > 0` → `(skill.never ?? []).length > 0` (in `checkW6`).

In `packages/core/src/audit-score.ts`, the `SURFACE_TAGS`/`SurfaceTag` block (around line 276-278):

```ts
const SURFACE_TAGS = new Set(['useWhen', 'avoidWhen', 'pitfalls'] as const);
type SurfaceTag = 'useWhen' | 'avoidWhen' | 'pitfalls';
```

becomes:

```ts
const SURFACE_TAGS = new Set(['useWhen', 'avoidWhen', 'never'] as const);
type SurfaceTag = 'useWhen' | 'avoidWhen' | 'never';
```

Apply the same rename to every other `'useWhen' | 'avoidWhen' | 'pitfalls'` type annotation and `'pitfalls'` literal argument in that file (the `ROUTING` array around line 689-690, `configOptionTargetsForTag`'s parameter type, and the `+8 on D3` suggestion string mentioning `@pitfalls` — change that user-facing message to say `@never` too).

- [ ] **Step 4: Run type-check and fix `@skillit/typedoc`**

```bash
pnpm --filter @skillit/typedoc run type-check 2>&1 | head -100
```

`packages/typedoc/src/extractor.ts` reads the JSDoc tag via `comment?.getTag('@never')` already (line 690, 733) — that string does **not** change (it's the actual TypeDoc tag lookup, already correct). What needs to change is wherever the _result_ gets assigned to an `ExtractedSkill`/`ExtractedConfigSurface` field named `pitfalls`. Find and fix with:

```bash
rg -n "pitfalls" packages/typedoc/src/extractor.ts
```

For each hit that assigns to or reads `.pitfalls` on the IR (not the `getTag('@never')` calls themselves), rename to `.never`.

`packages/typedoc/src/plugin.ts` has three JSDoc comments on its own exported option types using `@pitfalls` as the tag name (skillit dogfoods its own conventions on its own source):

```ts
   * @category Output
   * @pitfalls
   * - NEVER point this inside a tracked source directory (e.g. `src/`) — `skillit gen` rewrites the whole output tree every build and would clobber hand-written files
```

Change each `@pitfalls` tag name (not the bullet content) to `@never`:

```ts
   * @category Output
   * @never
   * - NEVER point this inside a tracked source directory (e.g. `src/`) — `skillit gen` rewrites the whole output tree every build and would clobber hand-written files
```

There are three occurrences in this file (lines ~44, ~56, ~100 as of this writing) — find them all with `rg -n "@pitfalls" packages/typedoc/src/plugin.ts` and fix each.

- [ ] **Step 5: Fix the test file**

```bash
pnpm --filter @skillit/core exec vitest run src/__tests__/config-extract.test.ts 2>&1 | tail -60
```

Apply the mechanical rule to any `.pitfalls` assertions or fixtures. Re-run until green.

- [ ] **Step 6: Full core+typedoc build and test**

```bash
pnpm --filter @skillit/core --filter @skillit/typedoc run build
pnpm --filter @skillit/core --filter @skillit/typedoc exec vitest run
```

Expected: both build clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/typedoc
git commit -m "refactor(core,typedoc): rename ExtractedSkill/ExtractedConfigSurface/ExtractedConfigOption .pitfalls to .never"
```

---

### Task 3: Rename MCP's flat wire convention `_meta.pitfalls` to `_meta.never`

**Files:**

- Modify: `packages/core/src/types.ts` (`ExtractedFunctionMcpMetadata`'s nested `pitfalls` field, around line 328)
- Modify: `packages/mcp/src/introspect/tools.ts`, `packages/mcp/src/extract.ts`, `packages/mcp/src/refine/runtime/merge-overlay.ts`, `packages/mcp/src/refine/runtime/overlay.ts`
- Modify: `packages/mcp/skills/skillit-mcp-docs/SKILL.md`
- Test (compiler-driven fixes): `packages/mcp/src/refine/__tests__/mcp-source.test.ts`, `packages/mcp/src/refine/__tests__/merge-overlay.test.ts`

**Interfaces:**

- Consumes: `ExtractedSkill.never`/`ExtractedConfigSurface.never` from Task 2.
- Produces: `ExtractedFunctionMcpMetadata.skillit.never?: readonly string[]` — the flat MCP `_meta` field name authors write is `never` (unchanged from before this task in the sense that it was never `never` before; this is the actual rename target).

- [ ] **Step 1: Rename the nested type field**

`packages/core/src/types.ts` around line 323-330:

```ts
export interface ExtractedFunctionMcpMetadata {
  /** Structured metadata extracted from flat `_meta` MCP tool annotations. */
  readonly skillit?: {
    readonly useWhen?: readonly string[];
    readonly avoidWhen?: readonly string[];
    readonly pitfalls?: readonly string[];
    readonly malformedReason?: string;
  };
```

becomes:

```ts
export interface ExtractedFunctionMcpMetadata {
  /** Structured metadata extracted from flat `_meta` MCP tool annotations. */
  readonly skillit?: {
    readonly useWhen?: readonly string[];
    readonly avoidWhen?: readonly string[];
    readonly never?: readonly string[];
    readonly malformedReason?: string;
  };
```

- [ ] **Step 2: Run type-check and fix `@skillit/mcp`**

```bash
pnpm --filter @skillit/mcp run type-check 2>&1 | head -150
```

Fix `packages/mcp/src/introspect/tools.ts` — the `readToolMetadata` function's tag list:

```ts
  for (const key of ['useWhen', 'avoidWhen', 'pitfalls', 'remarks', 'example'] as const) {
```

becomes:

```ts
  for (const key of ['useWhen', 'avoidWhen', 'never', 'remarks', 'example'] as const) {
```

Fix `packages/mcp/src/extract.ts` — the `collectMetaEnrichment` function. Its return type annotation:

```ts
): Pick<ExtractedSkill, 'avoidWhen' | 'packageDescription' | 'pitfalls' | 'remarks' | 'useWhen'> {
  const enrichment: Pick<
    ExtractedSkill,
    'avoidWhen' | 'packageDescription' | 'pitfalls' | 'remarks' | 'useWhen'
  > = {};
```

becomes:

```ts
): Pick<ExtractedSkill, 'avoidWhen' | 'never' | 'packageDescription' | 'remarks' | 'useWhen'> {
  const enrichment: Pick<
    ExtractedSkill,
    'avoidWhen' | 'never' | 'packageDescription' | 'remarks' | 'useWhen'
  > = {};
```

And later in the same function:

```ts
const useWhen: string[] = [];
const avoidWhen: string[] = [];
const pitfalls: string[] = [];
```

becomes:

```ts
const useWhen: string[] = [];
const avoidWhen: string[] = [];
const never: string[] = [];
```

```ts
const serverPitfalls = serverMeta['pitfalls'];
if (typeof serverPitfalls === 'string' && serverPitfalls.trim()) {
  pitfalls.push(serverPitfalls);
}
```

becomes:

```ts
const serverNever = serverMeta['never'];
if (typeof serverNever === 'string' && serverNever.trim()) {
  never.push(serverNever);
}
```

```ts
pushLines(pitfalls, fn.mcpMetadata?.skillit?.pitfalls, fn.tags['pitfalls']);
```

becomes:

```ts
pushLines(never, fn.mcpMetadata?.skillit?.never, fn.tags['never']);
```

```ts
if (pitfalls.length > 0) enrichment.pitfalls = pitfalls;
```

becomes:

```ts
if (never.length > 0) enrichment.never = never;
```

Also update the doc comments in this file that reference `_meta.{useWhen, avoidWhen, pitfalls, remarks, packageDescription}` and `` `pitfalls: string` → seeds `skill.pitfalls` `` and `` `fn.mcpMetadata.skillit.{useWhen,avoidWhen,pitfalls}` `` — change each `pitfalls`/`.pitfalls` mention to `never`/`.never`. Find them with `rg -n "pitfalls" packages/mcp/src/extract.ts` and fix every remaining hit.

Fix `packages/mcp/src/refine/runtime/merge-overlay.ts` and `packages/mcp/src/refine/runtime/overlay.ts` (the `OverlayAnnotations.pitfalls` field and its usages) with the same mechanical rule.

- [ ] **Step 3: Fix the bundled `skillit-mcp-docs` skill's worked example**

`packages/mcp/skills/skillit-mcp-docs/SKILL.md` currently lists (from an earlier fix this session):

```
- Flat `_meta` string fields — `useWhen`, `avoidWhen`, `pitfalls`, `remarks`, `example`
```

Change to:

```
- Flat `_meta` string fields — `useWhen`, `avoidWhen`, `never`, `remarks`, `example`
```

Verify with `rg -n "pitfalls" packages/mcp/skills/skillit-mcp-docs/SKILL.md` — expect no remaining hits after the fix.

- [ ] **Step 4: Fix the test files**

```bash
pnpm --filter @skillit/mcp exec vitest run src/refine/__tests__/mcp-source.test.ts src/refine/__tests__/merge-overlay.test.ts 2>&1 | tail -60
```

Apply the mechanical rule to fixtures/assertions. Re-run until green.

- [ ] **Step 5: Full mcp build and unit test run**

```bash
pnpm --filter @skillit/mcp run build
pnpm --filter @skillit/mcp exec vitest run tests/unit
```

Expected: build clean, all unit tests pass. (Integration tests are covered in Task 7's final verification.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/mcp
git commit -m "refactor(mcp): rename _meta.pitfalls wire convention to _meta.never"
```

---

### Task 4: Sweep remaining `pitfalls` references not caught by the compiler

**Files:**

- Modify: `packages/core/src/refine/ast-edit.ts` (comment only, if not already done in Task 1)
- Modify: any remaining files flagged by the verification sweep below

**Interfaces:**

- Consumes: nothing new — this is a completeness check on Tasks 1-3.

- [ ] **Step 1: Run the exhaustive sweep**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/to-skills
rg -n "\bpitfalls\b" packages/*/src -g '!*.d.ts' -i
```

Expected: **no output**. Every occurrence should have been caught by the type-checker in Tasks 1-3, since `pitfalls` was consistently used as either a typed property/parameter or a string literal in a type-checked position (verified during plan-writing: no bare untyped string comparisons against `'pitfalls'` exist in this codebase outside the type-checked contexts already covered).

- [ ] **Step 2: If anything remains, fix it**

For any surviving hit, read the surrounding context and apply the mechanical rule (`pitfalls` → `never`) whether it's a comment, a markdown-embedded code sample inside a `.ts` file, or a variable name. Re-run the Step 1 command until it returns no output.

- [ ] **Step 3: Sweep markdown/doc files outside `src/` (not compiler-checked)**

```bash
rg -ln "\bpitfalls\b" -i . -g '!node_modules' -g '!*/dist/*' -g '!pnpm-lock.yaml' -g '!docs/superpowers/**' -g '!specs/**' -g '!drafts/**' -g '!**/CHANGELOG.md' -g '!*.ts'
```

This intentionally excludes `.ts` files (already covered by Steps 1-2) and historical docs (specs/plans/changelogs — those describe what was true when written; leave them). Expect hits in `packages/cli/skills/skillit-cli-docs/SKILL.md` (fixed in Task 5) and possibly `packages/mcp/skills/skillit-mcp-docs/SKILL.md` (should already be clean from Task 3 Step 3 — if it still shows up here, you missed a spot; fix it now). Fix any other hit the same way.

- [ ] **Step 4: Commit (only if Step 2 or 3 found anything)**

```bash
git add -A
git commit -m "chore: sweep remaining pitfalls references missed by the compiler"
```

If nothing was found in Steps 2-3, skip this commit — there's nothing to commit.

---

### Task 5: Fix the self-contradictory `skillit-cli-docs` bundled doc

**Files:**

- Modify: `packages/cli/skills/skillit-cli-docs/SKILL.md`

**Interfaces:**

- None — pure documentation fix.

- [ ] **Step 1: Fix the prose/example contradiction**

The file currently reads (prose says `@pitfalls`, the code example below it already says `@never` — they disagree):

```
For routing tags (`@useWhen`, `@avoidWhen`, `@pitfalls`), add them as JSDoc on
a `<PascalCommandName>Options` interface in a TypeScript source file.
```

Change to:

```
For routing tags (`@useWhen`, `@avoidWhen`, `@never`), add them as JSDoc on
a `<PascalCommandName>Options` interface in a TypeScript source file.
```

The code example immediately below already uses `@never` correctly — no change needed there. Verify:

```bash
rg -n "@pitfalls|@never" packages/cli/skills/skillit-cli-docs/SKILL.md
```

Expected: every hit says `@never`, none say `@pitfalls`.

- [ ] **Step 2: Commit**

```bash
git add packages/cli/skills/skillit-cli-docs/SKILL.md
git commit -m "docs(cli): fix skillit-cli-docs prose/example contradiction on the never tag name"
```

---

### Task 6: Close skillit#87 — extract shared correlation logic, wire it into `generateCliSkill`

**Files:**

- Modify: `packages/cli/src/refine-source.ts`
- Create: `packages/cli/src/config-surface-correlation.ts`
- Modify: `packages/cli/src/index.ts` (export the new function)
- Modify: `packages/client/src/generate.ts`
- Modify (test): `packages/client/src/__tests__/generate.test.ts` (add the new `generateCliSkill` regression test here — `gen.test.ts` mocks `generateCliSkill` away, wrong layer)
- Create (test fixture): `packages/client/src/__tests__/fixtures/cli-with-greet-command.mjs`

**Interfaces:**

- Produces: `correlateConfigSurfaces(surfaces: readonly { name: string }[], sourceGlob: string): Promise<ExtractedConfigSurface[]>` — exported from `@skillit/cli`. `CliRefineSource.extract()` and `generateCliSkill` both call this.

- [ ] **Step 1: Read the current `CliRefineSource` correlation logic**

Before extracting, re-read `packages/cli/src/refine-source.ts` in full to confirm the exact current contents of `interfaceNameCandidates`, `readTagsAcross`, `readSources`, and the module-level `fileDeclaresInterface` function — the rename in Tasks 1-3 will have already changed `pitfalls` references inside `readTagsAcross` to `never`. Use the post-rename file content as the basis for the extraction below (don't copy stale code from before this plan started).

- [ ] **Step 2: Create `packages/cli/src/config-surface-correlation.ts`**

Move `interfaceNameCandidates`, `readTagsAcross`, `readSources`, and `fileDeclaresInterface` out of the `CliRefineSource` class and into this new standalone module, converting the two class-private methods (`interfaceNameCandidates`, `readTagsAcross`) into plain exported/module-level functions since they no longer have `this` to close over — `interfaceNameCandidates` takes no external state (it's a pure string transform), and `readTagsAcross` takes `candidates` and `sources` as its only inputs, both already passed as parameters in the current implementation. Structure:

```ts
import { readFile, glob } from 'node:fs/promises';
import type { ExtractedConfigSurface } from '@skillit/core';
import { readJsDocTags } from '@skillit/core';
import { readOptionsTags } from './options-jsdoc.js';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.cache']);

/**
 * Candidate option-interface names for a command, in priority order.
 *
 * The documented convention is `<Command>Options` (e.g. `add-remote` →
 * `AddRemoteOptions`, `db:migrate` → `DbMigrateOptions`), but real consumers —
 * including skillit's own CLI — commonly name these `<Command>Opts` or
 * `<Command>CommandOpts` (e.g. `init` → `InitOpts`, `refine` →
 * `RefineCommandOpts`). We probe all three and use the first that a source
 * file actually declares, so a non-conventional consumer still gets matched
 * instead of silently skipped (or colliding with an unrelated `XOptions`).
 */
export function interfaceNameCandidates(command: string): string[] {
  const pascal = command
    .split(/[-_:.\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return [`${pascal}Options`, `${pascal}Opts`, `${pascal}CommandOpts`];
}

/** Globs the source files once and returns a file → contents map. */
export async function readSources(sourceGlob: string): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  for await (const file of glob(sourceGlob, {
    exclude: (f) => f.endsWith('.d.ts') || f.split(/[\\/]/).some((seg) => EXCLUDED_DIRS.has(seg))
  })) {
    sources.set(file, await readFile(file, 'utf8'));
  }
  return sources;
}

/**
 * Returns whether `src` declares the interface named exactly `iface`.
 *
 * Matches on identifier boundaries so the probe for `GenOptions` does not
 * spuriously match `interface GenOptionsExtra`. Shared by file-selection
 * and tag-reading so both agree on what counts as the interface.
 */
export function fileDeclaresInterface(src: string, iface: string): boolean {
  const escaped = iface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\binterface\\s+${escaped}\\b`);
  return pattern.test(src);
}

/**
 * Reads tags for the first candidate interface that a globbed source file
 * declares with at least one tag. Candidates are tried in priority order so
 * the documented `<Command>Options` name wins over the `Opts`/`CommandOpts`
 * fallbacks when more than one is present.
 */
function readTagsAcross(
  candidates: string[],
  sources: Map<string, string>
): Partial<Record<'useWhen' | 'avoidWhen' | 'never' | 'remarks' | 'example', string>> {
  for (const iface of candidates) {
    for (const src of sources.values()) {
      if (!fileDeclaresInterface(src, iface)) {
        continue;
      }
      const tags = readOptionsTags(iface, src);
      if (Object.keys(tags).length > 0) {
        return tags;
      }
    }
  }
  return {};
}

/**
 * Correlate JSDoc routing tags (`@useWhen`/`@avoidWhen`/`@never`/`@remarks`/
 * `@example`) from `<Command>Options`-style interfaces in the consumer's TS
 * source onto CLI command surfaces, so they flow into the generated skill's
 * `## When to Use` / `## NEVER` sections.
 *
 * Used by both `skillit gen --source cli` (via `generateCliSkill`) and
 * `skillit refine --source cli` (via `CliRefineSource`) so the two paths
 * produce symmetric output — closes skillit#87.
 *
 * @useWhen
 * - You have introspected CLI command surfaces and a glob of the consumer's
 *   TypeScript source, and need `ExtractedConfigSurface[]` with JSDoc-derived
 *   routing content correlated onto each command
 * @never
 * - NEVER call this with a glob that resolves zero files and expect a warning — it silently returns empty ExtractedConfigSurface[] for every surface, same as "no JSDoc tags found"
 */
export async function correlateConfigSurfaces(
  surfaces: readonly { name: string }[],
  sourceGlob: string
): Promise<ExtractedConfigSurface[]> {
  const sources = await readSources(sourceGlob);
  const configSurfaces: ExtractedConfigSurface[] = [];

  for (const surface of surfaces) {
    const candidates = interfaceNameCandidates(surface.name);
    const tags = readTagsAcross(candidates, sources);

    const configSurface: ExtractedConfigSurface = {
      name: surface.name,
      description: '',
      sourceType: 'cli',
      options: []
    };
    let hasContent = false;
    if (tags.useWhen !== undefined) {
      configSurface.useWhen = [tags.useWhen];
      hasContent = true;
    }
    if (tags.avoidWhen !== undefined) {
      configSurface.avoidWhen = [tags.avoidWhen];
      hasContent = true;
    }
    if (tags.never !== undefined) {
      configSurface.never = [tags.never];
      hasContent = true;
    }
    if (tags.remarks !== undefined) {
      configSurface.remarks = tags.remarks;
      hasContent = true;
    }
    if (tags.example !== undefined) {
      configSurface.usage = tags.example;
      hasContent = true;
    }

    if (hasContent) {
      configSurfaces.push(configSurface);
    }
  }

  return configSurfaces;
}
```

Note: `readJsDocTags` is imported but unused in the snippet above — remove that import if your editor/lint flags it; it was listed for reference to `options-jsdoc.ts`'s own dependency, not required directly in this file.

- [ ] **Step 3: Update `CliRefineSource` to use the new shared function**

In `packages/cli/src/refine-source.ts`, remove the now-duplicated `interfaceNameCandidates` and `readTagsAcross` private methods and the module-level `fileDeclaresInterface` function (they now live in `config-surface-correlation.ts`). Update the imports at the top of the file to add:

```ts
import {
  correlateConfigSurfaces,
  fileDeclaresInterface,
  interfaceNameCandidates,
  readSources
} from './config-surface-correlation.js';
```

`resolveTargetLocation` and `applyFixes` still need `interfaceNameCandidates`, `fileDeclaresInterface`, and `readSources` directly (they don't go through the full `correlateConfigSurfaces` flow — they resolve a single target or apply a single fix) — keep calling those as imported functions instead of `this.interfaceNameCandidates(...)`/`this.findInterfaceFile(...)`. `findInterfaceFile` (the other private method, not listed for extraction) stays in `refine-source.ts` since it's only used by `resolveTargetLocation`/`applyFixes`, not by the correlation flow.

Replace the `extract()` method's manual configSurfaces-building loop:

```ts
const configSurfaces: ExtractedConfigSurface[] = [];
for (const surface of surfaces) {
  const candidates = this.interfaceNameCandidates(surface.name);
  const tags = this.readTagsAcross(candidates, sources);
  // ... (the rest of the manual loop building configSurface objects)
}
```

with:

```ts
const configSurfaces = await correlateConfigSurfaces(surfaces, this.opts.sourceGlob);
```

Since `correlateConfigSurfaces` does its own `readSources` call internally, and `extract()` also separately calls `this.readSources()` earlier (assigned to a local `sources` variable used for other purposes in the method — check the current file for exactly what else `sources` is used for after this change; if it's used for nothing else post-extraction, remove the now-redundant `const sources = await this.readSources();` line entirely to avoid double-globbing the filesystem on every `extract()` call).

- [ ] **Step 4: Export `correlateConfigSurfaces` from `@skillit/cli`**

In `packages/cli/src/index.ts`, add:

```ts
export { correlateConfigSurfaces } from './config-surface-correlation.js';
```

- [ ] **Step 5: Build `@skillit/cli` and fix any errors**

```bash
pnpm --filter @skillit/cli run build
pnpm --filter @skillit/cli run type-check
```

Expected: clean build, no type errors. Fix anything that surfaces (likely: an unused import in `refine-source.ts` if `findInterfaceFile`'s only other caller was removed, or a missed `this.` prefix).

- [ ] **Step 6: Run `@skillit/cli`'s existing tests**

```bash
pnpm --filter @skillit/cli exec vitest run
```

Expected: all existing tests pass unchanged — `CliRefineSource.extract()`'s observable behavior (the `ExtractedSkill` it returns) is identical before and after this refactor, since the correlation logic itself didn't change, only where it lives.

- [ ] **Step 7: Write the failing regression test for #87 in `@skillit/client`**

`generateCliSkill` has **no existing direct unit test** — `gen.test.ts` mocks it away entirely (it tests the command-wiring layer, not the function), and `generate.test.ts` only covers `generateConfigSkill` so far. Add the new test to `generate.test.ts`, extending it to also cover `generateCliSkill`, following that file's existing real-filesystem-fixture pattern.

`generateCliSkill`'s `opts.program` is always a `"<file>#<exportName>"` string resolved via `loadProgram`, which dynamically `import()`s the file — so the fixture Command must live in a real, in-workspace, importable module (a tmpdir-written file can't resolve `commander` via Node's module resolution). This repo already has exactly this pattern: `packages/client/src/__tests__/fixtures/bin-with-program.mjs` (used by `detect-source.test.ts`) is an in-workspace `.mjs` fixture exporting a `Command`, referenced via `fileURLToPath(new URL('./fixtures/...', import.meta.url))` so its `commander` import resolves, while the temp dir holds only the ancillary files (here: the `<Command>Options`-tagged source file `correlateConfigSurfaces`'s `sourceGlob` will scan).

Create a new fixture file `packages/client/src/__tests__/fixtures/cli-with-greet-command.mjs`:

```js
import { Command } from 'commander';

const program = new Command().name('greet-cli');
program.command('greet').description('Greet someone');

export { program };
```

Add the test to `packages/client/src/__tests__/generate.test.ts`. First, update the imports at the top of the file:

```ts
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generateCliSkill, generateConfigSkill } from '../generate.js';
```

Then add a second `describe` block after the existing `generateConfigSkill` one:

```ts
describe('generateCliSkill', () => {
  it('correlates @never JSDoc from a <Command>Options interface into the generated skill', async () => {
    const programPath = fileURLToPath(
      new URL('./fixtures/cli-with-greet-command.mjs', import.meta.url)
    );
    tmpDir = await mkdtemp(join(tmpdir(), 'gen-cli-never-'));
    await writeFile(
      join(tmpDir, 'command-options.ts'),
      [
        '/**',
        ' * @useWhen - Server advertises the capability',
        ' * @never - NEVER call this without checking capabilities first. Fix: probe with --help',
        ' */',
        'export interface GreetOptions {}'
      ].join('\n'),
      'utf8'
    );
    const outDir = join(tmpDir, 'skills');

    await generateCliSkill({
      program: `${programPath}#program`,
      cwd: tmpDir,
      nature: 'cli',
      name: 'greet-cli',
      outDir
    });

    const skillMd = await readFile(join(outDir, 'greet-cli', 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('## NEVER');
    expect(skillMd).toContain('NEVER call this without checking capabilities first');
  });
});
```

The single module-level `tmpDir`/`afterEach` cleanup already declared at the top of `generate.test.ts` (shared with the `generateConfigSkill` tests) covers this new `describe` block too — no separate cleanup needed. Confirm `GenerateSkillOpts.nature` accepts the CLI variant of `RefineSourceKind` by checking `packages/client/src/detect-source.ts`'s exported type before running — if the CLI variant's exact string differs from `'cli'`, use that value instead.

- [ ] **Step 8: Run the new test to verify it fails**

```bash
pnpm --filter @skillit/client exec vitest run src/__tests__/generate.test.ts -t "correlates @never JSDoc"
```

Expected: **FAIL** — `skillMd` does not contain `## NEVER`, because `generateCliSkill` doesn't yet call `correlateConfigSurfaces`. This confirms the test actually exercises #87's bug.

- [ ] **Step 9: Wire `correlateConfigSurfaces` into `generateCliSkill`**

In `packages/client/src/generate.ts`, add the import:

```ts
import {
  correlateConfigSurfaces,
  extractCliSkill,
  introspectCommander,
  loadProgram,
  writeCliSkill,
  type CliInvocationMode
} from '@skillit/cli';
```

(merge into the existing `@skillit/cli` import block rather than adding a second one — check the current import statement first).

Add the `join` import from `node:path` if not already present (it likely already is, given `dirname`/`join` usage elsewhere in this file — verify with `rg -n "^import" packages/client/src/generate.ts`).

In `generateCliSkill`, change:

```ts
export async function generateCliSkill(opts: GenerateSkillOpts): Promise<void> {
  const program = await loadProgram({ program: opts.program, cwd: opts.cwd });
  const skill = await extractCliSkill({ program, metadata: { name: opts.name } });
  const pkgDir = await findNearestPackageDir(opts.cwd);
  const meta = pkgDir ? await readPackageMetadata(pkgDir) : {};
  applyNpxMode(skill, meta, opts.invocationMode);
```

to:

```ts
export async function generateCliSkill(opts: GenerateSkillOpts): Promise<void> {
  const program = await loadProgram({ program: opts.program, cwd: opts.cwd });
  const surfaces = introspectCommander(program);
  const sourceGlob = join(opts.cwd, '**', '*.ts');
  const configSurfaces = await correlateConfigSurfaces(surfaces, sourceGlob);
  const skill = await extractCliSkill({
    program,
    metadata: { name: opts.name },
    ...(configSurfaces.length > 0 ? { configSurfaces } : {})
  });
  const pkgDir = await findNearestPackageDir(opts.cwd);
  const meta = pkgDir ? await readPackageMetadata(pkgDir) : {};
  applyNpxMode(skill, meta, opts.invocationMode);
```

`introspectCommander` (`packages/cli/src/introspect-commander.ts`, already exported from `@skillit/cli`) is what `CliRefineSource.extract()` already calls to get `surfaces` before correlating — reusing it here instead of hand-rolling a `program.commands.map(...)` walk guarantees `gen` and `refine` derive surface names identically, which is the actual symmetry goal of this fix, not just "produces similar-looking output." Add it to the same `@skillit/cli` import block as `correlateConfigSurfaces`.

- [ ] **Step 10: Run the regression test again to verify it passes**

```bash
pnpm --filter @skillit/client exec vitest run src/__tests__/generate.test.ts -t "correlates @never JSDoc"
```

Expected: **PASS**.

- [ ] **Step 11: Run the full `@skillit/client` test suite**

```bash
pnpm --filter @skillit/client exec vitest run
```

Expected: all tests pass, including the pre-existing `generateCliSkill` tests (confirming the new `configSurfaces` wiring doesn't change output for programs with no matching `<Command>Options` interfaces — `correlateConfigSurfaces` returns `[]` in that case, and `configSurfaces.length > 0 ? { configSurfaces } : {}` means `extractCliSkill` receives no `configSurfaces` key at all, identical to today's behavior).

- [ ] **Step 12: Commit**

```bash
git add packages/cli packages/client
git commit -m "feat(cli,client): correlate @never/@useWhen JSDoc in generateCliSkill (closes skillit#87)"
```

---

### Task 7: Final full verification and changeset

**Files:**

- Create: `.changeset/never-tag-standardization.md`

- [ ] **Step 1: Full monorepo build**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/to-skills
pnpm run build
```

Expected: all 12 packages build clean, no errors.

- [ ] **Step 2: Full monorepo test suite**

```bash
pnpm test
```

Expected: all test files pass (compare the total count against the pre-change baseline — it should be equal to the prior total plus 1, for the new regression test added in Task 6).

- [ ] **Step 3: Full monorepo type-check**

```bash
pnpm run type-check
```

Expected: clean across all 12 packages.

- [ ] **Step 4: Lint**

```bash
pnpm -w run lint
```

Expected: exit code 0, no output.

- [ ] **Step 5: MCP package's own suite, including integration tests**

```bash
cd packages/mcp
RUN_INTEGRATION_TESTS=true npx vitest run --exclude tests/integration/cli-target-without-binary.test.ts --exclude tests/integration/programmatic-render-twice.test.ts
cd ../..
```

(The two excluded tests are pre-existing, environment-only failures unrelated to this work — confirmed earlier in this session by reproducing them identically on unmodified `develop`.) Expected: all remaining unit + integration tests pass, including `meta-passthrough.test.ts` (which exercises the MCP `_meta` flat-field reading this plan renamed).

- [ ] **Step 6: Final exhaustive sweep — confirm zero stray `pitfalls` references**

```bash
rg -n "\bpitfalls\b" -i . -g '!node_modules' -g '!*/dist/*' -g '!pnpm-lock.yaml' -g '!docs/superpowers/**' -g '!specs/**' -g '!drafts/**' -g '!**/CHANGELOG.md'
```

Expected: **no output**. Anything found here at this point is a genuine miss — go back and fix it, re-running the relevant task's build/test commands afterward.

- [ ] **Step 7: Write the changeset**

Create `.changeset/never-tag-standardization.md`:

```markdown
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
```

- [ ] **Step 8: Commit**

```bash
git add .changeset/never-tag-standardization.md
git commit -m "chore: add changeset for never-tag standardization + skillit#87 fix"
```

---

## Self-Review

**Spec coverage:**

- Goal 1 (one tag name, `@never`, everywhere) → Tasks 1, 2, 3, 4, 5.
- Goal 2 (`gen`/`refine` symmetry) → Task 6.
- Non-goals explicitly excluded, no tasks touch them.
- Rename mechanics (lsproxy for same-package, compiler-driven for the rest) → reflected in every task's "run type-check, fix errors" pattern rather than hand-written diffs for all ~130 occurrences; `lsproxy` itself is not scripted into a task because the compiler-driven loop is strictly more exhaustive for this codebase's typed-access pattern (verified during plan-writing: `REFINE_TAGS`'s `satisfies`/exhaustiveness guard and the `SurfaceTag`-typed indexed accesses mean nearly every occurrence is compiler-checked). An implementer who prefers to use `lsproxy textDocument rename --dry-run` on the same-package declarations first (as the design doc describes) may do so before Step 3 of each task — the compiler-driven fix loop is the completeness backstop either way.
- Changeset levels match the design doc exactly.

**Placeholder scan:** No TBD/TODO; every step gives either exact before/after code or an exact command + exact expected output + a stated mechanical transformation rule for the remaining occurrences a full code dump would be redundant to enumerate given the compiler catches them.

**Type consistency:** `correlateConfigSurfaces(surfaces: readonly { name: string }[], sourceGlob: string): Promise<ExtractedConfigSurface[]>` (Task 6) is used identically in both its `CliRefineSource.extract()` call site and its `generateCliSkill` call site. `RefineTag`'s `'never'` member (Task 1) is the type every later task's `.never` field rename assumes.
