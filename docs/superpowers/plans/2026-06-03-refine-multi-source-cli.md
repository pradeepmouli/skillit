# Refine Multi-Source (CLI-first) + `init` + AST Editing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `to-skills refine` work for CLI-generated skills (in addition to MCP), add a `to-skills init` onboarding command, inject each source's bundled guidance skill into the eval loop, and replace the regex/string-surgery JSDoc editor with a shared `@ast-grep/napi` utility.

**Architecture:** Six self-contained chunks. (1) AST-edit foundation in `@to-skills/core` with `insertJsDocTag` reimplemented on it. (2) Source-agnostic guidance injection through the loop and model client. (3) CLI command work-item targets in the audit scorer. (4) `CliRefineSource` in `@to-skills/cli` — extract (with interface-JSDoc → config-surface read so the loop converges), guidance, and JSDoc write-back. (5) `refine` source detection + `--source`. (6) `to-skills init`.

**Tech Stack:** TypeScript 5 (strict, no `any`), Node ≥20, Vitest, `@ast-grep/napi`, `commander`, pnpm workspaces, oxlint/oxfmt. Spec: `docs/superpowers/specs/2026-06-03-refine-multi-source-init-design.md`.

**Preconditions:**

- Rebase onto master **after PR #51 merges** (the `introspectCommander` required/mandatory fix). Verify `git log --oneline | rg required-option` shows the fix before starting Chunk 4.
- Security rule (repo hook): NEVER write `re.exec(`. Use `source.match(re)` / `source.matchAll(re)`.

---

## File Structure

| File                                              | Responsibility                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/refine/ast-edit.ts` (create)   | `@ast-grep/napi` wrapper: `upsertJsDocTag`, `findCallNodes`, `upsertObjectProperty`. Sole importer of the binding. |
| `packages/core/src/refine/jsdoc-edit.ts` (modify) | `insertJsDocTag` delegates to `ast-edit`; signature unchanged.                                                     |
| `packages/core/src/refine/types.ts` (modify)      | `RefineSource.guidance?()`; `guidance?` on `DraftRequest`/`ReviewRequest`.                                         |
| `packages/core/src/refine/loop.ts` (modify)       | Resolve `source.guidance()` once; thread into draft/review.                                                        |
| `packages/core/src/audit-score.ts` (modify)       | `targetsForMissingTag` also yields CLI command surfaces.                                                           |
| `packages/cli/src/refine-source.ts` (create)      | `CliRefineSource implements RefineSource`.                                                                         |
| `packages/cli/src/program-loader.ts` (create)     | Load commander program: `--program file#export` + auto-find from `bin`.                                            |
| `packages/cli/src/options-jsdoc.ts` (create)      | ast-grep read of `*Options` interface JSDoc → `ExtractedConfigSurface` routing tags (closes the loop).             |
| `packages/client/src/commands/refine.ts` (modify) | Source detection + `--source` + per-source dispatch.                                                               |
| `packages/client/src/detect-source.ts` (create)   | Detect source from installed packages + project nature.                                                            |
| `packages/client/src/commands/init.ts` (create)   | detect → install → generate → refine.                                                                              |
| `packages/client/src/model/anthropic.ts` (modify) | Include `guidance` in prompts.                                                                                     |
| `packages/client/src/bin.ts` (modify)             | Register `init`.                                                                                                   |

---

## Chunk 1: AST-edit foundation

Replace the regex JSDoc editor with `@ast-grep/napi`, behavior-preserving for `insertJsDocTag`.

### Task 1.1: Add `@ast-grep/napi` to `@to-skills/core`

**Files:** Modify `packages/core/package.json`

