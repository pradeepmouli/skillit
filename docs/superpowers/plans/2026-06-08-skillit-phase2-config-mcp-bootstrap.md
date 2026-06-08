# skillit Phase 2 — config + mcp(build) bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `config` and `mcp` source kinds into the `/skillit-bootstrap` orchestration: wire `mcp` through `skillit gen`/`audit` (build mode primary, runtime/overlay fallback), expand the skill prose to all four kinds, and dogfood both — config to grade B and mcp(build) to its kind-aware target — with regenerate-determinism.

**Architecture:** Reuse everything. `@skillit/mcp` already exports `extractMcpSkill`, `McpRefineSource` (runtime/overlay), `TypeScriptMcpRefineSource` (build, implements `resolveTargetLocation`), `readMcpConfigFile`, and `bundleMcpSkill`. `config` is already wired into `gen`/`audit` via `ConfigRefineSource`; Phase 2 only needs to lift it into the skill prose. For `mcp`, extract the build/runtime dispatch that already lives inline in `refine.ts:250-271` into one shared `createMcpRefineSource` factory in `@skillit/mcp`, add a `generateMcpSkill` that reuses `bundleMcpSkill`'s render/write, and call both from `gen`/`audit` (lazy-imported, mirroring the typedoc wiring). No SKILL.md is ever hand-written — the agent enriches source; `skillit gen` re-derives.

**Tech Stack:** TypeScript 5 (strict, no `any`, `exactOptionalPropertyTypes`), Node ≥20, Vitest, pnpm workspaces, oxlint/oxfmt, changesets. Branch: `feat/phase2-config-mcp-bootstrap` off `develop` (Phase 1 merged at `1c786c6`).

---

## Background facts (verified against the tree)

- **MCP source construction (the DRY target)** — `packages/client/src/commands/refine.ts:250-271` reads `readMcpConfigFile(mcpPath)`, finds the entry (`opts.server` by name, else first non-disabled), then dispatches: `build` → `new TypeScriptMcpRefineSource({ transport, sourceGlob })`; `runtime` → `new McpRefineSource({ overlayPath, extract: () => extractMcpSkill({ transport }) })`.
- **Mode detection** — `detectRefineMode(cwd, mcpPath): 'build' | 'runtime' | 'ambiguous'` (`packages/client/src/detect-mode.ts:81`). `refine.ts:225-242` resolves `--mode` (explicit `build`/`runtime`) else auto-detects, erroring on `ambiguous`.
- **MCP gen short-circuit** — `packages/client/src/commands/gen.ts:94-98` throws `skillit gen does not yet support the mcp source; cli, config, and typedoc are supported in this release.`
- **MCP audit short-circuit** — `packages/client/src/commands/audit.ts:81-87` prints the same and sets `process.exitCode = 1`.
- **typedoc wiring template (mirror this)** — `gen.ts` lazy-imports `generateTypeDocSkill` from `../generate.js`; `audit.ts:96-99` does `const { createTypeDocRefineSource } = await import('@skillit/typedoc')` inside the branch, then `buildAuditReport(source, skill)`.
- **config is already wired** — `gen.ts:71-88` (`generateConfigSkill`) and `audit.ts:114-129` (`new ConfigRefineSource(...)`). `ConfigRefineSource` (`packages/core/src/refine/config-source.ts:66`) implements `extract`/`auditContext`/`applyFixes`/`resolveTargetLocation`. **No code change for config — prose only.**
- **mcp generate building block** — `bundleMcpSkill` (`packages/mcp/src/bundle.ts:53`) already does `extractMcpSkill` → `renderSkill` (core) → `writeSkills` (core); `outDir` defaults to `<packageRoot>/skills`. `generateMcpSkill` reuses its render/write.
- **detect-source** — `RefineSourceKind = 'cli' | 'mcp' | 'typedoc'` (`detect-source.ts:6`); `detectProjectNature` maps `@modelcontextprotocol/sdk` → `'mcp'` (`:97`). `config` is explicit-only (requires `--config-type`); `mcp` requires `--mcp <path>`.
- **In-memory MCP server for tests** — existing mcp unit tests build `new McpServer({ name, version })` and register tools (`packages/mcp/tests/unit/tool-discovery.test.ts`). Reuse that pattern; pair with `InMemoryTransport` so no subprocess is spawned in tests.
- **Kind-aware convergence targets (§6.4)** — config → **B** (no functions/params; per-option routing + one example file is the ceiling); mcp → **B**, **A** only if tool handlers carry full JSDoc.

---

## File Structure

**Create:**

- `packages/mcp/src/refine/factory.ts` — `selectServerEntry()`, `createMcpRefineSource()`, `generateMcpSkill()`.
- `packages/mcp/src/refine/__tests__/factory.test.ts` — factory + generate unit tests (in-memory server).
- `packages/client/src/mcp-mode.ts` — `resolveMcpMode(cwd, opts)` shared by `refine`/`audit`.
- `packages/client/src/__tests__/mcp-mode.test.ts`.
- `docs/superpowers/DOGFOOD-phase2.md` — config + mcp dogfood records.
- `.changeset/phase2-config-mcp-bootstrap.md`.

**Modify:**

