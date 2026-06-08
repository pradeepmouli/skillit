# skillit Phase 1 — `/skillit-bootstrap` Slash Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/skillit-bootstrap` — a prose Claude Code skill, bundled with `@skillit/client`, that orchestrates the agent-bootstrap loop (`skillit gen` → `skillit audit --json` → agent enriches source → regenerate) for the **typedoc** and **cli** source kinds, dogfooded on a real `@skillit/*` cli package to its kind-aware grade target with a regenerate-determinism check.

**Architecture:** The slash command is **prose only** — a `SKILL.md` (+ one `references/` file) that instructs the agent to shell out to the Phase 0 primitives and judge convergence itself per spec §2.4. There is **no new orchestration TypeScript**: the deterministic machinery (`gen`, `audit --json`, the renderer/audit/judge) already lives in `@skillit/core`/`@skillit/client` from Phase 0. The agent supplies the one non-deterministic step — enriching repo source surfaces (JSDoc / README / examples / package.json) — and never writes a `SKILL.md`/`references/*.md` (hard invariant §2.5). Scope is typedoc + cli; config + mcp are Phase 2; the mechanical no-hand-edit guard is Phase 3.

**Tech Stack:** Markdown (the skill artifact), TypeScript 5 / Node ≥20 (packaging only — `package.json` `files`, one vitest packaging assertion), Vitest, oxlint/oxfmt, pnpm workspaces, changesets. The skill follows skillit's own SKILL.md conventions (frontmatter `name`/`description`, progressive disclosure).

**Source spec:** `docs/superpowers/specs/2026-06-07-skillit-agent-bootstrap-architecture-design.md` — §2.1–2.4 (loop + convergence), §3.1–3.3 (slash command shape / packaging / thin orchestrator), §2.3 + §4 (enrichment-surface routing), §8.2–8.3 (validation/determinism), §9.3 (Phase 1 scope).

**Decisions already made (this plan honors them):**

- **Prose-only** skill — no convergence-loop TS; agent runs `skillit gen` + `skillit audit --json` and judges convergence.
- Scope **typedoc + cli** only (config/mcp = Phase 2).
- Dogfood on a real `@skillit/*` **cli** package → grade ≥ kind-aware target (cli = B), plus a regenerate-determinism check. typedoc kind exercised once. lsproxy is stretch/manual, **not** a dependency.
- No-hand-edit pre-write guard **deferred to Phase 3**.

**Branch:** start from `develop` (Phase 0 merged at `38965a6`). Create `feat/phase1-bootstrap-slash-command`.

---

## File Structure

| Path                                                                     | Responsibility                                                                                                                                                                                                                           | Action           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `packages/client/skills/skillit-bootstrap/SKILL.md`                      | The orchestration skill the agent invokes as `/skillit-bootstrap`: frontmatter, the 7-step loop, invariant, convergence rules, how to run the Phase 0 primitives, convergence report. Concise + scannable.                               | Create           |
| `packages/client/skills/skillit-bootstrap/references/surface-routing.md` | Progressive-disclosure reference: the audit-code → enrichment-surface table, edit-vs-create guidance, `upsertJsDocTag` writeback note, kind scope (typedoc+cli) + what's deferred.                                                       | Create           |
| `packages/client/package.json`                                           | Add `"files": ["dist", "README.md", "skills"]` so the bundled skill ships on publish (mirrors `@skillit/cli`).                                                                                                                           | Modify           |
| `packages/client/src/__tests__/bootstrap-skill.test.ts`                  | Packaging assertion: the bundled SKILL.md exists, has valid frontmatter (`name: skillit-bootstrap`, non-empty `description`), references file exists, and `package.json` `files` includes `skills`. The one genuinely unit-testable bit. | Create           |
| `.claude/skills/skillit-bootstrap`                                       | In-repo discoverability for dogfooding: a **symlink** to the canonical `../../packages/client/skills/skillit-bootstrap` (no content duplication).                                                                                        | Create (symlink) |
| `README.md`                                                              | Position `/skillit-bootstrap` as the primary UX (§5.3); document consumer install (`cp` from the published package) and the typedoc/cli scope.                                                                                           | Modify           |
| `docs/superpowers/DOGFOOD-phase1.md`                                     | The recorded dogfood run: target package, before/after grade, files enriched, the determinism-check result. The human-review artifact (§2.4 convergence report, captured).                                                               | Create           |
| `.changeset/phase1-bootstrap-slash-command.md`                           | `@skillit/client` minor (new bundled skill + `files`).                                                                                                                                                                                   | Create           |

