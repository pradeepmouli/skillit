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

## Finite vs. coverage-gated findings (size the work before you start)

Audit improvements come in two shapes — tell them apart before deciding how far
a finding can move the grade:

- **Finite / complexity-gated** (e.g. `@remarks` on functions with 3+ params,
  `@category` grouping): the target set is small and enumerable. The
  `targets[]` list **is** the whole job — close it and the dimension moves.
- **Coverage-gated / all-or-nothing** (the D8 `@param` / `@returns` / property
  JSDoc checks E1/E2/E3): the check fails on the **first** undocumented member
  across the _entire_ public surface, so the points only land at ~100%
  coverage. Here `targets[]` is only a **sample** — closing the listed symbols
  does **not** flip the gate. Before committing, get the true remaining count
  (`audit … --json` issue list, grouped by code) and decide: either do the full
  sweep, or stop and report the gap. Do **not** write filler prose on internal
  helpers just to chase the gate — that is the anti-pattern this skill exists to
  prevent.

## Grounding runtime claims

Before writing any pitfall or `@never`/`@avoidWhen` rule that asserts _runtime
behavior_, read the implementation (the `--ground` globs, or the function body).
A fluent, well-structured claim that is factually wrong is invisible to the
deterministic audit — the safeguard is that you actually read the code.

## Per-kind headline surface

The table above is kind-independent (any project has README + package.json). The
_headline judgment_ of the skill lives in a kind-specific surface:

- **typedoc** — per-symbol JSDoc on exported functions/classes/types (the richest
  surface; every export is introspectable). Writeback: `upsertJsDocTag`.
- **cli** — JSDoc on the command's `<Command>Options` interface; `CliRefineSource`
  correlates the option-interface tags onto the command surface. For an
  adapter-model CLI (no static command tree), enrich the stable exported symbols
  together with `@packageDocumentation` instead.
- **config** — **per-property** JSDoc on the config type's properties:
  `@useWhen`/`@avoidWhen`/`@never`/`@remarks` on each option, plus a sibling
  `<config>.example.ts` (written only if absent — never clobbered) for the
  example finding. Findings carry a dot-path `configKey`; `resolveTargetLocation`
  returns `{ file, declName, propertyPath }`. Writeback: `upsertPropertyJsDocTag`.
- **mcp (build mode)** — JSDoc on the tool-handler symbols **plus**
  `_meta.toSkills.{useWhen,avoidWhen,pitfalls}` annotations in your TS server
  source. `resolveTargetLocation` resolves a tool to its `{ file, declName }`.
  Writeback: `upsertJsDocTag`. (`gen`/`audit --source mcp --mode build`.)
- **mcp (runtime mode)** — the server source is **not** editable, so the only
  writable surface is the overlay JSON. This is handled by `skillit refine`'s
  overlay path, **not** this loop — there is nothing to enrich in source.

## Scope

- **Supported:** `cli` (Commander), `typedoc` (TS library), `config` (a config
  type via `--config-type`), and `mcp` **build mode** (an MCP server whose TS
  source you own, via `--mcp` + optional `--server`).
- **Runtime mode** (third-party MCP servers, no editable source) is served by
  `skillit refine`'s overlay path, not this loop.
- Kind-aware grade targets: typedoc → A; cli → B; config → B; mcp → B (A only if
  every tool handler carries full JSDoc). A non-enumerated command tree, a
  function-less config type, and a thinly-annotated tool set each cap below A.
