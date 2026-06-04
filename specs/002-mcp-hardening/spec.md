# Feature Specification: `@skillit/mcp` Hardening — Discriminated Unions, Helper Consolidation, and Robustness Polish

**Feature Branch**: `002-mcp-hardening`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Address the deferred items from the PR 20 comprehensive review (5 Critical + 15 Important + 15 Suggestions). Convert flat option records to discriminated unions where invariants are doc-only today; consolidate the 5 helpers duplicated between target-mcpc and target-fastmcp into a shared module; harden extract.ts against unbounded stderr buffers, missing initialize timeouts, and listener leaks; surface programmatic audit results to library callers; warn on malformed `_meta.toSkills` annotations; add the two missing integration tests (HTTP `--header` + bundle multi-target); strip phase/task tokens from source comments."

## Context

PR 20 (the `001-mcp-extract-bundle` feature) shipped end-to-end functionality across 148 tasks but the comprehensive review surfaced a tail of defects that were deliberately deferred to keep the merge moving. The deferral was tracked in commit `d83a39d`'s message and in `specs/001-mcp-extract-bundle/spec-deltas.md`. This spec formalizes those items into a coherent follow-up so the package reaches v0.2.0 with the rough edges sanded.

Three categories of work, all _non-functional_ changes (no new user-visible capability):

1. **Type safety** — flat option records (`AdapterRenderContext`, `ParameterPlan`, `McpServerConfig`, `AuditResult`) carry implicit invariants enforced only at runtime. Convert to discriminated unions so misuse becomes a compile error.
2. **Code consolidation** — five helper functions (`resolveLaunchCommand`, `formatCliMarker`, `shellQuote`, `collapseTrailingNewlines`, plus `renderToolsBody`/`planForTool`/`parameterToSchema`) are byte-for-byte duplicated between `@skillit/target-mcpc` and `@skillit/target-fastmcp`. Extract to a shared module so future CLI adapters get them for free and so a fix lands in one place.
3. **Robustness** — `extract.ts` has an unbounded stderr accumulator (OOM risk on chatty servers), no initialize timeout (infinite hang on stuck servers), and a stderr listener leak in stdio finally blocks. Audit findings at extract time go only to stderr — programmatic API consumers (build pipelines using `extractMcpSkill` directly) can't read them. Malformed `_meta.toSkills` annotations are silently dropped with no diagnostic.

The work is purely additive/refactoring. All 1090+ existing tests must continue to pass; no public API breaks beyond the documented discriminated-union migrations (covered in the changelog).

## Clarifications

### Session 2026-04-25

The following calls were resolved at spec-authoring time using PR 20 review evidence; no NEEDS CLARIFICATION markers remain.

- **stderr ring-buffer cap**: 64 KiB. Chosen to balance "useful tail context for diagnostics" against "bounded memory on long-running servers". Not configurable in v0.2.0 — fixed cap keeps the API surface small.
- **`initializeTimeoutMs` default**: 30 000 ms. Generous enough for `npx -y` cold starts on fresh CI runners (~10 s alone) while catching genuinely stuck servers fast. Configurable per `transport.initializeTimeoutMs`.
- **Audit issue code for malformed `_meta.toSkills`**: extend existing M3 (warning severity) rather than introducing M6 — the failure mode is "annotation not honored", which is the same user-facing impact M3 already covers. The new M3 sub-rule emits `code: 'M3'` with `tool: <name>` and `message: 'malformed _meta.toSkills annotation: <reason>'`.
- **`AdapterRenderContext` discriminated-union breaking change**: minor version bump (we are pre-1.0). Document in CHANGELOG and migration guide.
- **`auditIssues` on `extractMcpSkill` return shape**: extend the existing `ExtractedSkill` rather than introduce a wrapper. `auditIssues?: readonly AuditIssue[]` is undefined when audit was skipped, populated (possibly empty) otherwise.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Library author gets compile-time invariant enforcement on AdapterRenderContext (Priority: P1)

A third-party adapter author writes a `render(skill, ctx)` method. Today, `ctx` exposes seven optional fields (`packageName?`, `binName?`, `httpEndpoint?`, `launchCommand?`, plus `skillName`, `maxTokens`, `canonicalize`) and the contract "exactly one of `packageName | httpEndpoint | launchCommand` is set" lives only in JSDoc and a runtime `MISSING_LAUNCH_COMMAND` throw. After this story ships, the adapter author writes `switch (ctx.mode) { case 'bundle': ... case 'http': ... case 'stdio': ... }` and TypeScript proves exhaustiveness; passing two of three fields becomes a compile error.

