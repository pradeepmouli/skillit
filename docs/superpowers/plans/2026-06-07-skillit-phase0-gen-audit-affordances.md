# skillit Phase 0 — `gen` / `audit --json` / `resolveTargetLocation` Affordances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface skillit's deterministic generate primitive as a first-class side-effect-free `skillit gen` command, reduce `skillit init` to install/wire-only, add a thin `skillit audit --json` command, and add an optional `resolveTargetLocation` method to every `RefineSource` — the agent-free core affordances of §9.3 Phase 0.

**Architecture:** Extract ONE shared generate module (`packages/client/src/generate.ts`) that both the new `gen` command and (the now-removed) init generation would have called — DRY: a single `generateSkill()` path per source kind. `gen`, `init`, and `audit` all resolve their source the same way `refine` does (`resolveRefineSource`). `audit --json` reuses the existing `auditSkill` + `estimateSkillJudgeScore` and serializes their output plus per-finding `resolveTargetLocation()` results. `resolveTargetLocation` is an optional `RefineSource` method, so adding it breaks no existing implementor.

**Tech Stack:** TypeScript 5 (strict), Node ≥20, commander 15, vitest, pnpm workspaces, oxlint, changesets. Type-check is `tsgo --noEmit`; lint is `oxlint`; tests are `vitest run`.

---

## File Structure

**New files**

- `packages/core/src/refine/types.ts` _(modify)_ — add `TargetLocation` interface + optional `resolveTargetLocation` to the `RefineSource` interface. Single source of truth for the contract.
- `packages/client/src/generate.ts` _(create)_ — the DRY shared generate module. Exports `GenerateSkillOpts`, `GenerateConfigSkillOpts`, `generateCliSkill()`, `generateConfigSkill()`, and a `generateSkill(opts)` dispatcher keyed on source kind. This is the ONE generate path `gen` calls; init no longer generates.
- `packages/client/src/commands/gen.ts` _(create)_ — `buildGenCommand()`: the `skillit gen` commander command. Resolves source via `resolveRefineSource`, calls `generate.ts`. Thin.
- `packages/client/src/commands/audit.ts` _(create)_ — `buildAuditCommand()` + `runAuditCommand()` + `buildAuditReport()`: the `skillit audit --json` command. Wraps `auditSkill` + `estimateSkillJudgeScore`, attaches `resolveTargetLocation` per finding, serializes to stdout.
- `packages/client/src/__tests__/generate.test.ts` _(create)_ — tests for the shared generate dispatcher.
- `packages/client/src/__tests__/gen.test.ts` _(create)_ — tests for the `gen` command (injection seam mirroring `InitDeps`).
- `packages/client/src/__tests__/audit-report.test.ts` _(create)_ — tests for `buildAuditReport()` (pure, no I/O).
- `packages/core/src/refine/__tests__/resolve-target-location.test.ts` _(create)_ — tests for `ConfigRefineSource.resolveTargetLocation`.
- `packages/cli/src/__tests__/cli-resolve-target.test.ts` _(create)_ — tests for `CliRefineSource.resolveTargetLocation`.
- `.changeset/phase0-gen-audit-affordances.md` _(create)_ — user-facing CLI changeset.

**Modified files**

- `packages/client/src/commands/init.ts` — strip generate + refine + regenerate from BOTH the config branch and the cli branch; reduce to detect → install → wire → print "now run `skillit gen`". Remove `generateSkill`/`generateConfigSkill`/`runRefine` from `InitDeps` and the default impls.
- `packages/client/src/program.ts` (`buildProgram`) — register `buildGenCommand()` and `buildAuditCommand()`.
- `packages/client/src/__tests__/init.test.ts` — rewrite assertions: init installs + prints guidance, never generates/refines.
- `packages/client/src/__tests__/program.test.ts` — expect `['audit', 'gen', 'init', 'mcp', 'refine']`.
- `packages/cli/src/refine-source.ts` (`CliRefineSource`) — add `resolveTargetLocation`.
- `packages/typedoc/src/refine/typedoc-source.ts` (`TypeDocRefineSource`) — add `resolveTargetLocation` (reuse `resolveSourceFile`).
- `packages/core/src/refine/config-source.ts` (`ConfigRefineSource`) — add `resolveTargetLocation`.
- `packages/mcp/src/refine/build/ts-mcp-source.ts` + `packages/mcp/src/refine/runtime/mcp-source.ts` — add `resolveTargetLocation` (build: discover tools; runtime: undefined).

---

## Ordering rationale (suite stays green)

Tasks are ordered so nothing is unreachable mid-plan:

1. **Task 1** adds `resolveTargetLocation` to the _interface_ as **optional** — no implementor breaks.
2. **Tasks 2–6** implement `resolveTargetLocation` per source — additive.
3. **Task 7** creates the DRY shared `generate.ts` module (additive; init still has its own copy).
4. **Task 8** adds the `gen` command (additive).
5. **Task 9** adds `audit --json` (additive).
6. **Task 10** registers both in `buildProgram` (additive; `program.test.ts` updated here).
7. **Task 11** — only NOW — strips init's generation/refine and repoints it. Everything `gen`/`audit` need already exists, so init losing its generators leaves no dangling caller.
8. **Task 12** changeset + final gate.

---

## Task 1: Add `resolveTargetLocation` to the `RefineSource` contract

**Files:**

- Modify: `packages/core/src/refine/types.ts`
- Test: `packages/core/src/refine/__tests__/resolve-target-location.test.ts` (created in Task 4; this task is type-only)

- [ ] **Step 1: Add the `TargetLocation` type and optional method**

In `packages/core/src/refine/types.ts`, add the `TargetLocation` interface immediately above `export interface RefineSource` and add the optional method to the interface. The current interface (lines 47–52) is:

```typescript
export interface RefineSource {
  extract(): Promise<ExtractedSkill>;
  auditContext(skill: ExtractedSkill): AuditContext;
  applyFixes(fixes: readonly DraftedFix[]): Promise<void>;
  guidance?(): string | Promise<string>;
}
```

Replace it with:

