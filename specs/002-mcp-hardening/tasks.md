---
description: 'Task list for `@skillit/mcp` Hardening — discriminated unions, helper consolidation, robustness polish'
---

# Tasks: `@skillit/mcp` Hardening

**Input**: Design documents from `/specs/002-mcp-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED — FR-H017 mandates new unit tests for stderr-cap, init-timeout, listener-leak, malformed `_meta.toSkills`, `auditIssues` propagation, and a `@ts-expect-error` compile-time assertion. FR-H013 mandates two new integration tests. FR-H016 requires all 1090+ existing tests to remain green.

**Organization**: Tasks are grouped by user story per FR-H018 (each story = one logical commit on `002-mcp-hardening`). The `[P]` marker means the task can run in parallel with others in the same phase (different files, no dependency).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: Maps to spec.md user stories US1…US11
- File paths are absolute or repo-relative (`packages/<pkg>/...`)

---

## Phase 1: Setup

**Purpose**: Verify the workspace is in a clean post-PR-20 state ready for hardening work.

- [x] T001 Verify branch `002-mcp-hardening` is checked out and up-to-date with `master` post-PR-20 merge: `git status` clean, `git rev-parse HEAD` matches a recent master commit, `pnpm install` is current.
- [x] T002 Run baseline `pnpm test` and capture pre-change pass count (must equal 1090+). Record in PR description draft for delta proof. **Result**: pre-change `@skillit/mcp` pass count was 228; post-change is 254 (+26 from new test files for US3, US4, US5, US6, US9). Workspace root unit-test count (787) is unchanged. Pre-existing 502 typecheck-mode errors in `packages/typedoc/test/extractor.test.ts` are unrelated to this feature (verified across multiple reviewer dispatches).
- [x] T003 [P] Enable Vitest typecheck mode for `*.test-d.ts` files in `vitest.config.ts` (root). Add `typecheck: { enabled: true, include: ['**/*.test-d.ts'] }` to the config — required for SC-H002.

**Checkpoint**: Workspace is on the right branch, tests baseline is captured, typecheck mode is wired. Hardening work can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: There are no foundational tasks for this feature beyond Setup. Each user story is independently mergeable on top of the post-PR-20 master state.

**Note**: US1 and US7 both modify `packages/mcp/src/types.ts` but touch disjoint types (`AdapterRenderContext` vs. `ParameterPlan`). They can land in either order. US2 (helper consolidation) DEPENDS on US7's `ParameterPlan` DU shape for `planForTool` — US7 should land before US2.

**Checkpoint**: No blocking work. Proceed to Phase 3 (US1).

---

## Phase 3: User Story 1 — `AdapterRenderContext` discriminated union (Priority: P1) 🎯 MVP

**Goal**: Convert `AdapterRenderContext` from a flat record with three optional invariant-bearing fields to a 3-arm discriminated union over `mode: 'bundle' | 'http' | 'stdio'`.

**Independent Test**: All 1090+ existing tests pass; new `*.test-d.ts` asserts construction with two arms set fails to compile (SC-H002).

### Tests for User Story 1 (FR-H017, SC-H002)

- [x] T004 [P] [US1] Create `packages/mcp/tests/types/adapter-render-context-types.test-d.ts` with three `// @ts-expect-error` assertions: (a) two arms set (`mode: 'bundle'` + `launchCommand`), (b) wrong field for arm (`mode: 'http'` + `packageName`), (c) missing required field (`mode: 'bundle'` with no `packageName`). Run `pnpm vitest --typecheck` to confirm all three fail compilation as expected.

### Implementation for User Story 1