- `packages/mcp/src/index.ts` — export `createMcpRefineSource`, `generateMcpSkill`, `selectServerEntry`, and their option types.
- `packages/mcp/src/bundle.ts` — factor `extract → renderSkill → writeSkills` into a shared `renderAndWriteMcpSkill()` reused by `bundleMcpSkill` and `generateMcpSkill` (DRY).
- `packages/client/src/commands/refine.ts` — replace the inline build/runtime dispatch (`:250-271`) with `createMcpRefineSource`.
- `packages/client/src/generate.ts` — add `GenerateMcpSkillOpts` + `generateMcpSkill` (lazy `import('@skillit/mcp')`).
- `packages/client/src/commands/gen.ts` — replace mcp short-circuit with a real branch; add `--mcp`/`--server` options.
- `packages/client/src/commands/audit.ts` — replace mcp short-circuit with a real branch (`createMcpRefineSource` via `resolveMcpMode`); add `--server`/`--mode`/`--overlay` options.
- `packages/client/skills/skillit-bootstrap/SKILL.md` — scope + inputs + convergence for config + mcp.
- `packages/client/skills/skillit-bootstrap/references/surface-routing.md` — config per-option + mcp surfaces; rewrite the "Scope this release" clause.
- `packages/client/package.json` — add `"@skillit/mcp": "workspace:*"` if not already a dep.

---

## Task 1: `createMcpRefineSource` factory + shared entry selection

**Files:**

- Create: `packages/mcp/src/refine/factory.ts`
- Create: `packages/mcp/src/refine/__tests__/factory.test.ts`
- Modify: `packages/mcp/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/mcp/src/refine/__tests__/factory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectServerEntry, createMcpRefineSource } from '../factory.js';

let dir: string;

async function writeMcpJson(servers: Record<string, unknown>): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'mcp-factory-'));
  const p = join(dir, 'mcp.json');
  await writeFile(p, JSON.stringify({ mcpServers: servers }), 'utf8');
  return p;
}

describe('selectServerEntry', () => {
  it('returns the named entry', () => {
    const entries = [
      { name: 'a', transport: { type: 'stdio', command: 'node', args: ['a.js'] } },
      { name: 'b', transport: { type: 'stdio', command: 'node', args: ['b.js'] } }
    ] as any;
    expect(selectServerEntry(entries, 'b').name).toBe('b');
  });

  it('falls back to the first non-disabled entry', () => {
    const entries = [
      { name: 'a', disabled: true, transport: {} },
      { name: 'b', transport: {} }
    ] as any;
    expect(selectServerEntry(entries).name).toBe('b');
  });

  it('throws when the named entry is absent', () => {
    expect(() => selectServerEntry([{ name: 'a', transport: {} }] as any, 'zzz')).toThrow(/zzz/);
  });
});

describe('createMcpRefineSource', () => {
  it('build mode → a source that resolves target locations to source files', async () => {
    const mcpPath = await writeMcpJson({
      srv: { command: 'node', args: ['server.js'] }
    });
    const source = await createMcpRefineSource({
      mcpPath,
      mode: 'build',
      sourceGlob: join(dir, '**', '*.ts')
    });
    expect(typeof source.extract).toBe('function');
    // build-mode source implements resolveTargetLocation (typedoc-like writeback)
    expect(typeof source.resolveTargetLocation).toBe('function');
    await rm(dir, { recursive: true, force: true });
  });

  it('runtime mode → a source with an overlay writeback (no source resolution)', async () => {
    const mcpPath = await writeMcpJson({
      srv: { command: 'node', args: ['server.js'] }
    });
    const source = await createMcpRefineSource({
      mcpPath,
      mode: 'runtime',
      overlayPath: join(dir, '.skillit-overlay.json')
    });
    expect(typeof source.extract).toBe('function');
    expect(typeof source.applyFixes).toBe('function');
    await rm(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/mcp/src/refine/__tests__/factory.test.ts`
Expected: FAIL — `Cannot find module '../factory.js'`.

- [ ] **Step 3: Write the factory**

`packages/mcp/src/refine/factory.ts`:

```typescript
import { join } from 'node:path';
import type { RefineSource } from '@skillit/core';
import { readMcpConfigFile } from '../config/file-reader.js';
import { extractMcpSkill } from '../extract.js';
import { McpRefineSource } from './runtime/mcp-source.js';
import { TypeScriptMcpRefineSource } from './build/ts-mcp-source.js';
import type { ConfigEntry } from '../types.js';

/**
 * Pick the MCP server entry to operate on: the one named `serverName`, or the
 * first non-disabled entry when no name is given.
 *
 * @param entries - parsed entries from `readMcpConfigFile`.
 * @param serverName - optional server name to select.
 * @returns the matching entry.
 * @throws if `serverName` is given but absent, or no enabled entry exists.
 */
export function selectServerEntry(entries: ConfigEntry[], serverName?: string): ConfigEntry {
  const entry = serverName
    ? entries.find((e) => e.name === serverName)
    : entries.find((e) => !e.disabled);
  if (!entry) {
    const which = serverName ? `"${serverName}"` : 'any enabled server';
    throw new Error(`Could not find ${which} in the MCP config`);
  }
  return entry;
}

/** Options for {@link createMcpRefineSource}. */
export interface CreateMcpRefineSourceOptions {
  /** Path to mcp.json / claude_desktop_config.json. */
  mcpPath: string;
  /** `build` (own TS server, JSDoc writeback) or `runtime` (overlay JSON). */
  mode: 'build' | 'runtime';
  /** Server name to select; defaults to the first enabled entry. */
  serverName?: string;
  /** Overlay path for runtime mode (default `<cwd>/.skillit-overlay.json`, caller-resolved). */
  overlayPath?: string;
  /** Source glob for build mode (default `<cwd>/**\/*.ts`, caller-resolved). */
  sourceGlob?: string;
}

