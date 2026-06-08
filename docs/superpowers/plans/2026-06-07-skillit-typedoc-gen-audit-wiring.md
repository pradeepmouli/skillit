# Wire the typedoc source into `skillit gen` + `skillit audit` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `skillit gen --source typedoc` and `skillit audit --source typedoc` actually work — by adding a programmatic TypeDoc-extraction entry to `@skillit/typedoc` and wiring it into the two client commands — so the bundled `/skillit-bootstrap` skill's existing "cli **or typedoc**" claim becomes true.

**Architecture (REUSE THE PLUGIN PIPELINE — decided):** Two existing pieces are reused, NOT re-implemented: (1) the TypeDoc plugin `load(app)` (`plugin.ts:135`) which on `convert()` does the **whole** extract→render→write pipeline and is exported from `@skillit/typedoc`; (2) `extractSkills(project)` (`extractor.ts:62`) the extractor. The only new code is the bit that produces a `ProjectReflection` from a package dir (bootstrap a TypeDoc `Application` + `convert()`), which lives in `@skillit/typedoc` (it owns the `typedoc` dep) so the client never imports `typedoc`.

- **`gen --source typedoc`** → `generateTypeDocSkills(opts)`: bootstrap an `Application`, call the exported `load(app)`, set `skillsOutDir = outDir`, `await app.convert()`. The plugin writes the skill. The client does **no** `extractSkills`/`renderSkills`/`writeSkills` itself — it reuses the plugin pipeline end-to-end.
- **`audit --source typedoc`** → `createTypeDocRefineSource(opts)` whose `extract()` bootstraps + `convert()`s and calls the existing `extractSkills(project, …)` (reusing the extractor), with `auditContext` from the shared `readPackageMetadata`. `audit` then calls `buildAuditReport`.
- Shared internal `convertProject(opts)` (bootstrap + convert) backs both. The "typedoc not supported" short-circuits in `gen.ts`/`audit.ts` become real branches (only `mcp` stays short-circuited).

**Tech Stack:** TypeScript 5 / Node ≥20, `typedoc` (already a dep of `@skillit/typedoc`), Vitest, oxlint/oxfmt, pnpm workspaces, changesets. The TypeDoc programmatic API: `Application.bootstrapWithPlugins()` / `app.convert()` (see existing `plugin.ts` imports: `Application, Converter, Context` from `typedoc`).

**Context / decisions:**

- Branch: continue on `feat/phase1-bootstrap-slash-command` (Phase 1 work; the bootstrap skill already claims typedoc).
- The bootstrap `SKILL.md` already says `--source cli|typedoc` — **no skill prose change needed**; this plan makes the claim real.
- Kind-aware grade target for typedoc = **A** (spec §6.4). Dogfood on `@skillit/core` (a real TS library).
- Reuse the Phase-1 shared `readPackageMetadata`/`findNearestPackageDir` (`@skillit/core`) for the typedoc source's `auditContext` — same DRY reader the cli/config sources use.
- `config` is accepted by gen/audit but the bootstrap skill stays scoped to cli+typedoc (config slash-command orchestration remains Phase 2).

---

## File Structure

