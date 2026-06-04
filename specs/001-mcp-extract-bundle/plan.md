# Implementation Plan: `@skillit/mcp` — Extract and Bundle MCP Servers as Agent Skills

**Branch**: `001-mcp-extract-bundle` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mcp-extract-bundle/spec.md`

## Summary

Add a new monorepo package `@skillit/mcp` that introspects live MCP servers (stdio or HTTP) and produces `ExtractedSkill` outputs consumable by the existing `@skillit/core` renderer. The package has two operating modes (`extract`, `bundle`) and a pluggable invocation-target system that emits either `mcp-protocol` skills (agent harness holds the MCP session) or `cli:*` skills where an external CLI (`mcpc`, `fastmcp`, `mcptools`) terminates MCP at the shell boundary — the CLI-as-proxy architecture. Extraction is shared across all targets; only rendering diverges.

**Approach**: introduce three new fields on `ExtractedSkill` in `@skillit/core` (`resources`, `prompts`, an optional `setup` block); extend `renderSkill` with an `invocation` selector; ship four packages — the main `@skillit/mcp` and three target adapters (`@skillit/target-mcp-protocol` as the default, plus `@skillit/target-mcpc` and `@skillit/target-fastmcp`). Depend on `@modelcontextprotocol/sdk` for all transport/protocol concerns; never implement JSON-RPC framing ourselves. Every extraction does a fresh handshake (no caching); every run produces canonicalized output (content-identical, not strictly byte-identical — see Research §2).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js ≥20 (matches existing workspace root and `@skillit/cli`)
**Primary Dependencies**:

- `@modelcontextprotocol/sdk` (client library — stdio + Streamable HTTP + SSE transports)
- `@skillit/core` (workspace:\* — existing IR, renderer, token budgeter, audit engine)
- `@apidevtools/json-schema-ref-parser` (JSON Schema `$ref` resolution)
- `commander` (CLI — matches the pattern in `@skillit/cli`)
- `yaml` (frontmatter emission — deterministic serialization)

**Storage**: none (filesystem only — reads `package.json`, `mcp.json` / `claude_desktop_config.json`; writes `skills/<name>/SKILL.md` + `references/*.md`)

**Testing**: Vitest (matches `pnpm test` in workspace root). Coverage targets:

- Unit: extractor, schema resolution, adapter argument encoders
- Integration: live stdio test against `@modelcontextprotocol/server-everything` (reference server with tools/resources/prompts); mock HTTP SSE transport for offline CI
- Contract: snapshot tests for each invocation target against a fixed `ExtractedSkill` IR sample

**Target Platform**: Node.js CLI + Node library. Runs in CI, developer machines, and build pipelines (postbuild hooks).

**Project Type**: Monorepo package addition (pnpm workspace — matches existing `packages/cli`, `packages/typedoc`, etc.)

**Performance Goals**:

- Bundle mode < 30s wall-clock for a server with 30 tools / 10 resources / 5 prompts on CI hardware (SC-006)
- Idempotent re-runs produce content-identical output (SC-009; relaxed from byte-identical per Research §2)
- Quick Reference for a 20-tool server stays under 500 tokens (SC-002)

**Constraints**:

- Must not invoke MCP tools, read resources, or execute prompts (FR-008 — metadata-only)
- Must use `@modelcontextprotocol/sdk`; must NOT implement JSON-RPC framing (FR-005)
- Must not modify consumer's `package.json` (Clarifications)
- Must exit non-zero with stderr diagnostics on any extraction failure (FR-027)
- Each reference file independently token-budgeted at 4000 tokens default (FR-021)

**Scale/Scope**:

- v1 ships four packages: `@skillit/mcp` (main) + three target adapters (`mcp-protocol`, `mcpc`, `fastmcp`). `mcptools` deferred to v1.1 (FR-IT-003 SHOULD).
- Expected to handle servers with 0-100 tools routinely; 100-500 tools via namespace splitting (FR-022).
- Third-party adapter packages resolved by naming convention (FR-IT-005).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

The project's `constitution.md` is an unfilled template (placeholders only). No explicit principles are declared at the project level. Governance defaults to `CLAUDE.md` project instructions:

- **TypeScript strict mode, no `any`** — enforced via `tsconfig.build.json` inheritance
- **oxlint / oxfmt** — lint and format gates in CI
- **Conventional commits** — enforced by existing commit conventions
- **pnpm workspaces** — new package follows `packages/mcp/` convention
- **Vitest** — unit + integration test framework

**Gate result**: PASS (no constitutional violations; project-level conventions observed via `CLAUDE.md`). No entries in Complexity Tracking.

**Post-design re-check**: PASS (see end of Phase 1 section). The design introduces one new cross-package dependency (`@skillit/core` → adds `resources`/`prompts` fields + `invocation` selector) which is a backward-compatible addition. Three new target-adapter packages are additive — no existing package is refactored beyond the renderer signature extension.

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-extract-bundle/
├── plan.md              # This file
├── research.md          # Phase 0 output — SDK, $ref resolver, idempotency strategy
├── data-model.md        # Phase 1 output — McpExtractOptions, BundleResult, InvocationAdapter
├── quickstart.md        # Phase 1 output — three-minute hands-on walk-through
├── contracts/
│   ├── cli.md           # `extract` and `bundle` subcommand shapes + flags
│   ├── programmatic.md  # extractMcpSkill / bundleMcpSkill / renderSkill signatures
│   ├── adapter.md       # InvocationAdapter plugin interface (for target packages)
│   └── package-json-config.md  # `to-skills.mcp` field schema
└── checklists/
    └── requirements.md  # Already written during /speckit.specify
```

### Source Code (repository root)

```text
packages/
├── core/                           # EXISTING — extended with new IR fields + invocation selector
│   └── src/
│       ├── types.ts                # + ExtractedResource, ExtractedPrompt, SkillSetup
│       ├── renderer.ts             # renderSkill signature gains `invocation: InvocationAdapter`
│       └── index.ts                # re-exports new types
├── mcp/                            # NEW — @skillit/mcp main package
│   ├── src/
│   │   ├── index.ts                # public exports: extractMcpSkill, bundleMcpSkill, InvocationAdapter
│   │   ├── extract.ts              # transport selection, initialize handshake, list pagination
│   │   ├── bundle.ts               # package.json reader, config normalizer, extract+render orchestration
│   │   ├── introspect/
│   │   │   ├── tools.ts            # tools/list → ExtractedFunction[]
│   │   │   ├── resources.ts        # resources/list → ExtractedResource[]
│   │   │   ├── prompts.ts          # prompts/list → ExtractedPrompt[]
│   │   │   └── schema.ts           # JSON Schema $ref resolution + parameter mapping
│   │   ├── adapter/
│   │   │   ├── loader.ts           # resolves cli:<name> → @skillit/target-<name> package
│   │   │   └── types.ts            # InvocationAdapter, InvocationTarget, AdapterOptions
│   │   ├── audit/
│   │   │   └── mcp-rules.ts        # M1-M4 audit checks (missing desc, schema, useWhen, generic name)
│   │   ├── cli.ts                  # commander wiring for `extract` / `bundle` subcommands
│   │   └── bin.ts                  # executable entry point
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/            # live against server-everything; mock HTTP
│   │   └── fixtures/
│   │       ├── server-everything.json    # cached expected ExtractedSkill
│   │       └── mock-responses/           # recorded JSON-RPC exchanges
│   ├── package.json
│   ├── tsconfig.json
│   └── tsconfig.build.json
├── target-mcp-protocol/            # NEW — default target adapter
│   └── src/
│       ├── index.ts                # default export: McpProtocolAdapter
│       ├── frontmatter.ts          # emits `mcp:` YAML block
│       └── render.ts               # extends core renderer with protocol-specific frontmatter
├── target-mcpc/                    # NEW — CLI-as-proxy adapter for Apify/mcpc
│   └── src/
│       ├── index.ts                # default export: McpcAdapter
│       ├── args.ts                 # inputSchema → mcpc `key:=value` argument encoding
│       ├── fallback.ts             # JSON-payload fallback for complex schemas (--json)
│       └── setup.ts                # Setup section with mcpc install + connect instructions
├── target-fastmcp/                 # NEW — CLI-as-proxy adapter for FastMCP CLI
│   └── src/
│       ├── index.ts                # default export: FastMcpAdapter
│       ├── args.ts                 # inputSchema → fastmcp `key=value` encoding
│       ├── fallback.ts             # single-JSON-argument form
│       └── setup.ts                # Setup section with fastmcp install instructions
└── (target-mcptools/)              # DEFERRED to v1.1 — FR-IT-003 SHOULD
```

**Structure Decision**: Option "pnpm workspace package addition." Follows the established pattern from `packages/cli` / `packages/typedoc`. Each target adapter is its own package so third-party adapters can be published under the same `@skillit/target-<name>` convention (FR-IT-005). The adapter interface lives in `@skillit/mcp` (the host) and is imported by each target package — not the other way around — so a third party writing an adapter only depends on `@skillit/mcp`, not on core internals.

## Complexity Tracking

None. Three net-new packages are justified by the spec's plugin architecture (FR-IT-003, FR-IT-005): shipping built-in targets as separate packages is the same mechanism third parties use, which means the plugin interface is dogfooded from day one.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| (none)    | —          | —                                    |

---

## Phase 0 — Research

Generated artifact: [research.md](./research.md).

Seven research questions resolved. Summary:

1. **MCP SDK version** — pin to `@modelcontextprotocol/sdk ^1.x` (current stable, actively maintained, supports stdio + Streamable HTTP + SSE). Transport auto-negotiation handled by the SDK's `Client` + `*Transport` abstractions.
2. **Idempotency strategy** — relax SC-009 from "byte-identical" to "canonicalized-content-identical." Apply three normalizations in the renderer: deterministic key order (sorted), stable array order (by `name` for tools/resources/prompts), and stripped timestamps from descriptions. Write a canonicalization pass in `@skillit/core/src/canonical.ts` and gate snapshot tests on it.
3. **`$ref` resolution** — use `@apidevtools/json-schema-ref-parser`. Dereferences in-place; handles cycles (throws explicit error, which the extractor converts to an audit error rather than a crash).
4. **`_meta.toSkills.pitfalls` vs `@never`** — extension key stays `pitfalls` (matches MCP-side naming convention — underscore-free, shorter, already in the spec's acceptance scenarios). The renderer maps it to the `pitfalls` field in `ExtractedSkill` (which `@skillit/core` already has — line 54 of `types.ts`). Project-level rename of `@never` JSDoc tag is unrelated; the IR field name bridges both worlds.
5. **Adapter plugin resolution** — use Node's `require.resolve()` against a list of candidate names: `@skillit/target-<name>` first, then `to-skills-target-<name>`. Default export of the resolved module must be an `InvocationAdapter`. No dynamic registry, no config plumbing.
6. **CLI argument encoding per target** — `mcpc` uses `key:=value` for typed args + `--json '{...}'` for complex payloads. `fastmcp` uses `key=value` (stringy) + single-JSON-argument form. `mcptools` uses `--flag=value` + `-p '{...}'` (deferred). All three adapters share a common "simple vs complex" decision logic (scalar/enum/simple-array → native, else JSON fallback) implemented in the host package.
7. **Frontmatter writer** — use the `yaml` library (yaml.org's reference TypeScript impl) for deterministic emission. Disable key sorting, force block style for `mcp:` block, flow style for `args` arrays to match observed conventions in OpenCode / Codex fixtures.

Zero NEEDS CLARIFICATION markers remain after Phase 0.

## Phase 1 — Design & Contracts

Generated artifacts:

- **[data-model.md](./data-model.md)** — new IR types (`ExtractedResource`, `ExtractedPrompt`, `SkillSetup`), option bags (`McpExtractOptions`, `McpBundleOptions`, `BundleResult`), and adapter types (`InvocationTarget`, `InvocationAdapter`, `AdapterContext`).
- **[contracts/cli.md](./contracts/cli.md)** — `extract` and `bundle` subcommand shapes, all flags, exit codes, stderr format.
- **[contracts/programmatic.md](./contracts/programmatic.md)** — `extractMcpSkill(options)`, `bundleMcpSkill(options)`, extended `renderSkill(skill, options)` signatures.
- **[contracts/adapter.md](./contracts/adapter.md)** — the `InvocationAdapter` plugin interface third parties implement.
- **[contracts/package-json-config.md](./contracts/package-json-config.md)** — the `to-skills.mcp` field schema with JSON Schema.
- **[quickstart.md](./quickstart.md)** — three hands-on walkthroughs: extract a third-party server, bundle your own, consume from a non-MCP agent.

### Agent context update

After this file is committed, run:

```bash
.specify/scripts/bash/update-agent-context.sh claude
```

This appends the new technology choices (`@modelcontextprotocol/sdk`, `@apidevtools/json-schema-ref-parser`, `yaml`) and the new package layout to `CLAUDE.md` between the preservation markers.

### Post-Design Constitution Re-check

PASS. Design:

- Adds three fields to `ExtractedSkill` — backward-compatible (all optional).
- Extends `renderSkill(skill, options)` with an optional `invocation` param — backward-compatible (defaults to `mcp-protocol`).
- Introduces four new packages (`@skillit/mcp` + three adapters) — follows `packages/*` convention.
- No modification to existing TypeDoc or CLI extractor packages required.
- CI gate remains unchanged: type-check, lint, test. New packages wired into the root `pnpm -r` cascade.

### Open items flagged to `/speckit.tasks`

From the checklist's remaining-risks note:

- **Idempotency** (resolved by Research §2 with canonicalization). Tasks file should include a canonicalization-pass task in `@skillit/core` plus snapshot-test coverage for determinism.
- **`_meta.toSkills.pitfalls` naming** (resolved by Research §4 — keep `pitfalls` in extension key, map to existing IR field). Tasks file should include a doc note in the contract spelling this out.

---

## Stop Here

`/speckit.plan` terminates after Phase 1 planning. Tasks and implementation are the next steps:

- `/speckit.tasks` generates `tasks.md` from this plan and the data model.
- `/speckit.implement` (or `subagent-driven-development`) executes the tasks.
