---
'@skillit/core': minor
'@skillit/client': patch
'@skillit/typedoc': patch
'@skillit/mcp': patch
---

Skill generation now auto-populates a `## See Also` section linking to skills bundled in direct dependencies.

When a dependency ships a skill (detected via `node_modules/<dep>/skills/*/SKILL.md` or `package.json#skillit.skills`), its name, path, and description appear in `## See Also` of the consuming package's skill. This prevents agents using only a CLI skill from missing critical context — like `## NEVER` rules — documented in a core library skill.

**New exports from `@skillit/core`:**

- `DepSkillRef` — cross-reference type (`name`, `path`, `description?`)
- `discoverDepSkills(pkgDir)` / `discoverDepSkillsSync(pkgDir)` — dep-skill discovery helpers
- `ExtractedSkill.seeAlso?` and `ExtractedSkill.rootDir?` — new IR fields

**New audit check W12:** warns when a dep has a skill not referenced in `## See Also`; contributes +3 to D3 (Anti-Patterns) when passing.
