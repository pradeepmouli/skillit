---
title: JSDoc Conventions
description: Custom and standard JSDoc tags that control skill generation quality.
---

# JSDoc Conventions

> Write JSDoc that generates expert-quality skills. Three custom tags, ten standard tags, and a README structure.

The quality of a generated SKILL.md depends entirely on what you write in your source docs. This page covers every tag and convention that `typedoc-plugin-skillit` understands.

## Custom Tags

These three tags close the biggest quality gaps in generated skills: decision procedures, anti-patterns, and freedom calibration. Declare them in `typedoc.json`:

```json
{
  "blockTags": ["@useWhen", "@avoidWhen", "@pitfalls"]
}
```

And in `tsdoc.json` (if your project uses one):

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
  "tagDefinitions": [
    { "tagName": "@useWhen", "syntaxKind": "block" },
    { "tagName": "@avoidWhen", "syntaxKind": "block" },
    { "tagName": "@pitfalls", "syntaxKind": "block" }
  ]
}
```

### `@useWhen` --- Positive decision triggers

Each bullet describes a scenario where an LLM should reach for this function. Aggregated into the SKILL.md "When to Use" section.

```typescript
/**
 * @useWhen
 * - You need CPU-intensive work isolated from the main process
 * - You want automatic EventEmitter forwarding across processes
 * - You need to run untrusted code in a sandboxed environment
 */
```

### `@avoidWhen` --- Negative decision triggers

Prevents misuse. Aggregated into SKILL.md "When to Use" as negative triggers. Knowing when NOT to use something is as valuable as knowing when to use it.

```typescript
/**
 * @avoidWhen
 * - The class uses non-serializable state (closures, WeakMaps, Symbols)
 * - You need sub-millisecond latency --- IPC adds ~1ms overhead per call
 * - You want to share mutable state between parent and child
 */
```

### `@pitfalls` --- Anti-patterns with reasoning

Use NEVER + BECAUSE format. This is the highest-leverage tag --- it directly provides expert knowledge that LLMs do not have from training data.

```typescript
/**
 * @pitfalls
 * - NEVER pass functions as constructor arguments --- V8 serialization
 *   silently drops them, producing a proxy with undefined methods
 * - NEVER call $terminate() inside a proxied method --- creates an IPC
 *   deadlock where the child can't respond to its own termination signal
 */
```

## Standard Tags

These are parsed natively by TypeDoc. Use them on every exported symbol where applicable:

| Tag             | Purpose                                                | Renders in                                    |
| --------------- | ------------------------------------------------------ | --------------------------------------------- |
| `@param`        | Parameter description (what it controls, not the type) | references/functions.md                       |
| `@returns`      | Return value meaning                                   | references/functions.md                       |
| `@example`      | Usage examples with imports and setup                  | SKILL.md Quick Start + references/examples.md |
| `@remarks`      | Extended expert knowledge beyond the summary           | references/functions.md --- after summary     |
| `@category`     | Groups exports by domain (overrides filename grouping) | SKILL.md Quick Reference + reference files    |
| `@throws`       | Error conditions and types                             | references/functions.md                       |
| `@see`          | Cross-references to related symbols                    | references/functions.md                       |
| `@deprecated`   | Deprecation notice with migration path                 | references/functions.md                       |
| `@since`        | Version introduced                                     | references/functions.md                       |
| `@defaultValue` | Default values on properties                           | references/types.md                           |

### `@remarks` --- Expert context

Goes beyond the one-line summary. Include trade-offs, design decisions, and non-obvious behavior:

```typescript
/**
 * Render a single skill.
 *
 * @remarks
 * Token budgets are applied per-reference-file, not per-skill.
 * A skill with many functions may have functions.md truncated
 * but types.md will be unaffected. Set maxTokens to at least
 * 500 to avoid mid-signature truncation.
 */
```

### `@category` --- Intentional grouping

When present, `@category` overrides the automatic filename-derived grouping. Exports in different files can share a category:

```typescript
// In renderer.ts
/** @category Rendering */
export function renderSkill(...) {}

// In writer.ts
/** @category Rendering */
export function writeSkills(...) {}

