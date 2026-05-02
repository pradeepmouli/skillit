# Contract: Reference Link Fix

## Overview

The renderer must emit SKILL.md reference loading instructions that match the actual reference file layout. No phantom sections (linking to files that don't exist), no wrong link form (`.md` when the content split into a directory).

## Current Behavior (broken)

```
renderSkillMd(skill, name, opts, refCategories=['functions','variables'])
  → renderLoadingTriggers(['functions','variables'])
    → "read `references/functions.md`"
    → "read `references/variables.md`"

// Then later:
addGroupedReferences(functions, ...) → references/functions/core.md, references/functions/utils.md
// variables array was empty → no file produced
```

Result: SKILL.md says `references/functions.md` (wrong — it's a directory) and `references/variables.md` (wrong — file doesn't exist).

## New Behavior

```
// Step 1: Build references first
references = buildAllReferences(skill, basePath, opts)

// Step 2: Derive manifest from actual filenames
manifest = buildRefManifest(references)
// → [{ category: 'functions', layout: 'directory', files: ['references/functions/core.md', ...] }]
// (variables not present — no items → no manifest entry)

// Step 3: Render SKILL.md with manifest
skillContent = renderSkillMd(skill, name, opts, manifest)
  → renderLoadingTriggers(manifest)
    → "browse `references/functions/` for per-group reference files"
    // no variables line emitted
```

## `buildRefManifest()` specification

```typescript
function buildRefManifest(references: RenderedFile[], basePath: string): RefManifest[];
```

Groups reference files by category (extracted from filename pattern `references/<category>/...`). For each category:

- If all files match `references/<category>.md` → `layout: 'file'`
- If any file matches `references/<category>/<subfile>.md` → `layout: 'directory'`
- Categories with zero files are omitted entirely

## `renderLoadingTriggers()` updated signature

```typescript
function renderLoadingTriggers(manifest: RefManifest[]): string;
```

Trigger text per layout:

- `file`: `read \`references/<category>.md\`` (unchanged)
- `directory`: `browse \`references/<category>/\` for per-group reference files`

## Test Contract

1. Skill with 50+ functions at `maxTokens: 2000` → SKILL.md must contain `references/functions/`, not `references/functions.md`
2. Skill with 0 variables → SKILL.md must NOT contain any `references/variables` text
3. Skill with 3 functions at `maxTokens: 8000` → SKILL.md must contain `references/functions.md` (single file, fits budget)
4. All existing renderer snapshot tests must pass (no behavioral regression for non-split cases)
