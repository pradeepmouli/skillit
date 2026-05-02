# Tasks: Skill Install Pipeline + Post-Process Quality

**Input**: Design documents from `/specs/003-skill-install-quality/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Include regression, unit, integration, and workspace validation coverage because the specification defines independent tests and regression safety expectations for every story.

**Organization**: Tasks are grouped by user story so each story can be implemented, tested, and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1`..`US6`)
- Every task includes exact file paths

## Path Conventions

- **Core renderer/writer**: `packages/core/src/`, `packages/core/test/`
- **TypeDoc pipeline**: `packages/typedoc/src/`, `packages/typedoc/test/`, `packages/typedoc-plugin/`
- **CLI pipeline**: `packages/cli/src/`, `packages/cli/test/`
- **MCP pipeline**: `packages/mcp/src/`, `packages/mcp/tests/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared test harness and fixtures that the feature work will extend.

- [x] T001 Create shared writer/install regression harness in `packages/core/test/writer.test.ts`
- [x] T002 [P] Add reusable MCP install-target fixtures in `packages/mcp/tests/integration/cli-target-bundle.test.ts` and `packages/mcp/tests/integration/multi-target.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared contracts and helper infrastructure used across renderer, writer, MCP, and CLI changes.

**⚠️ CRITICAL**: Finish this phase before starting story work.

- [x] T003 Extend shared output contracts (`RefManifest`, `installTargets`, `suggestion`) in `packages/core/src/types.ts`, `packages/core/src/index.ts`, and `packages/mcp/src/types.ts`
- [x] T004 Implement installed-skill target resolution, deduplication, and frontmatter helper logic in `packages/core/src/writer.ts`

**Checkpoint**: Shared contracts and writer helper scaffolding are ready for story work.

---

## Phase 3: User Story 1 - SKILL.md reference links match actual file layout (Priority: P1) 🎯 MVP

**Goal**: Make SKILL.md loading instructions match the files that are actually rendered, including split directories, nested splits, and empty sections.

**Independent Test**: Generate skills with single-file references, split references, nested split references, and empty sections; verify SKILL.md links only to real outputs and uses the correct file-vs-directory form in every case.

### Tests for User Story 1

- [x] T005 [P] [US1] Add split-reference and empty-section regression coverage in `packages/core/test/renderer.test.ts`
- [x] T006 [P] [US1] Add loading-trigger invocation coverage for file-vs-directory layouts in `packages/core/test/renderer.invocation.test.ts`
- [x] T007 [P] [US1] Add nested split-directory regression coverage in `packages/core/test/renderer.test.ts`

### Implementation for User Story 1

- [x] T008 [US1] Add `RefManifest` creation and manifest plumbing in `packages/core/src/renderer.ts`
- [x] T009 [US1] Update `renderLoadingTriggers()` to emit file-vs-directory links and suppress phantom sections in `packages/core/src/renderer.ts`

**Checkpoint**: Split reference directories, nested splits, and zero-item sections render correct SKILL.md loading guidance.

---

## Phase 4: User Story 2 - Generated skills are automatically installed into agent discovery directories (Priority: P1)

**Goal**: Add opt-in install targets so generated skills are copied into agent discovery directories after writing to `skillsOutDir`.

**Independent Test**: Configure install targets in the TypeDoc plugin, run generation, and verify each skill is written to `skills/`, `.claude/skills/`, and `.agents/skills/` with `SKILL.md` plus `references/`; verify stale targets are replaced, missing targets are created, duplicate targets are deduped, relative paths resolve correctly, and no-config behavior is unchanged.

### Tests for User Story 2

- [x] T010 [P] [US2] Add `writeSkills()` multi-target install coverage in `packages/core/test/writer.test.ts`
- [x] T011 [P] [US2] Add TypeDoc install-target option coverage in `packages/typedoc/test/plugin.test.ts`
- [x] T012 [P] [US2] Add install-semantics regression coverage for no-config, stale-target cleanup, missing directories, relative paths, and deduplication in `packages/core/test/writer.test.ts` and `packages/typedoc/test/plugin.test.ts`
- [x] T013 [P] [US2] Add last-wins collision regression coverage in `packages/core/test/writer.test.ts` and `packages/mcp/tests/integration/bundle-multi-server.test.ts`

### Implementation for User Story 2