```typescript
/**
 * Where an audit/judge target's enrichment surface lives on disk, so a caller
 * (e.g. the agent-bootstrap slash command) can jump straight to the declaration
 * instead of re-deriving the file from `sourceModule`.
 */
export interface TargetLocation {
  /** Absolute or repo-relative path to the file holding the declaration. */
  file: string;
  /** The declaration name to anchor the edit on (export name, interface, or option key). */
  declName: string;
  /** Dot-path into a config type when the target is a single option (e.g. `components.prefix`). */
  propertyPath?: string;
}

export interface RefineSource {
  extract(): Promise<ExtractedSkill>;
  auditContext(skill: ExtractedSkill): AuditContext;
  applyFixes(fixes: readonly DraftedFix[]): Promise<void>;
  guidance?(): string | Promise<string>;
  /**
   * Resolve an improvement target (`{file, name, kind}` from `ActionableImprovement.targets`)
   * to a concrete on-disk location. Optional — a source that cannot resolve a
   * given target returns `undefined`. Used by `skillit audit --json` and the
   * agent-bootstrap loop.
   *
   * The return is a union of sync and async: config/typedoc resolve synchronously,
   * but cli and mcp(build) must read source files, so they return a `Promise`.
   * Callers `await` the result (awaiting a non-Promise is a no-op).
   */
  resolveTargetLocation?(target: {
    name: string;
    kind: string;
    file?: string;
  }): TargetLocation | undefined | Promise<TargetLocation | undefined>;
}
```

> This union (rather than a bare sync type) is intentional and final — cli (Task 3) and mcp-build (Task 5) are `async`. Do not narrow it.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @skillit/core run type-check`
Expected: PASS (no errors — the method is optional, so `ConfigRefineSource`/`McpRefineSource`/etc. still satisfy the interface).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/refine/types.ts
git commit -m "feat(core): add optional resolveTargetLocation to RefineSource"
```

---

## Task 2: Implement `resolveTargetLocation` on `TypeDocRefineSource`

**Files:**

- Modify: `packages/typedoc/src/refine/typedoc-source.ts`

This source already holds `resolveSourceFile(exportName) => string | undefined` (typedoc-source.ts:8, used by `applyFixes` at :25). Reuse it.

- [ ] **Step 1: Add the method**

In `packages/typedoc/src/refine/typedoc-source.ts`, add the import for `TargetLocation` to the existing type import and add the method to the class. The current import (line 3) is:

```typescript
import type { ExtractedSkill, AuditContext, DraftedFix, RefineSource } from '@skillit/core';
```

Change it to:

```typescript
import type {
  ExtractedSkill,
  AuditContext,
  DraftedFix,
  RefineSource,
  TargetLocation
} from '@skillit/core';
```

Then add this method inside the `TypeDocRefineSource` class, after `auditContext` (line 18–20):

```typescript
  resolveTargetLocation(target: {
    name: string;
    kind: string;
    file?: string;
  }): TargetLocation | undefined {
    const file = this.opts.resolveSourceFile(target.name);
    if (!file) return undefined;
    return { file, declName: target.name };
  }
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @skillit/typedoc run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/typedoc/src/refine/typedoc-source.ts
git commit -m "feat(typedoc): resolveTargetLocation reuses resolveSourceFile"
```

---

## Task 3: Implement `resolveTargetLocation` on `CliRefineSource`

**Files:**

- Modify: `packages/cli/src/refine-source.ts`
- Test: `packages/cli/src/__tests__/cli-resolve-target.test.ts`

`CliRefineSource` has `interfaceNameCandidates(command)` (refine-source.ts:50) and `findInterfaceFile(iface, sources)` (refine-source.ts:189). A CLI target's `name` is the command name; it resolves to the `<Command>Options` interface in some source file.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/__tests__/cli-resolve-target.test.ts`:

```typescript
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { CliRefineSource } from '../refine-source.js';

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('CliRefineSource.resolveTargetLocation', () => {
  it('resolves a command target to the file declaring its <Command>Options interface', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-resolve-'));
    await writeFile(
      join(tmpDir, 'add-remote.ts'),
      `export interface AddRemoteOptions {\n  url: string;\n}\n`
    );
    const program = new Command('tool');
    const source = new CliRefineSource({
      program,
      sourceGlob: join(tmpDir, '**', '*.ts'),
      cwd: tmpDir
    });

    const loc = await source.resolveTargetLocation({ name: 'add-remote', kind: 'command' });
    expect(loc).toBeDefined();
    expect(loc!.declName).toBe('AddRemoteOptions');
    expect(loc!.file).toBe(join(tmpDir, 'add-remote.ts'));
  });

  it('returns undefined when no options interface exists for the command', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-resolve-'));
    await writeFile(join(tmpDir, 'other.ts'), `export const x = 1;\n`);
    const program = new Command('tool');
    const source = new CliRefineSource({
      program,
      sourceGlob: join(tmpDir, '**', '*.ts'),
      cwd: tmpDir
    });

    const loc = await source.resolveTargetLocation({ name: 'missing', kind: 'command' });
    expect(loc).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/cli/src/__tests__/cli-resolve-target.test.ts`
Expected: FAIL with `source.resolveTargetLocation is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/refine-source.ts`, add `TargetLocation` to the existing `@skillit/core` type import (currently lines 4–12, imports `type AuditContext, type DraftedFix, ...`). Add `type TargetLocation` to that import list. Then add this method to the `CliRefineSource` class, after `auditContext` (lines 118–120):

```typescript
  async resolveTargetLocation(target: {
    name: string;
    kind: string;
    file?: string;
  }): Promise<TargetLocation | undefined> {
    const sources = await this.readSources();
    const candidates = this.interfaceNameCandidates(target.name);
    for (const iface of candidates) {
      const file = this.findInterfaceFile(iface, sources);
      if (file) return { file, declName: iface };
    }
    return undefined;
  }
```

> Note: this implementation is `async` (it reads source files). Task 1 already declares the interface return as `TargetLocation | undefined | Promise<TargetLocation | undefined>`, so the `Promise`-returning method satisfies the optional slot — no further interface change is needed. Callers `await` the result (`audit.ts` Task 9 awaits it).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/cli/src/__tests__/cli-resolve-target.test.ts`
Expected: PASS (2 passed).

If `pnpm --filter @skillit/cli run type-check` fails on the async return, edit `packages/core/src/refine/types.ts` so the optional method reads:

```typescript
  resolveTargetLocation?(target: { name: string; kind: string; file?: string }):
    | TargetLocation
    | undefined
    | Promise<TargetLocation | undefined>;