- [ ] **Step 1:** Add `"@ast-grep/napi": "^0.43.0"` to `dependencies`.
- [ ] **Step 2:** `pnpm install` from repo root. Expected: lockfile updates, platform optional deps resolve.
- [ ] **Step 3:** Verify import: `cd packages/core && node -e "import('@ast-grep/napi').then(m=>console.log(typeof m.parse, m.Lang.TypeScript))"`. Expected: `function TypeScript`.
- [ ] **Step 4:** Commit. `git add packages/core/package.json pnpm-lock.yaml && git commit -m "build(core): add @ast-grep/napi dependency"`

### Task 1.2: `upsertJsDocTag` in `ast-edit.ts`

**Files:** Create `packages/core/src/refine/ast-edit.ts`; Test `packages/core/src/refine/__tests__/ast-edit.test.ts`

- [ ] **Step 1: Write failing tests.**

```typescript
import { describe, it, expect } from 'vitest';
import { upsertJsDocTag } from '../ast-edit.js';

describe('upsertJsDocTag', () => {
  it('creates a JSDoc block when the export has none', () => {
    const src = `export function loadConfig(path: string) {}\n`;
    const out = upsertJsDocTag(src, 'loadConfig', 'useWhen', 'Loading config');
    expect(out).toContain('/**');
    expect(out).toContain('@useWhen Loading config');
    expect(out.indexOf('/**')).toBeLessThan(out.indexOf('export function loadConfig'));
  });

  it('appends a tag into an existing JSDoc block', () => {
    const src = `/**\n * Parse.\n */\nexport function parse() {}\n`;
    const out = upsertJsDocTag(src, 'parse', 'pitfalls', 'NEVER trust input');
    expect(out).toContain('* Parse.');
    expect(out).toContain('@pitfalls NEVER trust input');
    expect(out.match(/\/\*\*/g)).toHaveLength(1); // no second block
  });

  it('is idempotent for an identical tag', () => {
    const src = `/**\n * @useWhen X\n */\nexport const f = () => {};\n`;
    expect(upsertJsDocTag(src, 'f', 'useWhen', 'X')).toBe(src);
  });

  it('annotates an interface declaration', () => {
    const src = `export interface GenOptions {\n  grammar: string;\n}\n`;
    const out = upsertJsDocTag(src, 'GenOptions', 'useWhen', 'Generating');
    expect(out).toContain('@useWhen Generating');
  });

  it('returns source unchanged when the declaration is absent', () => {
    const src = `export const other = 1;\n`;
    expect(upsertJsDocTag(src, 'missing', 'useWhen', 'X')).toBe(src);
  });

  it('does not match a comment mentioning the name', () => {
    const src = `// loadConfig is great\nexport const loadConfig = () => {};\n`;
    const out = upsertJsDocTag(src, 'loadConfig', 'useWhen', 'Y');
    // The new block attaches to the declaration, not the line comment
    expect(out).toContain('@useWhen Y');
    expect(out.indexOf('@useWhen Y')).toBeGreaterThan(out.indexOf('// loadConfig is great'));
  });
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm --filter @to-skills/core test -- ast-edit` → FAIL (module missing).
- [ ] **Step 3: Implement `ast-edit.ts`.**

```typescript
// packages/core/src/refine/ast-edit.ts
import { parse, Lang } from '@ast-grep/napi';
import type { SgNode } from '@ast-grep/napi';
import type { RefineTag } from './types.js';

const DECL_KINDS = new Set([
  'function_declaration',
  'class_declaration',
  'interface_declaration',
  'lexical_declaration', // const/let
  'variable_declaration'
]);

