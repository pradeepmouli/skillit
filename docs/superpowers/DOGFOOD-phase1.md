# Phase 1 dogfood — `/skillit-bootstrap` on `@skillit/client`

Target: the `@skillit/client` package's own `skillit` Commander CLI
(`--source cli --program ./dist/program.js#buildProgram`, run from
`packages/client`). Kind-aware grade target for cli = **B**.

This run is the Phase 1 acceptance gate: follow the bundled `/skillit-bootstrap`
loop (gen → audit → enrich source → regenerate), reach grade ≥ B, and confirm
the generated skill regenerates deterministically.

## Headline: the loop surfaced a real extraction bug

The first audit pass reported `audit.package: ""` (empty) and fired the F1
(package.json description) and F3 (README) findings — but those findings were
**unaddressable**, because `CliRefineSource.auditContext()` returned `{}`: the
cli source never read package.json/README at all. The audit was correctly
reporting a gap it could not let anyone close. This is exactly the failure mode
the agent-bootstrap architecture exists to catch — a deterministic loop + a real
agent reading the source revealed a latent Phase 0 bug an external-model refine
loop would have papered over by drafting content the pipeline discarded.

Fix: `34b8a10` — extracted a shared `readPackageMetadata()` /
`findNearestPackageDir()` into `@skillit/core`, delegated the config source to
it (no regression — 720 core tests green), and wired `CliRefineSource`'s
`extract()` + `auditContext()` to read package.json + README via it. The read
logic now lives in exactly one place (DRY).

## Baseline

| Stage                          | Grade | Total /120 | Note                                                  |
| ------------------------------ | ----- | ---------- | ----------------------------------------------------- |
| Before metadata fix            | C     | 90 (75%)   | `audit.package` empty — F1/F3 unaddressable (the bug) |
| After metadata fix (`34b8a10`) | **B** | 97 (80.8%) | F1 (description) now read from package.json → passes  |

The fix alone cleared C→B by surfacing the description that was always present.

## Result (after enrichment)

Enrichment performed (real source edits, never a `SKILL.md`):

- **Created `packages/client/README.md`** with a blockquote + intro + command
  table — clears F3 (README description). This is the "create a parseable
  artifact" move from the skill's surface-routing reference.
- **Refreshed `packages/client/package.json` `description`** — the old text only
  mentioned `refine`; updated to describe the full gen/audit/init/refine surface
  (score-neutral, F1 already passed, but honest).

| Stage            | Grade | Total /120    | F1 desc    | F3 readme  |
| ---------------- | ----- | ------------- | ---------- | ---------- |
| After enrichment | **B** | **100 (83%)** | ✅ passing | ✅ passing |

Dimension movement: D4 (description/README) fully cleared. Grade-B gate **met**.

## Determinism

`skillit gen --source cli --program ./dist/program.js#buildProgram` run twice
into separate dirs → `diff -r` reports **byte-identical** output
(`client/SKILL.md` + `references/commands.md`). `DETERMINISTIC ✓`. The enriched
source is the real change; the skill is a pure function of it.

## Findings judged un-addressable / deferred (the convergence report)

- **D3 `@deprecated/@since/@throws/@see` tags (+3)** — kind-aware CLI ceiling.
  These are per-symbol JSDoc depth tags; a Commander CLI surface has no clean
  per-command symbol to anchor them on (the extraction is command-tree based,
  not export-based). Structurally limited for the cli kind (spec §6.4: cli → B).
- **D5 `@category` grouping (+3)** — same: category tags apply to exported
  symbols, not CLI commands. CLI ceiling.
- **D3 README Troubleshooting section (+2)** — genuinely addressable (add a
  `## Troubleshooting` section), but diminishing returns past the B gate;
  deferred. A future pass could add it for +2.

No runtime-behavior claims were written this run (the enrichments were metadata

- README prose), so the §8.2 impl-grounded spot-check was not triggered.

## Follow-ups surfaced

- **Minor:** `skillit gen --out <abs-path>` joins the path onto cwd
  (`join(cwd, opts.out)`), so an absolute `--out` lands under cwd rather than at
  the absolute location. Use relative `--out`, or harden `gen` to honor absolute
  paths (`isAbsolute` check). Non-blocking.

## typedoc smoke

Command (run from `packages/core`):

```
cd packages/core && node ../client/dist/bin.js audit --source typedoc --json 2>&1 | head -30
```

Result: **errored** — no JSON produced, no grade.

```
skillit audit does not yet support the typedoc source; cli and config are supported in this release.
```

Follow-up: the typedoc audit path is not yet wired in `@skillit/client`; tracked for Phase 2.
