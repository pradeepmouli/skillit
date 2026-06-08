# Phase 2 dogfood — `/skillit-bootstrap` on config + mcp

Phase 2 brings the `config` and `mcp` source kinds into the bootstrap loop. This
records the two dogfoods (acceptance gates per spec §8): follow the loop (gen →
audit → enrich source → regenerate), reach the kind-aware target, and confirm
regenerate-determinism.

## config dogfood — `@skillit/typedoc` `SkillsPluginOptions`

Target: the TypeDoc plugin's options interface
(`--source config --config-type ./src/plugin.ts#SkillsPluginOptions`, run from
`packages/typedoc`). Kind-aware grade target for config = **B**.

### Baseline → enriched

| Stage            | Grade | Total /120 | D3  | Note                                          |
| ---------------- | ----- | ---------- | --- | --------------------------------------------- |
| Baseline         | C     | 95 (79%)   | 2   | D3 (anti-patterns) starved; B is +1 away      |
| After enrichment | **B** | **103**    | 10  | per-option `@pitfalls` cleared the D3 deficit |

Enrichment performed (real per-property JSDoc on the config type — never a
`SKILL.md`): added `@useWhen` / `@avoidWhen` to the under-annotated options
(`skillsInstallTargets`, `skillsIncludeExamples`, `skillsIncludeSignatures`,
`skillsNamePrefix`, `skillsLicense`, `llmsTxtOutDir`, `skillsAuditJson`,
`skillsDocsDir`), `@pitfalls` to the high-risk ones (`skillsOutDir`,
`skillsInstallTargets`, `skillsNamePrefix`), and `@category` grouping. Every
claim follows from the option's documented purpose (no invented runtime
semantics).

### Headline: the loop surfaced a real tag-divergence bug

