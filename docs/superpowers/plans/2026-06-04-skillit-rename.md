# `@to-skills` → `@skillit` Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the whole project from `@to-skills` to the `@skillit` npm org — package scope, the CLI (single `skillit` bin with a `skillit mcp` subcommand group), bundled skill names, the consumer config key, and the repo — carrying current versions, with no backward-compat shims.

**Architecture:** A mostly-mechanical token rename driven by **regression discipline, not RED-first TDD** — behavior is unchanged, so the existing suite is the safety net and the gate is "full suite green + zero unintended `to-skills` hits + type-check + lint" after every chunk. The single behavioral change (folding the `to-skills-mcp` bin into `skillit mcp …`) gets a real behavior test.

**Tech Stack:** pnpm workspaces, TypeScript strict, commander, Vitest, oxlint/oxfmt, changesets. `@skillit/*` scope.

**Spec:** `docs/superpowers/specs/2026-06-04-skillit-rename-design.md`.

---

## Conventions & tooling reality (read first)

- **Gates run from the repo root:** `pnpm exec vitest run --reporter=dot`, `pnpm -r type-check`, `pnpm run lint`. The lint-staged commit hook runs oxfmt/oxlint and may reformat — expected.
- **The scope token `@skillit/` is unambiguous** (it's an npm scope; it never appears as that exact string anywhere except as the package scope). So the scope rewrite is a **guarded text replace of `@skillit/`**, not ast-grep — ast-grep cannot sub-match inside a module-specifier string literal, and lspeasy rename-symbol only renames code identifiers, not package names. Use the precise `rg --files-with-matches` → `sed -i` recipe given below with explicit path exclusions.
- **lspeasy `rename symbol`** is available for branded _identifiers_, but in this repo the only `toSkills*` names are cosmetic file-local vars (`core/src/writer.ts`); renaming them is optional and NOT required. Do not force it.
- **Verification gate** after each chunk: `rg -n 'to-skills|@to-skills' --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!**/CHANGELOG.md' --glob '!docs/superpowers/**' --glob '!specs/**/CHANGELOG*'` must return only intentional historical mentions; the chunk that owns a given area must drive its hits to zero.
- **The commit hook rejects the literal `re`+`.exec(`** — irrelevant to renaming but don't introduce it.
- **Branch:** `feat/skillit-rename` (already created off master).

## File Structure (what each chunk owns)

| Chunk | Area                                                      | Key files                                                                                                                                       |
| ----- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Package scope + manifests + import specifiers             | all `packages/*/package.json`, all `**/*.ts` import/export lines, `pnpm-lock.yaml`                                                              |
| 2     | `skillit mcp` bin fold (only behavior change)             | `packages/mcp/src/cli.ts`, `packages/mcp/src/bin.ts`, `packages/mcp/package.json`, `packages/client/src/bin.ts`, `packages/client/package.json` |
| 3     | Skill dirs + loaders + program/brand strings + config key | `packages/{cli,mcp,typedoc-plugin,typedoc}/skills/`, loader URLs, `packages/mcp/src/bundle/config.ts`, skill metadata, generated `skills/`      |
| 4     | Docs + repo URLs                                          | `README.md`, `website/`, `CLAUDE.md`, `specs/001-mcp-extract-bundle/contracts/package-json-config.md`                                           |
| 5     | Release                                                   | `.changeset/`, publish, deprecate, repo rename                                                                                                  |

---

## Chunk 1: Package scope + import specifiers

### Task 1.1: Rename the package scope across manifests and source

**Files:** all `packages/*/package.json`; all `**/*.ts` under `packages/*/src` and test dirs; `pnpm-lock.yaml` (regenerated).

- [ ] **Step 1: Capture the baseline.** Record the current green state so any test-count change is visible.

Run: `pnpm exec vitest run --reporter=dot 2>&1 | tail -3`
Expected: a passing count (e.g. `Tests  1016 passed`). Note the number.

- [ ] **Step 2: Replace the `@skillit/` scope token everywhere it is the scope.** This covers package `name` fields, `workspace:*` dep keys, and every `from '@skillit/...'` / `import('@skillit/...')` specifier in one pass. `typedoc-plugin-to-skills` is unscoped (no `@`), so it is NOT touched here — it is handled in Step 3.

Run:

```bash
rg -l '@skillit/' --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!**/CHANGELOG.md' \
  | xargs sed -i '' 's#@skillit/#@skillit/#g'
```

(Note: macOS `sed` needs the empty `''` after `-i`. On Linux use `sed -i 's#...#...#g'`.)

- [ ] **Step 3: Rename the unscoped plugin package.** In `packages/typedoc-plugin/package.json` only, change the `name`:

```bash
sed -i '' 's#"typedoc-plugin-to-skills"#"typedoc-plugin-skillit"#' packages/typedoc-plugin/package.json
```

Then update any `workspace:*` references to it (if any package depends on it):

```bash
rg -l 'typedoc-plugin-to-skills' --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!**/CHANGELOG.md' \
  | xargs sed -i '' 's#typedoc-plugin-to-skills#typedoc-plugin-skillit#g'
```

- [ ] **Step 4: Reinstall so pnpm relinks the renamed workspace packages.**

Run: `pnpm install`
Expected: completes; `pnpm-lock.yaml` updated to the `@skillit/*` names. (If install errors on an unresolved `@skillit/*`, a specifier was missed — re-run Step 2's `rg` to find it.)

- [ ] **Step 5: Build + gates.**

Run: `pnpm -r build && pnpm exec vitest run --reporter=dot && pnpm -r type-check && pnpm run lint`
Expected: build clean; **same test count as Step 1, all passing**; type-check exit 0; lint exit 0.

- [ ] **Step 6: Scope-rewrite verification gate.**

Run: `rg -n '@skillit/' --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!**/CHANGELOG.md' --glob '!docs/superpowers/**'`
Expected: **no matches** (every `@skillit/` is gone outside dist/changelog/the rename docs).

- [ ] **Step 7: Commit.**

```bash
git add -A
git commit -m "refactor: rename package scope @skillit/* → @skillit/*"
```

---

## Chunk 2: `skillit mcp` bin fold (the one behavioral change)

Today `@skillit/mcp` ships a `to-skills-mcp` bin; `packages/mcp/src/cli.ts` exports `buildProgram(): Command` (a `Command().name('to-skills-mcp')` with `extract`/`bundle`/`refine` subcommands), and `packages/mcp/src/bin.ts` owns the `McpError`→exit-code mapping + SIGINT handling. We expose the commands as `skillit mcp …` and delete the standalone bin, **preserving the exit-code mapping** on the folded path.

### Task 2.1: Export a mountable `mcp` command + reusable error mapper from `@skillit/mcp`

**Files:** `packages/mcp/src/cli.ts`, new `packages/mcp/src/error-exit.ts`, `packages/mcp/src/bin.ts`, `packages/mcp/src/index.ts`; Test `packages/mcp/tests/unit/mcp-command.test.ts`.

- [ ] **Step 1: Extract the exit-code mapping out of `bin.ts` into a reusable module.** Create `packages/mcp/src/error-exit.ts`:

```typescript
// packages/mcp/src/error-exit.ts
import { McpError } from './errors.js';

// Exit-code mapping (intentionally explicit — see contracts/package-json-config.md).
const ERROR_EXIT_CODES: Record<string, number> = {
  LOCAL_IO_FAILED: 2,
  TRANSPORT_FAILED: 2,
  INITIALIZE_FAILED: 2,
  PROTOCOL_VERSION_UNSUPPORTED: 2,
  SCHEMA_REF_CYCLE: 3,
  SERVER_EXITED_EARLY: 3,
  AUDIT_FAILED: 3,
  DUPLICATE_SKILL_NAME: 4,
  MISSING_LAUNCH_COMMAND: 5,
  ADAPTER_NOT_FOUND: 5,
  UNKNOWN_TARGET: 5
};

/** Map a thrown value to the deterministic process exit code (1 for non-McpError). */
export function mcpErrorExitCode(err: unknown): number {
  if (err instanceof McpError) return ERROR_EXIT_CODES[err.code] ?? 1;
  return 1;
}

/** Write the standard stderr report for a thrown value and exit with its mapped code. */
export function reportMcpErrorAndExit(err: unknown): never {
  if (err instanceof McpError) {
    process.stderr.write(`Error [${err.code}]: ${err.message}\n`);
    if (err.cause instanceof Error) {
      process.stderr.write(`  Caused by: ${err.cause.message}\n`);
    }
    process.exit(mcpErrorExitCode(err));
  }
  if (err instanceof Error) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`Unknown error: ${String(err)}\n`);
  process.exit(1);
}
```

- [ ] **Step 2: Add `buildMcpCommand()` to `cli.ts`.** Refactor `buildProgram` so the subcommands attach to a passed command, and add a `mcp` builder. In `packages/mcp/src/cli.ts`, change the `buildProgram` signature to delegate:

Replace the `export function buildProgram(): Command {` body's opening so the subcommands are added by a shared helper. Concretely, rename the existing `buildProgram` internals into `function attachMcpSubcommands(program: Command): Command { … existing .command('extract')…/.command('bundle')…/.command('refine')… chain … return program; }`, then:

```typescript
/** Standalone program (legacy `to-skills-mcp` shape) — kept for internal/testing use. */
export function buildProgram(): Command {
  return attachMcpSubcommands(
    new Command()
      .name('skillit-mcp')
      .description('Extract or bundle MCP servers as Agent Skills')
      .version(PACKAGE_VERSION)
  );
}

/**
 * The `mcp` command for mounting under the top-level `skillit` program:
 * `skillit mcp extract|bundle|refine …`.
 * @public
 */
export function buildMcpCommand(): Command {
  return attachMcpSubcommands(
    new Command('mcp').description('Extract or bundle MCP servers as Agent Skills')
  );
}
```

(The `.action(...)`/`.command(...)` chains move verbatim into `attachMcpSubcommands`; only the program-creation lines differ.)

- [ ] **Step 3: Rewrite `bin.ts` to use the shared mapper** (no behavior change for the standalone path, but DRY). Replace the inline `ERROR_EXIT_CODES` + `reportAndExit` in `packages/mcp/src/bin.ts` with an import:

```typescript
import { buildProgram } from './cli.js';
import { reportMcpErrorAndExit } from './error-exit.js';
```

Delete the local `ERROR_EXIT_CODES` const and `reportAndExit` function; change the SIGINT message `[to-skills-mcp]` → `[skillit-mcp]`; and change the final line to `program.parseAsync(process.argv).catch(reportMcpErrorAndExit);`.

- [ ] **Step 4: Export the new API from the mcp package index.** In `packages/mcp/src/index.ts` add:

```typescript
export { buildMcpCommand, buildProgram } from './cli.js';
export { mcpErrorExitCode, reportMcpErrorAndExit } from './error-exit.js';
```

(Keep existing exports.)

- [ ] **Step 5: Write the behavior test.**

```typescript
// packages/mcp/tests/unit/mcp-command.test.ts
import { describe, it, expect } from 'vitest';
import { buildMcpCommand, mcpErrorExitCode } from '../../src/index.js';
import { McpError } from '../../src/errors.js';

describe('buildMcpCommand', () => {
  it('returns a command named "mcp" carrying the extract/bundle/refine subcommands', () => {
    const cmd = buildMcpCommand();
    expect(cmd.name()).toBe('mcp');
    const names = cmd.commands.map((c) => c.name()).sort();
    expect(names).toContain('extract');
    expect(names).toContain('bundle');
    expect(names).toContain('refine');
  });
});

describe('mcpErrorExitCode', () => {
  it('preserves the documented exit-code mapping', () => {
    expect(mcpErrorExitCode(new McpError('x', 'AUDIT_FAILED'))).toBe(3);
    expect(mcpErrorExitCode(new McpError('x', 'DUPLICATE_SKILL_NAME'))).toBe(4);
    expect(mcpErrorExitCode(new McpError('x', 'TRANSPORT_FAILED'))).toBe(2);
    expect(mcpErrorExitCode(new McpError('x', 'UNKNOWN_TARGET'))).toBe(5);
    expect(mcpErrorExitCode(new Error('plain'))).toBe(1);
  });
});
```

(Verify the exact `McpError` constructor signature in `packages/mcp/src/errors.ts` and the subcommand names in `cli.ts` before finalizing; adjust the literals to match. If `refine` isn't a subcommand of the mcp program, drop it from the assertion.)

- [ ] **Step 6: Run the test (it exercises new code, so it should pass once Steps 1–4 are done).**

Run: `pnpm exec vitest run packages/mcp/tests/unit/mcp-command.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 7: Drop the mcp standalone bin and mount `mcp` under `skillit`.**
  - In `packages/mcp/package.json`, remove the `"bin": { "to-skills-mcp": ... }` block. (Keep `bin.ts` in source for internal/dev use; it just won't be published as a bin.)
  - In `packages/client/package.json`, set `"bin": { "skillit": "./dist/bin.js" }` (already renamed from `to-skills` by Chunk 1's scope pass? No — the bin KEY `to-skills` is a brand string, not the scope; rename it here):

```bash
sed -i '' 's#"to-skills": "./dist/bin.js"#"skillit": "./dist/bin.js"#' packages/client/package.json
```

- In `packages/client/src/bin.ts`, import and mount the mcp command, and route mcp errors through the shared mapper. Current bin builds `new Command('to-skills')` and adds refine/init. Update:

```typescript
import { Command } from 'commander';
import { buildRefineCommand } from './commands/refine.js';
import { buildInitCommand } from './commands/init.js';
import { buildMcpCommand, reportMcpErrorAndExit } from '@skillit/mcp';

const program = new Command('skillit').description('skillit CLI').version('0.1.0');
program.addCommand(buildRefineCommand());
program.addCommand(buildInitCommand());
program.addCommand(buildMcpCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  // Preserve the mcp exit-code contract for the `skillit mcp …` path; other
  // errors keep the prior generic behavior.
  reportMcpErrorAndExit(err);
});
```

(`reportMcpErrorAndExit` already falls back to exit 1 + `Error: <msg>` for non-`McpError`, matching the prior client behavior, so it's safe as the single catch handler. Confirm the existing client bin's catch did `console.error(...) + process.exit(1)` — equivalent.)

- [ ] **Step 8: Build + full gates.**

Run: `pnpm -r build && pnpm exec vitest run --reporter=dot && pnpm -r type-check && pnpm run lint`
Expected: all green; test count = Chunk-1 count + new mcp-command tests.

- [ ] **Step 9: Commit.**

```bash
git add -A
git commit -m "feat(cli): fold to-skills-mcp into a single skillit bin (skillit mcp …)"
```

---

## Chunk 3: Skill dirs + loaders + brand strings + config key

### Task 3.1: Rename bundled skill directories and fix loader URLs

**Files:** `packages/cli/skills/to-skills-cli-docs/`, `packages/mcp/skills/to-skills-mcp-docs/`, `packages/typedoc-plugin/skills/to-skills-docs/`, `packages/typedoc/skills/to-skills-docs/`; loaders in `packages/cli/src/{refine-source,extract}.ts`, `packages/typedoc/src/plugin.ts`.

- [ ] **Step 1: `git mv` the skill directories.**

```bash
git mv packages/cli/skills/to-skills-cli-docs packages/cli/skills/skillit-cli-docs
git mv packages/mcp/skills/to-skills-mcp-docs packages/mcp/skills/skillit-mcp-docs
git mv packages/typedoc-plugin/skills/to-skills-docs packages/typedoc-plugin/skills/skillit-docs
git mv packages/typedoc/skills/to-skills-docs packages/typedoc/skills/skillit-docs
```

- [ ] **Step 2: Update the loader URLs.** Replace the skill-dir path segment in the three loaders:

```bash
rg -l "skills/to-skills-(cli-|mcp-|)docs/SKILL.md" packages/*/src \
  | xargs sed -i '' -e 's#skills/to-skills-cli-docs/#skills/skillit-cli-docs/#g' \
                    -e 's#skills/to-skills-mcp-docs/#skills/skillit-mcp-docs/#g' \
                    -e 's#skills/to-skills-docs/#skills/skillit-docs/#g'
```

- [ ] **Step 3: Rename the skill `name:` inside each SKILL.md frontmatter** (`to-skills-cli-docs` → `skillit-cli-docs`, etc.) and any in-body self-references:

```bash
rg -l 'to-skills-(cli-|mcp-|)docs' packages/*/skills \
  | xargs sed -i '' -e 's#to-skills-cli-docs#skillit-cli-docs#g' \
                    -e 's#to-skills-mcp-docs#skillit-mcp-docs#g' \
                    -e 's#to-skills-docs#skillit-docs#g'
```

- [ ] **Step 4: Build + gates** (the cli/typedoc tests load these skills, so this proves the loaders resolve).

Run: `pnpm -r build && pnpm exec vitest run --reporter=dot && pnpm -r type-check`
Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "refactor: rename bundled skill dirs to skillit-*"
```

### Task 3.2: Rename the program/brand strings and the `to-skills` config key

**Files:** `packages/mcp/src/bundle/config.ts`; any remaining `'to-skills'` brand literals (program descriptions, skill metadata `name`/`keywords`/`description`); generated `skills/` artifacts.

- [ ] **Step 1: Rename the consumer config key** in `packages/mcp/src/bundle/config.ts`: the read `pkg['to-skills']` → `pkg['skillit']`, and both `McpError` messages + the doc comment (`to-skills section …`, `to-skills.mcp field …` → `skillit …`).

```bash
sed -i '' -e "s#pkg\['to-skills'\]#pkg['skillit']#g" \
          -e 's#to-skills section is missing#skillit section is missing#g' \
          -e 's#"to-skills": { "mcp"#"skillit": { "mcp"#g' \
          -e 's#to-skills\.mcp field#skillit.mcp field#g' \
          packages/mcp/src/bundle/config.ts
```

Then verify the variable name `const toSkills = pkg['skillit'];` reads oddly — rename the local for clarity:
Use lspeasy `rename symbol` on the `toSkills` local in `config.ts` → `skillitConfig` (or hand-edit; it's file-local). Confirm `toSkills.mcp` references update.

- [ ] **Step 2: Rename remaining brand literals.** Find every remaining `to-skills` (not yet handled) in `packages/*/src`:

```bash
rg -n 'to-skills' packages/*/src --glob '!*.test.ts'
```

For each hit, replace `to-skills` → `skillit` (program `.name()`/`.description('to-skills CLI')` → `'skillit CLI'`, skill metadata strings, keyword arrays). Use targeted `sed`/edits per file. Example for the client bin description (already mostly handled in Chunk 2, confirm):

```bash
rg -l "'to-skills CLI'|to-skills CLI" packages/*/src | xargs sed -i '' 's#to-skills CLI#skillit CLI#g'
```

- [ ] **Step 3: Regenerate committed skill artifacts.** Any `skills/` output under the repo root generated by the tool (e.g. `skills/to-skills-refine/`) is regenerated under the new brand. Regenerate via the existing generator (the dogfood script) or `git mv` + sed if it's a static fixture:

```bash
rg -l 'to-skills' skills 2>/dev/null | xargs -r sed -i '' 's#to-skills#skillit#g'
# rename the dir if present:
[ -d skills/to-skills-refine ] && git mv skills/to-skills-refine skills/skillit-refine
```

- [ ] **Step 4: Build + full gates + brand verification.**

Run: `pnpm -r build && pnpm exec vitest run --reporter=dot && pnpm -r type-check && pnpm run lint`
Then: `rg -n 'to-skills' packages/*/src --glob '!*.test.ts'`
Expected: all gates green; the `rg` returns **no matches** in `src` (tests may still reference old fixture names — fix those too if any assertion breaks).

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "refactor: rebrand program name, skill metadata, and the skillit config key"
```

---

## Chunk 4: Docs + repo URLs

### Task 4.1: Rebrand docs, README, CLAUDE.md, and the config contract

**Files:** `README.md`, `website/**`, `CLAUDE.md`, `specs/001-mcp-extract-bundle/contracts/package-json-config.md`, and `repository`/URL fields.

- [ ] **Step 1: Rebrand the config contract doc.** In `specs/001-mcp-extract-bundle/contracts/package-json-config.md`, rename the schema key `to-skills` → `skillit` and the example JSON (`{ "to-skills": { "mcp": … } }` → `{ "skillit": { … } }`).

```bash
sed -i '' -e 's#"to-skills"#"skillit"#g' -e 's#to-skills\.mcp#skillit.mcp#g' -e 's#`to-skills`#`skillit`#g' \
  specs/001-mcp-extract-bundle/contracts/package-json-config.md
```

- [ ] **Step 2: Rebrand README + website + CLAUDE.md.** Replace remaining brand + repo URL hits (`pradeepmouli/to-skills` → `pradeepmouli/skillit`, `@skillit/*` already done in Chunk 1 but docs may carry them in prose/code fences, `to-skills`/`to-skills-mcp` command examples → `skillit`/`skillit mcp`, bin/skill names):

```bash
rg -l 'to-skills' README.md website CLAUDE.md \
  | xargs sed -i '' -e 's#pradeepmouli/to-skills#pradeepmouli/skillit#g' \
                    -e 's#to-skills-mcp #skillit mcp #g' \
                    -e 's#`to-skills`#`skillit`#g' \
                    -e 's#@skillit/#@skillit/#g' \
                    -e 's#to-skills#skillit#g'
```

Then **manually review** the README/website diffs — prose rewrites (e.g. "the to-skills CLI") need to read naturally as "the skillit CLI", and `skillit mcp` command examples must be correct (`skillit mcp refine …`, not `skillit-mcp refine`). Fix any awkward replacements by hand.

- [ ] **Step 3: Update `repository` URLs in package.json files** (if Chunk 1 didn't catch the `to-skills` in the URL — the scope replace only touched `@skillit/`):

```bash
rg -l 'pradeepmouli/to-skills' packages/*/package.json package.json \
  | xargs sed -i '' 's#pradeepmouli/to-skills#pradeepmouli/skillit#g'
```

- [ ] **Step 4: Gates + full brand sweep.**

Run: `pnpm exec vitest run --reporter=dot && pnpm -r type-check && pnpm run lint`
Then the global gate:

```bash
rg -n 'to-skills|@to-skills' --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!**/CHANGELOG.md' --glob '!docs/superpowers/**'
```

Expected: green gates; the `rg` returns **only intentional historical mentions** (e.g. `specs/001-*/tasks.md` describing past work). Anything in shipping code/docs/config must be zero. Triage each remaining hit explicitly; `log`/note any deliberately-kept historical reference.

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "docs: rebrand README, website, CLAUDE.md, and the config contract to skillit"
```

---

## Chunk 5: Release (changeset, publish, deprecate, repo rename)

### Task 5.1: Changeset + close the stale version PR

**Files:** `.changeset/skillit-rename.md`.

- [ ] **Step 1: Add a changeset** declaring the rename across the renamed packages (carry current versions — changesets bumps from the published baseline; use `patch` so the first `@skillit` release equals the carried version, or set explicit versions if the team prefers — confirm with the changesets config). Minimal content:

```markdown
---
'@skillit/core': patch
'@skillit/cli': patch
'@skillit/mcp': patch
'@skillit/client': patch
'@skillit/typedoc': patch
'@skillit/docusaurus': patch
'@skillit/vitepress': patch
'@skillit/target-mcpc': patch
'@skillit/target-mcp-protocol': patch
'@skillit/target-fastmcp': patch
'typedoc-plugin-skillit': patch
---

Rebrand `@to-skills` → `@skillit`: package scope, single `skillit` CLI (with `skillit mcp …`), bundled skill names, and the `skillit` package.json config key. No API changes.
```

- [ ] **Step 2: Commit.**

```bash
git add .changeset/skillit-rename.md
git commit -m "chore: changeset for the @skillit rebrand"
```

- [ ] **Step 3: Close the stale `changeset-release/master` PR (#42)** — it targets the old scope. (Done via the GitHub UI / `gh pr close 42` once this branch is the source of truth — perform during the PR/merge step, not before.)

### Task 5.2: Publish + deprecate + repo rename (release actions — require human go-ahead)

These are outward-facing; perform them only with explicit consent, after the rename PR is merged to master.

- [ ] **Step 1:** Merge the rename PR to master (triggers the changesets publish of `@skillit/*` + `typedoc-plugin-skillit`).
- [ ] **Step 2: Deprecate the old packages** with a pointer (one command each):

```bash
for p in core cli mcp client typedoc docusaurus vitepress target-mcpc target-mcp-protocol target-fastmcp; do
  npm deprecate "@skillit/$p" "Renamed to @skillit/$p"
done
npm deprecate typedoc-plugin-to-skills "Renamed to typedoc-plugin-skillit"
```

- [ ] **Step 3: Rename the GitHub repo** `pradeepmouli/to-skills` → `pradeepmouli/skillit` (`gh repo rename skillit` or in GitHub settings; the old URL 301-redirects). The in-repo URL references were updated in Chunk 4.

---

## Self-Review

**Spec coverage:**

- Scope rename (all `@skillit/*`) → Task 1.1. ✓
- typedoc-plugin → `typedoc-plugin-skillit` → Task 1.1 Step 3. ✓
- Single `skillit` bin + `skillit mcp` fold + drop mcp bin → Chunk 2. ✓
- Preserve mcp exit-code mapping → Task 2.1 (`error-exit.ts` + test). ✓
- Bundled skill dirs + loaders → Task 3.1. ✓
- Program name + brand strings → Task 3.2. ✓
- Consumer config key `to-skills` → `skillit` + contract doc → Task 3.2 Step 1 + Task 4.1 Step 1. ✓
- Versions carried → Task 5.1 (changeset). ✓
- Repo rename + URLs → Task 4.1 (in-repo) + Task 5.2 Step 3 (GitHub). ✓
- Deprecate old packages → Task 5.2 Step 2. ✓
- Close #42 → Task 5.1 Step 3. ✓
- Zero-unintended-hits gate → Chunk 4 Step 4 (global) + per-chunk verification steps. ✓

**Placeholder scan:** No "TBD"/"implement later". The two "confirm against current code" notes (McpError constructor signature in 2.1 Step 5; changesets bump strategy in 5.1 Step 1) are explicit verification instructions with a concrete default, not vague gaps.

**Consistency:** `buildMcpCommand()`/`mcpErrorExitCode`/`reportMcpErrorAndExit` are defined in Task 2.1 and consumed in the client bin (2.1 Step 7) and the test (2.1 Step 5) with matching names. The scope token `@skillit/` and brand token `skillit` are used uniformly.

**Discipline note:** Per the user, this is **regression-driven** — chunks 1, 3, 4 have NO new tests (existing suite + `rg` gate is the safety net); only Chunk 2 (new CLI wiring) adds a behavior test. That is intentional and correct for a behavior-preserving rename.