```

- [ ] **Step 5: Run type-check**

Run: `pnpm --filter @skillit/cli run type-check && pnpm --filter @skillit/core run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/refine-source.ts packages/cli/src/__tests__/cli-resolve-target.test.ts packages/core/src/refine/types.ts
git commit -m "feat(cli): CliRefineSource.resolveTargetLocation via interface candidates"
```

---

## Task 4: Implement `resolveTargetLocation` on `ConfigRefineSource`

**Files:**

- Modify: `packages/core/src/refine/config-source.ts`
- Test: `packages/core/src/refine/__tests__/resolve-target-location.test.ts`

A config target's `name` is the option's dot-path `configKey` (`kind: 'config-option'`) per `configOptionTargetsForTag` (audit-score.ts:308). The file is the config file; the declName is the config type name; the propertyPath is the option key.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/refine/__tests__/resolve-target-location.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ConfigRefineSource } from '../config-source.js';

describe('ConfigRefineSource.resolveTargetLocation', () => {
  const source = new ConfigRefineSource({
    configFile: '/repo/src/config.ts',
    typeName: 'MyConfig'
  });

  it('resolves a config-option target to {file, declName=typeName, propertyPath=key}', () => {
    const loc = source.resolveTargetLocation({ name: 'components.prefix', kind: 'config-option' });
    expect(loc).toEqual({
      file: '/repo/src/config.ts',
      declName: 'MyConfig',
      propertyPath: 'components.prefix'
    });
  });

  it('resolves a config-example target to the config file with no propertyPath', () => {
    const loc = source.resolveTargetLocation({ name: 'MyConfig', kind: 'config-example' });
    expect(loc).toEqual({ file: '/repo/src/config.ts', declName: 'MyConfig' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/core/src/refine/__tests__/resolve-target-location.test.ts`
Expected: FAIL with `source.resolveTargetLocation is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/refine/config-source.ts`, add `TargetLocation` to the type import from `./types.js` (currently line 12: `import type { DraftedFix, RefineSource } from './types.js';`):

```typescript
import type { DraftedFix, RefineSource, TargetLocation } from './types.js';
```

Add this method to the `ConfigRefineSource` class, after `auditContext` (lines 129–136):

```typescript
  /**
   * Map an improvement target to its on-disk location. Config targets carry the
   * option's dot-path `configKey` as `name` (kind `config-option`); the config
   * type holds them, so the file is always the config file and the declName is
   * the type. A `config-example` target points at the same file with no path.
   */
  resolveTargetLocation(target: {
    name: string;
    kind: string;
    file?: string;
  }): TargetLocation | undefined {
    if (target.kind === 'config-example') {
      return { file: this.opts.configFile, declName: this.opts.typeName };
    }
    return {
      file: this.opts.configFile,
      declName: this.opts.typeName,
      propertyPath: target.name
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/core/src/refine/__tests__/resolve-target-location.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/refine/config-source.ts packages/core/src/refine/__tests__/resolve-target-location.test.ts
git commit -m "feat(core): ConfigRefineSource.resolveTargetLocation via dot-path configKey"
```

---

## Task 5: Implement `resolveTargetLocation` on the MCP sources

**Files:**

- Modify: `packages/mcp/src/refine/build/ts-mcp-source.ts`
- Modify: `packages/mcp/src/refine/runtime/mcp-source.ts`

Build mode can discover tool locations via the same `discoverTools` it already uses in `applyFixes`. Runtime mode edits an overlay JSON (no source declaration) → returns `undefined`.

- [ ] **Step 1: Add the build-mode method**

In `packages/mcp/src/refine/build/ts-mcp-source.ts`, add `TargetLocation` to the type import (line 3: `import type { AuditContext, DraftedFix, ExtractedSkill, RefineSource } from '@skillit/core';`):

```typescript
import type {
  AuditContext,
  DraftedFix,
  ExtractedSkill,
  RefineSource,
  TargetLocation
} from '@skillit/core';
```

The file already imports `readFile`, `glob`, and `discoverTools`. Add this method to the `TypeScriptMcpRefineSource` class, after `auditContext` (lines 23–25):

```typescript
  async resolveTargetLocation(target: {
    name: string;
    kind: string;
    file?: string;
  }): Promise<TargetLocation | undefined> {
    const EXCLUDED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.cache']);
    for await (const file of glob(this.opts.sourceGlob, {
      exclude: (f) => f.endsWith('.d.ts') || f.split(/[\\/]/).some((seg) => EXCLUDED_DIRS.has(seg))
    })) {
      const source = await readFile(file, 'utf8');
      const { tools } = discoverTools(file, source);
      if (tools.has(target.name)) {
        return { file, declName: target.name };
      }
    }
    return undefined;
  }
```

- [ ] **Step 2: Add the runtime-mode method**

In `packages/mcp/src/refine/runtime/mcp-source.ts`, add `TargetLocation` to its `@skillit/core` type import, then add this method to the `McpRefineSource` class, after `auditContext`:

```typescript
  resolveTargetLocation(_target: {
    name: string;
    kind: string;
    file?: string;
  }): TargetLocation | undefined {
    // Runtime mode edits an overlay JSON, not source declarations — there is no
    // on-disk symbol to jump to.
    return undefined;
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @skillit/mcp run type-check`
Expected: PASS.

- [ ] **Step 4: Run the mcp suite to confirm no regression**

Run: `pnpm exec vitest run packages/mcp`
Expected: PASS (all existing mcp tests green; methods are additive).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/refine/build/ts-mcp-source.ts packages/mcp/src/refine/runtime/mcp-source.ts
git commit -m "feat(mcp): resolveTargetLocation (build discovers tools; runtime undefined)"
```

---

## Task 6: Re-run the full core/cli/client/mcp suite (interface checkpoint)

- [ ] **Step 1: Run the suites touched so far**

Run: `pnpm exec vitest run packages/core packages/cli packages/mcp packages/typedoc`
Expected: PASS (all green — every change so far is additive/optional).

- [ ] **Step 2: Type-check the whole workspace**

Run: `pnpm run type-check`
Expected: PASS.

No commit (checkpoint only).

---

## Task 7: Create the DRY shared `generate.ts` module

**Files:**

- Create: `packages/client/src/generate.ts`
- Test: `packages/client/src/__tests__/generate.test.ts`

This is the ONE generate path. It lifts `defaultGenerateSkill` (cli: `loadProgram` → `extractCliSkill` → `writeCliSkill`) and `defaultGenerateConfigSkill` (config: `ConfigRefineSource.extract` → `renderSkills` → `writeSkills`, with `maxTokens: 16000` and the config-specific description) out of `init.ts` verbatim, so `gen` and (later, when init stops generating) any other caller share it.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/__tests__/generate.test.ts`:

```typescript
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateConfigSkill } from '../generate.js';

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('generateConfigSkill', () => {
  it('extracts the config type and writes a SKILL.md into outDir', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'gen-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: '@scope/my-lib', description: 'A test lib', keywords: ['x'] })
    );
    await writeFile(
      join(tmpDir, 'config.ts'),
      `/** A config. */\nexport interface MyConfig {\n  /** out dir */\n  outDir?: string;\n}\n`
    );
    const outDir = join(tmpDir, 'skills');

    await generateConfigSkill({
      configFile: join(tmpDir, 'config.ts'),
      typeName: 'MyConfig',
      name: 'my-lib',
      outDir
    });

    expect(existsSync(join(outDir, 'my-lib', 'SKILL.md'))).toBe(true);
    const md = await readFile(join(outDir, 'my-lib', 'SKILL.md'), 'utf8');
    expect(md).toContain('my-lib');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/client/src/__tests__/generate.test.ts`