| Path                                                 | Responsibility                                                                                                                                                                                                                                                                     | Action |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `packages/typedoc/src/extract-standalone.ts`         | NEW: `extractTypeDocSkills(opts)` — bootstrap a TypeDoc `Application`, `convert()`, call `extractSkills`. Plus `createTypeDocRefineSource(opts)` factory returning a `RefineSource` (extract + auditContext via `readPackageMetadata` + `resolveSourceFile` from project sources). | Create |
| `packages/typedoc/src/index.ts`                      | Export `extractTypeDocSkills`, `createTypeDocRefineSource`, and their option types.                                                                                                                                                                                                | Modify |
| `packages/typedoc/test/extract-standalone.test.ts`   | TDD: run against a tiny temp fixture package (one `src/index.ts` with a documented export), assert an `ExtractedSkill` with the function + description comes back.                                                                                                                 | Create |
| `packages/client/package.json`                       | Add `"@skillit/typedoc": "workspace:*"` dependency.                                                                                                                                                                                                                                | Modify |
| `packages/client/src/commands/gen.ts`                | Replace the `typedoc` half of the unsupported short-circuit with a real branch: `extractTypeDocSkills` → `renderSkills` → `writeSkills`.                                                                                                                                           | Modify |
| `packages/client/src/generate.ts`                    | Add `generateTypeDocSkill(opts)` alongside `generateCliSkill`/`generateConfigSkill` (the one generate path for typedoc).                                                                                                                                                           | Modify |
| `packages/client/src/commands/audit.ts`              | Replace the `typedoc` half of the short-circuit with a real branch: construct `createTypeDocRefineSource` → `buildAuditReport`.                                                                                                                                                    | Modify |
| `packages/client/src/__tests__/gen.test.ts`          | Update: `--source typedoc` no longer rejected; stub `generateTypeDocSkill` and assert dispatch.                                                                                                                                                                                    | Modify |
| `packages/client/src/__tests__/audit-report.test.ts` | Update: drop/adjust the "typedoc rejected" assertion (typedoc now supported; mcp still rejected).                                                                                                                                                                                  | Modify |
| `docs/superpowers/DOGFOOD-phase1.md`                 | Replace the typedoc-smoke follow-up with the real typedoc dogfood result (grade vs target A, determinism).                                                                                                                                                                         | Modify |
| `.changeset/phase1-bootstrap-slash-command.md`       | Update body: typedoc now wired into gen/audit (the changeset already bumps client/core/cli; add a line).                                                                                                                                                                           | Modify |

---

## Task 1: `extractTypeDocSkills` + `createTypeDocRefineSource` in `@skillit/typedoc`

**Files:**

- Create: `packages/typedoc/src/extract-standalone.ts`
- Modify: `packages/typedoc/src/index.ts`
- Test: `packages/typedoc/test/extract-standalone.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/typedoc/test/extract-standalone.test.ts`:

```typescript
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractTypeDocSkills } from '../src/extract-standalone.js';

let tmpDir: string;
afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

async function writeLibFixture(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'td-extract-'));
  await mkdir(join(tmpDir, 'src'), { recursive: true });
  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({
      name: '@scope/mylib',
      description: 'A small documented library.',
      version: '0.0.0'
    })
  );
  await writeFile(
    join(tmpDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2022',
        skipLibCheck: true
      },
      include: ['src']
    })
  );
  await writeFile(
    join(tmpDir, 'src', 'index.ts'),
    `/**\n * Add two numbers together.\n * @param a first addend\n * @param b second addend\n * @returns the sum\n */\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n`
  );
  return tmpDir;
}

describe('extractTypeDocSkills', () => {
  it('extracts a skill with the documented export from a package dir', async () => {
    const dir = await writeLibFixture();
    const skills = await extractTypeDocSkills({
      entryPoints: [join(dir, 'src', 'index.ts')],
      tsconfig: join(dir, 'tsconfig.json'),
      cwd: dir
    });
    expect(skills.length).toBeGreaterThan(0);
    const skill = skills[0]!;
    const fn = skill.functions.find((f) => f.name === 'add');
    expect(fn).toBeDefined();
    expect(fn!.description).toMatch(/Add two numbers/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/typedoc/test/extract-standalone.test.ts`
Expected: FAIL with `Cannot find module '../src/extract-standalone.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/typedoc/src/extract-standalone.ts`. READ `packages/typedoc/src/plugin.ts` first to copy the exact TypeDoc bootstrap pattern + the `extractSkills` call shape, and `packages/typedoc/src/extractor.ts` for the `PackageMetadata` type it expects. Implement:

