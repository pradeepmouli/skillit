# Implementation Plan: `@skillit/mcp` Hardening — Discriminated Unions, Helper Consolidation, Robustness Polish

**Branch**: `002-mcp-hardening` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-mcp-hardening/spec.md`

## Summary

Address the deferred items from PR 20's comprehensive multi-agent review: convert four flat option records (`AdapterRenderContext`, `ParameterPlan`, `McpServerConfig`, `AuditResult`) into discriminated unions or readonly DTOs so invariants become compile-time, not runtime; consolidate ~100 LOC of byte-identical helpers between `@skillit/target-mcpc` and `@skillit/target-fastmcp` into a shared module under `@skillit/mcp/adapter-utils`; harden `extract.ts` against unbounded stderr buffers (64 KiB ring), missing initialize timeouts (configurable, 30 s default), and stderr listener leaks; surface programmatic audit findings on the `extractMcpSkill` return value; warn on malformed `_meta.toSkills` annotations (extends M3); add two missing integration tests; strip `Phase X` / `T###` / `B# fix` tokens from source comments.

**Approach**: 11 small commits on a single feature branch, ordered by dependency. Phase A (US1, US7, US11, US15) does the type-shape changes — these touch the most call sites so they ship first; Phase B (US2) extracts the shared CLI helpers — depends on US7 (shared `ParameterPlan` shape); Phase C (US3, US4, US5, US6) adds the runtime hardening; Phase D (US8) parses `mcp.json` at the boundary; Phase E (US9, US10, FR-H019, FR-H020) adds tests, removes phase tokens, updates CHANGELOG and `spec-deltas.md`. All 1090+ existing tests must pass at every commit; coverage thresholds (70/70/65/70 lines/functions/branches/statements) hold or improve.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥20 (matches existing workspace root and `@skillit/cli`)

**Primary Dependencies** (no new runtime deps):

- `@modelcontextprotocol/sdk@1.29.0` (pinned — no upgrade in this scope)
- `@skillit/core` (workspace:\*) — `ExtractedSkill` extension for `auditIssues`
- `@skillit/mcp` (workspace:\*) — adapter-utils module added here
- Existing test stack: vitest 2.x, oxlint, oxfmt

**Storage**: none (same as parent feature — filesystem-only, no DB)

**Testing**: Vitest. New test additions:

