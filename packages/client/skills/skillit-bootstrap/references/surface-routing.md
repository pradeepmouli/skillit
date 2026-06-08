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
