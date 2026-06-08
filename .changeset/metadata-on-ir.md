---
'@skillit/core': minor
'@skillit/cli': patch
'@skillit/typedoc': patch
'@skillit/mcp': patch
'@skillit/client': patch
---

refactor: consolidate project metadata onto the ExtractedSkill IR

`auditSkill(skill, context)` is now `auditSkill(skill)` — the deterministic audit
is a pure function of the IR. `ExtractedSkill` gains `readme?: ParsedReadme`;
every source populates it (plus the existing identity fields) in `extract()`. The
separate `AuditContext` type and the `RefineSource.auditContext()` method are
**removed** — they were a parallel metadata channel that three sources
independently forgot, leaving package-description/README findings unaddressable.
Project metadata now has one source of truth (the IR), consumed by both the
renderer and the audit; repo-reading stays at the agent layer.

BREAKING (`@skillit/core`): `auditSkill` is single-arg; `AuditContext` and
`RefineSource.auditContext()` are gone. Callers pass metadata via the skill IR.