- Unit: stderr ring-buffer cap (`extract.ts`), initialize timeout (`vi.useFakeTimers`), listener leak (30-iteration loop), malformed `_meta.toSkills` warning, `auditIssues` propagation, `@ts-expect-error` for two-arms-set DU
- Integration (`RUN_INTEGRATION_TESTS=true` only): HTTP `--header KEY=VALUE` end-to-end against mock SSE fixture, bundle multi-target (`--invocation mcp-protocol --invocation cli:mcpc`)
- Contract: existing snapshot tests must remain byte-identical (proves helper consolidation didn't drift)

**Target Platform**: Node.js CLI + library (no platform changes from 001).

**Project Type**: Monorepo package modification (no new packages — pure refactor + hardening within existing `packages/{core,mcp,target-mcp-protocol,target-mcpc,target-fastmcp}`).

**Performance Goals**:

- No regression on bundle wall-clock (< 30 s for 30 tools / 10 resources / 5 prompts — SC-006 from 001)
- Idempotency contract preserved (SC-009 from 001)

**Constraints**:

- All 1090+ existing tests pass at every commit (FR-H016 / SC-H001)
- Coverage thresholds hold or improve (70/70/65/70)
- No new runtime dependencies; SDK version pinned
- CodeQL alert classes (js/incomplete-sanitization, js/polynomial-redos) do not regress
- Stderr ring buffer fixed at 64 KiB (not configurable in v0.2.0 — Clarifications)
- Listener detachment must use named function reference (not closure-equality), so `removeListener` actually finds it
- `auditIssues` undefined when audit was skipped vs `[]` when ran clean (callers must distinguish — US3 acceptance scenario 3)
- `Phase \d+` / `T\d{3}` / `B\d+ fix` token regex stripping is scoped to `packages/*/src/**/*.ts` and `packages/*/README.md` only — `specs/**` and `tasks.md` are the audit trail and stay

**Scale/Scope**:

- 11 user stories across 5 packages
- Net source LOC change: target ≥80 lines reduction (target-mcpc + target-fastmcp `render.ts` after helper extraction — SC-H003)
- New tests: ~10 unit + 2 integration
- No new public API surface beyond `auditIssues?` field and `initializeTimeoutMs?` option

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

The project's `.specify/memory/constitution.md` is an unfilled template (placeholders only). No explicit principles declared at the project level. Governance defaults to `CLAUDE.md` project instructions and the conventions observed in `001-mcp-extract-bundle`:

- **TypeScript strict mode, no `any`** — discriminated unions enforce stronger invariants than the current flat records (improvement)
- **oxlint / oxfmt** — gates unchanged
- **Conventional commits** — 11+ commits, one per user story
- **pnpm workspaces** — no topology change
- **Vitest** — unchanged

**Gate result**: PASS (no constitutional violations; this work strengthens existing conventions). No entries in Complexity Tracking.

**Post-design re-check**: PASS (see end of Phase 1 section). The discriminated-union migrations introduce documented breaking changes for downstream adapter authors, but pre-1.0 minor-bump-for-breaking is the established convention from 001 (FR-H019 mandates CHANGELOG documentation; SC-H010 caps adopter migration cost).

## Project Structure

### Documentation (this feature)

```text
specs/002-mcp-hardening/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 — DU patterns, ring buffer impl, timeout semantics
├── data-model.md        # Phase 1 — refactored type shapes (AdapterRenderContext, ParameterPlan, ExtractedSkill+, etc.)
├── contracts/
│   ├── adapter-render-context.md   # New 3-arm DU contract
│   ├── parameter-plan.md            # New 4-arm DU contract
│   ├── adapter-utils.md             # Shared helpers module exports
│   ├── extract-options.md           # initializeTimeoutMs addition + auditIssues return shape
│   └── audit-rules.md               # M3 sub-rule: malformed _meta.toSkills
├── quickstart.md        # Phase 1 — adopter migration guide (the breaking-change cookbook)
├── tasks.md             # Phase 2 — generated by /speckit.tasks
└── checklists/
    └── requirements.md  # Already written during /speckit.specify (16/16 pass)
```

### Source Code (repository root)

```text
packages/
├── core/                              # EXTENDED
│   └── src/
│       ├── types.ts                   # + auditIssues?: readonly AuditIssue[] on ExtractedSkill (FR-H006)
│       └── renderer.ts                # ctx.mode dispatch (FR-H002) — sets discriminator from SkillRenderOptions
├── mcp/                               # MAIN CHANGES HERE
│   ├── src/
│   │   ├── types.ts                   # AdapterRenderContext as 3-arm DU (FR-H001), ParameterPlan as 4-arm DU (FR-H011)
│   │   ├── extract.ts                 # 64 KiB ring buffer (FR-H007), initializeTimeoutMs (FR-H008), listener cleanup (FR-H009), auditIssues propagation (FR-H006)
│   │   ├── audit.ts                   # M3 sub-rule for malformed _meta.toSkills (FR-H010)
│   │   ├── config-file-reader.ts      # readMcpConfigFile returns parsed McpTransport[] (FR-H012)
│   │   ├── cli.ts                     # remove "Defensive" runtime narrowing (FR-H012)
│   │   └── adapter/
│   │       ├── cli-tools-helpers.ts   # NEW — shared resolveLaunchCommand, formatCliMarker, shellQuote, collapseTrailingNewlines, renderToolsBody, planForTool, parameterToSchema (FR-H004)
│   │       └── param-table.ts         # consume DU narrowing instead of defensive checks
│   └── tests/unit/
│       ├── stderr-ring-buffer.test.ts            # NEW (FR-H017, SC-H004)
│       ├── initialize-timeout.test.ts            # NEW (FR-H017, SC-H005)
│       ├── stdio-listener-leak.test.ts           # NEW (FR-H017, SC-H006)
│       ├── audit-malformed-meta.test.ts          # NEW (FR-H017)
│       ├── extract-audit-issues-return.test.ts   # NEW (US3, SC-H007)
│       └── adapter-render-context-types.test-d.ts # NEW — @ts-expect-error two-arms-set (SC-H002)
├── target-mcp-protocol/               # MIGRATED
│   └── src/render.ts                  # switch (ctx.mode) narrowing (FR-H003)
├── target-mcpc/                       # MIGRATED + slimmed
│   └── src/render.ts                  # imports from @skillit/mcp/adapter-utils (FR-H005); only encodeOne + Setup template stay
├── target-fastmcp/                    # MIGRATED + slimmed
│   └── src/render.ts                  # same — encodeOne + Setup template only
└── (workspace root)
    ├── CHANGELOG.md                   # documents DU breaking changes (FR-H019)
    └── specs/001-mcp-extract-bundle/spec-deltas.md  # marked RESOLVED-IN-002 (FR-H020)

tests/integration/                     # NEW INTEGRATION TESTS (gated, FR-H013)
├── http-header-end-to-end.integration.test.ts
└── bundle-multi-target.integration.test.ts
```

**Structure Decision**: Stay within the existing 5-package topology (`core`, `mcp`, `target-mcp-protocol`, `target-mcpc`, `target-fastmcp`). Add one new module file (`packages/mcp/src/adapter/cli-tools-helpers.ts`) plus ~6 new test files. No new packages, no relocations of existing files.

## Complexity Tracking

> No constitutional violations. Table omitted.

## Phase 0 — Research (Outline)

Research lives in `research.md`. Topics:

1. **Discriminated-union ergonomics in TypeScript 5.x**: how to encode "exactly one of N optional fields" via `mode` discriminator while preserving API ergonomics for adapter authors. Compare DU vs. tagged-record vs. branded-type approaches; pick DU for compile-time exhaustiveness.
2. **Stderr ring-buffer implementations**: byte-counting Buffer concat vs. array-of-chunks with running total; chosen approach for O(1) append + O(n) flush. Consider edge cases: chunks larger than 64 KiB (split or drop?), UTF-8 boundary preservation on the tail.
3. **`vi.useFakeTimers` interaction with `setTimeout`-driven race vs. `client.connect()` Promise**: Pattern for racing a timeout against an SDK call without leaking timers. Reference Vitest 2.x docs.
4. **`EventEmitter.removeListener` correctness**: must use the same function reference passed to `addListener`. Common bug: anonymous arrow functions can't be removed. Pattern: named function captured in `finally`.
5. **`@ts-expect-error` for compile-time test assertions**: idiomatic Vitest pattern for `*.test-d.ts` files; whether to use `tsd` or hand-rolled. Established pattern: `vitest typecheck` mode + `// @ts-expect-error` markers.
6. **Helper extraction across workspace boundaries**: `@skillit/mcp/adapter-utils` subpath export pattern in `package.json`; avoid public-API surface bloat; document which symbols are stable vs. internal.

## Phase 1 — Design & Contracts (Outline)

### 1.1 Data Model (`data-model.md`)

Refactored type shapes:

- `AdapterRenderContext`: 3-arm DU over `mode: 'bundle' | 'http' | 'stdio'` (each arm carries the field that was previously optional)
- `ParameterPlan`: 4-arm DU over `type: 'scalar' | 'enum' | 'string-array' | 'json'` (`scalarType` lives only on `scalar` arm; `enum` lives only on `enum` arm)
- `ExtractedSkill`: extended with `auditIssues?: readonly AuditIssue[]`
- `McpExtractOptions.transport.stdio`: extended with `initializeTimeoutMs?: number` (default 30 000)
- `McpServerConfig`: stays as wire-shape (un-validated) but no longer leaks past `readMcpConfigFile`
- `WrittenSkill`, `AuditResult`: array fields marked `readonly`

### 1.2 Contracts (`contracts/`)

Five contract files capture the public-API surface:

- `adapter-render-context.md` — DU shape, narrowing example, breaking-change call-out
- `parameter-plan.md` — DU shape, narrowing per arm
- `adapter-utils.md` — exported symbols from `@skillit/mcp/adapter-utils` and stability guarantees
- `extract-options.md` — `initializeTimeoutMs` addition, `auditIssues` return-shape semantics (undefined vs `[]`)
- `audit-rules.md` — M3 sub-rule for malformed `_meta.toSkills` (severity warning)

### 1.3 Quickstart (`quickstart.md`)

Adopter migration cookbook:

- Before/after for `AdapterRenderContext` consumers (10-line snippet)
- Before/after for `ParameterPlan` consumers (5-line snippet)
- New `auditIssues` programmatic-API example (CI gate use case)
- New `initializeTimeoutMs` option example

### 1.4 Agent Context Update

Run `.specify/scripts/bash/update-agent-context.sh claude` to register the new module path under "Recent Changes".

## Post-design Constitution Re-check

- All proposed changes are within the existing TypeScript strict / oxlint / vitest convention envelope.
- The two breaking changes (US1, US7) are documented per FR-H019; pre-1.0 minor-bump precedent stands.
- No new packages, no new runtime deps, no SDK upgrade — minimal blast radius.

**Gate result**: PASS.

## Stop Point

`/speckit.plan` ends here. Phase 2 (tasks.md generation) is `/speckit.tasks`'s responsibility.
