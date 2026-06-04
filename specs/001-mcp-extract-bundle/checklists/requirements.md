# Specification Quality Checklist: `@skillit/mcp` — Extract and Bundle MCP Servers as Agent Skills

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-24
**Last Updated**: 2026-04-24 (post-clarify revision adding invocation targets)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Content Quality caveat

This spec is deeply technical — it names specific packages (`@modelcontextprotocol/sdk`, `@skillit/core`, `mcpc`, `fastmcp`, `mcptools`), CLI shapes (`extract`, `bundle` subcommands, `--invocation` flag), and IR fields (`ExtractedFunction`, `ExtractedResource`, `InvocationAdapter`). This is appropriate here because the feature is itself a developer tool whose "users" are library authors and CI pipelines; the technical surface IS the user-facing surface. The spec does not prescribe _how_ to implement transport, parser, or adapter internals — those are left for `/speckit.plan`.

### Clarifications resolved (14 total)

Seven original design questions plus seven follow-ups on invocation targets and the CLI-as-proxy architecture, all pre-resolved in the Clarifications section:

- **Extract semantics** — fresh handshake only, no caching; metadata-only (no execution); docs-only output with `mcp:` frontmatter for the harness to consume.
- **Bundle semantics** — no package.json mutation; npx-by-name frontmatter (not file paths); single postbuild step only; `llms.txt` reuses core's existing flag; forward-compatible writer abstraction for future native Skills primitive.
- **Invocation targets** — multiple targets shipped as first-class renderers; no new CLI (existing `mcpc`/`fastmcp`/`mcptools` are rendering targets, not competitors); simple npm-convention plugin resolution (`@skillit/target-<n>`); extract is target-agnostic (one extraction → any number of rendered targets); bundle mode accepts string-or-array `invocation` field for multi-target emission.
- **Architectural framing (new)** — `mcp-protocol` and `cli:*` are two architectures sharing one extractor, not cosmetic render variants. CLI targets are a _CLI-as-proxy_ model: the external CLI terminates MCP at the shell boundary; the agent never sees MCP; session/auth/retry state lives in the CLI. Different test obligations per architecture (CLI targets need arg-encoding round-trip tests; `mcp-protocol` needs frontmatter-dialect verification).
- **Adapter-version invalidation (new, resolves prior open risk)** — CLI-target skills embed adapter name + version in both human-readable Setup text and machine-readable frontmatter (FR-IT-012). Audit engine warns when the embedded version drifts from the installed adapter (FR-IT-013). Consumers get a mechanical freshness signal without runtime skill↔CLI coupling.

No open `[NEEDS CLARIFICATION]` markers.

### Post-tasks status

`/speckit.tasks` generated 122 tasks; `/speckit.superb.review` identified 11 coverage gaps + 4 overly-broad tasks; gaps closed by adding 12 new tasks and splitting 4 broad tasks into 14 sub-tasks. `tasks.md` now at **148 tasks** with full FR/SC/edge-case coverage. Ready for `/speckit.implement` or subagent-driven execution.

### Open design risks surfaced by the superb.clarify pass

Three load-bearing assumptions were flagged during clarification. The user's revision resolved **two of three**:

- **Q1 (frontmatter format stability)** — resolved by widening scope: the invocation-target system now explicitly separates `mcp-protocol` (emits `mcp:` frontmatter) from CLI targets (emit Setup sections, no frontmatter). "One frozen shape" replaced by a pluggable writer abstraction.
- **Adapter/CLI drift** — resolved by FR-IT-012/013: adapter-version fingerprint embedded in the skill + audit-time freshness check. Mechanical signal, no runtime coupling.

One remaining risk is documented but not explicitly re-litigated in the revised Clarifications section; flag for `/speckit.plan` attention:

1. **`_meta.toSkills` namespace stability** — the spec uses `_meta.toSkills.{useWhen,avoidWhen,pitfalls}` as an invented convention. Note that `pitfalls` here does NOT match the project's current JSDoc tag (`@never`, formerly `@pitfalls`). This is either (a) intentional decoupling (MCP extension key ≠ JSDoc tag name) or (b) an oversight. Plan should confirm and, if intentional, note the divergence explicitly in the mapping doc. If oversight, the extension key should be renamed to `never`.
2. **Byte-identical idempotency (FR-038 / SC-009)** — stated as a guarantee but genuinely difficult: MCP SDK may return tools in nondeterministic order, schema `$ref` resolution may reorder keys, and pagination cursors could introduce ordering variance. Consider relaxing to "canonicalized-content-identical" with a mandatory stable-sort pass in the renderer. Plan should surface the canonicalization rules explicitly.

### Section count at a glance

- **7 user stories** (4 × P1, 2 × P2, 1 × P3). Each independently testable. US5 (CLI invocation targets) and US6 (programmatic API) now carry the target-variance load.
- **54 functional requirements** — FR-001 through FR-041 (shared / extract / bundle / audit) plus FR-IT-001 through FR-IT-013 (invocation targets, including adapter-version fingerprinting).
- **12 measurable success criteria** — original 9 plus SC-010/011/012 for the target system.
- **18 edge cases** — original 13 plus 4 new target-specific ones (CLI-not-installed, schema-exceeds-CLI-encoding, name-collision with reserved subcommands, output-path collision across targets) plus one bundle+CLI-target-specific clarification.

### Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`

None remain.