**Why a symlink, not a copy, for `.claude/skills/`:** the canonical skill lives in `packages/client/skills/` (the shipped location). Duplicating it under `.claude/skills/` would violate DRY and drift. A committed symlink keeps one source of truth while making `/skillit-bootstrap` invocable in this repo for dogfooding. Consumers install by copying from their `node_modules/@skillit/client/skills/` (documented in Task 5); a polished `skillit`-managed installer is deferred (YAGNI for the MVP).

---

## Task 1: Scaffold the bundled skill + packaging (RED-first on the packaging assertion)

**Files:**

- Create: `packages/client/skills/skillit-bootstrap/SKILL.md`
- Create: `packages/client/skills/skillit-bootstrap/references/surface-routing.md`
- Modify: `packages/client/package.json`
- Test: `packages/client/src/__tests__/bootstrap-skill.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/__tests__/bootstrap-skill.test.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The bundled skill lives alongside the package root (packages/client/skills),
// two levels up from this test file's dir (src/__tests__).
const clientRoot = fileURLToPath(new URL('../../', import.meta.url));
const skillDir = join(clientRoot, 'skills', 'skillit-bootstrap');

describe('bundled skillit-bootstrap skill', () => {
  it('ships a SKILL.md with valid frontmatter', () => {
    const skillPath = join(skillDir, 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    const md = readFileSync(skillPath, 'utf8');
    // Frontmatter block at the top
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).not.toBeNull();
    const front = fm![1]!;
    expect(front).toMatch(/^name:\s*skillit-bootstrap\s*$/m);
    expect(front).toMatch(/^description:\s*\S.+$/m);
  });

  it('ships the surface-routing reference', () => {
    expect(existsSync(join(skillDir, 'references', 'surface-routing.md'))).toBe(true);
  });

  it('declares skills/ in package files so the skill is published', () => {
    const pkg = JSON.parse(readFileSync(join(clientRoot, 'package.json'), 'utf8')) as {
      files?: string[];
    };
    expect(pkg.files).toBeDefined();
    expect(pkg.files).toContain('skills');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/client/src/__tests__/bootstrap-skill.test.ts`
Expected: FAIL — SKILL.md does not exist; `pkg.files` is `undefined`.

- [ ] **Step 3: Create the skill files (skeleton) — full content lands in Tasks 2–3**

Create `packages/client/skills/skillit-bootstrap/SKILL.md` with valid frontmatter and a placeholder body (Task 2 fills the body):

```markdown
---
name: skillit-bootstrap
description: 'Bootstrap an AI-agent skill from a TypeScript codebase by running the deterministic skillit generate/audit loop and enriching repo source (JSDoc, README, examples, package.json) until the skill reaches its grade target. Use for cli or typedoc projects; never edit SKILL.md/references directly.'
version: 0.1.0
toSkills:
  managed: bundled-orchestrator
---

# skillit-bootstrap

<!-- body authored in Task 2 -->
```

Create `packages/client/skills/skillit-bootstrap/references/surface-routing.md` with a heading (Task 3 fills it):

```markdown
# Enrichment surface routing

<!-- content authored in Task 3 -->
```

- [ ] **Step 4: Add the `files` field to `packages/client/package.json`**

Add a `"files"` array (mirroring `@skillit/cli`) immediately after the `"license"`/`"author"` block, before `"bin"` (exact placement is flexible — it must be a top-level key):

