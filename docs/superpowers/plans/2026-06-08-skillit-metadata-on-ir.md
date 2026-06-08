# Metadata-on-IR Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate project metadata onto the `ExtractedSkill` IR and delete the parallel `AuditContext` channel, so the deterministic audit is a pure function of the IR (`auditSkill(skill)`) and no source can silently provide empty metadata.

**Architecture:** The audit was reading project metadata through a separate `auditContext()` method on every `RefineSource` — a parallel path that three implementations independently forgot, leaving package-description/README findings unaddressable. But that metadata is just `readPackageMetadata()` output, which each source's `extract()` already reads. This refactor moves the one missing piece (`readme: ParsedReadme`) onto the IR (identity fields are already there), repoints every audit check from `context.X` to `skill.X`, makes `auditSkill` single-arg, and deletes `AuditContext` + `auditContext()` entirely. Render and audit both become pure projections of the IR; repo-reading stays at the agent layer (`--ground`, §8.2 spot-check).

**Tech Stack:** TypeScript 5 (strict, no `any`, `exactOptionalPropertyTypes`), Node ≥20, Vitest, pnpm workspaces, oxlint/oxfmt, changesets. Branch: `feat/metadata-on-ir`, stacked on `feat/phase2-config-mcp-bootstrap`.

---

## Background facts (verified call-site inventory)

- **`AuditContext`** (`packages/core/src/audit-types.ts:46-55`) = `{ packageDescription?, keywords?, repository?, readme? }`. **`ParsedReadme`** (`audit-types.ts:60-71`) = `{ blockquote?, firstParagraph?, quickStart?, features?, troubleshooting? }`.
- **`readPackageMetadata()`** (`packages/core/src/refine/package-metadata.ts:55`) already returns `PackageMetadata` = `{ packageName?, packageDescription?, keywords?, repository?, readme? }` — **including `readme`**.
- **`ExtractedSkill`** (`packages/core/src/types.ts`) already has `packageDescription` (18), `keywords` (12), `repository` (14), `description` (8), `name` (6) — **but NO `readme` field**. Add `readme?: ParsedReadme`.
- **`auditSkill(skill, context)`** (`audit.ts:975`). Checks that read `context`: **F1** (`context.packageDescription`, :44), **F2** (`context.keywords`, :68), **F3** (`context.readme?.blockquote`/`.firstParagraph`, :100-102), **E5** (`context.repository`, :430), **W4** (`context.keywords`, :532), **W5** (`context.readme?.features`, :558-564), **W6** (`context.readme?.troubleshooting`, :587-593), **A1** (`context.keywords`, :757), **A4** (`context.readme?.quickStart`, :893-898). All other checks already read `skill` only.
- **`auditSkill` callers:** `loop.ts:23` (`auditSkill(skill, source.auditContext(skill))`); `client/src/commands/audit.ts:46` (same); `typedoc/src/plugin.ts:399` (builds a local `AuditContext` at :392-397); plus `examples/audit-and-fix.ts:33` and generated `docs/api/media/*` (regenerated, not hand-maintained).
- **`auditContext()` impls to delete (6):** `ConfigRefineSource` (config-source.ts:150-157), `CliRefineSource` (cli/refine-source.ts:140-150), `TypeDocRefineSource` (typedoc-source.ts:24-26, returns `{}`), `createTypeDocRefineSource` (extract-standalone.ts:159-161), `TypeScriptMcpRefineSource` (ts-mcp-source.ts:29-31, returns `{}`), `McpRefineSource` (mcp-source.ts:25-27, returns `{}`). Each source's `extract()` already reads metadata (or delegates to a thunk/extractor that does).
- **`RefineSource` contract** (`packages/core/src/refine/types.ts:63`): delete the `auditContext` line.
- **`audit-score.ts`** does NOT read `AuditContext` — no change.
- **`readmeFeatures`/`readmeTroubleshooting`** (IR fields, types.ts:58/60) are populated only by the typedoc plugin (:343-344) and read only by the renderer (renderer.ts:542-543, 580-581). **Out of scope** — left as-is (render-only fields; the audit never used them). The minor `skill.readme.features` vs `skill.readmeFeatures` redundancy is noted as a follow-up, not addressed here.
- **Tests touching this:** `core/test/audit.test.ts` (~47 `auditSkill` calls via a `makeContext()` factory, :47), `core/src/refine/__tests__/config-source.test.ts` (:205/218/230), `loop.test.ts` (:37/43), `loop-guidance.test.ts` (:43/53), `cli/test/cli-audit-context.test.ts` (:13/34/49), `client/src/__tests__/audit-report.test.ts` (:41/75).