**Why this priority**: Highest-confidence Critical finding from the PR 20 review (95% from types reviewer). Misuse today is silent at compile time; only runtime tests catch it. The discriminated-union conversion is the single biggest correctness win available.

**Independent Test**: Convert `AdapterRenderContext` to a 3-arm discriminated union over `mode: 'bundle' | 'http' | 'stdio'` with the field-presence invariants encoded per arm. Adapt all 3 in-tree adapters + the renderer's ctx-building dispatch. All 1090+ existing tests pass without runtime behavior changes; a deliberate "two arms set" test case fails to compile (negative compile-time assertion via `@ts-expect-error`).

**Acceptance Scenarios**:

1. **Given** a `McpcAdapter.render(skill, ctx)` body, **When** the developer writes `if (ctx.mode === 'bundle') { … ctx.packageName … }`, **Then** TypeScript narrows the type so `ctx.packageName: string` (not optional).
2. **Given** an attempt to construct `{ mode: 'bundle', packageName: 'x', launchCommand: { command: 'node' } }`, **When** TypeScript checks, **Then** the second field is rejected as excess property.
3. **Given** the renderer's invocation-adapter dispatch in `core/src/renderer.ts`, **When** the host builds `ctx`, **Then** the `mode` discriminator is set deterministically from the `SkillRenderOptions` shape (`invocationPackageName` → bundle, `invocationHttpEndpoint` → http, `invocationLaunchCommand` → stdio; throw if more than one).

---

### User Story 2 — Future CLI adapter gets duplicated helpers from a shared module (Priority: P1)

A maintainer (or a third party) writes `@skillit/target-foo`. Today they would copy `resolveLaunchCommand`, `formatCliMarker`, `shellQuote`, `collapseTrailingNewlines`, plus the tool-body rendering scaffolding (`renderToolsBody`, `planForTool`, `parameterToSchema`) from `target-mcpc`. After this story ships, they import them from `@skillit/mcp/adapter-utils` (or a sibling module) and the only adapter-specific code is the `encodeOne(plan)` callback that determines the per-CLI argument syntax.

**Why this priority**: Important finding from code reviewer (95% confidence). The duplication is real (~100 lines per adapter, byte-identical). A bug fix in one today must be applied in the other manually, and there's no static enforcement keeping them in sync.

**Independent Test**: Move the 5 functions into `packages/mcp/src/adapter/cli-tools-helpers.ts` (or similar). Both target-mcpc and target-fastmcp import from there. The adapter-specific `encodeOne` callback (mcpc uses `:=` for typed scalars; fastmcp always uses `=`) stays in each package. All 23 tests in each adapter package continue to pass byte-identical rendering output (verified via inline-snapshot tests).

**Acceptance Scenarios**:

1. **Given** the existing target-mcpc render output, **When** the adapter is refactored to import shared helpers, **Then** all 23 target-mcpc tests pass without snapshot updates.
2. **Given** the existing target-fastmcp render output, **When** the same refactor lands, **Then** all 23 target-fastmcp tests pass without snapshot updates.
3. **Given** a maintainer adding a third CLI adapter (`target-foo`), **When** they wire up `@skillit/mcp/adapter-utils`, **Then** they implement only `encodeOne(plan: ParameterPlan): string` and a Setup-section template — everything else is inherited.

---

### User Story 3 — Programmatic extract callers can read audit findings (Priority: P1)

A build-pipeline author calls `extractMcpSkill({ transport })` from a Node script and wants to gate their CI on audit results. Today, audit findings go only to `process.stderr` — there is no `audit:` field on the returned `ExtractedSkill` and no way to read structured `AuditIssue[]` without forking stderr. After this story ships, the return value carries the audit result so callers can branch on `result.auditIssues` length and severity.

**Why this priority**: Important finding from errors reviewer (90% confidence). The current shape blocks the entire programmatic-API category for CI-driven workflows. The fix is a one-field addition (`auditIssues?: readonly AuditIssue[]` on the return type) plus a JSDoc note.