```json
  "files": [
    "dist",
    "README.md",
    "skills"
  ],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/client/src/__tests__/bootstrap-skill.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add packages/client/skills/skillit-bootstrap/SKILL.md packages/client/skills/skillit-bootstrap/references/surface-routing.md packages/client/package.json packages/client/src/__tests__/bootstrap-skill.test.ts
git commit -m "feat(client): scaffold bundled skillit-bootstrap skill + ship skills/ in files

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Author the `SKILL.md` orchestration prose

**Files:**

- Modify: `packages/client/skills/skillit-bootstrap/SKILL.md`

This is the core deliverable. Replace the placeholder body (keep the frontmatter from Task 1) with the full orchestration prose below. It must be concise and scannable — detail tables go in the reference file (Task 3), linked via progressive disclosure.

- [ ] **Step 1: Replace the body** with exactly this content (below the frontmatter):

````markdown
# skillit-bootstrap

Bootstrap a high-quality AI-agent skill from a TypeScript codebase. You run the
deterministic skillit pipeline, read its machine-readable findings, and enrich
the **repo source** (JSDoc, README, examples, package.json) until the generated
skill reaches its grade target. skillit owns the skill output; you own the
inputs.

## The one hard rule

**Never create or edit any `SKILL.md` or `references/*.md` for the target
project.** Those are pure outputs of `skillit gen` — regenerated every pass. You
edit only repo _source surfaces_. If you find yourself about to write a
`SKILL.md`, stop: the fix belongs in the source the skill is generated from.

## When to use

- A `cli` (Commander) or `typedoc` (TypeScript library) project that needs a
  generated agent skill, or whose skill scores below its grade target.
- Run after the project is set up with the right `@skillit/*` package (see
  step 1). For `config` and `mcp` projects, this release does not orchestrate
  them yet — use `skillit refine` (see `references/surface-routing.md`).

## Inputs

```
/skillit-bootstrap [--source cli|typedoc] [--program <file#export>]
                   [--out <dir>] [--grade A|B|C] [--max-iterations <n>]
                   [--ground <glob>...]
```

- `--source` — override detection (`cli` or `typedoc` this release).
- `--program` — Commander program entry for the cli source (`./dist/cli.js#program`).
- `--out` — skill output dir (default `skills`).
- `--grade` — override the kind-aware target (below).
- `--max-iterations` — hard cap on enrich/regenerate passes (default 5).
- `--ground <glob>` — consumer/implementation code you MUST read before writing
  any runtime-behavior pitfall, so your claims reflect real behavior, not guesses.

## The loop

1. **Set up once.** Determine the source kind (honor `--source`, else infer:
   `commander`/`yargs` dep → cli; otherwise a TS library → typedoc). If the
   project has no `@skillit/*` package installed yet, run `skillit init --source
<kind>` once (it installs + wires only; it does not generate).
2. **Generate.** Run `skillit gen --source <kind> [--program …] [--out …]`. This
   deterministically produces the skill from current source. Never hand-edit its
   output.
3. **Audit.** Run `skillit audit --source <kind> [--program …] --json` and read
   the JSON: `estimate.grade`, `estimate.dimensions` (D1–D8), and
   `improvements[]`. Each improvement carries `suggestion`, `dimension`,
   `targets: [{file, name, kind}]`, and (when resolvable) `resolvedLocations[]`
   pointing at the exact file + declaration to edit. **These targets are your
   work queue.**
4. **Enrich the source.** For each addressable finding, open the cited source
   file and write the missing content on the named symbol/section/key, choosing
   the surface the suggestion names. The surface → audit-code map and the
   edit-vs-create guidance are in `references/surface-routing.md`. Before writing
   any _runtime-behavior_ pitfall, read the relevant implementation (`--ground`
   globs) — do not invent semantics from a type signature.
   - Prefer the `upsertJsDocTag` / `upsertPropertyJsDocTag` helpers (exported
     from `@skillit/core`) for JSDoc-tag writeback rather than free-hand
     splicing — they handle `*/` escaping and multi-line prefixing.
   - You may also **create** a new parseable artifact when that is the better
     home (a `docs/<guide>.md`, an `examples/<name>.ts`, a missing README
     section) — but only of a type an existing parser already consumes, and
     never a `SKILL.md`.
5. **Regenerate + re-audit.** Re-run step 2 then step 3. Compare the new
   `estimate` to the previous pass.
6. **Decide convergence** (your judgment, using these signals):
   - **Pass** — `estimate.grade` ≥ the target. Default target is _kind-aware_:
     typedoc/library → **A**; cli adapter-model → **B** (some dimensions — e.g.
     enumerated-tree examples — don't structurally apply to a cli surface).
     `--grade` overrides.
   - **Plateau** — the score did not rise AND every remaining finding targets a
     symbol that genuinely has nothing more to truthfully say. You can _see_ the
     source, so distinguish "legitimately complete" from "stuck re-drafting" —
     stop on the former.
   - **Cap** — never exceed `--max-iterations` (default 5).
7. **Report.** Print the final grade, the D1–D8 breakdown, the list of source
   files you enriched, and any remaining findings you judged un-addressable with
   a one-line rationale each. This is the human review surface; the user commits
   the result.

## After convergence

Tell the user to review the enriched source diffs and the regenerated skill,
then commit. Remind them the skill is reproducible: `skillit gen` on the same
source yields byte-identical output, so the source diff is the real change.
````

- [ ] **Step 2: Structural check** (no unit test — assert required sections exist)

Run: `rg -n "^## (The one hard rule|When to use|Inputs|The loop|After convergence)" packages/client/skills/skillit-bootstrap/SKILL.md`
Expected: 5 matching headings printed.

Run: `pnpm exec vitest run packages/client/src/__tests__/bootstrap-skill.test.ts`
Expected: PASS (frontmatter still valid).

- [ ] **Step 3: Commit**

```bash
git add packages/client/skills/skillit-bootstrap/SKILL.md
git commit -m "feat(client): author skillit-bootstrap orchestration prose

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Author `references/surface-routing.md`