/**
 * Build the right `RefineSource` for an MCP target. Centralizes the build/runtime
 * dispatch previously inlined in the `refine` command so `refine`/`audit` share it.
 *
 * @param opts - selection + mode options.
 * @returns a `TypeScriptMcpRefineSource` (build) or `McpRefineSource` (runtime).
 */
export async function createMcpRefineSource(
  opts: CreateMcpRefineSourceOptions
): Promise<RefineSource> {
  const entries = await readMcpConfigFile(opts.mcpPath);
  const entry = selectServerEntry(entries, opts.serverName);

  if (opts.mode === 'build') {
    return new TypeScriptMcpRefineSource({
      transport: entry.transport,
      sourceGlob: opts.sourceGlob ?? join(process.cwd(), '**', '*.ts')
    });
  }
  return new McpRefineSource({
    overlayPath: opts.overlayPath ?? join(process.cwd(), '.skillit-overlay.json'),
    extract: () => extractMcpSkill({ transport: entry.transport })
  });
}
```

> NOTE for the implementer: confirm the exact exported `ConfigEntry` type name and `transport` field in `packages/mcp/src/types.ts` and the `McpRefineSource`/`TypeScriptMcpRefineSource` constructor option shapes (`packages/mcp/src/refine/runtime/mcp-source.ts`, `.../build/ts-mcp-source.ts`); adjust imports/field names to match verbatim. Do not introduce `any`.

- [ ] **Step 4: Export from the package index**

In `packages/mcp/src/index.ts`, add:

```typescript
export {
  createMcpRefineSource,
  selectServerEntry,
  type CreateMcpRefineSourceOptions
} from './refine/factory.js';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @skillit/mcp run build && pnpm exec vitest run packages/mcp/src/refine/__tests__/factory.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/refine/factory.ts packages/mcp/src/refine/__tests__/factory.test.ts packages/mcp/src/index.ts
git commit -m "feat(mcp): createMcpRefineSource factory + selectServerEntry (shared build/runtime dispatch)"
```

---

## Task 2: `generateMcpSkill` (gen primitive, reuse bundle render/write)

**Files:**

- Modify: `packages/mcp/src/bundle.ts` (extract `renderAndWriteMcpSkill`)
- Modify: `packages/mcp/src/refine/factory.ts` (add `generateMcpSkill`) — or a sibling `generate.ts`; keep it next to the factory
- Modify: `packages/mcp/src/index.ts`
- Modify: `packages/mcp/src/refine/__tests__/factory.test.ts`

- [ ] **Step 1: Write the failing test** (append to `factory.test.ts`)

```typescript
import { generateMcpSkill } from '../factory.js';
import { existsSync, readdirSync } from 'node:fs';

describe('generateMcpSkill', () => {
  it('extracts + renders + writes a SKILL.md under outDir', async () => {
    // Uses an in-memory MCP server fixture (see helper below) exposed over a
    // stdio shim, OR a prebuilt fixture server in packages/mcp/tests/fixtures.
    // The implementer wires the transport to the same fixture the existing
    // extract tests use.
    const { mcpPath, outDir, cleanup } = await mcpFixtureProject(); // test helper
    await generateMcpSkill({ mcpPath, outDir });
    const found =
      existsSync(outDir) &&
      readdirSync(outDir, { recursive: true }).some((p) => String(p).endsWith('SKILL.md'));
    expect(found).toBe(true);
    await cleanup();
  });
});
```

> The implementer creates `mcpFixtureProject()` using the **same** mechanism the existing `extract` tests use to obtain a transport (in-memory `McpServer` + `InMemoryTransport`, or a tiny prebuilt stdio server under `packages/mcp/tests/fixtures/`). Reuse, do not invent a new spawning path. If the existing tests mock `extractMcpSkill`, mock it here too and assert render/write happens.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/mcp/src/refine/__tests__/factory.test.ts -t generateMcpSkill`
Expected: FAIL — `generateMcpSkill` is not exported.

- [ ] **Step 3: Extract the shared render/write helper in `bundle.ts`**

Read `bundleMcpSkill` (`packages/mcp/src/bundle.ts:53`). Pull its `extractMcpSkill → renderSkill → writeSkills` core into:

```typescript
/**
 * Render an extracted MCP skill and write it (SKILL.md + references) under `outDir`.
 * Shared by {@link bundleMcpSkill} and `generateMcpSkill` so both produce identical output.
 *
 * @param skill - the extracted skill IR.
 * @param outDir - absolute output directory.
 * @returns the written skill records (as `writeSkills` returns).
 */
export async function renderAndWriteMcpSkill(skill: ExtractedSkill, outDir: string) {
  const rendered = renderSkill(skill /*, match bundle's exact render opts */);
  return writeSkills(outDir, [rendered] /*, match bundle's exact write opts */);
}
```