**Independent Test**: Add `auditIssues` to the value `extractMcpSkill` returns (extension to `ExtractedSkill`). A new unit test calls `extractMcpSkill` against a mocked client whose tool has empty descriptions and asserts `result.auditIssues[0].code === 'M1'`. The existing CLI continues to behave identically (it reads via stderr today; the structured field is additive).

**Acceptance Scenarios**:

1. **Given** a programmatic call `const skill = await extractMcpSkill({...})`, **When** the server has audit-flagged tools, **Then** `skill.auditIssues` is a populated `readonly AuditIssue[]`.
2. **Given** the CLI calling the same API, **When** the audit emits issues, **Then** the existing stderr behavior is unchanged (back-compat).
3. **Given** `options.audit?.skip === true`, **When** extract runs, **Then** `skill.auditIssues` is `undefined` (not `[]`) so callers can distinguish "not run" from "ran clean".

---

### User Story 4 — Bounded stderr capture + initialize timeout (Priority: P1)

A user runs `to-skills-mcp extract --command npx --arg -y --arg some-misbehaving-server`. The server prints stderr at high rate (chatty logger) and never sends `initialize`. Today: extract hangs forever (only Ctrl-C escapes), and stderr accumulates unbounded into a string array (OOM risk on long enough runs). After this story ships: the stderr buffer is capped at 64 KiB (ring-buffer style), and an `initializeTimeoutMs` option (default 30 000) bounds the wait — exceeding it throws `INITIALIZE_FAILED` with a clear timeout message.

**Why this priority**: Important finding from errors reviewer. The hang case has bitten the maintainer in development; the OOM case is theoretical but trivially reproducible against a misbehaving server. Both fixes are surgical — single-file change to `extract.ts` plus one new option in `McpExtractOptions.transport.stdio`.

**Independent Test**: Add a test using a mock stdio transport that produces 1 MB of stderr before `initialize` — assert the captured buffer is ≤64 KiB. Add a second test that mocks a transport that never resolves connect — assert the extract throws `INITIALIZE_FAILED` after the configured timeout (use `vi.useFakeTimers` to make it fast).

**Acceptance Scenarios**:

1. **Given** a stdio server that streams 100 KB of stderr before exiting, **When** extract runs, **Then** the captured buffer is ≤64 KiB and the SERVER*EXITED_EARLY message includes the \_most recent* stderr.
2. **Given** a stdio server that connects but hangs the initialize handshake, **When** extract runs with `initializeTimeoutMs: 5000`, **Then** the call rejects with `McpError('INITIALIZE_FAILED', /timeout/)` after 5 s.
3. **Given** the default timeout (30 s) is hit on real network conditions (rare), **When** the user wants a longer wait, **Then** they can set `initializeTimeoutMs: 60_000`.

---

### User Story 5 — Cleaned-up listener lifecycle in stdio path (Priority: P2)

The stdio extract path attaches a `data` listener to `transport.stderr` but never removes it. After successful extract, late stderr chunks land in a closure-captured array that's still alive. On a tight loop (bundle mode iterating 10+ entries), the cumulative listener count can hit `MaxListenersExceeded` warnings. After this story ships, the listener is captured as a named function and removed in `finally`.

**Why this priority**: Suggestion-tier from errors reviewer (~80% confidence) but cheap to fix. Bundle mode iterates per-entry; the leak compounds.

**Independent Test**: Add a unit test that runs 30 iterations of `extractStdio` against a mock transport and asserts `(transport.stderr as EventEmitter).listenerCount('data') === 0` after each call.

---

### User Story 6 — Warning on malformed `_meta.toSkills` annotations (Priority: P2)

A server author types `_meta.toSkills.useWhen: "string"` (missing the array wrapper). Today the malformed value is silently dropped — they get no warning, no audit issue, no log line. They discover the silent drop only by comparing rendered output to expectations. After this story ships, malformed `_meta.toSkills` entries surface as warning-severity audit issues (extending M3) so authors get a diagnostic.

**Why this priority**: Important finding from errors reviewer. Silent drops in user-controlled config are a known anti-pattern; the fix is a small audit-rule addition.

**Independent Test**: Add a unit test that feeds an `ExtractedSkill` with a tool whose introspector saw a malformed `_meta.toSkills` and asserts `runMcpAudit(skill)` emits a warning issue identifying the offending tool.