// In tokens.ts
/** @category Token Management */
export function estimateTokens(...) {}
```

## Config Surface Detection

Interfaces that represent configuration are extracted as config surfaces instead of regular types. Detection uses two signals:

**1. The `@config` tag (preferred, explicit):**

```typescript
/**
 * Configuration for the form generation CLI.
 * @config
 */
export interface ZodFormsConfig {
  /** Component preset (e.g. "shadcn") */
  preset?: string;
}
```

**2. Name suffix fallback:** interface names ending with `Options`, `Config`, `Configuration`, or `Settings` (PascalCase boundary --- `GenerateOptions` matches, `OptionsParser` does not).

If you use the `@config` tag, declare it alongside the other custom tags:

```json
{
  "blockTags": ["@useWhen", "@avoidWhen", "@pitfalls", "@config"]
}
```

Per-property JSDoc on config interfaces flows through to each option, including custom tags:

```typescript
/** @config */
export interface GenerateOptions {
  /**
   * Preview without writing files
   *
   * @useWhen
   * - First time running against a new config --- verify output paths
   * - CI validation --- ensure generation succeeds without modifying the repo
   *
   * @pitfalls
   * - NEVER rely on dry-run output matching real output exactly ---
   *   skips post-processing
   *
   * @defaultValue false
   */
  dryRun?: boolean;
}
```

## Complete Example

All tags on one function:

````typescript
/**
 * Run class instances in isolated child processes with full TypeScript support.
 *
 * @remarks
 * All method calls become async and are transparently forwarded over IPC.
 * Supports V8 serialization (10x faster than JSON) and EventEmitter forwarding.
 * Use `Symbol.dispose` or explicit `$terminate()` for cleanup.
 *
 * @useWhen
 * - You need CPU-intensive work isolated from the main process
 * - You want automatic EventEmitter forwarding across processes
 *
 * @avoidWhen
 * - The class uses non-serializable state (closures, WeakMaps)
 * - You need sub-millisecond latency --- IPC adds ~1ms overhead
 *
 * @pitfalls
 * - NEVER pass functions as constructor args --- V8 serialization silently
 *   drops them
 * - NEVER call $terminate() inside a proxied method --- creates IPC deadlock
 *
 * @param target The class constructor to proxy
 * @param modulePath Path to the module exporting the class (resolved from cwd)
 * @returns Proxied instance where all methods return Promises
 * @throws {ProcxyError} When the child process fails to start
 *
 * @example
 * ```typescript
 * import { procxy } from 'procxy';
 * await using calc = await procxy(Calculator, './calculator.js');
 * const result = await calc.add(2, 3); // runs in child process
 * ```
 *
 * @see sanitizeForV8 --- pre-check if values survive V8 serialization
 * @category Core
 * @since 1.0.0
 */
export async function procxy<T>(target: Class<T>, modulePath: string): Promise<Procxy<T>>;
````

## README Conventions

The generator extracts specific sections from your README by exact heading name.

### Required Structure

```markdown
# package-name

> One-sentence description of what this library does and what problem it solves.

Extended explanation with key capabilities. 2-3 sentences giving enough
context to understand when to reach for this library.

## Quick Start

` ` `typescript
import { mainFunction } from 'package-name';
const result = mainFunction(input);
` ` `

## Features

- **Feature One** --- what it does and why it matters
- **Feature Two** --- what it does and why it matters

## Pitfalls

- **NEVER do X** --- because [non-obvious reason from experience]
- **Common Mistake** --- what goes wrong and why
```

### Heading Detection

| Canonical        | Also Accepted (case-insensitive)                 |
| ---------------- | ------------------------------------------------ |
| `## Quick Start` | `## Usage`, `## Getting Started`                 |
| `## Features`    | `## Key Features`, `## Highlights`               |
| `## Pitfalls`    | `## Common Mistakes`, `## Gotchas`, `## Caveats` |

### Description Detection

The generator looks for a description between the `# title` and first `## heading`:

1. **Blockquote** (`> ...`) --- preferred, used for SKILL.md frontmatter description
2. **First prose paragraph** --- fallback, used for SKILL.md body intro

If both exist, the blockquote becomes the concise description and the paragraph becomes the expanded intro.