The first enrichment used `@never` for pitfalls (the JSDoc/typedoc surface's tag,
which the skill's own surface-routing reference recommended). The re-audit showed
**zero movement** — D3 stayed at 2. The loop had surfaced a genuine cross-surface
inconsistency:

- The **typedoc / JSDoc** surface authors pitfalls as `@never` (TypeDoc maps it
  to the `pitfalls` IR field).
- The **config** surface (`config-extract.ts`, ast-grep) reads the literal
  **`@pitfalls`** tag and silently ignores `@never`.

So on a config option, `@never` is inert. Switching the three pitfall tags to
`@pitfalls` moved **D3 2 → 10** and the grade **C → B (103)**. The deterministic
audit caught what a fluent-but-wrong tag would otherwise have hidden — and it
caught an error in the skill's own reference, which has been corrected
(`surface-routing.md` now documents `@pitfalls` for config + a §4.2 tag note).

A second, smaller gap: `@category` is **not** scored on config options either
(D5/D7 did not move). Recorded as a config-surface ceiling, not chased.

### Determinism

`skillit gen --source config --config-type ./src/plugin.ts#SkillsPluginOptions`
run twice into separate dirs → `diff -r` reports **byte-identical** output
(`typedoc/SKILL.md` + `references/config.md`). `DETERMINISTIC ✓`, including after
enrichment. The enriched source is the real change; the skill is a pure function
of it.

### Convergence report (config ceiling = B, met)

Remaining findings judged un-addressable on the config surface:

- **`@category` grouping (+3 D5/D7)** — not extracted for config options
  (`config-extract` reads `useWhen`/`avoidWhen`/`pitfalls`/`remarks`/`default`
  only). The `@category` tags added remain valid for the interface's typedoc role
  but don't move the config grade. Config ceiling.
- **`@deprecated`/`@since`/`@throws`/`@see` (+3 D3)** — symbol-level depth tags,
  not part of the config per-property surface. Ceiling.
- **`@example` config file (+4)** and **README Troubleshooting (+2)** — genuinely
  addressable, but past the B gate; deferred (diminishing returns).
- **Per-option full coverage (`@pitfalls`/`@useWhen`/`@avoidWhen` on _every_
  option) (+7)** — coverage-gated (all-or-nothing across all ~15 options); the
  sampled key options were enriched to clear B without the full sweep.

## mcp dogfood — build mode (`@fixture/meta-mcp-server`)

Target: the `meta-server` stdio MCP server fixture
(`packages/mcp/tests/fixtures/meta-server-package`), a real node-spawnable server
exposing a `compute` tool plus server-level `_meta.toSkills`. Run via
`--source mcp --mcp ./mcp.json --mode build`. Kind-aware target for mcp = **B**
(A only if every tool handler carries full JSDoc).

### Headline: the loop surfaced the Phase-1 metadata gap, again — and it was fixed

The first audit reported **grade F (66/120)** with D4 (description) at 5/15 and
the F-series metadata findings firing **unaddressably** — because both MCP
`RefineSource`s (`TypeScriptMcpRefineSource`, `McpRefineSource`) returned an
empty `auditContext()`. This is the identical gap the Phase 1 cli dogfood found
in `CliRefineSource`: the source never read `package.json`/README, so the
description/README findings could never be closed.

Fix (`5570297`): wire the shared `readPackageMetadata` / `findNearestPackageDir`
reader (from `@skillit/core`) into both MCP sources — cached in `extract()`,
returned synchronously from `auditContext()` — and thread `cwd` through
`createMcpRefineSource` and its refine/audit call sites. Identical pattern to the
cli fix; 288 mcp tests + 158 mcp/client tests stay green.

### Baseline → after the fix (same real server)

| Stage                                    | Grade | Total /120 | D4  | Note                                     |
| ---------------------------------------- | ----- | ---------- | --- | ---------------------------------------- |
| Before fix (empty auditContext)          | F     | 66 (55%)   | 5   | F-series metadata findings unaddressable |
| After fix, with package metadata present | **D** | **78**     | 15  | D4 fully cleared once metadata is read   |

The +12 (D4 5 → 15) came entirely from the fix letting the audit read a
`package.json` description + keywords + a README — proving the metadata path now
works end-to-end against a **live spawned stdio MCP server**.

### Determinism

`skillit gen --source mcp --mcp ./mcp.json` run twice → `diff -r` reports
**byte-identical** output (`meta-server/SKILL.md` + `references/functions.md`).
`DETERMINISTIC ✓`. Caveat inherent to MCP: extraction spawns the server, so
determinism holds for a deterministic server (as this fixture is).

### Convergence report (best grade D/78; ceiling is fixture-bound, not loop-bound)

The remaining gap to B is D2/D3: "Add `@pitfalls`/`@useWhen`/`@avoidWhen` to key
exports" — i.e. per-tool `_meta.toSkills` annotations on the **server's TypeScript
source**. That is the build-mode headline surface, but it could not be exercised
here because **every in-repo MCP fixture ships compiled `dist/` only — there is no
editable TS-source MCP server to enrich** (the `target-*` packages are CLI-style,
not MCP servers). Building + compiling a bespoke server fixture (with a
recompile-in-loop so source `_meta` reaches the running server) was judged
disproportionate for this pass.

What IS proven for mcp build mode:

- The full `gen` + `audit --source mcp --mode build` pipeline works against a real
  spawned stdio server (extraction → render → write → score), deterministically.
- The empty-`auditContext` bug was surfaced by the loop and fixed (the headline,
  parallel to Phase 1).
- The `_meta.toSkills` source writeback mechanism (`applyMetaEdit` +
  tool-discovery) is covered by `@skillit/mcp`'s unit tests, and the
  `audit --source mcp` branch by `audit-report.test.ts` — so the one un-dogfooded
  step (tool-source enrichment) is unit-tested, not unverified.

Follow-up: add an editable-TS-source MCP server fixture so a future pass can
dogfood the full build-mode tool-`_meta` enrichment loop to B/A.