**Files:**

- Modify: `packages/client/skills/skillit-bootstrap/references/surface-routing.md`

This is the detailed table the SKILL.md links to (progressive disclosure). It encodes the audit-code → enrichment-surface mapping from spec §2.3, the edit-vs-create rule, and the kind scope.

- [ ] **Step 1: Replace the file** with exactly this content:

```markdown
# Enrichment surface routing

For each audit finding, edit the **source surface** named here — never the
generated `SKILL.md`. The audit `suggestion` text already names the surface;
this table is the quick reference. (Source: skillit architecture spec §2.3/§4.)

| Audit codes        | Enrichment surface (what you edit) | How                                                                        |
| ------------------ | ---------------------------------- | -------------------------------------------------------------------------- |
| F4                 | Symbol JSDoc summary               | `/** … */` on the function/class/type/enum/variable                        |
| E1, E2             | `@param` / `@returns` prose        | on parameters and non-void returns                                         |
| E3                 | Interface/type property JSDoc      | `/** … */` on each property                                                |
| W7, W8, W9         | Routing tags                       | `@useWhen` / `@avoidWhen` / `@never` (render as pitfalls)                  |
| W10, W11, W3       | Depth tags                         | `@remarks` (complex fns), `@category`, `@since`/`@throws`/`@see`           |
| W1, W5             | Module docs                        | `@packageDocumentation` summary + `@remarks`                               |
| E4, W2             | Examples                           | sibling `*.example.ts` / `examples/*`, or `@example` blocks on key exports |
| F3, W5, W6, A4     | README sections                    | Features / Troubleshooting / Quick Start, intro blockquote                 |
| F1, F2, E5, W4, A1 | package.json metadata              | `description`, `keywords` (≥5, ≥3 domain), `repository`                    |

Use the `upsertJsDocTag` / `upsertPropertyJsDocTag` helpers (exported from
`@skillit/core`) for tag writeback — they escape `*/` and prefix multi-line
content correctly. Free-hand JSDoc splicing is error-prone.

## Edit vs. create

Editing an existing surface is the common move, but you may **create** a new
artifact when it is the better home for missing content — e.g.:

- a `docs/<guide>.md` page (consumed by skillit's docs scanner → `skill.documents`);
- an `examples/<name>.ts` or sibling `*.example.ts` (consumed by the examples scanner);
- a `## Troubleshooting` / `## Features` section a README lacks.