---

## File Structure

**Modify:**

- `packages/core/src/types.ts` — move `ParsedReadme` here (next to `ExtractedSkill`); add `readme?: ParsedReadme` to `ExtractedSkill`.
- `packages/core/src/audit-types.ts` — re-export `ParsedReadme` from types.ts; **delete `AuditContext`**.
- `packages/core/src/audit.ts` — `auditSkill(skill)` single-arg; F1/F2/F3/E5/W4/W5/W6/A1/A4 read from `skill`.
- `packages/core/src/refine/types.ts` — delete `auditContext` from `RefineSource`.
- `packages/core/src/refine/config-source.ts` — `extract()` sets `skill.readme`; delete `auditContext()`.
- `packages/core/src/refine/loop.ts` — `auditSkill(skill)`.
- `packages/cli/src/refine-source.ts` — `extract()` sets `skill.readme`; delete `auditContext()`.
- `packages/typedoc/src/refine/typedoc-source.ts` — delete `auditContext()` (extract delegates; readme comes from the thunk/extractor).
- `packages/typedoc/src/extract-standalone.ts` — `extract()` sets `skill.readme`; delete `auditContext()`.
- `packages/typedoc/src/plugin.ts` — set `skill.readme` from the parsed README; call `auditSkill(skill)`.
- `packages/mcp/src/refine/build/ts-mcp-source.ts` — `extract()` sets `skill.readme`; delete `auditContext()`.
- `packages/mcp/src/refine/runtime/mcp-source.ts` — `extract()` sets `skill.readme`; delete `auditContext()`.
- `packages/client/src/commands/audit.ts` — `auditSkill(skill)`.
- `examples/audit-and-fix.ts` — drop the context arg.
- Tests listed above.

**Create:**

- `.changeset/metadata-on-ir.md`.

---

## Task 1: Add `readme` to the IR; relocate `ParsedReadme`

**Files:**

- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/audit-types.ts`

- [ ] **Step 1: Move `ParsedReadme` into `types.ts`**

Cut the `ParsedReadme` interface from `packages/core/src/audit-types.ts:60-71` and paste it into `packages/core/src/types.ts` (above `ExtractedSkill`). In `audit-types.ts`, replace it with a re-export so existing importers keep working:

```typescript
// packages/core/src/audit-types.ts (near the top, after imports)
export type { ParsedReadme } from './types.js';
```

- [ ] **Step 2: Add the `readme` field to `ExtractedSkill`**

In `packages/core/src/types.ts`, inside `ExtractedSkill` (next to `readmeFeatures`/`readmeTroubleshooting` around line 58):

```typescript
  /**
   * Parsed README sections (blockquote, first paragraph, features,
   * troubleshooting, quick-start). The single source of project narrative
   * metadata — the audit reads this directly; no separate AuditContext.
   */
  readme?: ParsedReadme;
```

- [ ] **Step 3: Build + type-check**

Run: `pnpm --filter @skillit/core run build && pnpm --filter @skillit/core run type-check`
Expected: clean (pure type addition; `readme` is unused so far).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/audit-types.ts
git commit -m "refactor(core): add readme to ExtractedSkill IR; relocate ParsedReadme to types.ts"
```

---

## Task 2: Populate `skill.readme` in every source's `extract()`

Each source already reads `PackageMetadata` (with `readme`) in `extract()`. Set it onto the returned IR. The pattern is identical: after obtaining `skill` and `meta`, `if (meta.readme) skill.readme = meta.readme;`.

**Files:**

- Modify: `packages/core/src/refine/config-source.ts`
- Modify: `packages/cli/src/refine-source.ts`
- Modify: `packages/typedoc/src/extract-standalone.ts`
- Modify: `packages/mcp/src/refine/build/ts-mcp-source.ts`
- Modify: `packages/mcp/src/refine/runtime/mcp-source.ts`
- Test: `packages/core/src/refine/__tests__/config-source.test.ts`, `packages/cli/test/cli-audit-context.test.ts`, `packages/mcp/src/refine/__tests__/audit-context-metadata.test.ts`

- [ ] **Step 1: Convert an existing auditContext test to assert on `extract().readme`**

These sources have tests asserting `source.auditContext(skill).readme`/metadata. Rewrite the assertions to read the IR. Example for `packages/cli/test/cli-audit-context.test.ts` (the test that builds a temp package with a README + package.json):

```typescript
// BEFORE: const ctx = source.auditContext(await source.extract()); expect(ctx.readme?.blockquote)...
// AFTER:
const skill = await source.extract();
expect(skill.readme?.blockquote).toBeTruthy();
expect(skill.packageDescription).toBe('<the description from the temp package.json>');
```