Expected: FAIL with `Cannot find module '../generate.js'` (or `generateConfigSkill is not a function`).

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/generate.ts`:

```typescript
// packages/client/src/generate.ts
import { extractCliSkill, loadProgram, writeCliSkill } from '@skillit/cli';
import { ConfigRefineSource, renderSkills, writeSkills } from '@skillit/core';
import type { RefineSourceKind } from './detect-source.js';

/** Options for CLI-path skill generation. */
export interface GenerateSkillOpts {
  /** Project root being generated for. */
  cwd: string;
  /** Resolved project nature. */
  nature: RefineSourceKind;
  /** Skill name (consumer package name, scope stripped). */
  name: string;
  /** Absolute output directory (`<cwd>/<out>`). */
  outDir: string;
  /** `--program <file#export>` entry, if provided. */
  program?: string;
}

/** Options for config-path skill generation. */
export interface GenerateConfigSkillOpts {
  /** Absolute path to the TypeScript file declaring the config type. */
  configFile: string;
  /** Exported interface / type-alias name to document. */
  typeName: string;
  /** Skill name (consumer package name, scope stripped). */
  name: string;
  /** Absolute output directory (`<cwd>/<out>`). */
  outDir: string;
}

/** CLI-path skill generation: loadProgram → extractCliSkill → writeCliSkill. */
export async function generateCliSkill(opts: GenerateSkillOpts): Promise<void> {
  const program = await loadProgram({ program: opts.program, cwd: opts.cwd });
  const skill = await extractCliSkill({ program, metadata: { name: opts.name } });
  writeCliSkill(skill, { outDir: opts.outDir });
}

/** Config-path skill generation: extract the surface → render → write. */
export async function generateConfigSkill(opts: GenerateConfigSkillOpts): Promise<void> {
  const skill = await new ConfigRefineSource({
    configFile: opts.configFile,
    typeName: opts.typeName,
    name: opts.name,
    // A config-specific description so the rendered skill describes the config
    // surface, not the package blurb (which is about the whole package).
    description: `Configuration options for ${opts.typeName}.`
  }).extract();
  // Config skills are content-rich (per-option routing + example); raise the
  // per-reference token budget so a multi-option surface isn't truncated.
  const rendered = renderSkills([skill], { outDir: opts.outDir, maxTokens: 16000 });
  writeSkills(rendered, { outDir: opts.outDir });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/client/src/__tests__/generate.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Type-check**

Run: `pnpm --filter @skillit/client run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/generate.ts packages/client/src/__tests__/generate.test.ts
git commit -m "feat(client): extract shared generate module (DRY for gen + init)"
```

---

## Task 8: Add the `skillit gen` command

**Files:**

- Create: `packages/client/src/commands/gen.ts`
- Test: `packages/client/src/__tests__/gen.test.ts`

`gen` resolves the source via `resolveRefineSource` (same as refine), then dispatches to `generate.ts`. It takes the same selectors as init/refine. Mirror the `InitDeps` injection seam so tests inject stub generators.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/__tests__/gen.test.ts`:

```typescript
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildGenCommand, type GenDeps } from '../commands/gen.js';
import type { GenerateConfigSkillOpts, GenerateSkillOpts } from '../generate.js';

let tmpDir: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
});

afterEach(async () => {
  process.chdir(prevCwd);
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

async function writeCliFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'gen-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({
      name: '@scope/my-tool',
      dependencies: { commander: '^15.0.0', '@skillit/cli': '^0.1.0' }
    })
  );
  process.chdir(tmpDir);
  return process.cwd();
}

async function writeConfigFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'gen-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: '@scope/my-lib', dependencies: {} })
  );
  await writeFile(
    join(tmpDir, 'config.ts'),
    `export interface MyConfig {\n  outDir?: string;\n}\n`
  );
  process.chdir(tmpDir);
  return process.cwd();
}

function makeStubs(): {
  deps: GenDeps;
  cliCalls: GenerateSkillOpts[];
  configCalls: GenerateConfigSkillOpts[];
} {
  const cliCalls: GenerateSkillOpts[] = [];
  const configCalls: GenerateConfigSkillOpts[] = [];
  const deps: GenDeps = {
    generateCliSkill: async (opts) => {
      cliCalls.push(opts);
    },
    generateConfigSkill: async (opts) => {
      configCalls.push(opts);
    }
  };
  return { deps, cliCalls, configCalls };
}

async function run(deps: GenDeps, argv: string[]): Promise<void> {
  const cmd = buildGenCommand(deps);
  await cmd.parseAsync(argv, { from: 'user' });
}

