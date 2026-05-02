# Data Model: 003-skill-install-quality

## §1 RefManifest (new, in `packages/core/src/types.ts`)

Describes the actual layout of a reference section after rendering, so `renderLoadingTriggers()` can emit correct links.

```typescript
export interface RefManifest {
  /** Category name: 'functions', 'classes', 'types', etc. */
  readonly category: string;
  /** Whether the section rendered as a single file or a directory of files */
  readonly layout: 'file' | 'directory';
  /** Actual relative filenames produced (e.g., ['references/functions.md'] or ['references/functions/core.md', 'references/functions/utils.md']) */
  readonly files: readonly string[];
}
```

**Built from**: The `RenderedFile[]` array after `addGroupedReferences()` and other reference rendering completes. A helper function inspects reference filenames to determine layout per category.

**Consumed by**: `renderLoadingTriggers()` — replaces the current `string[]` (category names only) parameter.

## §2 SkillWriteOptions (extended, in `packages/core/src/types.ts`)

```typescript
// Before (current):
export interface SkillWriteOptions {
  outDir: string;
}

// After:
export interface SkillWriteOptions {
  readonly outDir: string;
  /** Optional directories to copy rendered skills into (e.g., '.claude/skills') */
  readonly installTargets?: readonly string[];
}
```

**Backward compatible**: `installTargets` is optional, default `undefined` (no install).

## §3 McpAuditIssue (extended, in `packages/core/src/types.ts`)

```typescript
// Before:
export interface McpAuditIssue {
  readonly code: `M${number}`;
  readonly severity: McpAuditSeverity;
  readonly message: string;
  readonly location?: { readonly tool?: string; readonly parameter?: string };
}

// After:
export interface McpAuditIssue {
  readonly code: `M${number}`;
  readonly severity: McpAuditSeverity;
  readonly message: string;
  readonly location?: { readonly tool?: string; readonly parameter?: string };
  /** Actionable fix template for eval loop consumption */
  readonly suggestion?: string;
}
```

## §4 BundledSkill frontmatter (convention, not a TypeScript type)

Bundled guidance skills use YAML frontmatter with a `version` field:

```yaml
---
name: to-skills-docs
description: 'Documentation conventions for generating high-quality AI agent skills...'
version: 1.4.0
---
```

The `version` field is read by `writeSkills()` during install to determine whether to replace an existing installed copy.

## §5 Curated skill frontmatter (convention)

Hand-curated skills use `curated: true` in frontmatter:

```yaml
---
name: rune-langium
description: 'Router skill for the rune-langium monorepo...'
curated: true
---
```

`writeSkills()` checks for this before overwriting.