---

### User Story 7 — `ParameterPlan` discriminated union (Priority: P2)

`ParameterPlan` has correlated optional fields: `scalarType` is set iff `type === 'scalar'`; `enum` is set iff `type === 'enum'`; `tier === 3` iff `type === 'json'`. Today every reader (target-mcpc args.ts, target-fastmcp args.ts, the param-table renderer) defensively re-checks combinations. After this story ships, a discriminated union over `type` lets TS prove which fields are present per arm.

**Why this priority**: Important finding from types reviewer (90% confidence). The current readers' defensive checks are noise; the union form is straightforwardly cleaner.

**Independent Test**: Refactor `ParameterPlan` to a discriminated union. All 5 reader sites (mcpc encoder, fastmcp encoder, param-table render, classifier output, plan-for-tool synthesis) compile without changes to their _behavior_ (after refactoring their type narrowing). All 23 + 23 + ~5 affected tests pass.

---

### User Story 8 — `McpServerConfig` parsed at the boundary, never leaked (Priority: P2)

`McpServerConfig` is the un-validated wire shape from `mcp.json`. Every field is optional including the `command` / `url` discriminator. Today the type leaks into `cli.ts::runConfigEntry` where the runtime narrowing happens (with a "Defensive" comment). After this story ships, `readMcpConfigFile` returns `McpTransport[]` directly (parsed at the file boundary) so the un-validated shape never reaches downstream code.

**Why this priority**: Important finding from types reviewer (85% confidence). Parse-don't-validate at the boundary; current code does the validation late.

**Independent Test**: `readMcpConfigFile(path): Promise<{name: string; transport: McpTransport; disabled?: boolean}[]>`. Update `runConfigExtract` to consume the new shape. All `tests/unit/config-file-reader.test.ts` cases remain green; the runtime narrowing in `runConfigEntry` becomes unnecessary and is removed.

---

### User Story 9 — Missing integration tests added (Priority: P2)

The test reviewer flagged two gaps: (a) HTTP `--header KEY=VALUE` from CLI parsing through to transport options is never end-to-end tested; (b) bundle `--invocation` override has unit coverage but no integration test against a real fixture package. After this story ships, both paths have integration tests that follow the existing fixture-copy + symlink pattern.

**Why this priority**: Important finding from test reviewer. The two gaps are user-visible code paths with significant blast radius if regressed.

**Independent Test**: Two new integration tests gated via `RUN_INTEGRATION_TESTS=true`. Both reuse existing fixture packages where possible.

**Acceptance Scenarios**:

1. **Given** the existing mock SSE server fixture, **When** CLI runs with `--header "Authorization=Bearer test-token"`, **Then** the mock server receives the header on the initialize request and the test asserts on the captured server-side header.
2. **Given** `fake-server-package`, **When** CLI runs `bundle --invocation mcp-protocol --invocation cli:mcpc`, **Then** both disambiguated output dirs exist with the right frontmatter (mcp: vs generated-by:).

---

### User Story 10 — Phase/task token cleanup (Priority: P3)

