# Implementation Plan: Skill Install Pipeline + Post-Process Quality

**Branch**: `003-skill-install-quality` | **Date**: 2026-05-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-skill-install-quality/spec.md`

## Summary

Three categories of work across the `@to-skills` monorepo:

1. **Reference link correctness** (US1): Fix the renderer so SKILL.md body links match actual reference file layout — no phantom sections, correct file-vs-directory links when token budgets split.
2. **Skill install pipeline** (US2, US3, US4, US6): Add `installTargets` to `writeSkills()`, TypeDoc plugin, and MCP CLI. Publish bundled guidance skills for all three pipelines. Preserve curated router skills.
3. **Audit eval loop** (US5): Add actionable fix suggestion templates to audit findings across TypeDoc, MCP, and CLI pipelines so an agent can iteratively improve source docs.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js >=20
**Primary Dependencies**: TypeDoc >=0.28, Vitest, pnpm workspaces
**Storage**: Filesystem only (read/write SKILL.md + references/)
**Testing**: Vitest (unit + snapshot + typecheck)
**Target Platform**: Node.js (CLI + TypeDoc plugin)
**Project Type**: Library (monorepo with 10 packages)
**Performance Goals**: Install step <100ms per target per skill
**Constraints**: No breaking changes to existing public APIs; `installTargets` is opt-in
**Scale/Scope**: ~800 existing tests, 10 packages

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Constitution is template-only (not customized for this project). No gates to evaluate. **PASS** — proceed.

## Project Structure

### Documentation (this feature)

```text
specs/003-skill-install-quality/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── install-targets.md
│   ├── reference-link-fix.md
│   └── audit-suggestions.md
└── tasks.md             # Phase 2 output (from /speckit.tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── renderer.ts          # US1: Fix renderLoadingTriggers + refCategories
├── writer.ts            # US2: Add installTargets to writeSkills()
├── types.ts             # Types for install options
└── audit.ts             # US5: Enhance suggestion templates

packages/typedoc/src/
└── plugin.ts            # US2: Register skillsInstallTargets option
                         # US3: Install bundled to-skills-docs
                         # US4: Detect curated router skills

packages/typedoc-plugin/
├── package.json         # US3: Add "skills" to "files"
└── skills/
    └── to-skills-docs/
        └── SKILL.md     # Existing — add version field to frontmatter

packages/mcp/
├── src/
│   ├── cli.ts           # US6: Add --install-target flag
│   ├── bundle.ts        # US6: Pass installTargets through
│   └── audit/
│       ├── rules.ts     # US5: Add suggestion field to McpAuditIssue
│       ├── rule-m1.ts   # US5: Add suggestions to M1 findings
│       ├── rule-m2.ts   # US5: Add suggestions to M2 findings
│       ├── rule-m3.ts   # US5: Add suggestions to M3 findings
│       └── rule-m4.ts   # US5: Add suggestions to M4 findings
├── package.json         # US3: Add "skills" to "files"
└── skills/              # NEW
    └── to-skills-mcp-docs/
        └── SKILL.md     # NEW: MCP annotation guidance

packages/core/src/
└── config-renderer.ts   # FR-Q012: Render envVar; FR-Q013: Fix trailing dash

packages/cli/
├── src/
│   ├── index.ts         # US5: CLI audit (new, C1-C8)
│   ├── help-parser.ts   # FR-Q011: Parse Arguments: section for descriptions
│   └── audit.ts         # NEW: CLI audit rules C1-C8
├── test/
│   ├── help-parser.test.ts  # Updated: Arguments: section parsing
│   └── audit.test.ts        # NEW: CLI audit rule tests
├── package.json         # US3: Add "skills" to "files"
└── skills/              # NEW
    └── to-skills-cli-docs/
        └── SKILL.md     # NEW: CLI documentation conventions guidance
```

**Structure Decision**: Existing monorepo structure. No new packages; changes spread across `core`, `typedoc`, `typedoc-plugin`, `mcp`, and `cli`. New `skills/` directories in `mcp` and `cli` for bundled guidance skills.

## Active Technologies

- TypeScript 5.x, Node.js >=20 (matches existing workspace root)
- Vitest (unit tests, snapshot tests)
- pnpm workspaces (monorepo)
