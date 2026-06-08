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

## typedoc dogfood — `@skillit/core`

Once `gen`/`audit --source typedoc` were wired (plugin pipeline for `gen`,
`extractSkills` for `audit`), the second dogfood ran the same loop against the
`@skillit/core` library via `--source typedoc` (run from `packages/core`).
Kind-aware grade target for typedoc = **A**.

```bash
cd packages/core && node ../client/dist/bin.js audit --source typedoc --json
```

### Determinism

`skillit gen --source typedoc` run twice into separate dirs → `diff -r` reports
**byte-identical** output (`skillit-core/SKILL.md` + `references/{classes,config,
types}.md` + `references/functions/`). `DETERMINISTIC ✓`, including after the
enrichment below.

### Baseline → enriched

| Stage                | Grade | Total /120 | D1  | D8  | Note                           |
| -------------------- | ----- | ---------- | --- | --- | ------------------------------ |
| Baseline             | B     | 100 (83%)  | 12  | 7   | pkg "core", per-symbol targets |
| After bounded enrich | **B** | **103**    | 15  | 7   | D1 maxed via `@remarks`        |

Enrichment performed (real `@skillit/core` source edits, never a `SKILL.md`),
driven by the audit's `improvements[].targets`:

- **`@remarks` on the 3+-param JSDoc helpers** (`insertJsDocTag`,
  `upsertJsDocTag`, `upsertPropertyJsDocTag`) — cleared the D1 "complex
  functions" finding. **D1 12 → 15 (maxed).**
- **`@param` / `@returns`** on the cited sample functions (`estimateTokens`,
  `extractConfigSurface`, `findNearestPackageDir`, `docsToExtractedDocuments`,
  `auditSkill`, `formatAuditJson`). All 720 core tests + type-check stay green.

### Why A was not reached in a bounded run (the real finding)

D8 did **not** move despite the `@param`/`@returns` edits, and the loop made
the reason precise. The audit's `improvements[].targets[]` list is a **sample**
(top-N symbols), but the underlying checks that feed D8 are **all-or-nothing
coverage gates**:

- `checkE1` (`@param`, +3) sets `allGood = false` on the **first** undocumented
  parameter across the _entire_ public surface.
- `checkE2` (`@returns`, +3) and `checkE3` (property JSDoc, +2) work the same way.

So closing the 9 sampled targets cannot flip E1/E2 from fail → pass. The
remaining gap is **37 `@param` + 26 `@returns` + 78 interface-property** members
(`audit ... --json` issue counts) — documenting ~141 API members across all of
`@skillit/core` to gain the final +8 (→ 111, grade A). That is a full-package
documentation sweep, not a bounded enrich/regenerate pass, and much of it would
be low-value prose on internal helpers — exactly the "drafting content to game a
gate" anti-pattern the agent-bootstrap architecture exists to avoid. Per the
plan, the **best grade reached (B, 103/120) is recorded with this rationale.**

This is itself the dogfood's headline result: audit improvements come in two
shapes the orchestrating agent must distinguish —

1. **Finite / complexity-gated** (D1 `@remarks` on 3+-param functions): a small,
   enumerable target set. Closing it moves the grade immediately. ✅ done here.
2. **Coverage-gated / all-or-nothing** (D8 E1/E2/E3): the cited targets are a
   sample; the dimension only rises at ~100% coverage of the whole surface.

The skill's convergence step ("distinguish legitimately complete from stuck
re-drafting") must recognize shape (2) and either commit to the full sweep or
stop and report — which is what this run did.

## Follow-ups surfaced

- **Minor:** `skillit gen --out <abs-path>` joins the path onto cwd
  (`join(cwd, opts.out)`), so an absolute `--out` lands under cwd rather than at
  the absolute location. Use relative `--out`, or harden `gen` to honor absolute
  paths (`isAbsolute` check). Non-blocking. (Same finding as the cli dogfood.)
- **Audit UX:** a coverage-gated improvement (D8 `@param`/`@returns`/property
  JSDoc) shows only its top-N sample targets, which **undersells** the work —
  "Add @param descriptions to all parameters (+3 on D8)" reads like 5 edits but
  needs all 37. The audit could report the full remaining count, or mark
  coverage-gated findings distinctly from finite ones, so the orchestrating
  agent can size the work before starting. Tracked for a future audit pass.