- [x] T014 [US2] Extend `writeSkills()` install-target copy semantics in `packages/core/src/writer.ts`
- [x] T015 [US2] Register `skillsInstallTargets` and pass resolved targets through `packages/typedoc/src/plugin.ts`

**Checkpoint**: TypeDoc generation installs rendered skills into configured agent directories without changing default behavior.

---

## Phase 5: User Story 3 - Bundled guidance skills are published and installable for all pipelines (Priority: P1)

**Goal**: Publish bundled guidance skills for TypeDoc, CLI, and MCP pipelines and install them alongside generated skills with version-aware replacement rules.

**Independent Test**: Verify `npm pack` for `typedoc-plugin-to-skills`, `@to-skills/cli`, and `@to-skills/mcp` includes each bundled skill; run TypeDoc, CLI extraction, and MCP generation with install targets and verify bundled guidance skills appear beside generated skills without overwriting custom copies.

### Tests for User Story 3

- [x] T016 [P] [US3] Add bundled-guidance publish/install coverage in `packages/typedoc/test/plugin.test.ts`, `packages/cli/test/extract.test.ts`, and `packages/mcp/tests/integration/cli-target-bundle.test.ts`
- [x] T017 [P] [US3] Add custom/no-version/different-name bundled-skill preservation coverage in `packages/core/test/writer.test.ts`

### Implementation for User Story 3

- [x] T018 [P] [US3] Include the bundled `skills/` directory in `packages/typedoc-plugin/package.json`
- [x] T019 [P] [US3] Include the bundled `skills/` directory in `packages/cli/package.json`
- [x] T020 [P] [US3] Include the bundled `skills/` directory in `packages/mcp/package.json`
- [x] T021 [P] [US3] Add versioned TypeDoc guidance content in `packages/typedoc-plugin/skills/to-skills-docs/SKILL.md`
- [x] T022 [P] [US3] Author CLI guidance content in `packages/cli/skills/to-skills-cli-docs/SKILL.md`
- [x] T023 [P] [US3] Author MCP guidance content in `packages/mcp/skills/to-skills-mcp-docs/SKILL.md`
- [x] T024 [US3] Add version-aware bundled-skill replacement rules in `packages/core/src/writer.ts`
- [x] T025 [US3] Append and install the bundled TypeDoc guidance skill in `packages/typedoc/src/plugin.ts`
- [x] T026 [US3] Append and install the bundled CLI guidance skill in `packages/cli/src/extract.ts` and `packages/cli/src/index.ts`
- [x] T027 [US3] Append and install the bundled MCP guidance skill in `packages/mcp/src/bundle.ts` and `packages/mcp/src/cli.ts`

**Checkpoint**: Bundled guidance skills ship in npm tarballs and install safely beside generated skills across all pipelines.

---

## Phase 6: User Story 4 - Router skill respects curated overrides (Priority: P2)

**Goal**: Preserve curated router skills instead of overwriting them during regeneration while retaining baseline router-generation behavior when no curated router exists.

**Independent Test**: Place a curated router skill at `skills/<project>/SKILL.md`, run generation, and verify the router is preserved while package-specific skills still refresh normally; also verify router generation still works for multi-package runs and remains absent for single-package runs.

### Tests for User Story 4

- [x] T028 [P] [US4] Add curated-router and router-baseline regression coverage in `packages/core/test/writer.test.ts` and `packages/core/test/renderer.test.ts`

### Implementation for User Story 4

- [x] T029 [US4] Preserve `curated: true` and `<!-- curated -->` router skills before cleanup in `packages/core/src/writer.ts`

**Checkpoint**: Curated router skills survive regeneration and default router behavior remains intact.

---

## Phase 7: User Story 5 - Audit suggestions include actionable fix text across all pipelines (Priority: P2)

**Goal**: Add actionable suggestion templates to TypeDoc, MCP, and CLI audit findings, and close parser/renderer gaps that keep CLI docs incomplete.

**Independent Test**: Run each audit pipeline against intentionally incomplete docs and verify every fatal/error finding includes a pipeline-appropriate suggestion template; verify CLI argument descriptions, env-var details, and empty-description rendering now behave correctly.

### Tests for User Story 5