describe('buildGenCommand', () => {
  it('generates the cli skill into <cwd>/skills for a cli source', async () => {
    const dir = await writeCliFixture();
    const { deps, cliCalls } = makeStubs();
    await run(deps, ['--source', 'cli']);
    expect(cliCalls).toHaveLength(1);
    expect(cliCalls[0]!.outDir).toBe(join(dir, 'skills'));
    expect(cliCalls[0]!.name).toBe('my-tool');
  });

  it('respects an explicit --out directory', async () => {
    const dir = await writeCliFixture();
    const { deps, cliCalls } = makeStubs();
    await run(deps, ['--source', 'cli', '--out', 'docs/skills']);
    expect(cliCalls[0]!.outDir).toBe(join(dir, 'docs/skills'));
  });

  it('generates the config skill from --config-type', async () => {
    const dir = await writeConfigFixture();
    const { deps, configCalls } = makeStubs();
    await run(deps, ['--source', 'config', '--config-type', './config.ts#MyConfig']);
    expect(configCalls).toHaveLength(1);
    expect(configCalls[0]!.typeName).toBe('MyConfig');
    expect(configCalls[0]!.configFile).toBe(join(dir, 'config.ts'));
    expect(configCalls[0]!.outDir).toBe(join(dir, 'skills'));
  });

  it('errors when the config source lacks --config-type', async () => {
    await writeConfigFixture();
    const { deps } = makeStubs();
    await expect(run(deps, ['--source', 'config'])).rejects.toThrow(/--config-type/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/client/src/__tests__/gen.test.ts`
Expected: FAIL with `Cannot find module '../commands/gen.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/commands/gen.ts`:

```typescript
// packages/client/src/commands/gen.ts
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import {
  classifyRefineSources,
  detectInstalledSources,
  detectProjectNature,
  type RefineSourceKind
} from '../detect-source.js';
import {
  generateCliSkill as defaultGenerateCliSkill,
  generateConfigSkill as defaultGenerateConfigSkill,
  type GenerateConfigSkillOpts,
  type GenerateSkillOpts
} from '../generate.js';
import { parseConfigTypeSpec, resolveRefineSource } from './refine.js';

/** Injectable generators (test seam, mirrors InitDeps). */
export interface GenDeps {
  generateCliSkill?(opts: GenerateSkillOpts): Promise<void>;
  generateConfigSkill?(opts: GenerateConfigSkillOpts): Promise<void>;
}

/** Parsed options for the `gen` action. */
export interface GenCommandOpts {
  source?: string;
  program?: string;
  configType?: string;
  out: string;
}

/** Strip a leading `@scope/` from a package name for a skill dir name. */
function skillNameFrom(packageName: string): string {
  const slash = packageName.indexOf('/');
  if (packageName.startsWith('@') && slash !== -1) return packageName.slice(slash + 1);
  return packageName;
}

async function readPackageName(cwd: string): Promise<string> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name ?? 'skill';
  } catch {
    return 'skill';
  }
}

export function buildGenCommand(deps: GenDeps = {}): Command {
  const generateCliSkill = deps.generateCliSkill ?? defaultGenerateCliSkill;
  const generateConfigSkill = deps.generateConfigSkill ?? defaultGenerateConfigSkill;

  return new Command('gen')
    .description(
      'Deterministically (re)generate the skill from current source — no model, no install'
    )
    .option('--source <kind>', 'cli | mcp | typedoc | config (auto-detected if omitted)')
    .option('--program <file#export>', 'commander program entry (cli source)')
    .option('--config-type <file#export>', 'config type entry (config source)')
    .option('--out <dir>', 'output directory for the generated skill', 'skills')
    .action(async (opts: GenCommandOpts) => {
      const cwd = process.cwd();
      const outDir = join(cwd, opts.out);

      if (opts.source === 'config') {
        if (opts.configType === undefined) {
          throw new Error(
            'The config source requires --config-type <file#export> (e.g. ./src/config.ts#MyConfig).'
          );
        }
        const parsed = parseConfigTypeSpec(opts.configType, cwd);
        if ('error' in parsed) throw new Error(parsed.error);
        await generateConfigSkill({
          configFile: parsed.configFile,
          typeName: parsed.typeName,
          name: skillNameFrom(await readPackageName(cwd)),
          outDir
        });
        return;
      }

      // Resolve a cli/mcp/typedoc source the same way refine does.
      const candidates = await detectInstalledSources(cwd);
      const detected = classifyRefineSources(candidates);
      const resolution = resolveRefineSource(opts, detected, candidates);
      if ('error' in resolution) throw new Error(resolution.error);

      if (resolution.kind === 'cli') {
        const name = skillNameFrom(await readPackageName(cwd));
        const nature: RefineSourceKind = 'cli';
        await generateCliSkill({
          cwd,
          nature,
          name,
          outDir,
          ...(opts.program !== undefined ? { program: opts.program } : {})
        });
        return;
      }

      // mcp/typedoc generation is not wired in Phase 0; surface a clear message
      // rather than silently no-op. (detectProjectNature kept imported for parity
      // with init's detection and to avoid an unused-import lint when extended.)
      void detectProjectNature;
      throw new Error(
        `gen for the ${resolution.kind} source is not yet implemented; cli and config are supported in this release.`
      );
    });
}
```

> The `void detectProjectNature;` line prevents an unused-import lint while documenting intent. If oxlint flags the unused import regardless, remove the `detectProjectNature` import and the `void` line in Step 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/client/src/__tests__/gen.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Type-check + lint the file**

Run: `pnpm --filter @skillit/client run type-check && pnpm exec oxlint packages/client/src/commands/gen.ts`
Expected: PASS, no lint errors. (If `detectProjectNature` is flagged unused, delete its import and the `void detectProjectNature;` line, then re-run.)

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/commands/gen.ts packages/client/src/__tests__/gen.test.ts
git commit -m "feat(client): add skillit gen command (deterministic, side-effect-free)"
```

---

## Task 9: Add the `skillit audit --json` command

**Files:**

- Create: `packages/client/src/commands/audit.ts`
- Test: `packages/client/src/__tests__/audit-report.test.ts`

Split the report-building (pure) from the I/O dispatch (resolves source, extracts, prints). Test the pure builder. `buildAuditReport` takes a `RefineSource` + the extracted skill, runs `auditSkill` + `estimateSkillJudgeScore`, and attaches `resolveTargetLocation` per improvement target.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/__tests__/audit-report.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type {
  AuditContext,
  DraftedFix,
  ExtractedSkill,
  RefineSource,
  TargetLocation
} from '@skillit/core';
import { buildAuditReport } from '../commands/audit.js';

/** A minimal skill that will fail several audit checks (no keywords, no JSDoc tags). */
function minimalSkill(): ExtractedSkill {
  return {
    name: 'demo',
    description: 'A demo skill for testing the audit report builder shape.',
    functions: [
      {
        name: 'doThing',
        description: 'Does the thing.',
        signature: 'doThing(): void',
        parameters: [],
        returnType: 'void',
        examples: [],
        tags: {},
        sourceModule: 'index'
      }
    ],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };
}

class StubSource implements RefineSource {
  constructor(private readonly skill: ExtractedSkill) {}
  extract(): Promise<ExtractedSkill> {
    return Promise.resolve(this.skill);
  }
  auditContext(): AuditContext {
    return {};
  }
  async applyFixes(_fixes: readonly DraftedFix[]): Promise<void> {}
  resolveTargetLocation(target: { name: string; kind: string }): TargetLocation | undefined {
    return { file: `src/${target.name}.ts`, declName: target.name };
  }
}

describe('buildAuditReport', () => {
  it('returns the audit, the estimate, and per-target resolved locations', async () => {
    const skill = minimalSkill();
    const source = new StubSource(skill);

    const report = await buildAuditReport(source, skill);

    // audit + estimate present
    expect(report.audit.package).toBe('demo');
    expect(typeof report.estimate.total).toBe('number');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(report.estimate.grade);

    // improvements carry resolved locations for their targets
    const withTargets = report.improvements.filter((i) => (i.targets?.length ?? 0) > 0);
    if (withTargets.length > 0) {
      const first = withTargets[0]!;
      expect(first.resolvedLocations.length).toBe(first.targets!.length);
      expect(first.resolvedLocations[0]).toMatchObject({ declName: expect.any(String) });
    }
  });

  it('tolerates a source without resolveTargetLocation (locations are null)', async () => {
    const skill = minimalSkill();
    const source: RefineSource = {
      extract: () => Promise.resolve(skill),
      auditContext: () => ({}),
      applyFixes: async () => {}
    };

    const report = await buildAuditReport(source, skill);
    for (const imp of report.improvements) {
      for (const loc of imp.resolvedLocations) {
        expect(loc).toBeNull();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/client/src/__tests__/audit-report.test.ts`
Expected: FAIL with `Cannot find module '../commands/audit.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/client/src/commands/audit.ts`:

```typescript
// packages/client/src/commands/audit.ts
import { isAbsolute, join } from 'node:path';
import { Command } from 'commander';
import {
  auditSkill,
  ConfigRefineSource,
  estimateSkillJudgeScore,
  type ActionableImprovement,
  type AuditResult,
  type ExtractedSkill,
  type RefineSource,
  type SkillJudgeEstimate,
  type TargetLocation
} from '@skillit/core';
import { CliRefineSource, loadProgram } from '@skillit/cli';
import {
  classifyRefineSources,
  detectInstalledSources,
  type RefineSourceKind
} from '../detect-source.js';
import { parseConfigTypeSpec, resolveRefineSource, type RefineCommandOpts } from './refine.js';

/** An improvement with each of its targets resolved to a concrete location (or null). */
export interface AuditReportImprovement extends ActionableImprovement {
  /** One entry per `targets[]`, in order; `null` when the source can't resolve it. */
  resolvedLocations: Array<TargetLocation | null>;
}

/** The full JSON report emitted by `skillit audit --json`. */
export interface AuditReport {
  audit: AuditResult;
  estimate: SkillJudgeEstimate;
  improvements: AuditReportImprovement[];
}

/**
 * Pure report builder: audit + score the skill, then resolve every improvement
 * target to its on-disk location via the source's optional resolveTargetLocation.
 */
export async function buildAuditReport(
  source: RefineSource,
  skill: ExtractedSkill
): Promise<AuditReport> {
  const audit = auditSkill(skill, source.auditContext(skill));
  const estimate = estimateSkillJudgeScore(audit, skill);

  const improvements: AuditReportImprovement[] = [];
  for (const imp of estimate.improvements) {
    const targets = imp.targets ?? [];
    const resolvedLocations: Array<TargetLocation | null> = [];
    for (const target of targets) {
      const loc = source.resolveTargetLocation
        ? await source.resolveTargetLocation(target)
        : undefined;
      resolvedLocations.push(loc ?? null);
    }
    improvements.push({ ...imp, resolvedLocations });
  }

  return { audit, estimate, improvements };
}

/** Parsed options for the `audit` action. */
export interface AuditCommandOpts {
  source?: string;
  program?: string;
  configType?: string;
  mcp?: string;
  json?: boolean;
}

export async function runAuditCommand(opts: AuditCommandOpts): Promise<void> {
  const cwd = process.cwd();
  const candidates = await detectInstalledSources(cwd);
  const detected = classifyRefineSources(candidates);
  const resolution = resolveRefineSource(opts as RefineCommandOpts, detected, candidates);
  if ('error' in resolution) {
    console.error(resolution.error);
    process.exitCode = 1;
    return;
  }

  let source: RefineSource;
  if (resolution.kind === 'cli') {
    const program = await loadProgram({ program: opts.program, cwd });
    source = new CliRefineSource({ program, sourceGlob: join(cwd, '**', '*.ts'), cwd });
  } else if (resolution.kind === 'config') {
    const parsed = parseConfigTypeSpec(opts.configType!, cwd);
    if ('error' in parsed) {
      console.error(parsed.error);
      process.exitCode = 1;
      return;
    }
    source = new ConfigRefineSource({
      configFile: isAbsolute(parsed.configFile) ? parsed.configFile : join(cwd, parsed.configFile),
      typeName: parsed.typeName,
      name: parsed.typeName
    });
  } else {
    console.error(
      `audit for the ${resolution.kind} source is not yet supported; use --source cli|config.`
    );
    process.exitCode = 1;
    return;
  }

  const skill = await source.extract();
  const report = await buildAuditReport(source, skill);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Grade ${report.estimate.grade} (${report.estimate.total}/120)`);
    console.log(
      `Fatal ${report.audit.summary.fatal}, Error ${report.audit.summary.error}, Warning ${report.audit.summary.warning}, Alert ${report.audit.summary.alert}`
    );
  }
}

export function buildAuditCommand(): Command {
  return new Command('audit')
    .description('Audit + judge the generated skill; emit findings (with target locations) as JSON')
    .option('--source <kind>', 'cli | mcp | typedoc | config (auto-detected if omitted)')
    .option('--program <file#export>', 'commander program entry (cli source)')
    .option('--config-type <file#export>', 'config type entry (config source)')
    .option('--mcp <path>', 'path to mcp.json or MCP config file')
    .option('--json', 'emit the full AuditResult + SkillJudgeEstimate as JSON')
    .action((opts: AuditCommandOpts) => runAuditCommand(opts));
}

// `RefineSourceKind` re-exported for callers that key off the resolved kind.
export type { RefineSourceKind };
```

> Note: `ConfigRefineSource` is imported from `@skillit/core` (its public export, per `core/src/refine/index.ts:7`). `CliRefineSource`/`loadProgram` come from `@skillit/cli`. These match how `refine.ts` imports them (refine.ts:9, 14).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/client/src/__tests__/audit-report.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Type-check + lint**

Run: `pnpm --filter @skillit/client run type-check && pnpm exec oxlint packages/client/src/commands/audit.ts`
Expected: PASS. (If oxlint flags the trailing `export type { RefineSourceKind }` as unused, delete that line and its import.)

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/commands/audit.ts packages/client/src/__tests__/audit-report.test.ts
git commit -m "feat(client): add skillit audit --json (audit+judge+target locations)"
```

---

## Task 10: Register `gen` and `audit` in `buildProgram`

**Files:**

- Modify: `packages/client/src/program.ts`
- Modify: `packages/client/src/__tests__/program.test.ts`

- [ ] **Step 1: Update the failing test first (RED)**

In `packages/client/src/__tests__/program.test.ts`, change the subcommand assertion (current lines 14–20) to:

```typescript
it('registers the audit, gen, init, mcp, and refine subcommands', () => {
  const names = buildProgram()
    .commands.map((c) => c.name())
    .sort();
  expect(names).toEqual(['audit', 'gen', 'init', 'mcp', 'refine']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/client/src/__tests__/program.test.ts`
Expected: FAIL — actual `['init', 'mcp', 'refine']` does not equal `['audit', 'gen', 'init', 'mcp', 'refine']`.

- [ ] **Step 3: Register the commands**

In `packages/client/src/program.ts`, add the imports (after line 6) and register them in `buildProgram`. Add these imports:

```typescript
import { buildGenCommand } from './commands/gen.js';
import { buildAuditCommand } from './commands/audit.js';
```

Then in `buildProgram`, after `program.addCommand(buildRefineCommand());` (line 35), add:

```typescript
program.addCommand(buildGenCommand());
program.addCommand(buildAuditCommand());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/client/src/__tests__/program.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/program.ts packages/client/src/__tests__/program.test.ts
git commit -m "feat(client): register gen and audit subcommands in buildProgram"
```

---

## Task 11: Reduce `skillit init` to install/wire ONLY

**Files:**

- Modify: `packages/client/src/commands/init.ts`
- Modify: `packages/client/src/__tests__/init.test.ts`

Strip generation + refine + regenerate from both branches. `init` detects nature, installs the package, and prints "now run `skillit gen`". `InitDeps` loses `generateSkill`/`generateConfigSkill`/`runRefine`; the config and cli branches no longer generate.

- [ ] **Step 1: Rewrite the init test (RED)**

Replace the entire contents of `packages/client/src/__tests__/init.test.ts` with:

```typescript
import { buildInitCommand, type InitDeps } from '../commands/init.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let tmpDir: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
});

afterEach(async () => {
  process.chdir(prevCwd);
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

async function writeCliFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'init-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: '@scope/my-tool', dependencies: { commander: '^15.0.0' } })
  );
  await writeFile(join(tmpDir, 'pnpm-lock.yaml'), '');
  process.chdir(tmpDir);
  return process.cwd();
}

async function writeMcpFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'init-'));
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'my-server', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } })
  );
  await writeFile(join(tmpDir, 'pnpm-lock.yaml'), '');
  process.chdir(tmpDir);
  return process.cwd();
}

interface InstallCall {
  pkg: string;
  pm: string;
  cwd: string;
}

function makeStubs(overrides?: Partial<InitDeps>): {
  deps: InitDeps;
  installCalls: InstallCall[];
} {
  const installCalls: InstallCall[] = [];
  const deps: InitDeps = {
    runInstall: async (pkg, pm, cwd) => {
      installCalls.push({ pkg, pm, cwd });
    },
    ...overrides
  };
  return { deps, installCalls };
}

function captureLog(): { logged: string[]; restore: () => void } {
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]): void => {
    logged.push(String(args[0]));
  };
  return {
    logged,
    restore: () => {
      console.log = originalLog;
    }
  };
}

async function run(deps: InitDeps, argv: string[] = []): Promise<void> {
  const cmd = buildInitCommand(deps);
  await cmd.parseAsync(argv, { from: 'user' });
}

describe('buildInitCommand (install/wire only)', () => {
  it('installs @skillit/cli with the detected pnpm command for a cli project', async () => {
    const dir = await writeCliFixture();
    const { deps, installCalls } = makeStubs();
    const { restore } = captureLog();
    try {
      await run(deps);
    } finally {
      restore();
    }
    expect(installCalls).toHaveLength(1);
    expect(installCalls[0]!.pkg).toBe('@skillit/cli');
    expect(installCalls[0]!.pm).toBe('pnpm');
    expect(installCalls[0]!.cwd).toBe(dir);
  });

  it('prints "run skillit gen" guidance and generates no artifacts for cli', async () => {
    await writeCliFixture();
    const { deps } = makeStubs();
    const { logged, restore } = captureLog();
    try {
      await run(deps);
    } finally {
      restore();
    }
    const out = logged.join('\n');
    expect(out).toMatch(/Installed @skillit\/cli/);
    expect(out).toMatch(/skillit gen/);
  });

  it('installs @skillit/mcp and points at skillit gen for an mcp project', async () => {
    await writeMcpFixture();
    const { deps, installCalls } = makeStubs();
    const { logged, restore } = captureLog();
    try {
      await run(deps);
    } finally {
      restore();
    }
    expect(installCalls[0]!.pkg).toBe('@skillit/mcp');
    expect(logged.join('\n')).toMatch(/skillit gen/);
  });

  it('does not install for the config source (built in) and points at skillit gen', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'init-'));
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ name: '@scope/my-lib' }));
    await writeFile(
      join(tmpDir, 'config.ts'),
      `export interface MyConfig {\n  outDir?: string;\n}\n`
    );
    await writeFile(join(tmpDir, 'pnpm-lock.yaml'), '');
    process.chdir(tmpDir);
    const { deps, installCalls } = makeStubs();
    const { logged, restore } = captureLog();
    try {
      await run(deps, ['--source', 'config', '--config-type', './config.ts#MyConfig']);
    } finally {
      restore();
    }
    expect(installCalls).toHaveLength(0);
    expect(logged.join('\n')).toMatch(/skillit gen --source config/);
  });

  it('throws with the exact command on install failure', async () => {
    await writeCliFixture();
    const { deps } = makeStubs({
      runInstall: async (pkg, pm) => {
        throw new Error(`install of ${pkg} via ${pm} failed`);
      }
    });
    await expect(run(deps)).rejects.toThrow(/pnpm add -D @skillit\/cli/);
  });

  it('rejects an invalid --source value', async () => {
    await writeCliFixture();
    const { deps } = makeStubs();
    await expect(run(deps, ['--source', 'bogus'])).rejects.toThrow(/cli\|mcp\|typedoc/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/client/src/__tests__/init.test.ts`
Expected: FAIL — `init.ts` still imports/uses `generateSkill`/`runRefine`; the new tests expect `skillit gen` guidance text that init does not yet print, and `InitDeps` still has the removed fields (type errors / assertion failures).

- [ ] **Step 3: Rewrite `init.ts` to install/wire only**

Replace the entire contents of `packages/client/src/commands/init.ts` with:

```typescript
// packages/client/src/commands/init.ts
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import {
  detectPackageManager,
  detectProjectNature,
  type RefineSourceKind
} from '../detect-source.js';

type PackageManager = 'pnpm' | 'yarn' | 'npm';

/**
 * Injectable side-effecting steps for {@link buildInitCommand}. Phase 0 init is
 * install/wire ONLY — it no longer generates or refines (those are `skillit
 * gen` and `skillit refine`), so the only injectable step is the install.
 */
export interface InitDeps {
  /** Install `pkg` as a dev dependency in `cwd` using package manager `pm`. */
  runInstall?(pkg: string, pm: PackageManager, cwd: string): Promise<void>;
}

interface InitOpts {
  source?: string;
  configType?: string;
}

const VALID_SOURCES: readonly RefineSourceKind[] = ['cli', 'mcp', 'typedoc'];

/** Map a project nature to the `@skillit/*` package that handles it. */
function natureToPackage(nature: RefineSourceKind): string {
  if (nature === 'cli') return '@skillit/cli';
  if (nature === 'mcp') return '@skillit/mcp';
  return 'typedoc-plugin-skillit';
}

/** Build the package manager's add-dev command line (for messaging + spawn). */
function addDevCommand(pm: PackageManager, pkg: string): string {
  if (pm === 'pnpm') return `pnpm add -D ${pkg}`;
  if (pm === 'yarn') return `yarn add -D ${pkg}`;
  return `npm install -D ${pkg}`;
}

/** Default install: spawn the package manager's add-dev command, cwd-scoped. */
function defaultRunInstall(pkg: string, pm: PackageManager, cwd: string): Promise<void> {
  const command = addDevCommand(pm, pkg);
  const [bin, ...args] = command.split(' ');
  return new Promise((resolve, reject) => {
    const child = spawn(bin!, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exited with code ${code}`));
    });
  });
}

export function buildInitCommand(deps: InitDeps = {}): Command {
  const runInstall = deps.runInstall ?? defaultRunInstall;

  return new Command('init')
    .description(
      'Detect the project and install the right @skillit package (then run `skillit gen`)'
    )
    .option('--source <kind>', 'cli | mcp | typedoc | config (auto-detected if omitted)')
    .option('--config-type <file#export>', 'config type entry (config source)')
    .action(async (opts: InitOpts) => {
      const cwd = process.cwd();

      // Config source is built into the client — nothing to install. Just point
      // the user at `skillit gen`.
      if (opts.source === 'config') {
        if (opts.configType === undefined) {
          throw new Error(
            'The config source requires --config-type <file#export> (e.g. ./src/config.ts#MyConfig).'
          );
        }
        console.log(
          `Config source needs no install. Generate the skill with:\n  skillit gen --source config --config-type ${opts.configType}`
        );
        return;
      }

      // Resolve nature: explicit --source wins, else detect.
      let nature: RefineSourceKind;
      if (opts.source !== undefined) {
        if (!VALID_SOURCES.includes(opts.source as RefineSourceKind)) {
          throw new Error(
            `Invalid --source value: ${opts.source}. Use --source <cli|mcp|typedoc>.`
          );
        }
        nature = opts.source as RefineSourceKind;
      } else {
        nature = await detectProjectNature(cwd);
      }

      // Map nature → package, install via the detected package manager.
      const pkg = natureToPackage(nature);
      const pm = detectPackageManager(cwd);
      const command = addDevCommand(pm, pkg);
      try {
        await runInstall(pkg, pm, cwd);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Install failed (${reason}). Run it manually:\n  ${command}`);
      }

      console.log(`Installed ${pkg}. Generate the skill with:\n  skillit gen --source ${nature}`);
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/client/src/__tests__/init.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Type-check the client (catches dangling references)**

Run: `pnpm --filter @skillit/client run type-check`
Expected: PASS. (Confirms nothing else in the client imported the removed `GenerateSkillOpts`/`GenerateConfigSkillOpts`/`runRefine` from `init.ts` — `gen.ts` and `generate.ts` own those now.)

- [ ] **Step 6: Run the whole client suite (no orphaned imports)**

Run: `pnpm exec vitest run packages/client`
Expected: PASS — all client tests green, including `gen.test.ts`, `audit-report.test.ts`, `program.test.ts`, `refine-resolve.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/commands/init.ts packages/client/src/__tests__/init.test.ts
git commit -m "feat(client)!: reduce skillit init to install/wire only; gen owns generation"
```

---

## Task 12: Changeset + final gate

**Files:**

- Create: `.changeset/phase0-gen-audit-affordances.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/phase0-gen-audit-affordances.md`:

```markdown
---
'@skillit/core': minor
'@skillit/client': minor
'@skillit/cli': patch
'@skillit/typedoc': patch
'@skillit/mcp': patch
---

feat: agent-bootstrap Phase 0 core affordances

- **`skillit gen`** — new first-class, deterministic, side-effect-free command that (re)generates the skill from current source (cli + config). It shares ONE generate path with the rest of the client (`packages/client/src/generate.ts`).
- **`skillit init` is now install/wire only** — it no longer generates or refines. After `init`, run `skillit gen`. (Behavior change for `init`.)
- **`skillit audit --json`** — new command wrapping `auditSkill` + `estimateSkillJudgeScore`, emitting the full `AuditResult` + `SkillJudgeEstimate` plus a resolved on-disk location per improvement target.
- **`RefineSource.resolveTargetLocation`** — new optional method on the core `RefineSource` contract, implemented for typedoc, cli, config, and mcp (build) sources.
```

- [ ] **Step 2: Commit the changeset**

```bash
git add .changeset/phase0-gen-audit-affordances.md
git commit -m "chore: changeset for Phase 0 gen/audit/resolveTargetLocation"
```

- [ ] **Step 3: Final gate — full affected suites green**

Run: `pnpm exec vitest run packages/core packages/client packages/cli packages/typedoc packages/mcp`
Expected: PASS — every test across all five packages green.

- [ ] **Step 4: Final gate — type-check the whole workspace**

Run: `pnpm run type-check`
Expected: PASS (all packages, `tsgo --noEmit`).

- [ ] **Step 5: Final gate — lint**

Run: `pnpm run lint`
Expected: PASS (`oxlint .`, no errors).

- [ ] **Step 6: Final commit (if lint/format produced changes)**

```bash
git add -A
git commit -m "chore: lint/format pass for Phase 0" || echo "nothing to commit"
```

---

## Self-Review checklist (completed during authoring)

**Spec coverage (§9.3 Phase 0):**

- "new `skillit gen` command (extract→render→write surfaced from inside `init`/`refine`)" → Tasks 7 (shared module), 8 (command), 10 (registration). ✓
- "reduce `skillit init` to install/wire only" → Task 11. ✓
- "`skillit audit --json`" → Task 9 (builder + command), 10 (registration). ✓
- "`resolveTargetLocation` on each `RefineSource`" → Task 1 (contract), 2 (typedoc), 3 (cli), 4 (config), 5 (mcp). ✓
- "DRY: gen and init's removed generation share ONE generate function" → `packages/client/src/generate.ts` is the single path; init no longer generates (Tasks 7 + 11). ✓
- "include resolveTargetLocation output per finding in audit --json" → `buildAuditReport` attaches `resolvedLocations` per improvement (Task 9). ✓
- "register in program.ts" → Task 10. ✓
- "user-facing CLI → changeset (core + client + affected)" → Task 12 (core/client minor; cli/typedoc/mcp patch). ✓

**Ordering:** additive tasks (1–10) precede the init strip (11), so the suite stays green throughout and nothing is unreachable mid-plan. ✓

**Type/name consistency:** `GenerateSkillOpts`/`GenerateConfigSkillOpts` defined once in `generate.ts` (Task 7) and consumed by `gen.ts` (Task 8) and `gen.test.ts`; `generateCliSkill`/`generateConfigSkill` names match across module, command deps, and tests; `TargetLocation` shape `{file, declName, propertyPath?}` consistent across Tasks 1–5 and consumed in Task 9; `buildAuditReport(source, skill)` signature matches its test (Task 9). ✓
