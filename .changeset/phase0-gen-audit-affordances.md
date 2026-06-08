---
'@skillit/core': minor
'@skillit/client': minor
'@skillit/cli': patch
'@skillit/typedoc': patch
'@skillit/mcp': patch
---

feat: agent-bootstrap Phase 0 core affordances

- **`skillit gen`** — new first-class, deterministic, side-effect-free command that (re)generates the skill from current source (cli + config). It shares ONE generate path with the rest of the client (`packages/client/src/generate.ts`).
- **`skillit init` is now install/wire only** — it no longer generates or refines. After `init`, run `skillit gen`. (Behavior change for `init`.)
- **`skillit audit --json`** — new command wrapping `auditSkill` + `estimateSkillJudgeScore`, emitting the full `AuditResult` + `SkillJudgeEstimate` plus a resolved on-disk location per improvement target.
- **`RefineSource.resolveTargetLocation`** — new optional method on the core `RefineSource` contract, implemented for typedoc, cli, config, and mcp (build) sources.