Replace the equivalent inline lines in `bundleMcpSkill` with a call to it (behavior-preserving — the bundle tests must stay green). Match the existing `renderSkill`/`writeSkills` argument shapes verbatim.

- [ ] **Step 4: Add `generateMcpSkill` to `factory.ts`**

```typescript
import { renderAndWriteMcpSkill } from '../bundle.js';

/** Options for {@link generateMcpSkill}. */
export interface GenerateMcpSkillOptions {
  mcpPath: string;
  serverName?: string;
  /** Absolute output directory. */
  outDir: string;
}

/**
 * GEN primitive for the mcp source: select the server, extract its skill via the
 * live transport, then render + write it deterministically. Mode-independent —
 * extraction is identical for build and runtime; mode only affects writeback (refine/audit).
 *
 * @param opts - mcp config path, optional server name, output dir.
 */
export async function generateMcpSkill(opts: GenerateMcpSkillOptions): Promise<void> {
  const entries = await readMcpConfigFile(opts.mcpPath);
  const entry = selectServerEntry(entries, opts.serverName);
  const skill = await extractMcpSkill({ transport: entry.transport });
  await renderAndWriteMcpSkill(skill, opts.outDir);
}
```

Export `generateMcpSkill` + `GenerateMcpSkillOptions` from `index.ts`.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @skillit/mcp run build && pnpm exec vitest run packages/mcp`
Expected: PASS — new test green, all existing mcp tests (incl. bundle) still green.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src
git commit -m "feat(mcp): generateMcpSkill + shared renderAndWriteMcpSkill (DRY with bundle)"
```

---

## Task 3: Refactor `refine.ts` to use the factory (DRY, regression-only)

**Files:**

- Modify: `packages/client/src/commands/refine.ts`

- [ ] **Step 1: Confirm the existing refine tests cover the mcp path**

Run: `pnpm exec vitest run packages/client -t refine`
Expected: PASS (capture the current green baseline).

- [ ] **Step 2: Replace the inline dispatch (`refine.ts:250-271`)**

Keep the mode resolution + logging (`:225-248`). Replace the entry-read + dispatch block with:

```typescript
const sourceGlob = opts.sourceGlob ?? join(cwd, '**', '*.ts');
source = await createMcpRefineSource({
  mcpPath,
  mode,
  serverName: opts.server,
  overlayPath,
  sourceGlob
});
reportInPlace = mode === 'build';
```

Add `createMcpRefineSource` to the existing `@skillit/mcp` import; remove now-unused imports (`TypeScriptMcpRefineSource`, `McpRefineSource`, `readMcpConfigFile`, `extractMcpSkill`) **only if** nothing else in the file uses them (verify with a grep first).

- [ ] **Step 3: Run the refine tests**

Run: `pnpm --filter @skillit/client run build && pnpm exec vitest run packages/client -t refine`
Expected: PASS — identical behavior, fewer lines.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/commands/refine.ts
git commit -m "refactor(client): refine mcp branch uses createMcpRefineSource (DRY)"
```

---

## Task 4: Shared `resolveMcpMode` client helper

**Files:**

- Create: `packages/client/src/mcp-mode.ts`
- Create: `packages/client/src/__tests__/mcp-mode.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/client/src/__tests__/mcp-mode.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { resolveMcpMode } from '../mcp-mode.js';