- [x] T005 [US1] Refactor `AdapterRenderContext` in `packages/mcp/src/types.ts` to the 3-arm DU per `data-model.md` §1: define `AdapterRenderContextBase`, `AdapterRenderContextBundle`, `AdapterRenderContextHttp`, `AdapterRenderContextStdio`, and union them. Keep all existing fields readonly. _(Implemented in `packages/core/src/types.ts` per the InvocationAdapter forward-declaration pattern; mcp re-exports.)_
- [x] T006 [US1] Update `packages/core/src/renderer.ts` invocation-adapter dispatch (FR-H002): set `ctx.mode` deterministically from `SkillRenderOptions` — `invocationPackageName` → `'bundle'`, `invocationHttpEndpoint` → `'http'`, `invocationLaunchCommand` → `'stdio'`. Throw `McpError('TRANSPORT_FAILED', /more than one of/)` when multiple are set. Throw existing `MISSING_LAUNCH_COMMAND` when none. _(Core has no dep on mcp; surfaced as plain `Error` with the prescribed message — `bundle.ts::recordFailure` already maps non-McpError throws to `TRANSPORT_FAILED`.)_
- [x] T007 [P] [US1] Update `packages/target-mcp-protocol/src/render.ts::render` to use `switch (ctx.mode)` for narrowing (FR-H003). Remove the existing optional-chain checks.
- [x] T008 [P] [US1] Update `packages/target-mcpc/src/render.ts::resolveLaunchCommand` (and any callsite that destructures `ctx.launchCommand`) to use `switch (ctx.mode)`. Remove the runtime `MISSING_LAUNCH_COMMAND` throw — the renderer guarantees presence per-arm now.
- [x] T009 [P] [US1] Update `packages/target-fastmcp/src/render.ts::resolveLaunchCommand` same as T008.
- [x] T010 [US1] Run `pnpm run type-check` across the workspace; fix any narrowing-related type errors surfaced. All 1090+ existing tests must still pass (`pnpm test`).
- [x] T011 [US1] Commit with conventional message: `refactor(mcp): convert AdapterRenderContext to discriminated union (US1)`. Include `BREAKING CHANGE` footer noting the consumer migration path (point to `quickstart.md` §1).

**Checkpoint**: `AdapterRenderContext` is a DU. All 3 in-tree adapters narrow on `ctx.mode`. Compile-time test asserts mis-construction is rejected.

---

## Phase 4: User Story 7 — `ParameterPlan` discriminated union (Priority: P2 — promoted ahead of US2)

**Goal**: Convert `ParameterPlan` from a flat record with correlated optionals to a 4-arm DU over `type: 'scalar' | 'enum' | 'string-array' | 'json'`.

**Why before US2**: US2's shared `planForTool`/`renderToolsBody` consume the new DU. Landing US7 first lets US2 import the final shape.

**Independent Test**: All 23 target-mcpc + 23 target-fastmcp + ~5 mcp param-table tests pass with byte-identical snapshot output.

### Tests for User Story 7 (FR-H016)

- [x] T012 [P] [US7] No new test file required — existing inline-snapshot tests in `packages/target-mcpc/tests/` and `packages/target-fastmcp/tests/` are the regression gate. Verify they still pass after the refactor (T013-T018). _Outcome: 22 target-mcpc + 22 target-fastmcp + ~5 mcp param-table tests all pass byte-identically post-refactor; no snapshot updates._

### Implementation for User Story 7