/** Find the named, exported declaration node for `name`. */
function findDeclaration(root: SgNode, name: string): SgNode | undefined {
  for (const node of root.findAll({
    rule: { kind: 'identifier', regex: `^${escapeRegex(name)}$` }
  })) {
    const decl = node.ancestors().find((a) => DECL_KINDS.has(a.kind()));
    if (!decl) continue;
    // The identifier must be the declaration's name, not an arbitrary reference.
    const nameField = decl.field('name');
    const declared =
      nameField?.text() === name ||
      decl.find({
        rule: {
          kind: 'variable_declarator',
          has: { kind: 'identifier', regex: `^${escapeRegex(name)}$`, field: 'name' }
        }
      }) != null;
    if (declared) return decl;
  }
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Leading `/** ... *␐/` comment node immediately preceding `decl`, if any. */
function leadingJsDoc(decl: SgNode): SgNode | undefined {
  const prev = decl.prev();
  if (prev && prev.kind() === 'comment' && prev.text().startsWith('/**')) return prev;
  return undefined;
}

export function upsertJsDocTag(
  source: string,
  declName: string,
  tag: RefineTag,
  content: string
): string {
  const root = parse(Lang.TypeScript, source).root();
  const decl = findDeclaration(root, declName);
  if (!decl) return source;

  const tagText = `@${tag} ${content}`;
  const existing = leadingJsDoc(decl);

  if (existing) {
    const block = existing.text();
    if (block.includes(tagText)) return source; // idempotent
    const indent = ' ' + ' '.repeat(existing.range().start.column);
    const merged = block.replace(/\s*\*\/\s*$/, `\n${indent}* ${tagText}\n${indent}*/`);
    return root.commitEdits([existing.replace(merged)]);
  }

  const col = decl.range().start.column;
  const indent = ' '.repeat(col);
  const blockText = `/**\n${indent} * ${tagText}\n${indent} */\n${indent}`;
  // Insert immediately before the declaration's first byte.
  const at = decl.range().start.index;
  return source.slice(0, at) + blockText + source.slice(at);
}
```

Note: the manual splice for the "no existing block" case uses `decl.range().start.index` (byte offset from the parser) — robust, no regex. Adjust field/kind names to the tree-sitter-typescript grammar during implementation (use `node.kind()` logging if a test fails).

- [ ] **Step 4: Run, verify pass.** `pnpm --filter @to-skills/core test -- ast-edit` → PASS.
- [ ] **Step 5: Commit.** `git add packages/core/src/refine/ast-edit.ts packages/core/src/refine/__tests__/ast-edit.test.ts && git commit -m "feat(core): ast-grep-based upsertJsDocTag"`

### Task 1.3: Reimplement `insertJsDocTag` on `upsertJsDocTag`

**Files:** Modify `packages/core/src/refine/jsdoc-edit.ts`; existing tests in `packages/core/src/refine/__tests__/` must stay green.

- [ ] **Step 1:** Find the existing jsdoc-edit tests: `rg -l insertJsDocTag packages/core --glob '*.test.ts'`. Read them — they are the behavior contract.
- [ ] **Step 2:** Replace the body of `insertJsDocTag` with a delegation:

```typescript
// packages/core/src/refine/jsdoc-edit.ts
import type { RefineTag } from './types.js';
import { upsertJsDocTag } from './ast-edit.js';

/** @deprecated internal alias — use upsertJsDocTag. Kept for callers/tests. */
export function insertJsDocTag(
  source: string,
  exportName: string,
  tag: RefineTag,
  content: string
): string {
  return upsertJsDocTag(source, exportName, tag, content);
}
```

- [ ] **Step 3: Run the full core suite.** `pnpm --filter @to-skills/core test` → all PASS. If a legacy test asserts an exact whitespace layout that differs, update the assertion to the AST-produced layout (semantics, not byte-identical formatting, is the contract) — note any such change in the commit body.
- [ ] **Step 4: Type-check.** `pnpm --filter @to-skills/core type-check` → no errors.
- [ ] **Step 5: Commit.** `git add packages/core/src/refine/jsdoc-edit.ts packages/core/src/refine/__tests__ && git commit -m "refactor(core): insertJsDocTag delegates to ast-grep upsertJsDocTag"`

---

## Chunk 2: Guidance injection (source-agnostic)

### Task 2.1: Types

**Files:** Modify `packages/core/src/refine/types.ts`

- [ ] **Step 1:** Add `guidance?: string` to `DraftRequest` and `ReviewRequest`. Add `guidance?(): string | Promise<string>;` to `RefineSource`.
- [ ] **Step 2: Type-check** `pnpm --filter @to-skills/core type-check` → PASS (optional members, no breakage).
- [ ] **Step 3: Commit.** `git commit -am "feat(core): add guidance to RefineSource + draft/review requests"`

### Task 2.2: Thread guidance through the loop

**Files:** Modify `packages/core/src/refine/loop.ts`; Test `packages/core/src/refine/__tests__/loop-guidance.test.ts`

- [ ] **Step 1: Write failing test.** Use a stub `RefineSource` whose `guidance()` returns `'RUBRIC-XYZ'` and a stub `ModelClient` that records each `DraftRequest`/`ReviewRequest`. Drive one iteration via the `scoreSkill` seam (return a failing grade with one improvement, then a passing grade). Assert every recorded request has `guidance === 'RUBRIC-XYZ'`. Also assert a source with no `guidance` yields `undefined` (no throw).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** In `refineSkill`, after `let skill = await source.extract();` add `const guidance = await source.guidance?.();` and include `guidance` in each `model.draft({...})` / `model.review({...})` object (all three call sites).
- [ ] **Step 4: Run, verify pass.** `pnpm --filter @to-skills/core test -- loop` → PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(core): refineSkill threads source guidance into draft/review"`

### Task 2.3: Model client uses guidance

**Files:** Modify `packages/client/src/model/anthropic.ts`; Test `packages/client/tests/unit/anthropic-prompt.test.ts`

- [ ] **Step 1: Write failing test.** Extract prompt assembly into pure helpers `buildDraftPrompt(req)` / `buildReviewPrompt(req)` and export them. Test: when `req.guidance` is set, the prompt contains a `Conventions:` section with the guidance text; when absent, it does not.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Add the helpers; have `draft`/`review` use them. Insert, when `req.guidance`, a block: `` `Conventions (follow these):\n${req.guidance}` ``.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat(client): include source guidance in drafter/reviewer prompts"`

---

## Chunk 3: CLI command work-item targets

Make CLI command surfaces produce refine work items (currently only classes/functions do).

### Task 3.1: `targetsForMissingTag` covers CLI command surfaces

**Files:** Modify `packages/core/src/audit-score.ts`; Test `packages/core/src/__tests__/audit-score-cli-targets.test.ts`

- [ ] **Step 1: Write failing test.** Build an `ExtractedSkill` with empty `functions`/`classes` and one `configSurfaces` entry `{ name: 'gen', sourceType: 'cli', options: [...] }` lacking `useWhen`. Call the exported improvement builder (or `estimateSkillJudgeScore`) and assert an improvement with a `@useWhen` suggestion has a target `{ name: 'gen', kind: 'command' }`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** In `targetsForMissingTag`, after class/function targets, append CLI command targets:

```typescript
const cliTargets: ImprovementTarget[] = (skill.configSurfaces ?? [])
  .filter((s) => s.sourceType === 'cli' && !(s as { useWhen?: unknown }).useWhen)
  .slice(0, maxFunctions)
  .map((s) => ({ file: '', name: s.name, kind: 'command' }));
return [...classTargets, ...fnTargets, ...cliTargets];
```

`file: ''` is a placeholder — `CliRefineSource.applyFixes` resolves the real file. Confirm the `useWhen`/`avoidWhen` field name on the config surface by reading the `ExtractedConfigSurface` type; adjust the filter accordingly.

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Full core suite + type-check.** `pnpm --filter @to-skills/core test && pnpm --filter @to-skills/core type-check` → PASS.
- [ ] **Step 6: Commit.** `git commit -am "feat(core): surface CLI command annotation gaps as refine work items"`

---

## Chunk 4: `CliRefineSource` (@to-skills/cli)

**Precondition:** PR #51 merged + rebased.

### Task 4.1: Program loader

**Files:** Create `packages/cli/src/program-loader.ts`; Test `packages/cli/test/program-loader.test.ts` + fixtures under `packages/cli/test/fixtures/`

- [ ] **Step 1: Write failing tests.** (a) `--program <fixture.ts#buildProgram>` returns a `Command` with the expected name. (b) auto-find imports a fixture `bin` exporting `program`. (c) a bin with no usable export throws an error whose message contains `--program`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `loadProgram(opts: { program?: string; cwd: string }): Promise<Command>`.** Parse `file#export`; dynamic-`import()` the (absolute) file URL; resolve a `Command` directly or call a zero-arg factory. Auto-find: read `package.json` `bin`, import it, probe exports `buildProgram`/`createProgram`/`program`/`default`. On failure throw `Error('Could not load a commander program; pass --program <file#export>')`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -m "feat(cli): commander program loader (--program + bin auto-find)"`

### Task 4.2: `*Options` interface JSDoc reader (loop closure)

**Files:** Create `packages/cli/src/options-jsdoc.ts`; Test `packages/cli/test/options-jsdoc.test.ts`

This is what lets a written `@useWhen` be re-read on the next `extract()` so the loop converges.

- [ ] **Step 1: Write failing test.** Given a source string with `/**\n * @useWhen When generating\n */\nexport interface GenOptions {}`, `readOptionsTags('GenOptions', source)` returns `{ useWhen: 'When generating' }`. Missing interface → `{}`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** using `@to-skills/core`'s ast-grep wrapper (export a small `readJsDocTags(source, declName): Partial<Record<RefineTag,string>>` from `ast-edit.ts` and reuse it here). Parse the interface's leading JSDoc, extract `@useWhen`/`@avoidWhen`/`@pitfalls` lines.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -m "feat(cli): read routing tags from *Options interface JSDoc"`

### Task 4.3: `CliRefineSource`

**Files:** Create `packages/cli/src/refine-source.ts`; export from `packages/cli/src/index.ts`; Test `packages/cli/test/refine-source.test.ts`

- [ ] **Step 1: Write failing tests.** (a) `extract()` over a fixture program returns an `ExtractedSkill` whose command surfaces include `useWhen` read from the matching `*Options` interface in the source glob. (b) `applyFixes([{toolName:'gen',tag:'useWhen',value:'When X'}])` writes `@useWhen When X` JSDoc onto `GenOptions` in the fixture file. (c) a fix for a command with no `*Options` interface logs a warning (spy on `process.stderr.write`) and changes nothing. (d) `guidance()` returns a non-empty string containing `CLI Documentation Conventions`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**

```typescript
// packages/cli/src/refine-source.ts
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import type { ExtractedSkill, AuditContext, DraftedFix, RefineSource } from '@to-skills/core';
import { upsertJsDocTag } from '@to-skills/core';
import { extractCliSkill } from './extract.js';
import { introspectCommander } from './introspect-commander.js';
import { readOptionsTags } from './options-jsdoc.js';

interface CliRefineSourceOptions {
  program: Command;
  sourceGlob: string; // absolute glob root, e.g. <cwd>/**/*.ts
  cwd: string;
}

const EXCLUDED = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

export class CliRefineSource implements RefineSource {
  constructor(private readonly opts: CliRefineSourceOptions) {}

  private interfaceName(command: string): string {
    return command.replace(/(^|[-_ ])([a-z])/g, (_, __, c: string) => c.toUpperCase()) + 'Options';
  }

  async extract(): Promise<ExtractedSkill> {
    const surfaces = introspectCommander(this.opts.program);
    const files = await this.sourceFiles();
    // Read routing tags from each command's *Options interface JSDoc.
    const configSurfaces = [];
    for (const s of surfaces) {
      const iface = this.interfaceName(s.name);
      for (const file of files) {
        const tags = readOptionsTags(iface, await readFile(file, 'utf8'));
        if (Object.keys(tags).length > 0) {
          configSurfaces.push({ name: iface, sourceType: 'config', ...tags });
          break;
        }
      }
    }
    return extractCliSkill({ program: this.opts.program, configSurfaces });
  }

  guidance(): string {
    const path = fileURLToPath(new URL('../skills/to-skills-cli-docs/SKILL.md', import.meta.url));
    return readFileSyncSafe(path);
  }

  auditContext(_skill: ExtractedSkill): AuditContext {
    return {};
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const files = await this.sourceFiles();
    for (const fix of fixes) {
      const iface = this.interfaceName(fix.toolName);
      const target = await this.findInterfaceFile(iface, files);
      if (!target) {
        process.stderr.write(
          `[to-skills] no ${iface} interface for command '${fix.toolName}'; skipped ${fix.tag}\n`
        );
        continue;
      }
      const src = await readFile(target, 'utf8');
      const next = upsertJsDocTag(src, iface, fix.tag, fix.value);
      if (next !== src) await writeFile(target, next, 'utf8');
    }
  }

  private async sourceFiles(): Promise<string[]> {
    /* glob with EXCLUDED + *.d.ts filter */
  }
  private async findInterfaceFile(iface: string, files: string[]): Promise<string | undefined> {
    /* first file containing `interface <iface>` */
  }
}
```

Implement the two private helpers and `readFileSyncSafe`. Reuse the glob-exclude pattern from `packages/mcp/src/refine/build/ts-mcp-source.ts`.

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5:** Bundle the guidance skill into the published package: confirm `packages/cli/skills/to-skills-cli-docs/SKILL.md` ships (check `files`/`exports` in `packages/cli/package.json`; it already ships for `writeCliSkill`).
- [ ] **Step 6: Commit.** `git commit -m "feat(cli): CliRefineSource (extract+guidance+JSDoc write-back)"`

---

## Chunk 5: `refine` source detection + `--source`

### Task 5.1: `detect-source.ts`

**Files:** Create `packages/client/src/detect-source.ts`; Test `packages/client/tests/unit/detect-source.test.ts`

- [ ] **Step 1: Write failing tests.** From a fixture `package.json`: `@to-skills/cli`→`'cli'`; `@to-skills/mcp`→`'mcp'`; `typedoc-plugin-to-skills`→`'typedoc'`; multiple→`'ambiguous'`; none→`'none'`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `detectRefineSource(cwd): Promise<'cli'|'mcp'|'typedoc'|'ambiguous'|'none'>` reading deps+devDeps.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git commit -m "feat(client): detect refine source from installed packages"`

### Task 5.2: Wire CLI source into `refine`

**Files:** Modify `packages/client/src/commands/refine.ts`

- [ ] **Step 1:** Add `--source <cli|mcp|typedoc>`, `--program <file#export>` options. Make `--mcp` no longer globally required.
- [ ] **Step 2:** Resolve source: explicit `--source` → use it; else `detectRefineSource(cwd)`; `ambiguous`/`none` → exit 1 with a message listing candidates and `--source`.
- [ ] **Step 3:** Validate flags per source (e.g. `mcp` requires `--mcp`; `cli` may use `--program`/`--source-glob`). For `cli`, `loadProgram` + `new CliRefineSource(...)`; keep existing MCP branch.
- [ ] **Step 4:** Manual smoke (CLI): in a fixture/`@sittir/cli` checkout, `to-skills refine --source cli --program ./src/cli.ts#buildProgram` → prints iteration lines; writes JSDoc. (Requires `ANTHROPIC_API_KEY`; if unset, assert the pre-flight error is clear.)
- [ ] **Step 5: Full suite + type-check.** `pnpm test && pnpm run type-check` → PASS.
- [ ] **Step 6: Commit.** `git commit -am "feat(client): refine supports the cli source with detection + --source"`

---

## Chunk 6: `to-skills init`

### Task 6.1: Project-nature detection + package-manager detection

**Files:** Add to `packages/client/src/detect-source.ts`; Test alongside

- [ ] **Step 1: Write failing tests.** `detectProjectNature(cwd)`: commander/yargs dep or loadable bin → `'cli'`; `@modelcontextprotocol/sdk` → `'mcp'`; else `'typedoc'`. `detectPackageManager(cwd)`: `pnpm-lock.yaml`→`'pnpm'`, `yarn.lock`→`'yarn'`, else `'npm'`.
- [ ] **Step 2–4:** Implement, verify pass.
- [ ] **Step 5: Commit.** `git commit -am "feat(client): project-nature + package-manager detection for init"`

### Task 6.2: `init` command

**Files:** Create `packages/client/src/commands/init.ts`; register in `packages/client/src/bin.ts`; Test `packages/client/tests/unit/init.test.ts`

- [ ] **Step 1: Write failing tests** (injecting a stub installer/generator/refiner so no real install/network runs): given a `cli` fixture, `init` (a) chooses the `@to-skills/cli` package + correct pkg-manager add command, (b) calls generate with `outDir` = `<cwd>/skills`, (c) invokes refine for `cli`. Install failure → throws with the command in the message; generate/refine not called.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** `buildInitCommand()`: detect nature (`--source` overrides) → map to package → run pkg-manager add (via an injectable `runInstall` defaulting to `child_process` spawn) → generate skill into `skills/<name>/` (CLI path: `loadProgram` + `extractCliSkill` + `writeCliSkill`) → dispatch `refine` for the source. Errors surface the exact command and stop.
- [ ] **Step 4:** Register in `bin.ts`: `program.addCommand(buildInitCommand())`.
- [ ] **Step 5: Run, verify pass + type-check.**
- [ ] **Step 6: Commit.** `git commit -am "feat(client): add to-skills init (detect→install→generate→refine)"`

### Task 6.3: Docs

**Files:** Modify root `README.md` (the existing Refine subsection)

- [ ] **Step 1:** Document `to-skills init` and the new `refine --source`/`--program` flags; note CLI write-back targets the `*Options` interface JSDoc.
- [ ] **Step 2: Commit.** `git commit -am "docs: document to-skills init and multi-source refine"`

---

## Final integration

- [ ] **Step 1:** `pnpm test && pnpm run type-check && pnpm run lint` → all PASS, no lint errors.
- [ ] **Step 2:** Add a changeset: `@to-skills/core` minor, `@to-skills/cli` minor, `@to-skills/client` minor — "multi-source refine (CLI), `to-skills init`, ast-grep JSDoc editing, guidance injection".
- [ ] **Step 3:** End-to-end dogfood: re-run `pnpm gen-cli-skill` in `@sittir/cli`, then `to-skills refine --source cli --program ./src/cli.ts#buildProgram` (with `ANTHROPIC_API_KEY`); confirm `@useWhen` JSDoc appears on `*Options` interfaces and the re-extracted skill's grade improves.
- [ ] **Step 4: Commit** any docs/changeset. Open PR.

---

## Notes & risks

- **Loop closure (highest risk):** CLI refine only converges if `extract()` re-reads written tags. Task 4.2 + 4.3 implement this via `*Options` interface JSDoc. If a CLI doesn't use `*Options` interfaces, refine cannot persist annotations — `applyFixes` logs and skips (documented limitation; the `to-skills-cli-docs` rubric prescribes config-surface JSDoc).
- **tree-sitter grammar specifics:** kind/field names in `ast-edit.ts` (`lexical_declaration`, `variable_declarator`, `comment`) must match `@ast-grep/napi`'s TypeScript grammar; verify during Task 1.2 and adjust.
- **MCP path untouched** this pass; its `meta-edit`/`tool-discovery` migration to the shared AST primitives is a fast-follow (separate plan).
- **DRY:** `upsertJsDocTag` is the single JSDoc editor for core, CLI, and (later) TypeDoc.