describe('resolveMcpMode', () => {
  it('honors an explicit --mode build', async () => {
    expect(await resolveMcpMode('/x', { mode: 'build', mcp: '/x/mcp.json' })).toEqual({
      mode: 'build'
    });
  });
  it('honors an explicit --mode runtime', async () => {
    expect(await resolveMcpMode('/x', { mode: 'runtime', mcp: '/x/mcp.json' })).toEqual({
      mode: 'runtime'
    });
  });
  it('rejects an invalid --mode', async () => {
    expect(await resolveMcpMode('/x', { mode: 'nope', mcp: '/x/mcp.json' })).toHaveProperty(
      'error'
    );
  });
  it('falls back to detection when --mode omitted', async () => {
    vi.resetModules();
    vi.doMock('../detect-mode.js', () => ({ detectRefineMode: vi.fn(async () => 'build') }));
    const { resolveMcpMode: r } = await import('../mcp-mode.js');
    expect(await r('/x', { mcp: '/x/mcp.json' })).toEqual({ mode: 'build' });
  });
  it('returns an error on ambiguous detection', async () => {
    vi.resetModules();
    vi.doMock('../detect-mode.js', () => ({ detectRefineMode: vi.fn(async () => 'ambiguous') }));
    const { resolveMcpMode: r } = await import('../mcp-mode.js');
    expect(await r('/x', { mcp: '/x/mcp.json' })).toHaveProperty('error');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/client/src/__tests__/mcp-mode.test.ts`
Expected: FAIL — `Cannot find module '../mcp-mode.js'`.

- [ ] **Step 3: Implement**

`packages/client/src/mcp-mode.ts`:

```typescript
import { detectRefineMode } from './detect-mode.js';

/** The subset of command options `resolveMcpMode` reads. */
export interface McpModeOpts {
  mode?: string;
  mcp?: string;
}

/** Resolved mode, or a user-facing error message. */
export type McpModeResult = { mode: 'build' | 'runtime' } | { error: string };

/**
 * Resolve the MCP refine/audit mode: honor an explicit `--mode build|runtime`,
 * otherwise auto-detect via `detectRefineMode`, surfacing an actionable error
 * when the mode is invalid or detection is ambiguous.
 *
 * @param cwd - project directory.
 * @param opts - parsed `--mode` / `--mcp` options.
 * @returns the resolved mode or an `{ error }` for the caller to print.
 */
export async function resolveMcpMode(cwd: string, opts: McpModeOpts): Promise<McpModeResult> {
  if (opts.mode === 'build' || opts.mode === 'runtime') return { mode: opts.mode };
  if (opts.mode !== undefined) {
    return { error: `Invalid --mode value: ${opts.mode}. Use 'build' or 'runtime'.` };
  }
  const detected = await detectRefineMode(cwd, opts.mcp ?? cwd);
  if (detected === 'ambiguous') {
    return {
      error: `Cannot determine MCP mode.
Use --mode build    (TypeScript MCP server you own)
    --mode runtime  (consuming project, any MCP server)`
    };
  }
  return { mode: detected };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @skillit/client run build && pnpm exec vitest run packages/client/src/__tests__/mcp-mode.test.ts`
Expected: PASS.

- [ ] **Step 5 (optional cleanup): adopt in `refine.ts`**

If it reduces duplication cleanly, replace `refine.ts:225-242` with a `resolveMcpMode` call. Keep `refine`'s existing `console.error` + `process.exitCode` behavior. Re-run refine tests. (Skip if it complicates the existing refine flow — the helper's primary consumer is `audit`.)

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/mcp-mode.ts packages/client/src/__tests__/mcp-mode.test.ts packages/client/src/commands/refine.ts
git commit -m "feat(client): resolveMcpMode helper (shared --mode resolution + ambiguity error)"
```

---

## Task 5: `skillit gen --source mcp`

**Files:**

- Modify: `packages/client/src/generate.ts`
- Modify: `packages/client/src/commands/gen.ts`
- Modify: `packages/client/src/__tests__/gen.test.ts` (or the existing gen test file)
- Modify: `packages/client/package.json` (ensure `@skillit/mcp` dep)

- [ ] **Step 1: Write the failing test**

Add to the gen command test (mirror the existing typedoc-branch test — inject a `deps.generateMcpSkill` stub and assert it is called with the resolved opts; assert the mcp short-circuit error is gone):

```typescript
it('routes --source mcp to generateMcpSkill with the resolved mcp path', async () => {
  const generateMcpSkill = vi.fn(async () => {});
  const cmd = buildGenCommand({ generateMcpSkill });
  await cmd.parseAsync(['--source', 'mcp', '--mcp', './mcp.json', '--out', 'skills'], {
    from: 'user'
  });
  expect(generateMcpSkill).toHaveBeenCalledWith(
    expect.objectContaining({
      mcpPath: expect.stringContaining('mcp.json'),
      outDir: expect.any(String)
    })
  );
});

it('errors when --source mcp is given without --mcp', async () => {
  const cmd = buildGenCommand({});
  await expect(
    cmd.parseAsync(['--source', 'mcp', '--out', 'skills'], { from: 'user' })
  ).rejects.toThrow(/--mcp/);
});
```

> Match the existing `GenDeps` injection shape (`gen.ts:54` `buildGenCommand(deps: GenDeps = {})`). Add `generateMcpSkill?` to `GenDeps` exactly like `generateTypeDocSkill?`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/client -t "source mcp"`
Expected: FAIL — short-circuit still throws "does not yet support".

- [ ] **Step 3: Add the wrapper in `generate.ts`**

```typescript
/** Options for mcp-path skill generation. */
export interface GenerateMcpSkillOpts {
  /** Path to mcp.json / MCP config file. */
  mcpPath: string;
  /** Server name to select; defaults to the first enabled entry. */
  server?: string;
  /** Absolute output directory. */
  outDir: string;
}

/**
 * MCP-path skill generation — lazily imports `@skillit/mcp` so the CLI does not
 * load the MCP stack at startup for non-mcp commands.
 */
export async function generateMcpSkill(opts: GenerateMcpSkillOpts): Promise<void> {
  const { generateMcpSkill: run } = await import('@skillit/mcp');
  await run({ mcpPath: opts.mcpPath, serverName: opts.server, outDir: opts.outDir });
}
```

- [ ] **Step 4: Replace the gen short-circuit (`gen.ts:94-98`) with a real branch**

```typescript
// mcp: explicit, or auto-detected via @modelcontextprotocol/sdk.
const isMcp =
  opts.source === 'mcp' ||
  (opts.source === undefined && (await detectProjectNature(cwd)) === 'mcp');
if (isMcp) {
  if (opts.mcp === undefined) {
    throw new Error('The mcp source requires --mcp <path> (path to mcp.json or MCP config file).');
  }
  await generateMcpSkill({ mcpPath: join(cwd, opts.mcp), server: opts.server, outDir });
  return;
}
```

Wire `deps.generateMcpSkill ?? defaultGenerateMcpSkill` like the typedoc default. Add the options:

```typescript
.option('--mcp <path>', 'path to mcp.json or MCP config file (mcp source)')
.option('--server <name>', 'MCP server entry to select (mcp source)')
```

(Reconcile `join(cwd, opts.mcp)` with `isAbsolute` like audit's config branch so an absolute `--mcp` is honored.)

- [ ] **Step 5: Ensure `@skillit/mcp` is a client dependency**

Check `packages/client/package.json` `dependencies` — `@skillit/mcp` is already present (Phase 0 wiring). If missing, add `"@skillit/mcp": "workspace:*"` and `pnpm install`.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter @skillit/client run build && pnpm exec vitest run packages/client`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/generate.ts packages/client/src/commands/gen.ts packages/client/src/__tests__ packages/client/package.json
git commit -m "feat(client): skillit gen --source mcp via generateMcpSkill (lazy import)"
```

---

## Task 6: `skillit audit --source mcp`

**Files:**

- Modify: `packages/client/src/commands/audit.ts`
- Modify: `packages/client/src/__tests__/audit.test.ts` (or existing audit test)

- [ ] **Step 1: Write the failing test**

```typescript
it('builds an mcp audit report in build mode', async () => {
  // Reuse the mcp fixture project helper; stub resolveMcpMode → build, or pass --mode build.
  const { mcpPath, cwd, cleanup } = await mcpFixtureProject();
  const report = await runAuditReturningJson(
    ['--source', 'mcp', '--mcp', mcpPath, '--mode', 'build', '--json'],
    cwd
  );
  expect(report.estimate.grade).toMatch(/[A-F]/);
  await cleanup();
});

it('errors when --source mcp is given without --mcp', async () => {
  // assert the actionable "--mcp" error + exitCode = 1
});
```

> Match how the existing audit tests drive `runAuditCommand`/`buildAuditReport`. If they call `buildAuditReport(source, skill)` directly with a constructed source, prefer that seam and assert `createMcpRefineSource` produces a working source for the fixture.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run packages/client -t "mcp audit"`
Expected: FAIL — short-circuit returns early.

- [ ] **Step 3: Replace the audit short-circuit (`audit.ts:81-87`) with a real branch**

Remove the early mcp short-circuit. Add an mcp branch alongside the typedoc branch (before the `detectInstalledSources` fallback):

```typescript
const isMcp =
  opts.source === 'mcp' ||
  (opts.source === undefined && (await detectProjectNature(cwd)) === 'mcp');

let source: RefineSource;
if (isTypedoc) {
  const { createTypeDocRefineSource } = await import('@skillit/typedoc');
  const { entryPoints, tsconfig } = resolveTypeDocEntry(cwd);
  source = createTypeDocRefineSource({ entryPoints, tsconfig, cwd });
} else if (isMcp) {
  if (opts.mcp === undefined) {
    console.error('The mcp source requires --mcp <path> (path to mcp.json or MCP config file).');
    process.exitCode = 1;
    return;
  }
  const resolved = await resolveMcpMode(cwd, opts);
  if ('error' in resolved) {
    console.error(resolved.error);
    process.exitCode = 1;
    return;
  }
  const { createMcpRefineSource } = await import('@skillit/mcp');
  source = await createMcpRefineSource({
    mcpPath: isAbsolute(opts.mcp) ? opts.mcp : join(cwd, opts.mcp),
    mode: resolved.mode,
    serverName: opts.server,
    overlayPath: opts.overlay
      ? isAbsolute(opts.overlay)
        ? opts.overlay
        : join(cwd, opts.overlay)
      : join(cwd, '.skillit-overlay.json'),
    sourceGlob: join(cwd, '**', '*.ts')
  });
} else {
  // ... existing detectInstalledSources / cli / config path unchanged
}
```

Extend `AuditCommandOpts` with `server?`, `mode?`, `overlay?`. Add options:

```typescript
.option('--server <name>', 'MCP server entry to select (mcp source)')
.option('--mode <build|runtime>', 'MCP refine mode (auto-detected if omitted)')
.option('--overlay <path>', 'overlay JSON path (mcp runtime mode)')
```

Import `resolveMcpMode` from `../mcp-mode.js`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @skillit/client run build && pnpm exec vitest run packages/client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/commands/audit.ts packages/client/src/__tests__
git commit -m "feat(client): skillit audit --source mcp (build/runtime via createMcpRefineSource)"
```

---

## Task 7: SKILL.md prose — config + mcp (in-session)

**Files:**

- Modify: `packages/client/skills/skillit-bootstrap/SKILL.md`

- [ ] **Step 1: Update frontmatter description (line 3)**

Change "Use for cli or typedoc projects" → "Use for cli, typedoc, config, or mcp projects".

- [ ] **Step 2: Rewrite "When to use" (lines 24-30)**

Replace the cli/typedoc-only scope + the "config and mcp … use skillit refine" redirect with all four kinds:

```markdown
## When to use

- A `cli` (Commander), `typedoc` (TS library), `config` (a TypeScript config
  type), or `mcp` (an MCP server you own — "build mode") project that needs a
  generated agent skill, or whose skill scores below its grade target.
- Run after the project is set up with the right `@skillit/*` package (see
  step 1). For a **third-party MCP server you cannot edit**, the skill is
  produced from an overlay ("runtime mode") via `skillit refine`; the bootstrap
  loop targets the build-mode (own-source) path.
```

- [ ] **Step 3: Update Inputs (lines 34-46)**

Add the selectors: `--config-type <file#export>` (config), `--mcp <path>` + `--server <name>` (mcp). Note `--source` now accepts `cli|typedoc|config|mcp`.

- [ ] **Step 4: Update convergence targets (step 6, "Pass")**

Add the kind-aware targets per §6.4: typedoc → A; cli → B; **config → B** (per-option routing + one example file is the ceiling; no functions/params); **mcp → B** (A only if every tool handler carries full JSDoc).

- [ ] **Step 5: Verify the packaging test still passes**

Run: `pnpm exec vitest run packages/client -t bootstrap`
Expected: PASS (`bootstrap-skill.test.ts` asserts frontmatter validity + references file presence).

- [ ] **Step 6: Commit**

```bash
git add packages/client/skills/skillit-bootstrap/SKILL.md
git commit -m "docs(skill): bootstrap orchestrates config + mcp (Phase 2 scope + targets)"
```

---

## Task 8: surface-routing.md — config + mcp surfaces (in-session)

**Files:**

- Modify: `packages/client/skills/skillit-bootstrap/references/surface-routing.md`

- [ ] **Step 1: Add config + mcp rows to the routing guidance**

Document (from spec §4.1 Table B / §4.7 / §4.8):

- **config** — per-property JSDoc (`@useWhen`/`@avoidWhen`/`@never`/`@remarks` on each config-type property via `upsertPropertyJsDocTag`) + a sibling `<config>.example.ts` (written only if absent). Findings carry a dot-path `configKey`; `resolveTargetLocation` returns `{ file, declName, propertyPath }`.
- **mcp (build)** — JSDoc on the tool-handler symbols (S1) + `_meta.toSkills.{useWhen,avoidWhen,pitfalls}` annotations (S7) in the TS server source; writeback via `upsertJsDocTag`. `resolveTargetLocation` resolves a tool to its `{ file, declName }`.
- **mcp (runtime)** — source not editable; the only writable surface is the overlay JSON (handled by `skillit refine`, not direct edits).

- [ ] **Step 2: Rewrite the "Scope this release" clause (lines 60-67)**

Replace the "Phase 1 / Not yet orchestrated: config and mcp" block with:

```markdown
## Scope

- **Supported:** `cli` (Commander), `typedoc` (TS library), `config` (a config
  type), and `mcp` **build mode** (an MCP server whose TS source you own).
- **Runtime mode** (third-party MCP servers, no editable source) is served by
  `skillit refine`'s overlay path, not this loop — there is no source to enrich.
- Kind-aware grade targets: typedoc → A; cli → B; config → B; mcp → B (A if
  tool handlers carry full JSDoc).
```

- [ ] **Step 3: Verify**

Run: `pnpm exec vitest run packages/client -t bootstrap`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/client/skills/skillit-bootstrap/references/surface-routing.md
git commit -m "docs(skill): surface-routing covers config per-option + mcp build/runtime"
```

---

## Task 9: config dogfood (in-session)

**Files:**

- Create/append: `docs/superpowers/DOGFOOD-phase2.md`

- [ ] **Step 1: Pick a real `@skillit` config target**

Primary candidate: the TypeDoc plugin options interface (`SkillsPluginOptions`, `packages/typedoc/src/plugin.ts`) — a genuine config surface. Confirm it is an `interface`/`type` extractable by `extractConfigSurface` (ast-grep). If unsuitable, pick another exported `*Options`/`*Config` interface in an `@skillit/*` package. Record the chosen target.

- [ ] **Step 2: Baseline**

```bash
cd packages/<pkg>
node ../client/dist/bin.js gen --source config --config-type ./src/<file>.ts#<TypeName> --out .det-a >/dev/null
node ../client/dist/bin.js audit --source config --config-type ./src/<file>.ts#<TypeName> --json
```

Record grade + dimensions. Run `gen` twice into `.det-a`/`.det-b`, `diff -r` → confirm `DETERMINISTIC ✓`.

- [ ] **Step 3: Enrich the source (never a SKILL.md)**

For each addressable finding, add per-property `@useWhen`/`@avoidWhen`/`@never`/`@remarks` JSDoc on the config-type properties (use `upsertPropertyJsDocTag` semantics; honest content grounded in the real option behavior), and create the sibling `<config>.example.ts` if the example finding fires. Regenerate + re-audit each pass.

- [ ] **Step 4: Converge to B and record**

Stop at grade **B** (the config ceiling) or a justified plateau. Record in `DOGFOOD-phase2.md`: baseline → final grade, dimensions moved, source files enriched, the determinism result, and any findings judged un-addressable (config ceiling) with one-line rationale each.

- [ ] **Step 5: Commit**

```bash
git add packages/<pkg> docs/superpowers/DOGFOOD-phase2.md
git commit -m "test(phase2): config dogfood on @skillit/<pkg> (-> B, deterministic)"
```

---

## Task 10: mcp build-mode dogfood (in-session)

**Files:**

- Create/append: `docs/superpowers/DOGFOOD-phase2.md`
- Possibly create: a minimal annotated fixture MCP server (if no in-repo own-source server exists)

- [ ] **Step 1: Obtain a build-mode target**

Build mode needs a TS MCP server whose source you own. Survey the repo for an existing annotated server (the `target-*` packages are CLI-style benchmark targets, not MCP servers — confirm). If none exists, create a minimal fixture under `packages/mcp/tests/fixtures/<name>/` with 2-3 `server.tool(...)` handlers and an `mcp.json` pointing at its built stdio entry. Record the chosen/created target.

- [ ] **Step 2: Baseline**

```bash
node packages/client/dist/bin.js gen --source mcp --mcp <mcp.json> --mode build --out .det-a >/dev/null
node packages/client/dist/bin.js audit --source mcp --mcp <mcp.json> --mode build --json
```

Record grade + dimensions. Regenerate twice, `diff -r` → `DETERMINISTIC ✓` (note: MCP extraction spawns the server, so determinism holds only for a deterministic server — record that caveat).

- [ ] **Step 3: Enrich the server source (never a SKILL.md)**

Add JSDoc on the tool-handler symbols + `_meta.toSkills.{useWhen,avoidWhen,pitfalls}` annotations per finding (grounded in the real tool behavior). Regenerate + re-audit each pass.

- [ ] **Step 4: Converge and record**

Target **B** (A only if every handler carries full JSDoc). Record baseline → final, dimensions moved, files enriched, determinism + the spawn-determinism caveat, and the §8.2 impl-grounded spot-check (assert `@never`/`_meta.toSkills` pitfalls match the handler's real behavior, not a guess).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp docs/superpowers/DOGFOOD-phase2.md
git commit -m "test(phase2): mcp build-mode dogfood (-> target grade, deterministic)"
```

---

## Task 11: changeset + final gate

**Files:**

- Create: `.changeset/phase2-config-mcp-bootstrap.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
'@skillit/client': minor
'@skillit/mcp': minor
---

feat: bootstrap config + mcp source kinds (Phase 2)

- `/skillit-bootstrap` now orchestrates `config` and `mcp` (build mode) in
  addition to `cli` and `typedoc`. Updated skill scope, surface routing
  (config per-option JSDoc + `<config>.example.ts`; mcp handler JSDoc +
  `_meta.toSkills`), and kind-aware grade targets (config → B, mcp → B/A).
- **mcp:** `skillit gen --source mcp` and `skillit audit --source mcp` are now
  wired (build + runtime). New `@skillit/mcp` exports: `createMcpRefineSource`,
  `generateMcpSkill`, `selectServerEntry`. The build/runtime dispatch is shared
  by `refine` and `audit` (DRY); `@skillit/mcp` (and its SDK) load lazily off
  the CLI startup path.
- **config:** already wired into `gen`/`audit` (Phase 0); Phase 2 brings it into
  the bootstrap loop.
```

- [ ] **Step 2: Final gate**

```bash
pnpm run build
pnpm run type-check
pnpm run lint
pnpm exec vitest run
```

Expected: all green (full suite). Fix any regressions before proceeding.

- [ ] **Step 3: Commit**

```bash
git add .changeset/phase2-config-mcp-bootstrap.md
git commit -m "chore(phase2): changeset + final gate (config + mcp bootstrap)"
```

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch`: verify the suite, then push and open a PR against `develop` (matching the Phase 0/1 pattern).

---

## Self-Review

- **Spec coverage:** §9.3 Phase 2 = "config + mcp(build)". Config = Tasks 7-9 (prose + dogfood; code already exists). mcp = Tasks 1-6 (factory, generate, refine refactor, mode helper, gen, audit) + 8 + 10. §6.4 kind-aware targets encoded in Tasks 7/8. §8.2 impl-grounded spot-check in Task 10. §8.3 determinism in Tasks 9/10. Covered.
- **DRY:** the build/runtime dispatch lives once (`createMcpRefineSource`); mode resolution lives once (`resolveMcpMode`); render/write lives once (`renderAndWriteMcpSkill`, shared by bundle + generate). `refine` is refactored onto the shared factory rather than left duplicated.
- **Type consistency:** `createMcpRefineSource`/`generateMcpSkill`/`selectServerEntry` names are used identically across factory, index, generate.ts, gen.ts, audit.ts. `GenerateMcpSkillOpts` (client) wraps `GenerateMcpSkillOptions` (mcp). `resolveMcpMode` returns `{mode} | {error}` consumed by audit.
- **No placeholders:** every code step shows real code; the two NOTE callouts (exact `ConfigEntry`/constructor field names; the bundle render/write arg shapes; the mcp fixture mechanism) are explicit "verify-against-source" instructions for facts that must match verbatim, not vague TODOs. The dogfood targets name primary candidates with selection criteria (in-session judgment tasks).
- **Lazy imports:** gen/audit load `@skillit/mcp` via dynamic `import()` (consistent with the Phase 1 typedoc fix — keeps the MCP SDK off the CLI startup path).

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review. Best for the mechanical TDD tasks (1-6, 11).
2. **Inline Execution** — execute in this session with checkpoints.

Per the chosen **Hybrid** mode: Tasks 1-6 and 11 (mechanical/TDD) → subagents; Tasks 7-10 (skill prose + the two dogfoods, which need judgment + grounding) → in-session.