- [ ] **Step 2: Run it — confirm it fails**

Run: `pnpm exec vitest run packages/cli/test/cli-audit-context.test.ts`
Expected: FAIL — `skill.readme` is `undefined` (not yet populated).

- [ ] **Step 3: Set `skill.readme` in each `extract()`**

- **`config-source.ts`** `extract()` (after it builds `skill` from `meta`, ~line 110-120): add `if (meta.readme !== undefined) skill.readme = meta.readme;` (it already sets `packageDescription`/`keywords`/`repository`).
- **`cli/src/refine-source.ts`** `extract()` (after `const skill = await extractCliSkill(...)`, ~line 130): add `if (this.cachedMetadata.readme !== undefined) skill.readme = this.cachedMetadata.readme;`.
- **`typedoc/src/extract-standalone.ts`** `createTypeDocRefineSource.extract()` (after `const skills = await extractTypeDocSkills(opts)` and reading `meta`, ~line 133-145): set `if (meta.readme !== undefined) skill.readme = meta.readme;` on the returned skill.
- **`mcp/src/refine/build/ts-mcp-source.ts`** `extract()` (after `extractMcpSkill` + the `readPackageMetadata` cache added in Phase 2, ~line 26): `const skill = await extractMcpSkill(...); ...; if (this.cachedMetadata.readme !== undefined) skill.readme = this.cachedMetadata.readme; return skill;`.
- **`mcp/src/refine/runtime/mcp-source.ts`** `extract()` (after `mergeOverlay`, ~line 22): `if (this.cachedMetadata.readme !== undefined) skill.readme = this.cachedMetadata.readme;`.

Respect `exactOptionalPropertyTypes` — guard with `!== undefined` before assigning (as shown).

- [ ] **Step 4: Run the converted tests + each source's suite**

Run: `pnpm exec vitest run packages/cli/test/cli-audit-context.test.ts packages/core/src/refine/__tests__/config-source.test.ts packages/mcp/src/refine/__tests__/audit-context-metadata.test.ts`
Expected: PASS (after also converting the config + mcp tests in Step 1 the same way).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/refine/config-source.ts packages/cli/src/refine-source.ts packages/typedoc/src/extract-standalone.ts packages/mcp/src/refine/build/ts-mcp-source.ts packages/mcp/src/refine/runtime/mcp-source.ts packages/cli/test packages/core/src/refine/__tests__/config-source.test.ts packages/mcp/src/refine/__tests__
git commit -m "refactor(sources): populate skill.readme on the IR in every extract()"
```

---

## Task 3: Make `auditSkill` single-arg, reading from the IR

**Files:**

- Modify: `packages/core/src/audit.ts`
- Test: `packages/core/test/audit.test.ts`

- [ ] **Step 1: Update a representative audit test to the new shape**

In `packages/core/test/audit.test.ts`, the `makeContext()` factory (line 47) builds an `AuditContext`. Replace its usage: instead of `auditSkill(skill, makeContext({ packageDescription: 'x', readme: {...} }))`, set those fields on the `skill` and call `auditSkill(skill)`. Add a helper `withMeta(skill, { packageDescription, keywords, repository, readme })` that returns `{ ...skill, packageDescription, keywords, repository, readme }`. Convert the F1/F3/W5/W6/A4 tests first (the metadata-dependent ones), e.g.:

```typescript
it('F1 fires when packageDescription is missing', () => {
  const result = auditSkill(makeSkill({ packageDescription: undefined }));
  expect(result.issues.some((i) => i.code === 'F1')).toBe(true);
});
it('F3 passes when README has a blockquote', () => {
  const result = auditSkill(makeSkill({ readme: { blockquote: 'A tool that…' } }));
  expect(result.issues.some((i) => i.code === 'F3')).toBe(false);
});
```

- [ ] **Step 2: Run — confirm it fails to compile**

Run: `pnpm exec vitest run packages/core/test/audit.test.ts`
Expected: FAIL — `auditSkill` still requires 2 args / checks still read `context`.

- [ ] **Step 3: Change the signature + repoint the checks**

In `packages/core/src/audit.ts`:

- `auditSkill(skill: ExtractedSkill): AuditResult` (drop `context`, line 975).
- Change the 9 metadata checks to take `skill` and read from it:
  - `checkF1`: `skill.packageDescription` (was `context.packageDescription`).
  - `checkF2`, `checkW4`, `checkA1`: `skill.keywords`.
  - `checkE5`: `skill.repository`.
  - `checkF3`: `skill.readme?.blockquote` / `skill.readme?.firstParagraph`.
  - `checkW5`: `skill.readme?.features`.
  - `checkW6`: `skill.readme?.troubleshooting`.
  - `checkA4`: `skill.readme?.quickStart`.
    Update each function's signature (e.g. `checkF1(skill, issues, passing)`), and the call sites inside `auditSkill` (lines 980-1009) to pass `skill`. W5/W6/A4 already also take `skill`, so they collapse to a single `skill` param.

> NOTE: `checkF1` should read `skill.packageDescription ?? skill.description` only if the existing logic did so — match the existing F1 logic exactly; it currently reads `context.packageDescription`, so use `skill.packageDescription`.

- [ ] **Step 4: Run the audit suite**

Run: `pnpm exec vitest run packages/core/test/audit.test.ts`
Expected: PASS (all ~47 converted cases).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/audit.ts packages/core/test/audit.test.ts
git commit -m "refactor(core): auditSkill(skill) reads project metadata from the IR (drop context param)"
```