Hard constraint: the new artifact must be a type an existing skillit parser
already consumes — **no new parser**, and never a `SKILL.md`.

## Grounding runtime claims

Before writing any pitfall or `@never`/`@avoidWhen` rule that asserts _runtime
behavior_, read the implementation (the `--ground` globs, or the function body).
A fluent, well-structured claim that is factually wrong is invisible to the
deterministic audit — the safeguard is that you actually read the code.

## Scope this release (Phase 1)

- **Supported:** `cli` (Commander) and `typedoc` (TS library) sources.
- **Not yet orchestrated here:** `config` and `mcp`. For those, use `skillit
refine` directly (the headless loop). They arrive in a later phase.
- Kind-aware grade targets: typedoc → A; cli → B (a non-enumerated command tree
  cannot structurally satisfy example/return-coverage dimensions).
```

- [ ] **Step 2: Structural check**

Run: `rg -n "^## (Edit vs. create|Grounding runtime claims|Scope this release)" packages/client/skills/skillit-bootstrap/references/surface-routing.md`
Expected: 3 matching headings.

- [ ] **Step 3: Commit**

```bash
git add packages/client/skills/skillit-bootstrap/references/surface-routing.md
git commit -m "docs(client): author skillit-bootstrap surface-routing reference

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: In-repo discoverability (symlink) so `/skillit-bootstrap` is invocable here

**Files:**

- Create: `.claude/skills/skillit-bootstrap` (symlink → canonical)

- [ ] **Step 1: Create the symlink** (relative, so it survives clone on darwin/linux)

Run:

```bash
mkdir -p .claude/skills
ln -s ../../packages/client/skills/skillit-bootstrap .claude/skills/skillit-bootstrap
```

- [ ] **Step 2: Verify it resolves to the canonical SKILL.md**

Run: `cat .claude/skills/skillit-bootstrap/SKILL.md | head -3`
Expected: prints the `---` frontmatter opening + `name: skillit-bootstrap`.

- [ ] **Step 3: Confirm git records it as a symlink (mode 120000), not a copy**

Run: `git add .claude/skills/skillit-bootstrap && git ls-files -s .claude/skills/skillit-bootstrap`
Expected: a line beginning `120000` (symlink), confirming no content duplication.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: symlink .claude/skills/skillit-bootstrap to bundled canonical (dogfood)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Document the slash command as primary UX + consumer install

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add a `### Bootstrap (recommended): /skillit-bootstrap` section**

Insert immediately **before** the existing `### Init: detect → install` section in `README.md` (so the agent-first UX leads). Use exactly:

````markdown
### Bootstrap (recommended): `/skillit-bootstrap`

The primary way to create or improve a skill is the **`/skillit-bootstrap`**
Claude Code skill (bundled with `@skillit/client`). It runs the deterministic
generate → audit loop and lets the agent enrich your repo's source (JSDoc,
README, examples, package.json) until the skill hits its grade target — you
never hand-edit a `SKILL.md`.

```bash
# Install the bundled skill into your project (one time)
cp -R node_modules/@skillit/client/skills/skillit-bootstrap .claude/skills/

# Then, in Claude Code:
/skillit-bootstrap --source cli --program ./dist/cli.js#program
/skillit-bootstrap --source typedoc
```
````

Supported sources this release: **cli** and **typedoc**. For `config` / `mcp`,
use `skillit refine` (below); slash-command support for those lands in a later
phase. The CLI commands (`skillit gen`, `skillit audit --json`, `skillit
refine`) remain for headless/CI use.

````

- [ ] **Step 2: Lint the README**

Run: `pnpm exec oxfmt README.md` (or rely on lint-staged at commit)
Run: `rg -n "skillit-bootstrap" README.md`
Expected: at least the new section's references print.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document /skillit-bootstrap as the primary skill-creation UX

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
````

---