```typescript
import { Application } from 'typedoc';
import { readPackageMetadata, findNearestPackageDir } from '@skillit/core';
import type {
  ExtractedSkill,
  RefineSource,
  AuditContext,
  DraftedFix,
  TargetLocation
} from '@skillit/core';
import { load } from './plugin.js';
import { extractSkills } from './extractor.js';

/** Options shared by the typedoc generate/extract helpers. */
export interface TypeDocRunOptions {
  /** Entry-point source files (e.g. `['src/index.ts']`, absolute). */
  entryPoints: string[];
  /** Path to the package tsconfig.json. */
  tsconfig: string;
  /** Package root (for package.json metadata). */
  cwd: string;
}

/** Bootstrap a TypeDoc Application for `opts` and convert. `register` lets the
 *  caller add the skills plugin (gen) or skip it (audit). */
async function convertProject(opts: TypeDocRunOptions, register?: (app: Application) => void) {
  const app = await Application.bootstrap({
    entryPoints: opts.entryPoints,
    tsconfig: opts.tsconfig,
    skipErrorChecking: true,
    logLevel: 'Error'
  });
  register?.(app);
  const project = await app.convert();
  if (!project) throw new Error(`TypeDoc could not convert: ${opts.entryPoints.join(', ')}`);
  return { app, project };
}

/** GEN: run the skills plugin pipeline (extract→render→write) end-to-end. The
 *  plugin writes to `outDir` on convert — the client adds NO render/write code. */
export async function generateTypeDocSkills(
  opts: TypeDocRunOptions & { outDir: string }
): Promise<void> {
  await convertProject(opts, (app) => {
    load(app); // registers skillsOutDir etc. + the write-on-resolve hook
    app.options.setValue('skillsOutDir', opts.outDir);
  });
  // The plugin's EVENT_RESOLVE_END handler has already written the skill(s).
}

/** AUDIT: convert + reuse the existing extractor; no render/write. */
export async function extractTypeDocSkills(opts: TypeDocRunOptions): Promise<ExtractedSkill[]> {
  const { project } = await convertProject(opts);
  const pkgDir = (await findNearestPackageDir(opts.cwd)) ?? opts.cwd;
  const meta = await readPackageMetadata(pkgDir);
  return extractSkills(project, false, {
    // map readPackageMetadata fields → extractSkills metadata shape (verify names)
    name: meta.packageName,
    description: meta.packageDescription,
    keywords: meta.keywords,
    repository: meta.repository
  });
}
```