---

## Task 4: Delete `auditContext()` from the contract + all impls + `AuditContext`

**Files:**

- Modify: `packages/core/src/refine/types.ts`, `audit-types.ts`, `refine/config-source.ts`, `refine/loop.ts`
- Modify: `packages/cli/src/refine-source.ts`, `packages/typedoc/src/refine/typedoc-source.ts`, `packages/typedoc/src/extract-standalone.ts`, `packages/mcp/src/refine/build/ts-mcp-source.ts`, `packages/mcp/src/refine/runtime/mcp-source.ts`
- Modify: `packages/client/src/commands/audit.ts`
- Test: `loop.test.ts`, `loop-guidance.test.ts`, `config-source.test.ts`, `cli-audit-context.test.ts`, `audit-report.test.ts`

- [ ] **Step 1: Update the callers + their tests first (red)**

- `packages/core/src/refine/loop.ts:23` → `const audit = auditSkill(skill);`
- `packages/client/src/commands/audit.ts:46` → `const audit = auditSkill(skill);`
- In `loop.test.ts` (:37/43) and `loop-guidance.test.ts` (:43/53), remove the `auditContext: vi.fn()` / `auditContext: () => ({})` properties from the mock `RefineSource` objects.
- In `audit-report.test.ts` (:41/75), remove the `auditContext()` methods from the stub sources.
- In `config-source.test.ts` (:205-230) and `cli-audit-context.test.ts` (:13-49), delete the `auditContext`-specific test cases (their coverage moved to the `extract().readme` assertions in Task 2).

Run the affected suites — expect FAIL/compile errors referencing `auditContext`.

- [ ] **Step 2: Delete the contract method + all impls + the type**

- `packages/core/src/refine/types.ts:63` — delete `auditContext(skill: ExtractedSkill): AuditContext;`. Remove the now-unused `AuditContext` import if present.
- Delete the `auditContext()` method from: `config-source.ts:150-157`, `cli/refine-source.ts:140-150`, `typedoc-source.ts:24-26`, `extract-standalone.ts:159-161`, `ts-mcp-source.ts:29-31`, `mcp-source.ts:25-27`. Remove each now-dead `cachedMetadata`/`cachedCtx` field ONLY if nothing else uses it (the `extract()` still reads `meta` locally to set `skill.readme`, so a cached field may no longer be needed — inline the read if so).
- `packages/core/src/audit-types.ts` — delete the `AuditContext` interface (:46-55). Keep the `ParsedReadme` re-export from Task 1.
- Remove now-unused `AuditContext` imports across all touched files (grep `AuditContext` to find them).

- [ ] **Step 3: Run the full core/cli/typedoc/mcp/client suites**