- [x] T030 [P] [US5] Add TypeDoc suggestion regression coverage in `packages/core/test/audit.test.ts`
- [x] T031 [P] [US5] Add MCP suggestion regression coverage in `packages/mcp/tests/unit/audit-rules.test.ts` and `packages/mcp/tests/unit/audit-malformed-meta.test.ts`
- [x] T032 [P] [US5] Add CLI audit and `Arguments:` parsing regression coverage in `packages/cli/test/help-parser.test.ts` and `packages/cli/test/audit.test.ts`
- [x] T033 [P] [US5] Add `envVar` and dangling-separator regression coverage in `packages/core/test/config-renderer.test.ts`

### Implementation for User Story 5

- [x] T034 [US5] Populate enhanced TypeDoc suggestion templates in `packages/core/src/audit.ts`
- [x] T035 [P] [US5] Add MCP rule suggestion templates in `packages/mcp/src/audit/rule-m1.ts` and `packages/mcp/src/audit/rule-m2.ts`
- [x] T036 [P] [US5] Add malformed-meta and missing-input-schema suggestion templates in `packages/mcp/src/audit/rule-m3.ts` and `packages/mcp/src/audit/rule-m4.ts`
- [x] T037 [US5] Implement CLI audit rules and exports in `packages/cli/src/audit.ts` and `packages/cli/src/index.ts`
- [x] T038 [US5] Parse `Arguments:` blocks into extracted argument descriptions in `packages/cli/src/help-parser.ts`
- [x] T039 [US5] Render `envVar` details and suppress dangling argument separators in `packages/core/src/config-renderer.ts`
- [x] T040 [US5] Wire CLI audit findings into extracted skill output in `packages/cli/src/extract.ts` and `packages/cli/src/index.ts`

**Checkpoint**: All three audit pipelines emit actionable fixes, and CLI-derived docs no longer lose argument or env-var detail.

---

## Phase 8: User Story 6 - CLI `--install-target` flag for MCP skills (Priority: P2)

**Goal**: Let MCP extract and bundle commands install generated skills directly into agent directories from the CLI.

**Independent Test**: Run `to-skills-mcp extract --install-target .claude/skills` and `to-skills-mcp extract` without the flag; verify the configured target receives the installed skill in the first case and default behavior remains unchanged in the second.

### Tests for User Story 6

- [x] T041 [P] [US6] Add MCP `--install-target` CLI coverage for repeatable flags and no-flag behavior in `packages/mcp/tests/unit/cli.test.ts` and `packages/mcp/tests/integration/multi-target.test.ts`

### Implementation for User Story 6

- [x] T042 [US6] Add repeatable `--install-target` parsing in `packages/mcp/src/cli.ts`
- [x] T043 [US6] Pass install targets through MCP extract flows in `packages/mcp/src/cli.ts` and `packages/mcp/src/extract.ts`
- [x] T044 [US6] Pass install targets through MCP bundle flows in `packages/mcp/src/cli.ts` and `packages/mcp/src/bundle.ts`

**Checkpoint**: MCP CLI users can install extracted or bundled skills directly into agent directories.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Finish user-facing docs, scenario walkthroughs, and workspace-wide regression validation.

