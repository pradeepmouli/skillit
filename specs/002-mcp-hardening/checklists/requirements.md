# Requirements Quality Checklist: `@skillit/mcp` Hardening

**Purpose**: Validate spec quality before planning starts — ensure no NEEDS CLARIFICATION markers, requirements are testable, scope is bounded.
**Created**: 2026-04-25
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] CHK001 No `[NEEDS CLARIFICATION]` markers remain in spec — all 5 ambiguities resolved in Clarifications section.
- [x] CHK002 No implementation details (file paths, types) leak into Functional Requirements — keys are written prescriptively but stay at "what", not "how", except where Requirements legitimately name the contract surface (FR-H001/H011 name the discriminator field, which is the contract).
- [x] CHK003 Each user story is independently testable — every story has its own Independent Test paragraph and isolated test additions.
- [x] CHK004 Acceptance scenarios are written in Given/When/Then form where applicable.

## Requirement Completeness

- [x] CHK005 Every functional requirement (FR-H001…FR-H020) maps to at least one user story or edge case.
- [x] CHK006 Every user story has a stated priority (P1/P2/P3) and a "Why this priority" rationale grounded in PR 20 reviewer evidence.
- [x] CHK007 Every Success Criterion (SC-H001…SC-H010) is measurable (counts, byte caps, grep results, test outcomes) and technology-agnostic-where-possible (some legitimately reference TS narrowing — they're invariants of the type system).
- [x] CHK008 Edge Cases section enumerates the non-obvious failure modes (back-compat for both DUs, encoder-callback drift, non-MCP extractors, ring-buffer interaction with display-trim, HTTP transport's lack of timeout option).
- [x] CHK009 Key Entities section identifies the 5 type-shape changes (AdapterRenderContext, ParameterPlan, ExtractedSkill, McpExtractOptions.transport.stdio, CliToolsHelpers).
- [x] CHK010 Assumptions section makes the cross-feature dependencies explicit (1090+ test baseline, MCP SDK pin, pnpm topology, pre-1.0 versioning convention, adopter count).
- [x] CHK011 Each P1 user story carries 2+ acceptance scenarios; P2/P3 stories carry ≥1.
- [x] CHK012 No duplicate or contradictory requirements — spot-check that FR-H006 (auditIssues optional) aligns with US3 acceptance scenario 3 (undefined when skipped); that FR-H010 extends M3 (not M6) per the clarification.

## Feature Readiness

- [x] CHK013 Scope is bounded: 11 user stories, 20 FRs, 10 SCs — no scope creep into adjacent areas (e.g., no new audit rules beyond M3 extension, no MCP SDK upgrades).
- [x] CHK014 Migration impact called out: FR-H019 mandates CHANGELOG entries for the two breaking DU migrations; SC-H010 sets the upper bound on adopter migration cost.
- [x] CHK015 Test additions named per story: stderr-cap, init-timeout, listener-leak, malformed `_meta.toSkills`, two integration tests — together address the test reviewer's coverage gap.
- [x] CHK016 Cross-spec hygiene: FR-H020 requires updating `specs/001-mcp-extract-bundle/spec-deltas.md` so the deferral record reflects RESOLVED-IN-002.

## Notes

- All 16 items pass on first authoring pass — the spec content was prepared from concrete reviewer findings (PR 20 comprehensive review) with no ambiguities left.
- Check items off as completed during planning; surface any failed item to the user before `/speckit.plan`.