Run: `pnpm exec vitest run packages/core packages/cli packages/typedoc packages/mcp packages/client`
Expected: PASS. Then `pnpm run type-check` — clean (no dangling `AuditContext` references).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(core): delete AuditContext + auditContext() from RefineSource and all sources"
```

---

## Task 5: Fix the typedoc plugin + examples call sites

**Files:**

- Modify: `packages/typedoc/src/plugin.ts`
- Modify: `examples/audit-and-fix.ts`

- [ ] **Step 1: typedoc plugin — set `skill.readme`, call `auditSkill(skill)`**

`packages/typedoc/src/plugin.ts:392-399` builds a local `AuditContext` and calls `auditSkill(skill, auditContext)`. The plugin already has the parsed `readme` (it sets `readmeFeatures`/`readmeTroubleshooting` at :343-344). Replace the local-context construction with assigning the parsed readme onto the skill before audit:

```typescript
// where `readme` (ParsedReadme) is already in scope from parseReadme:
if (readme) skill.readme = readme;
// drop the local `auditContext` object entirely:
const audit = auditSkill(skill);
```

Remove the now-unused `AuditContext` import from plugin.ts.

- [ ] **Step 2: examples — drop the context arg**

`examples/audit-and-fix.ts:33` → `auditSkill(skill)`. If the example constructed an `AuditContext` from `parseReadme`, instead set `skill.readme = parseReadme(...)` before the call (mirroring real usage). (Generated `docs/api/media/*` copies are regenerated by the docs build — leave them; they are not hand-maintained source.)

- [ ] **Step 3: Build + type-check typedoc + run its suite**

Run: `pnpm --filter @skillit/typedoc run build && pnpm --filter @skillit/typedoc run type-check && pnpm exec vitest run packages/typedoc`
Expected: PASS / clean.

- [ ] **Step 4: Commit**

```bash
git add packages/typedoc/src/plugin.ts examples/audit-and-fix.ts
git commit -m "refactor(typedoc): plugin sets skill.readme + calls auditSkill(skill); update example"
```

---

## Task 6: Regression dogfood + changeset + final gate

**Files:**

- Create: `.changeset/metadata-on-ir.md`

- [ ] **Step 1: Re-run the Phase 2 dogfood audits to confirm parity**

The metadata-on-IR change must not regress grades. From `packages/typedoc`:

```bash
node ../client/dist/bin.js audit --source config --config-type ./src/plugin.ts#SkillsPluginOptions --json
```

Expected: still **grade B (103/120)** (config dogfood baseline). Rebuild client first: `pnpm --filter @skillit/core --filter @skillit/cli --filter @skillit/typedoc --filter @skillit/mcp --filter @skillit/client run build`.

Also confirm the mcp audit still reads metadata (from a temp consumer dir with a package.json description, as in the Phase 2 dogfood) → still **D/78**.

- [ ] **Step 2: Write the changeset**

`.changeset/metadata-on-ir.md`:

```markdown
---
'@skillit/core': minor
'@skillit/cli': patch
'@skillit/typedoc': patch
'@skillit/mcp': patch
'@skillit/client': patch
---

refactor: consolidate project metadata onto the ExtractedSkill IR

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
```

- [ ] **Step 3: Final gate**

```bash
pnpm run build && pnpm run type-check && pnpm run lint && pnpm exec vitest run
```

Expected: all green (full suite). Also run the `@skillit/mcp` package suite: `pnpm --filter @skillit/mcp test`.

- [ ] **Step 4: Commit + finish the branch**

```bash
git add .changeset/metadata-on-ir.md
git commit -m "chore: changeset + final gate (metadata-on-IR refactor)"
```

Then use `superpowers:finishing-a-development-branch`: push and open a PR. Because this branch is **stacked on `feat/phase2-config-mcp-bootstrap`**, target the PR base at `feat/phase2-config-mcp-bootstrap` (or rebase onto `develop` once #68 merges, then target `develop`).

---

## Self-Review

- **Coverage:** add `readme` to IR (T1) → populate in all 5 sources (T2) → `auditSkill(skill)` reads IR (T3) → delete `AuditContext`/`auditContext()` everywhere (T4) → fix plugin + example callers (T5) → no-regression dogfood + changeset + gate (T6). Every inventoried site (9 checks, 7 callers, 6 impls, 6 test files, the contract, the type) maps to a task.
- **Placeholders:** none — each metadata field's `context.X → skill.X` mapping is enumerated; the per-source `skill.readme` assignment is shown; the signature change is explicit.
- **Type consistency:** `readme?: ParsedReadme` (T1) is the field every later task reads (`skill.readme?.blockquote/.features/.troubleshooting/.quickStart`). `auditSkill(skill)` (T3) matches the caller updates (T4/T5). `withMeta`/`makeSkill` test helpers are introduced in T3 and reused.
- **Out of scope (noted):** `readmeFeatures`/`readmeTroubleshooting` stay as render-only IR fields; the `skill.readme.features` vs `skill.readmeFeatures` redundancy is a deliberate follow-up, not addressed here (keeps the renderer + its tests untouched, shrinking blast radius). `audit-score.ts` unchanged (doesn't read context). Generated `docs/api/media/*` left to the docs build.

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task + two-stage review. Tasks 1–5 are mechanical TDD; good fit. Note the tasks are **sequential** (each builds on the prior type/signature change) — no parallel implementers.
2. **Inline Execution** — execute in this session with checkpoints.