- [x] T045 [P] Update install-target and bundled-skill documentation in `README.md`, `packages/cli/README.md`, `packages/mcp/README.md`, and `packages/typedoc-plugin/README.md`
- [x] T046 Refresh validated scenario walkthroughs in `specs/003-skill-install-quality/quickstart.md`
- [x] T047 Run workspace regression validation via scripts in `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup and blocks all story work
- **User Stories (Phases 3-8)**: Depend on Foundational
- **Polish (Phase 9)**: Depends on all shipped user stories

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2 and is the recommended MVP slice
- **US2 (P1)**: Starts after Phase 2 and is independent of US1
- **US3 (P1)**: Depends on US2 install-target plumbing
- **US4 (P2)**: Starts after Phase 2 and shares the writer layer with US2/US3 while remaining independently testable
- **US5 (P2)**: Starts after Phase 2 and is independent of install-target work
- **US6 (P2)**: Depends on US2 install-target plumbing and US3 bundled-skill install behavior

### Within Each User Story

- Write the listed tests first and confirm they fail before changing implementation
- Update shared contracts before wiring runtime behavior
- Keep file-system writer changes ordered before pipeline integration changes
- Complete and validate one story before broadening to the next dependency tier

### Parallel Opportunities

- T002 can run while T001 establishes the shared writer test harness
- US1 test tasks T005, T006, and T007 can run in parallel
- US2 test tasks T010, T011, T012, and T013 can run in parallel
- US3 package metadata tasks T018, T019, and T020 can run in parallel
- US3 guidance-content tasks T021, T022, and T023 can run in parallel
- US5 test tasks T030, T031, T032, and T033 can run in parallel
- US5 MCP audit implementation tasks T035 and T036 can run in parallel
- T045 can run in parallel with T046 once implementation is complete

---

## Parallel Example: User Story 1

```bash
Task: "Add split-reference and empty-section regression coverage in packages/core/test/renderer.test.ts"
Task: "Add loading-trigger invocation coverage for file-vs-directory layouts in packages/core/test/renderer.invocation.test.ts"
Task: "Add nested split-directory regression coverage in packages/core/test/renderer.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Add writeSkills() multi-target install coverage in packages/core/test/writer.test.ts"
Task: "Add TypeDoc install-target option coverage in packages/typedoc/test/plugin.test.ts"
Task: "Add install-semantics regression coverage for no-config, stale-target cleanup, missing directories, relative paths, and deduplication in packages/core/test/writer.test.ts and packages/typedoc/test/plugin.test.ts"
Task: "Add last-wins collision regression coverage in packages/core/test/writer.test.ts and packages/mcp/tests/integration/bundle-multi-server.test.ts"
```

## Parallel Example: User Story 3

```bash
Task: "Include the bundled skills/ directory in packages/typedoc-plugin/package.json"
Task: "Include the bundled skills/ directory in packages/cli/package.json"
Task: "Include the bundled skills/ directory in packages/mcp/package.json"
Task: "Add versioned TypeDoc guidance content in packages/typedoc-plugin/skills/to-skills-docs/SKILL.md"
Task: "Author CLI guidance content in packages/cli/skills/to-skills-cli-docs/SKILL.md"
Task: "Author MCP guidance content in packages/mcp/skills/to-skills-mcp-docs/SKILL.md"
```

## Parallel Example: User Story 5

```bash
Task: "Add TypeDoc suggestion regression coverage in packages/core/test/audit.test.ts"
Task: "Add MCP suggestion regression coverage in packages/mcp/tests/unit/audit-rules.test.ts and packages/mcp/tests/unit/audit-malformed-meta.test.ts"
Task: "Add CLI audit and Arguments: parsing regression coverage in packages/cli/test/help-parser.test.ts and packages/cli/test/audit.test.ts"
Task: "Add envVar and dangling-separator regression coverage in packages/core/test/config-renderer.test.ts"
```

## Parallel Example: User Story 6

```bash
Task: "Add MCP --install-target CLI coverage for repeatable flags and no-flag behavior in packages/mcp/tests/unit/cli.test.ts and packages/mcp/tests/integration/multi-target.test.ts"
Task: "Add repeatable --install-target parsing in packages/mcp/src/cli.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Validate SKILL.md link correctness for single-file, split, nested-split, and empty-section cases.
4. Stop after US1 if you need the smallest shippable fix.

### Incremental Delivery

1. Deliver US1 to remove broken reference links and phantom sections.
2. Deliver US2 to install generated skills automatically.
3. Deliver US3 to publish and install bundled guidance skills.
4. Deliver US4 to preserve curated router overrides.
5. Deliver US5 to turn audits into actionable eval-loop feedback.
6. Deliver US6 to expose install targets through the MCP CLI.
7. Finish with Phase 9 regression validation and documentation refresh.

### Parallel Team Strategy

1. One engineer completes Phase 1 and Phase 2.
2. After that, split work across three lanes:
   - Lane A: US1 then US4
   - Lane B: US2 then US3 then US6
   - Lane C: US5
3. Rejoin for Phase 9 documentation and workspace validation.

---

## Notes

- `packages/typedoc/test/plugin.test.ts`, `packages/core/test/writer.test.ts`, and `packages/cli/test/audit.test.ts` are expected new files in this feature.
- US3 and US6 reuse the same install-target semantics from `writeSkills()` to avoid divergent copy logic.
- US4 preserves curated router skills in the writer layer, not the pure renderer layer.
- US5 explicitly covers the parser/renderer follow-up gaps from research: `Arguments:` parsing, `envVar` rendering, and dangling-dash suppression.
- Create a git commit after each completed story or logical batch so the implementation history matches the task phases.