Source files contain ~30 references to `Phase X`, `T###`, `B# fix` — useful during implementation, noise now. After this story ships, these tokens are stripped from source comments (READMEs and JSDoc are kept clean; spec files keep them since they're the audit trail).

**Why this priority**: Suggestion. Pure docs cleanup; zero behavior change.

**Independent Test**: `grep -E "Phase [0-9]|B[0-9]+ fix|T[0-9]{3}" packages/*/src/**/*.ts` returns zero results.

---

### User Story 11 — `readonly` consistency on output DTOs (Priority: P3)

`WrittenSkill.files`, `ParameterPlan.path`, `AuditResult.issues` are mutable arrays leaking write capability to consumers. After this story ships, they're `readonly`. No consumer mutates them in practice; this is hygiene.

**Why this priority**: Suggestion.

**Independent Test**: Mark fields `readonly`. The TS compiler catches any mutation site; existing code passes since no one mutates these.

---

### Edge Cases

- **`AdapterRenderContext` discriminated union — backward compat**: Adapters in the wild might destructure `ctx.launchCommand` directly without checking `ctx.mode`. The new shape breaks that pattern at compile time, which is by design — flag in changelog as a breaking change. Pre-1.0 minor bump.
- **`ParameterPlan` discriminated union — same story**: third-party CLI adapters that import `ParameterPlan` may need narrowing updates. Same minor bump.
- **Helper consolidation — adapter encoder swap**: target-mcpc's `encodeOne` and target-fastmcp's `encodeOne` differ on type-marker (`:=` vs `=`). The shared helper passes them as a callback; verify no behavioral drift via existing inline-snapshot tests.
- **Audit result on extract — non-MCP extractors**: TypeDoc/CLI extractors don't run audit. Keep `auditIssues` undefined on those, set on MCP extract path only. Document in JSDoc.
- **Phase/task token cleanup — spec files**: keep tokens in `specs/`, `tasks.md`, `spec-deltas.md` since they ARE the audit trail. Strip only from `packages/*/src/**` and `packages/*/README.md`.
- **stderr ring buffer cap and tail-trim coexistence**: the existing 2 KiB display-trim still applies on top of the 64 KiB capture cap — they serve different purposes (capture vs display).
- **initializeTimeoutMs option — HTTP transports**: the option lives on `transport.stdio` only. HTTP transports already have their own connect timeouts via `fetch`.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-H001**: `AdapterRenderContext` MUST be a discriminated union over `mode: 'bundle' | 'http' | 'stdio'` with field-presence invariants encoded per arm.
- **FR-H002**: The renderer's invocation-adapter dispatch in `core/src/renderer.ts` MUST set `ctx.mode` deterministically from `SkillRenderOptions`. Throw `McpError('TRANSPORT_FAILED', ...)` if more than one of `invocationPackageName`/`invocationHttpEndpoint`/`invocationLaunchCommand` is set.
- **FR-H003**: All 3 in-tree invocation adapters MUST be updated to use `switch (ctx.mode)` for narrowing.
- **FR-H004**: 5 helpers (`resolveLaunchCommand`, `formatCliMarker`, `shellQuote`, `collapseTrailingNewlines`, `renderToolsBody`/`planForTool`/`parameterToSchema` group) MUST live in a single shared module under `@skillit/mcp/adapter-utils` (or equivalent location).
- **FR-H005**: target-mcpc and target-fastmcp MUST import from the shared module; only adapter-specific `encodeOne` and `Setup` template stay in each package.
- **FR-H006**: `extractMcpSkill` return value MUST carry `auditIssues?: readonly AuditIssue[]`. Undefined when audit was skipped; populated otherwise (empty array when audit ran clean).
- **FR-H007**: `extract.ts` stderr capture MUST use a ring buffer capped at 64 KiB. The "no stderr captured" / "Server stderr:" message contract continues to surface the most-recent bytes.
- **FR-H008**: `McpExtractOptions.transport` for stdio MUST accept `initializeTimeoutMs?: number` with default 30 000. Exceeding it throws `McpError('INITIALIZE_FAILED', /timeout/, ...)`.
- **FR-H009**: stdio path MUST remove the `transport.stderr` data listener in the `finally` block to prevent leak across bundle iterations.
- **FR-H010**: Malformed `_meta.toSkills` entries MUST surface as a warning-severity audit issue (extending M3 with a `malformed _meta.toSkills annotation` sub-rule).
- **FR-H011**: `ParameterPlan` MUST be a discriminated union over `type: 'scalar' | 'enum' | 'string-array' | 'json'` with correlated fields encoded per arm.
- **FR-H012**: `readMcpConfigFile` MUST return parsed `McpTransport[]` (with `name` / `disabled?`), not raw `McpServerConfig`. The runtime narrowing in `cli.ts::runConfigEntry` MUST be removed.
- **FR-H013**: Two new integration tests MUST be added — HTTP `--header` end-to-end, and bundle multi-target — gated via `RUN_INTEGRATION_TESTS=true`.
- **FR-H014**: All `Phase \d+`, `T\d{3}`, `B\d+ fix` tokens MUST be stripped from `packages/*/src/**/*.ts` and `packages/*/README.md`. Keep them in `specs/**` and `tasks.md`.
- **FR-H015**: `WrittenSkill.files`, `ParameterPlan.path`, `AuditResult.issues` MUST be marked `readonly`. Any necessary internal mutation moves to private/local arrays.
- **FR-H016**: All 1090+ existing tests MUST continue to pass with no behavioral changes.
- **FR-H017**: New unit tests MUST cover: stderr-buffer cap (1 MB stderr → ≤64 KiB), initialize-timeout (mock hang → throws), listener-leak (30 iterations → 0 listeners), malformed `_meta.toSkills` warning emission.
- **FR-H018**: Each completed user story MUST land as a separate commit on the same feature branch (logical history).
- **FR-H019**: The CHANGELOG.md MUST document the discriminated-union breaking changes (US1, US7) for downstream adapter authors.
- **FR-H020**: `specs/001-mcp-extract-bundle/spec-deltas.md` MUST be updated to mark the deferred items as RESOLVED-IN-002.

### Key Entities

- **AdapterRenderContext** (refactored): discriminated union over `mode` with three arms — `bundle` (carries `packageName`, optional `binName`), `http` (carries `httpEndpoint`), `stdio` (carries `launchCommand`). Common fields: `skillName`, `maxTokens`, `canonicalize`.
- **ParameterPlan** (refactored): discriminated union over `type` with four arms — `scalar` (carries `scalarType`), `enum` (carries `enum: readonly string[]`), `string-array`, `json` (Tier 3 fallback). Common fields: `path`, `tier`.
- **ExtractedSkill** (extended): adds optional `auditIssues?: readonly AuditIssue[]` field, populated only by the MCP extract path when audit ran.
- **McpExtractOptions.transport.stdio** (extended): adds optional `initializeTimeoutMs?: number` (default 30 000).
- **CliToolsHelpers module** (new): exports `resolveLaunchCommand`, `formatCliMarker`, `shellQuote`, `collapseTrailingNewlines`, `renderToolsBody`, `planForTool`, `parameterToSchema` consumed by all CLI invocation adapters.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-H001**: All 1090+ existing tests pass on the merge candidate; coverage thresholds (70/70/65/70) hold or improve.
- **SC-H002**: A `@ts-expect-error` test asserts the `AdapterRenderContext` two-arms-set construction is rejected at compile time.
- **SC-H003**: `wc -l` on `target-mcpc/src/render.ts` + `target-fastmcp/src/render.ts` decreases by ≥80 lines combined after helper extraction (proving consolidation, not just relocation).
- **SC-H004**: A unit test produces a 1 MB stderr stream into the mock transport and asserts captured buffer length ≤ 65 536 bytes.
- **SC-H005**: A unit test using `vi.useFakeTimers` asserts that a 30 s timeout fires within 1 ms of advancing fake time past 30 000 ms.
- **SC-H006**: A 30-iteration loop test on stdio extract asserts `listenerCount('data') === 0` after each iteration.
- **SC-H007**: A unit test asserts `extractMcpSkill(...).auditIssues` is populated when audit issues exist and `undefined` when `audit.skip === true`.
- **SC-H008**: Two new integration tests pass under `RUN_INTEGRATION_TESTS=true`; default unit-only runs are unaffected (pre-existing skip behavior).
- **SC-H009**: `grep -E "Phase [0-9]|B[0-9]+ fix|T[0-9]{3}" packages/*/src/**/*.ts packages/*/README.md` returns zero matches.
- **SC-H010**: Adopters running `pnpm install @skillit/mcp@0.2.0` need at most: re-narrow `AdapterRenderContext` consumers via `switch (ctx.mode)`, re-narrow `ParameterPlan` consumers via `switch (plan.type)`. No other public-API changes.

## Assumptions

- The 1090+ existing tests are a stable baseline; coverage thresholds in `vitest.config.ts` are correct.
- The `superpowers:subagent-driven-development` workflow remains the execution pattern (spec → plan → tasks → batched implementation with reviewer dispatches).
- No upstream MCP SDK changes are expected during this work; SDK 1.29.0 stays pinned.
- pnpm workspace topology (`@skillit/core`, `@skillit/mcp`, `@skillit/target-mcp-protocol`, `@skillit/target-mcpc`, `@skillit/target-fastmcp`) stays as-is.
- CodeQL alert classes (js/incomplete-sanitization, js/polynomial-redos) addressed in PR 20 do not regress.
- The pre-1.0 minor-bump-for-breaking convention (used in `001-mcp-extract-bundle`) continues to apply.
- Adopters of `@skillit/mcp` are at most a handful; the discriminated-union migration is a documented but acceptable cost.