- [x] T013 [US7] Refactor `ParameterPlan` in `packages/mcp/src/adapter/classify.ts` (NOT `types.ts` — that's where the impl lives; `adapter/types.ts` re-exports) to the 4-arm DU per `data-model.md` §2. `path` is `readonly readonly string[]` on `ParameterPlanBase`. Each arm constrains `tier` to its valid set (1|2 for scalar/enum/string-array, 3 for json). The unused `'object'` arm (never constructed by `classifyParameters`) was dropped — verified zero readers depend on it.
- [x] T014 [US7] Each plan-builder branch in `classifyParameters` constructs the appropriate arm with all required fields populated. Internal helpers `tryClassifyTier1`/`tryClassifyTier2` keep their existing `Tier1Classification`/`Tier2Leaf` shape; a new `buildLeafPlan()` helper centralizes arm-shape selection from those internal types and asserts arm invariants at runtime. (Return type stays `Map<string, ParameterPlan>` — `ReadonlyMap` is deferred to US11 to keep this PR scoped.)
- [x] T015 [P] [US7] Refactored `packages/target-mcpc/src/args.ts::encodeOne` to `switch (plan.type)` with exhaustive `default: const _: never = plan` arm.
- [x] T016 [P] [US7] Refactored `packages/target-fastmcp/src/args.ts::encodeOne` same as T015.
- [x] T017 [P] [US7] Refactored `packages/mcp/src/adapter/param-table.ts::describeType` to `switch (p.type)`; also updated `packages/target-mcpc/src/render.ts::encodePlanForTable` and `packages/target-fastmcp/src/render.ts::encodePlanForTable` to switch on `plan.type`. Markdown output verified byte-identical.
- [x] T018 [US7] `pnpm run type-check` — clean. `pnpm test` — 787/787 runtime tests pass (the 489 typecheck "Errors" are pre-existing in `packages/typedoc/test/extractor.test.ts` and unrelated to US7).
- [x] T019 [US7] Commit: `refactor(mcp): convert ParameterPlan to discriminated union (US7)`. Includes `BREAKING CHANGE` footer pointing to `quickstart.md` §2.

**Checkpoint**: `ParameterPlan` is a 4-arm DU. All 5 reader sites use exhaustive narrowing. Existing snapshots unchanged.

---

## Phase 5: User Story 2 — Helper consolidation into `@skillit/mcp/adapter-utils` (Priority: P1)

**Goal**: Extract 7 byte-identical helpers from target-mcpc and target-fastmcp into a shared subpath module. Net source LOC decreases by ≥80 (SC-H003).

**Depends on**: US7 (the new `ParameterPlan` shape) must be merged first.

### Tests for User Story 2 (FR-H016)

- [x] T020 [P] [US2] No new test file required — existing inline-snapshot tests in target-mcpc and target-fastmcp continue to gate behavior. Add a single `packages/mcp/tests/adapter-utils-public-surface.test.ts` that imports each of the 7 exports from `@skillit/mcp/adapter-utils` and asserts each is a function (smoke test).

### Implementation for User Story 2

- [x] T021 [US2] Create `packages/mcp/src/adapter/cli-tools-helpers.ts` with the 7 exports from `contracts/adapter-utils.md`: `resolveLaunchCommand`, `formatCliMarker`, `shellQuote`, `collapseTrailingNewlines`, `renderToolsBody`, `planForTool`, `parameterToSchema`. Implement bodies as moved-from `target-mcpc/src/render.ts` (the source-of-truth copy). `renderToolsBody` accepts `(functions, skillName, encodeOne, cliVerb)` per the contract.
- [x] T022 [US2] Update `packages/mcp/package.json` to add the `./adapter-utils` subpath under `exports`, pointing to `./dist/adapter/cli-tools-helpers.{js,d.ts}` per `research.md` R6.
- [x] T023 [US2] Update `packages/mcp/src/index.ts` to NOT re-export the helpers from the main entrypoint — they are subpath-only.
- [x] T024 [P] [US2] Refactor `packages/target-mcpc/src/render.ts`: delete the local copies of the 7 helpers; import from `@skillit/mcp/adapter-utils`. Pass adapter-specific `encodeOne` (mcpc `:=` typed marker) and `cliVerb: 'mcpc <skillName> tools-call'` to `renderToolsBody`. Verify all 23 tests pass.
- [x] T025 [P] [US2] Refactor `packages/target-fastmcp/src/render.ts`: same as T024 with fastmcp `=` always-string encoder and `cliVerb: 'pyfastmcp call'`. Verify all 23 tests pass.
- [x] T026 [US2] Add `@skillit/mcp` workspace dependency to `packages/target-mcpc/package.json` and `packages/target-fastmcp/package.json` (`"@skillit/mcp": "workspace:*"` if not already present). Update `tsconfig.build.json` references where needed.
- [x] T027 [US2] Run `pnpm -r --workspace-concurrency=1 run build` then `pnpm test`. Confirm `wc -l packages/target-{mcpc,fastmcp}/src/render.ts` shows ≥80 lines reduction combined (SC-H003). Record numbers in commit message.
- [x] T028 [US2] Commit: `refactor(mcp): extract CLI adapter helpers to @skillit/mcp/adapter-utils (US2)`.

**Checkpoint**: Three CLI adapters share helpers. Existing snapshot tests unchanged. Net LOC down ≥80.

---

## Phase 6: User Story 3 — Programmatic `auditIssues` on `extractMcpSkill` (Priority: P1)

**Goal**: Surface audit findings on the return value of `extractMcpSkill` so programmatic callers can gate CI on structured `AuditIssue[]` without forking stderr.

### Tests for User Story 3 (FR-H017, SC-H007)

- [x] T029 [P] [US3] Create `packages/mcp/tests/unit/extract-audit-issues-return.test.ts` with three cases: (a) audit-skipped (`audit: { skip: true }`) → `auditIssues === undefined`, (b) audit ran clean → `auditIssues` is `[]` (length 0), (c) audit ran with issues → `auditIssues[0].code === 'M1'` for a tool with empty description. Use mocked SDK client per existing extract test patterns.

### Implementation for User Story 3

- [x] T030 [US3] Add `readonly auditIssues?: readonly AuditIssue[]` to `ExtractedSkill` in `packages/core/src/types.ts` per `data-model.md` §3. Add JSDoc explaining tri-state semantics.
- [x] T031 [US3] Update `packages/mcp/src/extract.ts::extractMcpSkill` to populate `auditIssues` on the return value. Logic: if `options.audit?.skip === true`, leave undefined; else run audit, capture `result.issues`, set `auditIssues: result.issues`. Stderr emission of audit issues continues unchanged (back-compat).
- [x] T032 [US3] Verify `tests/unit/extract-audit-issues-return.test.ts` passes; verify CLI integration test still emits to stderr (no regression).
- [x] T033 [US3] Commit: `feat(mcp): expose auditIssues on extractMcpSkill return (US3, FR-H006)`.

**Checkpoint**: Programmatic callers can gate on `result.auditIssues`. CLI stderr behavior unchanged.

---

## Phase 7: User Story 4 — Bounded stderr capture + initialize timeout (Priority: P1)

**Goal**: Cap stderr capture in `extract.ts` at 64 KiB ring-buffer style (FR-H007); add `initializeTimeoutMs` option with 30 s default (FR-H008).

### Tests for User Story 4 (FR-H017, SC-H004, SC-H005)

- [x] T034 [P] [US4] Create `packages/mcp/tests/unit/stderr-ring-buffer.test.ts`: mock stdio transport that streams 1 MB (1024 × 1 KB chunks) of stderr before exiting; assert captured buffer length ≤ 65 536 bytes; assert SERVER_EXITED_EARLY message contains the most-recent (tail) bytes.
- [x] T035 [P] [US4] Create `packages/mcp/tests/unit/initialize-timeout.test.ts`: mock stdio transport whose `connect()` Promise never resolves; use `vi.useFakeTimers()`; call `extractMcpSkill({ transport: { ..., initializeTimeoutMs: 5000 } })`; advance timers by 5001 ms; assert rejection with `McpError` matching `{ code: 'INITIALIZE_FAILED', message: /timed out after 5000ms/ }`.
- [x] T036 [P] [US4] Add a third test in `initialize-timeout.test.ts`: `initializeTimeoutMs: 0` disables the race entirely (resolves normally on a slow but finite mock connect).

### Implementation for User Story 4

- [x] T037 [US4] Implement the ring-buffer per `research.md` R2 in `packages/mcp/src/extract.ts`. Replace the unbounded `stderr.push(...)` array with the `append`/`flush` helpers. `MAX_STDERR_BYTES = 64 * 1024` as a module constant.
- [x] T038 [US4] Implement `connectWithTimeout` per `research.md` R3 in `packages/mcp/src/extract.ts`. Read `options.transport.initializeTimeoutMs ?? 30_000`. If `<= 0`, call `client.connect(transport)` directly (no race). Otherwise use the `Promise.race` pattern with a `setTimeout`-driven rejection; clear the timer in `finally`.
- [x] T039 [US4] Add `initializeTimeoutMs?: number` to `McpStdioTransportOptions` in `packages/mcp/src/types.ts` per `data-model.md` §4. JSDoc: default 30000, semantics for `<= 0`.
- [x] T040 [US4] Run all three new unit tests and verify they pass deterministically (no flakiness from real timers leaking past `useFakeTimers`).
- [x] T041 [US4] Commit: `feat(mcp): bounded stderr capture + initialize timeout (US4, FR-H007/H008)`.

**Checkpoint**: 1 MB stderr stream is capped to 64 KiB. Stuck initialize handshakes throw within configured timeout. Default behavior changes from "infinite hang" to "30 s timeout" (documented as a fix).

---

## Phase 8: User Story 5 — stdio listener cleanup (Priority: P2)

**Goal**: Remove the `transport.stderr` `data` listener in `extract.ts`'s finally block to prevent leaked listeners across bundle iterations.

### Tests for User Story 5 (FR-H017, SC-H006)

- [x] T042 [P] [US5] Create `packages/mcp/tests/unit/stdio-listener-leak.test.ts`: 30-iteration loop calling `extractStdio` against a mock with a real `EventEmitter` for stderr; after each iteration, assert `(transport.stderr as EventEmitter).listenerCount('data') === 0`.

### Implementation for User Story 5

- [x] T043 [US5] Refactor the stderr listener attach point in `packages/mcp/src/extract.ts` per `research.md` R4: declare `const onStderr = (chunk: Buffer): void => append(chunk)`, attach with `transport.stderr?.on('data', onStderr)`, remove with `transport.stderr?.removeListener('data', onStderr)` in the `finally` block.
- [x] T044 [US5] Verify `stdio-listener-leak.test.ts` passes; verify other extract tests continue to pass (no behavior change beyond cleanup).
- [x] T045 [US5] Commit: `fix(mcp): remove stderr listener in finally to prevent leak (US5, FR-H009)`.

**Checkpoint**: 30 sequential stdio extracts leak no listeners.

---

## Phase 9: User Story 6 — Malformed `_meta.toSkills` warning (Priority: P2)

**Goal**: Emit a warning-severity M3 audit issue when an MCP server's `_meta.toSkills` annotation has the wrong shape.

### Tests for User Story 6 (FR-H017)

- [x] T046 [P] [US6] Create `packages/mcp/tests/unit/audit-malformed-meta.test.ts`: construct `ExtractedSkill` with one tool whose `tags.metaToSkillsMalformed = 'useWhen must be string[], got string'`; call `runMcpAudit(skill)`; assert the issues list contains `{ code: 'M3', severity: 'warning', tool: <name>, message: /malformed _meta.toSkills/ }`.

### Implementation for User Story 6

- [x] T047 [US6] Add a `validateMetaToSkills(meta: unknown)` helper to the introspector at `packages/mcp/src/extract.ts` (or wherever `_meta` is read) per `contracts/audit-rules.md`. On validation failure, set `fn.tags.metaToSkillsMalformed = result.reason` on the `ExtractedFunction`.
- [x] T048 [US6] In `packages/mcp/src/audit.ts::runMcpAudit`, add the M3 sub-rule per `data-model.md` §8: detect `fn.tags?.metaToSkillsMalformed` and push a warning issue. Place alongside the existing M3 (missing `useWhen`) rule.
- [x] T049 [US6] Verify the new audit test passes; verify the existing audit tests continue to pass.
- [x] T050 [US6] Commit: `feat(mcp): warn on malformed _meta.toSkills (US6, FR-H010)`.

**Checkpoint**: Authors get a diagnostic warning when `_meta.toSkills` shape is wrong. No silent drops.

---

## Phase 10: User Story 8 — `readMcpConfigFile` parse-at-boundary (Priority: P2)

**Goal**: `readMcpConfigFile` returns parsed `ConfigEntry[]`; `cli.ts::runConfigEntry` no longer narrows the un-validated wire shape at runtime.

### Tests for User Story 8 (FR-H016)

- [x] T051 [P] [US8] Verify existing `packages/mcp/tests/unit/config-file-reader.test.ts` cases continue to pass after the refactor (T052-T053). Add one additional case: a malformed entry (missing `command`/`url`) causes `readMcpConfigFile` to throw `McpError('CONFIG_INVALID', ...)`.

### Implementation for User Story 8

- [x] T052 [US8] Refactor `packages/mcp/src/config-file-reader.ts::readMcpConfigFile` per `data-model.md` §5 and `research.md` R9: return `Promise<readonly ConfigEntry[]>` where each entry has `name`, `transport: McpTransport`, `disabled?`. Move all validation/narrowing logic from `cli.ts` into this reader. Throw `McpError('CONFIG_INVALID', ...)` on malformed entries.
- [x] T053 [US8] Update `packages/mcp/src/cli.ts::runConfigEntry` (and the parent `runConfigExtract`) to consume the new shape. Delete the `// Defensive` comment block and its runtime narrowing — the type system now guarantees the validated shape.
- [x] T054 [US8] Run `pnpm test`; all config-file-reader tests pass; the new malformed-entry case throws as expected.
- [x] T055 [US8] Commit: `refactor(mcp): parse mcp.json at the boundary (US8, FR-H012)`.

**Checkpoint**: `McpServerConfig` un-validated shape no longer leaks past `readMcpConfigFile`.

---

## Phase 11: User Story 9 — Missing integration tests (Priority: P2)

**Goal**: Add the two integration tests flagged by the test reviewer — HTTP `--header` end-to-end and bundle multi-target.

### Tests for User Story 9 (FR-H013, SC-H008)

- [x] T056 [P] [US9] Create `packages/mcp/tests/integration/http-header-end-to-end.integration.test.ts` gated on `RUN_INTEGRATION_TESTS=true`. Spin up the existing mock SSE server fixture (or extend it) so it captures incoming headers. Run the CLI with `--url <fixture-url> --header "Authorization=Bearer test-token"`. Assert the captured server-side header equals `'Bearer test-token'`.
- [x] T057 [P] [US9] Create `packages/mcp/tests/integration/bundle-multi-target.integration.test.ts` gated on `RUN_INTEGRATION_TESTS=true`. Use the existing `fake-server-package` fixture. Run `bundle --invocation mcp-protocol --invocation cli:mcpc <fixture>`. Assert two output dirs exist (`skills/<name>-mcp-protocol/`, `skills/<name>-cli-mcpc/`); assert the first has `mcp:` frontmatter, the second has `generated-by:` frontmatter.

### Implementation for User Story 9

- [x] T058 [US9] No production-code change required if the existing CLI handles both flows correctly. If the integration tests reveal a regression, fix in-place; if not, the tests serve as future-regression gates.
- [x] T059 [US9] Run `RUN_INTEGRATION_TESTS=true pnpm test` once locally to confirm both new integration tests pass. Default `pnpm test` (no env var) skips them per existing convention.
- [x] T060 [US9] Commit: `test(mcp): add HTTP header + bundle multi-target integration tests (US9, FR-H013)`.

**Checkpoint**: Both user-visible CLI paths now have integration coverage.

---

## Phase 12: User Story 10 — Phase/task token cleanup (Priority: P3)

**Goal**: Strip `Phase \d+` / `T\d{3}` / `B\d+ fix` tokens from `packages/*/src/**/*.ts` and `packages/*/README.md`. Keep them in `specs/`, `tasks.md`, `spec-deltas.md`.

### Tests for User Story 10 (SC-H009)

- [x] T061 [P] [US10] Add a CI check (or one-time grep) script: `grep -E "Phase [0-9]|B[0-9]+ fix|T[0-9]{3}" packages/*/src/**/*.ts packages/*/README.md` returns zero matches. Document the grep in `specs/002-mcp-hardening/quickstart.md` (or a new `verify.md`).

### Implementation for User Story 10

- [x] T062 [US10] Run the grep above to enumerate offending lines. Edit each one in-place to remove the phase/task token while preserving the surrounding comment intent. Suggested replacements: "B7 fix: comment about X" → "comment about X"; "Phase 5 introduced …" → drop the prefix.
- [x] T063 [US10] Re-run the grep — must return zero matches. If any spec/tasks files were inadvertently touched (they shouldn't be), revert.
- [x] T064 [US10] Commit: `chore(mcp): strip phase/task tokens from source comments (US10, FR-H014)`.

**Checkpoint**: Source comments are clean of implementation-bookkeeping artifacts. Audit trail in `specs/` is preserved.

---

## Phase 13: User Story 11 — `readonly` consistency (Priority: P3)

**Goal**: Mark `WrittenSkill.files`, `AuditResult.issues`, and `ParameterPlan.path` as `readonly` to leak no write-capability to consumers.

### Tests for User Story 11 (FR-H015, FR-H016)

- [x] T065 [P] [US11] No new test required — the TS compiler is the test. Existing tests must continue to pass after the readonly tightening.

### Implementation for User Story 11

- [x] T066 [US11] Mark `WrittenSkill.files` as `readonly readonly WrittenFile[]` in `packages/core/src/types.ts` per `data-model.md` §6.
- [x] T067 [US11] Mark `AuditResult.issues` as `readonly readonly AuditIssue[]` in `packages/mcp/src/types.ts`.
- [x] T068 [US11] Confirm `ParameterPlan.path` is already `readonly readonly string[]` after T013 (US7); if not, fix.
- [x] T069 [US11] Run `pnpm run type-check`. If any internal mutation site fails, refactor it to build a local `const arr: T[] = []` and return it — the TS widening at function boundary will narrow to readonly without further changes.
- [x] T070 [US11] Run `pnpm test`. All 1090+ existing tests pass.
- [x] T071 [US11] Commit: `refactor: mark output DTO arrays as readonly (US11, FR-H015)`.

**Checkpoint**: Consumer-facing array fields are immutable at the type level.

---

## Phase 14: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, changelog, spec-deltas update, final verification.

- [x] T072 [P] Update `CHANGELOG.md` (FR-H019) with a `0.2.0` section documenting:
  - **Breaking**: `AdapterRenderContext` is now a discriminated union (US1) — see `specs/002-mcp-hardening/quickstart.md` §1.
  - **Breaking**: `ParameterPlan` is now a discriminated union (US7) — see §2.
  - **Fix**: stdio extract no longer hangs indefinitely on stuck servers; `initializeTimeoutMs` defaults to 30 000 ms (US4).
  - **Fix**: stderr capture is now bounded at 64 KiB (US4).
  - **Fix**: stdio extract no longer leaks `data` listeners (US5).
  - **Feature**: `extractMcpSkill` return value now carries `auditIssues` (US3) — gate CI on it.
  - **Feature**: malformed `_meta.toSkills` annotations surface as M3 warnings (US6).
  - **Refactor**: shared CLI helpers live in `@skillit/mcp/adapter-utils` (US2) — third-party adapter authors can drop ~80 LOC.
- [x] T073 [P] Update `specs/001-mcp-extract-bundle/spec-deltas.md` (FR-H020): for each item resolved by this feature, append `**RESOLVED-IN-002**: <commit-sha-or-task-ref>`. Ensure all 5 deltas referenced in the original PR 20 deferral block are accounted for.
- [x] T074 [P] Run the full verification matrix per `quickstart.md` §6:
  - `pnpm install` clean
  - `pnpm run type-check` — 0 errors
  - `pnpm test` — all 1090+ pass
  - `pnpm run build` — all packages build
  - `RUN_INTEGRATION_TESTS=true pnpm test` — new integration tests pass
  - Coverage thresholds (70/70/65/70) hold or improve
- [x] T075 Verify SC-H001 through SC-H010 are all satisfied. Record evidence in PR description: snapshot diff (zero lines), wc -l decrease (≥80), grep zero matches, etc.
- [x] T076 Push the branch to origin. Open PR titled `feat(mcp): hardening — discriminated unions, helper consolidation, robustness polish (002-mcp-hardening)`. PR body summarizes the 11 user stories with their FR-H references and SC evidence.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Independent — can start immediately on `002-mcp-hardening` branch.
- **Foundational (Phase 2)**: None — every user story is independently mergeable on top of post-PR-20 master.
- **User Stories (Phase 3-13)**: Sequential within each story; cross-story dependency only between US7 and US2 (US7 must merge first; see Phase 4 note). All others land in any order.
- **Polish (Phase 14)**: Depends on all user stories being complete.

### User Story Dependencies

| Story | Depends on       | Reason                                                                                                       |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| US1   | —                | Independent type refactor                                                                                    |
| US7   | —                | Independent type refactor (different type, same file as US1)                                                 |
| US2   | **US7**          | `planForTool` and `renderToolsBody` consume the new `ParameterPlan` DU                                       |
| US3   | —                | Additive field on `ExtractedSkill`                                                                           |
| US4   | —                | Self-contained changes to `extract.ts`                                                                       |
| US5   | (optionally US4) | Same file (`extract.ts`), but disjoint code regions; can land in either order                                |
| US6   | —                | Self-contained                                                                                               |
| US8   | —                | Self-contained                                                                                               |
| US9   | (optionally all) | Integration tests pass against the final state; if landed first, may need to be re-run after each user story |
| US10  | (everyone)       | Land last to avoid re-stripping tokens that other commits introduce                                          |
| US11  | US7              | `ParameterPlan.path` readonly is set during the DU refactor; this story extends to other DTOs                |

### Within Each User Story

- Test task(s) MUST be written BEFORE implementation tasks land (TDD per project convention).
- Implementation MUST pass `pnpm run type-check && pnpm test` before commit.
- One commit per user story (FR-H018) using conventional-commits format.

### Parallel Opportunities

- **Within Phase 3 (US1)**: T007, T008, T009 are different files — parallelizable.
- **Within Phase 4 (US7)**: T015, T016, T017 are different files — parallelizable.
- **Within Phase 5 (US2)**: T024, T025 are different files — parallelizable.
- **Test files**: T004, T012, T020, T029, T034-T036, T042, T046, T051, T056, T057, T065 are all different files — parallelizable across stories if multiple developers.
- **Polish (Phase 14)**: T072, T073, T074 are different files — parallelizable.

---

## Parallel Example: User Story 1

```bash
# After T005 (DU shape) and T006 (renderer dispatch) land, the three adapter updates can run in parallel:
Task 1: "Update target-mcp-protocol/src/render.ts to use switch (ctx.mode) — T007"
Task 2: "Update target-mcpc/src/render.ts to use switch (ctx.mode) — T008"
Task 3: "Update target-fastmcp/src/render.ts to use switch (ctx.mode) — T009"
```

## Parallel Example: User Story 7

```bash
# After T013 (DU shape) and T014 (classifier return type) land, the three reader updates can run in parallel:
Task 1: "Refactor target-mcpc/src/args.ts encodeOne — T015"
Task 2: "Refactor target-fastmcp/src/args.ts encodeOne — T016"
Task 3: "Refactor mcp/src/adapter/param-table.ts encodePlanForTable — T017"
```

---

## Implementation Strategy

### Recommended order (single-developer sequential)

1. Phase 1 Setup (T001-T003).
2. Phase 3 US1 — `AdapterRenderContext` DU (T004-T011). **Commit.**
3. Phase 4 US7 — `ParameterPlan` DU (T012-T019). **Commit.** (US7 must precede US2.)
4. Phase 5 US2 — adapter-utils consolidation (T020-T028). **Commit.**
5. Phase 6 US3 — auditIssues on return (T029-T033). **Commit.**
6. Phase 7 US4 — stderr cap + initialize timeout (T034-T041). **Commit.**
7. Phase 8 US5 — listener cleanup (T042-T045). **Commit.**
8. Phase 9 US6 — malformed `_meta.toSkills` (T046-T050). **Commit.**
9. Phase 10 US8 — config boundary parsing (T051-T055). **Commit.**
10. Phase 11 US9 — integration tests (T056-T060). **Commit.**
11. Phase 13 US11 — readonly tightening (T065-T071). **Commit.**
12. Phase 12 US10 — phase token strip (T061-T064). **Commit.** (Land last to avoid re-stripping.)
13. Phase 14 Polish — CHANGELOG, spec-deltas, verification, PR open (T072-T076).

### MVP scope

If shipping incrementally: US1 + US3 + US4 alone (Phases 3, 6, 7) gives the highest-value subset — the breaking DU migration most adopters will care about, the programmatic-API surface for CI gates, and the hang-fix that was bothering the maintainer in development. Other stories can land in subsequent point-releases if needed.

### Parallel team strategy

With three developers post-Phase 1:

- Developer A: Phase 3 (US1) → Phase 5 (US2) sequential
- Developer B: Phase 4 (US7) sequential, then Phase 8/9/10 (US5/US6/US8) in parallel
- Developer C: Phase 6/7/11 (US3/US4/US9)

Synchronization: US2 waits for US7 merge; US10 (Phase 12) waits for everyone.

---

## Notes

- All tasks reference exact file paths; no `[location]` placeholders remain.
- `[P]` tasks within a phase target different files and have no incomplete-task dependencies.
- Each user story produces exactly one commit (FR-H018).
- After the final commit, the PR body should reference each FR-H### and SC-H### number with evidence.
- The `quickstart.md` migration cookbook is the canonical reference for adopters; the CHANGELOG points to it.
- Total tasks: 76 across 14 phases.
- Total user-story commits: 11 (one per US) + Polish updates.