## Task 6: Dogfood validation on a real `@skillit/*` cli package + determinism

**Files:**

- Create: `docs/superpowers/DOGFOOD-phase1.md`

This is the Phase 1 acceptance gate. It is a **recorded run**, not a unit test: follow the bootstrap loop against a real cli package and capture the evidence. The target is `@skillit/client` itself (its `skillit` Commander program is a real cli source) OR `@skillit/cli` — pick whichever currently scores below B.

- [ ] **Step 1: Baseline audit — record the starting grade**

Run (from the chosen package dir, after `pnpm build`):

```bash
node packages/client/dist/bin.js audit --source cli --program ./dist/bin.js#buildProgram --json > /tmp/skillit-baseline.json
```

Record `estimate.grade`, `estimate.total`, and the count of `improvements[]` from `/tmp/skillit-baseline.json` into `docs/superpowers/DOGFOOD-phase1.md` under a `## Baseline` heading.

> If `--program ./dist/bin.js#buildProgram` does not resolve, use the program export the package actually ships (check `packages/client/src/program.ts` `buildProgram`). The point is a real Commander program, not the exact path.

- [ ] **Step 2: Run the bootstrap loop by following the skill**

Invoke `/skillit-bootstrap --source cli --program <entry>` (or follow `packages/client/skills/skillit-bootstrap/SKILL.md` step-by-step manually). Enrich the cited source surfaces (Commander `.description()`/`.option()` text, `*Options` JSDoc, package.json keywords) per the audit findings. Do **not** edit any generated `SKILL.md`.

- [ ] **Step 3: Converged audit — record the final grade**

Run the same audit command into `/tmp/skillit-final.json`. Record the final `estimate.grade` (must be ≥ **B**), the dimension deltas, and the list of source files you enriched into `docs/superpowers/DOGFOOD-phase1.md` under `## Result`.

Expected: `estimate.grade` ∈ `{A, B}`.

- [ ] **Step 4: Determinism check — regenerate twice, assert byte-identical**

Run:

```bash
node packages/client/dist/bin.js gen --source cli --program <entry> --out /tmp/skill-a
node packages/client/dist/bin.js gen --source cli --program <entry> --out /tmp/skill-b
diff -r /tmp/skill-a /tmp/skill-b && echo "DETERMINISTIC"
```

Expected: prints `DETERMINISTIC` (no diff). Record the result in `docs/superpowers/DOGFOOD-phase1.md` under `## Determinism`.

- [ ] **Step 5: Write the dogfood record** `docs/superpowers/DOGFOOD-phase1.md`

It must contain: the target package + program entry; `## Baseline` (grade/total/improvement count); `## Result` (final grade, dimension deltas, enriched files); `## Determinism` (the diff result); and a `## Findings judged un-addressable` list with one-line rationales (the convergence report from SKILL.md step 7). If any enrichment was a _runtime_ claim, note which `--ground`/impl file you read to verify it (the §8.2 impl-grounded spot-check).

- [ ] **Step 6: Commit** (include the source enrichments from Step 2 and the record)

```bash
git add docs/superpowers/DOGFOOD-phase1.md
git add -A   # the source-surface enrichments made during the dogfood
git commit -m "test(phase1): dogfood /skillit-bootstrap on a @skillit cli package (grade>=B, deterministic)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: typedoc-kind smoke + changeset + final gate

**Files:**

- Create: `.changeset/phase1-bootstrap-slash-command.md`
- Modify: `docs/superpowers/DOGFOOD-phase1.md` (append a typedoc note)

- [ ] **Step 1: Exercise the typedoc kind once (smoke)**

Pick a small TS-library package (e.g. `@skillit/core`) and run one generate+audit pass via the typedoc path to confirm the skill's typedoc instructions are runnable:

```bash
node packages/client/dist/bin.js audit --source typedoc --json | head -40 || true
```

Append a `## typedoc smoke` note to `docs/superpowers/DOGFOOD-phase1.md` recording whether the typedoc audit ran and the grade observed. (No grade gate on typedoc this task — it's a runnability smoke; full typedoc convergence is exercised in dogfooding when a typedoc consumer is bootstrapped.)

