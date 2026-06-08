---
name: skillit-bootstrap
description: 'Bootstrap an AI-agent skill from a TypeScript codebase by running the deterministic skillit generate/audit loop and enriching repo source (JSDoc, README, examples, package.json) until the skill reaches its grade target. Use for cli or typedoc projects; never edit SKILL.md/references directly.'
version: 0.1.0
toSkills:
  managed: bundled-orchestrator
---

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