> IMPLEMENTER NOTES — resolve against the real APIs (TDD catches mistakes):
>
> - **gen reuses the plugin pipeline** (`load(app)` → `convert()` writes). Do NOT call `renderSkills`/`writeSkills` in the client or here — the plugin does it. Confirm the option-registration ordering: `load(app)` must run before `setValue('skillsOutDir', …)`, and the plugin reads options inside its convert hook.
> - **audit reuses `extractSkills`** on the converted project (no render/write).
> - Confirm `Application.bootstrap` vs `bootstrapWithPlugins` for the installed `typedoc` version — we register OUR `load` directly, so we do NOT want auto-loaded external plugins.
> - `extractSkills`'s metadata field names may differ from `readPackageMetadata`'s (`name` vs `packageName`). Read both; map correctly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/typedoc/test/extract-standalone.test.ts`
Expected: PASS (1 passed). (TypeDoc conversion of one tiny file is fast.)

- [ ] **Step 5: Add `createTypeDocRefineSource` to the same file**

Append a factory that wraps the runner as a `RefineSource` for `audit`:

```typescript
/** Build a RefineSource backed by a programmatic TypeDoc extraction. */
export function createTypeDocRefineSource(opts: ExtractTypeDocOptions): RefineSource {
  let cachedSkill: ExtractedSkill | undefined;
  let cachedCtx: AuditContext = {};
  return {
    async extract(): Promise<ExtractedSkill> {
      const skills = await extractTypeDocSkills(opts);
      cachedSkill = skills[0] ?? {
        name: '',
        description: '',
        functions: [],
        classes: [],
        types: [],
        enums: [],
        variables: [],
        examples: []
      };
      const pkgDir = (await findNearestPackageDir(opts.cwd)) ?? opts.cwd;
      const meta = await readPackageMetadata(pkgDir);
      cachedCtx = {
        ...(meta.packageDescription !== undefined
          ? { packageDescription: meta.packageDescription }
          : {}),
        ...(meta.keywords !== undefined ? { keywords: meta.keywords } : {}),
        ...(meta.repository !== undefined ? { repository: meta.repository } : {}),
        ...(meta.readme !== undefined ? { readme: meta.readme } : {})
      };
      return cachedSkill;
    },
    auditContext(_skill: ExtractedSkill): AuditContext {
      return cachedCtx;
    },
    async applyFixes(_fixes: readonly DraftedFix[]): Promise<void> {
      // refine writeback for typedoc is out of scope here (gen/audit only).
    },
    resolveTargetLocation(target: {
      name: string;
      kind: string;
      file?: string;
    }): TargetLocation | undefined {
      // The audit issue's own `file` is the best locator we have without re-walking
      // the project; pass it through when present.
      return target.file ? { file: target.file, declName: target.name } : undefined;
    }
  };
}
```

Run the test again (still green): `pnpm exec vitest run packages/typedoc/test/extract-standalone.test.ts`

- [ ] **Step 6: Export from `packages/typedoc/src/index.ts`**

Add: `export { extractTypeDocSkills, createTypeDocRefineSource } from './extract-standalone.js';`
and `export type { ExtractTypeDocOptions } from './extract-standalone.js';`

- [ ] **Step 7: Type-check + commit**

Run: `pnpm --filter @skillit/core run build && pnpm --filter @skillit/typedoc run type-check`
Expected: PASS.

```bash
git add packages/typedoc/src/extract-standalone.ts packages/typedoc/src/index.ts packages/typedoc/test/extract-standalone.test.ts
git commit -m "feat(typedoc): programmatic extractTypeDocSkills + createTypeDocRefineSource"
```

---

## Task 2: `generateTypeDocSkill` + `gen` typedoc branch

**Files:**

- Modify: `packages/client/package.json`
- Modify: `packages/client/src/generate.ts`
- Modify: `packages/client/src/commands/gen.ts`
- Modify: `packages/client/src/__tests__/gen.test.ts`

- [ ] **Step 1: Add the dependency**

In `packages/client/package.json` `dependencies`, add `"@skillit/typedoc": "workspace:*"` (alphabetical with the other `@skillit/*` deps). Run `pnpm install` from repo root.

- [ ] **Step 2: Update the failing test (RED)**

In `packages/client/src/__tests__/gen.test.ts`, the suite currently asserts `--source typedoc` rejects. Replace that test with one that stubs a `generateTypeDocSkill` dep and asserts dispatch. Add to the `GenDeps` stubs and a new test:

```typescript
it('generates the typedoc skill for a typedoc source', async () => {
  const dir = await writeTypedocFixture();
  const { deps, typedocCalls } = makeStubs();
  await run(deps, ['--source', 'typedoc']);
  expect(typedocCalls).toHaveLength(1);
  expect(typedocCalls[0]!.outDir).toBe(join(dir, 'skills'));
});
```

You must add: a `writeTypedocFixture()` helper (writes a package.json with NO commander dep + a `src/index.ts` + `tsconfig.json` so detection resolves to typedoc), a `typedocCalls: GenerateTypeDocSkillOpts[]` array + `generateTypeDocSkill` stub in `makeStubs()`, and import `GenerateTypeDocSkillOpts` from `../generate.js`. Mirror the existing cli/config stub structure exactly.

Run: `pnpm exec vitest run packages/client/src/__tests__/gen.test.ts`
Expected: FAIL — `generateTypeDocSkill` not in `GenDeps` / typedoc still short-circuits.

- [ ] **Step 3: Add `generateTypeDocSkill` to `generate.ts`**

In `packages/client/src/generate.ts` add:

```typescript
import { extractTypeDocSkills } from '@skillit/typedoc';
import { renderSkills, writeSkills } from '@skillit/core';

/** Options for typedoc-path skill generation. */
export interface GenerateTypeDocSkillOpts {
  /** Package root. */
  cwd: string;
  /** Entry-point source files (absolute). */
  entryPoints: string[];
  /** Path to tsconfig.json. */
  tsconfig: string;
  /** Absolute output directory. */
  outDir: string;
}

