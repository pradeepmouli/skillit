# Contract: Install Targets

## Overview

`writeSkills()` gains an optional `installTargets` parameter. When provided, each rendered skill is copied to each target directory after writing to `outDir`.

## `writeSkills()` updated signature

```typescript
export function writeSkills(skills: RenderedSkill[], options: SkillWriteOptions): void;
```

Where `SkillWriteOptions` is:

```typescript
interface SkillWriteOptions {
  readonly outDir: string;
  readonly installTargets?: readonly string[];
}
```

## Behavior

1. Write all skills to `outDir` (existing behavior, unchanged)
2. If `installTargets` is provided and non-empty:
   a. Resolve each target to absolute path (relative to cwd)
   b. Deduplicate targets (remove duplicates, remove targets that resolve to same path as `outDir`)
   c. For each unique target:
   - For each skill: clean `target/<skill-name>/` then copy all files (SKILL.md + references/)
3. Curated skill detection (applies to both `outDir` and install targets):
   a. Before cleaning a skill directory, check if `<dir>/<skill-name>/SKILL.md` exists
   b. If it exists, parse YAML frontmatter
   c. If `curated: true` → skip this skill directory entirely, log info message
   d. If no frontmatter or `curated` not set → proceed with clean + write

## Bundled Guidance Skill Install

When `installTargets` is configured, the caller (TypeDoc plugin, MCP CLI) is responsible for appending bundled guidance skills to the rendered skills list before calling `writeSkills()`. This keeps `writeSkills()` generic — it doesn't know about bundled skills.

The bundled skill install uses version comparison:

1. Check if `target/<bundled-skill-name>/SKILL.md` exists
2. If exists, parse frontmatter for `version` and `name`
3. If `name` doesn't match the bundled skill's name → skip (consumer's custom skill)
4. If `version` >= bundled version → skip (already up-to-date)
5. If `version` < bundled version → replace (upgrade)
6. If no `version` field → skip (treat as custom, don't overwrite)

## TypeDoc Plugin Option

```typescript
app.options.addDeclaration({
  name: 'skillsInstallTargets',
  help: 'Agent discovery directories to install generated skills into (e.g., .claude/skills)',
  type: ParameterType.Array,
  defaultValue: []
});
```

## MCP CLI Flag

```
--install-target <dir>   Install skills to agent directory (repeatable)
```

Maps to `installTargets: string[]` in the extract/bundle options.

## Test Contract

1. `writeSkills(skills, { outDir: 'skills', installTargets: ['.claude/skills'] })` → skills exist in both `skills/` and `.claude/skills/`
2. `writeSkills(skills, { outDir: 'skills' })` → skills only in `skills/` (backward compat)
3. Curated `skills/my-project/SKILL.md` with `curated: true` → preserved after `writeSkills` run
4. Bundled skill with `version: 1.4.0` replaces installed `version: 1.3.0`
5. Bundled skill with `version: 1.3.0` does NOT replace installed `version: 1.4.0`
6. Install target that doesn't exist → created automatically
7. Duplicate install targets → written once