> If `--source typedoc` requires a generated `ExtractedSkill` input the audit can't produce standalone, record that gap as a follow-up in the dogfood doc rather than blocking — the cli path is the Phase 1 acceptance gate.

- [ ] **Step 2: Write the changeset** `.changeset/phase1-bootstrap-slash-command.md`:

```markdown
---
'@skillit/client': minor
---

feat: ship the `/skillit-bootstrap` agent skill (Phase 1)

- New bundled Claude Code skill `skillit-bootstrap` (`packages/client/skills/`)
  that orchestrates the agent-bootstrap loop — `skillit gen` → `skillit audit
--json` → agent enriches repo source → regenerate — for the **cli** and
  **typedoc** source kinds. The agent never writes a `SKILL.md`; it edits only
  source surfaces (JSDoc / README / examples / package.json).
- `@skillit/client` now ships its `skills/` directory (`files`), so the bundled
  skill installs with the package.
- config / mcp orchestration and the mechanical no-hand-edit guard are deferred
  to later phases; the CLI commands remain for headless/CI use.
```

- [ ] **Step 3: Final gate — affected suite + type-check + lint**

Run:

```bash
pnpm exec vitest run packages/client
pnpm run type-check
pnpm run lint
```

Expected: all PASS (client suite green incl. `bootstrap-skill.test.ts`; workspace type-check clean; `oxlint .` clean).

- [ ] **Step 4: Commit**

```bash
git add .changeset/phase1-bootstrap-slash-command.md docs/superpowers/DOGFOOD-phase1.md
git commit -m "chore(phase1): changeset + typedoc smoke for /skillit-bootstrap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage (Phase 1 = §9.3 item 2: slash command MVP, typedoc + cli, dogfood):**

- §3.1 slash command shape (flags) → SKILL.md `## Inputs` (Task 2). ✓
- §3.2 packaging (bundled with `@skillit/client`, rides skill install path) → Task 1 (`files`) + Task 4 (discoverability) + Task 5 (consumer install). ✓
- §3.3 thin orchestrator (7 steps, no generation/audit/scoring logic) → SKILL.md `## The loop` (Task 2), prose-only, shells to Phase 0 primitives. ✓
- §2.3 / §4 surface routing → `references/surface-routing.md` (Task 3). ✓
- §2.4 convergence (kind-aware grade, plateau, cap, report) → SKILL.md step 6–7 (Task 2). ✓
- §2.5 hard invariant (never write SKILL.md) → SKILL.md `## The one hard rule` (Task 2) + reference (Task 3). ✓
- §8.2 quality + impl-grounded spot-check → Task 6 (grade ≥ B gate + runtime-claim grounding note). ✓
- §8.3 determinism (regenerate, byte-identical) → Task 6 Step 4. ✓
- §9.3 scope typedoc+cli, dogfood `@skillit/*` → Tasks 6 (cli gate) + 7 (typedoc smoke). ✓
- Deferred (correctly out of scope): config/mcp orchestration (Phase 2), no-hand-edit guard + staleness CI (Phase 3), headless deprecation (Phase 4). ✓

**2. Placeholder scan:** SKILL.md and reference content are given in full (not "TBD"). The dogfood `<entry>` program path is intentionally parameterized with a fallback instruction (the real export is `buildProgram`, verifiable in `program.ts`) — acceptable because the exact path depends on the chosen target package and the task says how to find it. No "add error handling"-style placeholders.

**3. Type/name consistency:** `name: skillit-bootstrap` is identical in the frontmatter (Task 1), the test assertion (Task 1), the symlink target (Task 4), README install path (Task 5), and changeset (Task 7). The Phase 0 primitives invoked (`skillit gen`, `skillit audit --json`, `skillit init`) match the commands shipped in `38965a6`. The flag set in `## Inputs` matches the spec §3.1 minus config-only flags (`--config-type` omitted since config is out of scope, `--target` omitted as YAGNI for the single-package MVP — noted as a deliberate scope trim, not a gap).