/** TypeDoc-path skill generation: run TypeDoc → extract → render → write. */
export async function generateTypeDocSkill(opts: GenerateTypeDocSkillOpts): Promise<void> {
  const skills = await extractTypeDocSkills({
    entryPoints: opts.entryPoints,
    tsconfig: opts.tsconfig,
    cwd: opts.cwd
  });
  const rendered = renderSkills(skills, { outDir: opts.outDir });
  writeSkills(rendered, { outDir: opts.outDir });
}
```

(`renderSkills`/`writeSkills` are already imported in `generate.ts` for the config path — reuse the existing import; don't duplicate.)

- [ ] **Step 4: Wire the `gen.ts` typedoc branch + entry/tsconfig discovery**

In `packages/client/src/commands/gen.ts`:

- Add `generateTypeDocSkill` to `GenDeps` (optional, defaulting to the real one), mirroring `generateCliSkill`.
- Add a helper `resolveTypeDocEntry(cwd)` that returns `{ entryPoints, tsconfig }`: tsconfig = `<cwd>/tsconfig.json` (fallback `tsconfig.build.json` if present); entryPoints = the package.json `source`/`exports` source if resolvable, else `<cwd>/src/index.ts` (default). Keep it simple; document the default.
- Replace the `opts.source === 'mcp' || opts.source === 'typedoc'` short-circuit so it ONLY short-circuits `mcp`. Add a typedoc branch (handle explicit `--source typedoc` AND auto-detected typedoc): resolve entry/tsconfig, call `generateTypeDocSkill({ cwd, entryPoints, tsconfig, outDir })`, return.

Run: `pnpm exec vitest run packages/client/src/__tests__/gen.test.ts`
Expected: PASS (all gen tests, incl. the new typedoc dispatch + the still-rejected mcp).

- [ ] **Step 5: Type-check + commit**

```bash
pnpm --filter @skillit/typedoc run build && pnpm --filter @skillit/client run type-check
git add packages/client/package.json packages/client/src/generate.ts packages/client/src/commands/gen.ts packages/client/src/__tests__/gen.test.ts
git commit -m "feat(client): skillit gen --source typedoc (programmatic extraction)"
```

---

## Task 3: `audit` typedoc branch

**Files:**

- Modify: `packages/client/src/commands/audit.ts`
- Modify: `packages/client/src/__tests__/audit-report.test.ts`

- [ ] **Step 1: Update the test (RED)**

In `packages/client/src/__tests__/audit-report.test.ts`, the `runAuditCommand unsupported sources` describe asserts `--source mcp` rejects (keep that). If there is a typedoc-rejection assertion, change it to expect typedoc is NOT rejected with the "not supported" message (it now runs). Since a full typedoc audit needs a real package, keep this test focused on mcp rejection only and remove any typedoc-specific rejection assertion. (The real typedoc audit is covered by the dogfood, Task 4.)

Run: `pnpm exec vitest run packages/client/src/__tests__/audit-report.test.ts`
Expected: still green for mcp; no typedoc rejection asserted.

- [ ] **Step 2: Wire the `audit.ts` typedoc branch**

In `packages/client/src/commands/audit.ts`:

- Change the explicit-source short-circuit so it only rejects `mcp` (not `typedoc`).
- In the resolution branch, add a `typedoc` case: resolve entry/tsconfig (reuse the same discovery as `gen` — extract a shared `resolveTypeDocEntry` into `generate.ts` or a small helper module and import in both, to stay DRY), construct `createTypeDocRefineSource({ cwd, entryPoints, tsconfig })`, then fall through to the existing `source.extract()` + `buildAuditReport(source, skill)` + print/JSON path.
- `resolveRefineSource` returns an error for `typedoc` ("typedoc refine not yet supported"). Handle typedoc BEFORE calling `resolveRefineSource` (like the explicit-mcp short-circuit), or special-case it, so it reaches the new branch.

Run: `pnpm exec vitest run packages/client/src/__tests__/audit-report.test.ts`
Expected: PASS.

- [ ] **Step 3: Type-check + commit**

```bash
pnpm --filter @skillit/client run type-check
git add packages/client/src/commands/audit.ts packages/client/src/__tests__/audit-report.test.ts
git commit -m "feat(client): skillit audit --source typedoc"
```

---

## Task 4: Dogfood typedoc on `@skillit/core` (in-session) + determinism

**Files:**

- Modify: `docs/superpowers/DOGFOOD-phase1.md`

- [ ] **Step 1: Build, then baseline-audit `@skillit/core` via typedoc**

```bash
pnpm --filter @skillit/core --filter @skillit/typedoc --filter @skillit/client run build
cd packages/core
node ../client/dist/bin.js audit --source typedoc --json 2>&1 | head -40
```

Record the grade/total/improvements (kind-aware target for typedoc = **A**, i.e. ≥90%/108).

- [ ] **Step 2: Run the bootstrap loop (follow the skill)**

Follow `/skillit-bootstrap --source typedoc`: enrich `@skillit/core` source per the findings (JSDoc summaries/`@param`/`@returns`/`@remarks`/`@example` on exported symbols, `@packageDocumentation`), regenerate, re-audit. Stop at grade A or a justified plateau or `--max-iterations`. Do NOT edit any SKILL.md.

- [ ] **Step 3: Determinism check**

```bash
node ../client/dist/bin.js gen --source typedoc --out .det-a >/dev/null 2>&1
node ../client/dist/bin.js gen --source typedoc --out .det-b >/dev/null 2>&1
diff -r .det-a .det-b && echo "DETERMINISTIC"; rm -rf .det-a .det-b
```

Expected: `DETERMINISTIC`.

- [ ] **Step 4: Record** the typedoc dogfood in `docs/superpowers/DOGFOOD-phase1.md` — REPLACE the `## typedoc smoke` follow-up with a `## typedoc dogfood (@skillit/core)` section: baseline grade, final grade vs target A, enriched files, determinism result, and any findings judged un-addressable. If grade A proves unreachable in a bounded run, record the best grade reached + a rationale (typedoc target may need multiple passes; B/A- is acceptable to document as progress with a follow-up).

- [ ] **Step 5: Commit** (source enrichments + record)

```bash
git add -A
git commit -m "test(typedoc): dogfood skillit bootstrap on @skillit/core via typedoc source"
```

---

## Task 5: Changeset update + final gate

**Files:**

- Modify: `.changeset/phase1-bootstrap-slash-command.md`

- [ ] **Step 1: Update the changeset body**

Add a bullet to `.changeset/phase1-bootstrap-slash-command.md` (it already bumps `@skillit/client`/`@skillit/core`/`@skillit/cli` minor; add `'@skillit/typedoc': minor` to the frontmatter and a bullet):

```markdown
- **typedoc:** `skillit gen --source typedoc` and `skillit audit --source typedoc`
  now work via a new programmatic `extractTypeDocSkills` entry in
  `@skillit/typedoc` (runs TypeDoc's Application and feeds `extractSkills`),
  making the `/skillit-bootstrap` skill's typedoc support real.
```

- [ ] **Step 2: Final gate**

```bash
pnpm exec vitest run packages/core packages/cli packages/client packages/typedoc
pnpm run type-check
pnpm run lint
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add .changeset/phase1-bootstrap-slash-command.md
git commit -m "chore(typedoc): changeset for typedoc gen/audit wiring"
```

---

## Self-Review

**1. Spec coverage:** Makes the bootstrap skill's typedoc claim real (the user's "wire typedoc into gen+audit now" decision). The reusable `extractSkills` seam is fed a programmatically-obtained `ProjectReflection`. cli (done) + typedoc (this plan) = the Phase 1 "typedoc + cli" scope, now both real. ✓

**2. Placeholder scan:** The TypeDoc bootstrap API is given concretely (`Application.bootstrapWithPlugins`/`convert`), with an explicit implementer note to verify the exact API against the installed version + `plugin.ts` (a real ambiguity flagged, not a lazy TBD). Entry-point/tsconfig discovery has a concrete default (`src/index.ts` + `tsconfig.json`). No "add error handling"-style gaps.

**3. Type/name consistency:** `extractTypeDocSkills` / `createTypeDocRefineSource` / `ExtractTypeDocOptions` / `generateTypeDocSkill` / `GenerateTypeDocSkillOpts` are used consistently across tasks. `extractSkills(project, perPackage, metadata)` matches its real signature (extractor.ts:62). `readPackageMetadata`/`findNearestPackageDir` reuse the Phase-1 shared reader. The gen/audit short-circuit change (mcp-only) is consistent between Tasks 2 and 3, and `resolveTypeDocEntry` is shared (DRY) between gen and audit (Task 3 Step 2).
