# Skill Documentation Conventions — Design Spec

## Problem

Auto-generated skills from `typedoc-plugin-to-skills` produce excellent API references but poor skills. The generated output answers "what functions exist?" when it should answer "what problem does this solve?" This is because:

1. The generator can only work with what authors write — sparse JSDoc produces sparse skills
2. READMEs are freeform — the generator can't reliably extract problem descriptions, quick starts, or feature lists
3. No feedback loop — authors don't know their docs are inadequate for skill generation until they see the output

If source documentation follows defined conventions, generation becomes purely mechanical and the output quality is guaranteed.

## Solution

Three components shipped as part of `typedoc-plugin-to-skills`:

1. **Documentation conventions** — a tiered set of requirements at four severity levels (fatal/error/warning/alert) that define what library authors must write
2. **TypeDoc plugin audit hook** — runs during `pnpm typedoc`, checks extracted data + README + package.json against the conventions, logs issues with file:line references and actionable suggestions
3. **Bundled Claude Code skill** (`to-skills-docs`) — documents the conventions and helps authors fix audit issues interactively

## Severity Levels

| Severity    | Meaning                                                | CI Behavior           |
| ----------- | ------------------------------------------------------ | --------------------- |
| **fatal**   | Skill is broken or useless without this                | Exit 1 (configurable) |
| **error**   | Skill exists but LLMs can't write correct code from it | Exit 1 (configurable) |
| **warning** | Skill works but isn't as good as it could be           | Exit 0 (logged)       |
| **alert**   | Stylistic/quality suggestion                           | Exit 0 (logged)       |

---

## Convention Requirements

### Fatal — Skill is broken without these

These take 5 minutes to add. Without them, the generated SKILL.md has no meaningful description, no triggers, and undocumented exports.

#### F1: `package.json` → `description`

One sentence answering "what does this library do?" Must be a problem statement, not a tagline.

**Bad:**

```json
{ "description": "A TypeScript library" }
{ "description": "Fast, lightweight, zero-dependency" }
{ "description": "" }
```

**Good:**

```json
{ "description": "Generate AI agent skills from TypeScript API documentation" }
{ "description": "Map process.env to strongly-typed nested config objects" }
{ "description": "Run class instances in isolated child processes with full TypeScript support" }
```

**Check:** `description` field exists, is non-empty, is >10 characters, does not consist solely of adjectives or tech-stack words.

**Maps to:** SKILL.md frontmatter `description`, SKILL.md body intro (fallback).

#### F2: `package.json` → `keywords` (5+ domain-specific)

Keywords that describe the problem domain, not the tech stack. These become "When to Use" triggers in the SKILL.md. Filter test: if a keyword applies to 1000+ npm packages, it's not specific enough.

**Bad:**

```json
{ "keywords": ["typescript", "library", "utils"] }
{ "keywords": ["typescript", "javascript", "npm"] }
```

**Good:**

```json
{ "keywords": ["proxy", "ipc", "child-process", "worker", "type-safe", "rpc", "isolation"] }
{ "keywords": ["config", "env", "environment", "nested", "camelcase", "zod", "type-safe"] }
```

**Check:** `keywords` array exists, has 5+ entries, at least 3 entries are not in the generic-filter list (`typescript`, `javascript`, `node`, `nodejs`, `npm`, `library`, `package`, `utils`, `utility`, `helper`, `tool`, `framework`).

**Maps to:** SKILL.md "When to Use" section, frontmatter description enrichment.

#### F3: README first paragraph

The README must have a prose description that answers "what problem does this solve and how?" This is detected using the following priority:

1. **Blockquote** (`> ...`) after the `# title` and before any `## heading` — preferred, explicit
2. **First prose paragraph** — first non-heading, non-badge, non-blockquote, non-empty line(s) before any `## heading` — fallback

**Bad:**

```markdown
# my-lib

[![Build](https://img.shields.io/...)]

## Installation
```

(No prose at all — just badges then a heading)

**Good:**

```markdown
# my-lib

> Map process.env to strongly-typed nested config objects with camelCase fields.

Includes schema-guided nesting via Zod, smart nesting without schema, type coercion,
and smart array merging options.

## Quick Start
```

**Check:** At least one of blockquote or prose paragraph exists before the first `## heading`. Content is >20 characters.

**Maps to:** SKILL.md body intro, frontmatter description (if richer than package.json description).

#### F4: JSDoc on every exported function, class, type, and enum

Every public export must have at least a one-sentence JSDoc summary comment.

**Bad:**

```typescript
export function renderSkill(skill: ExtractedSkill): RenderedSkill {
```

**Good:**

```typescript
/** Render a single extracted skill into SKILL.md + progressive disclosure references */
export function renderSkill(skill: ExtractedSkill): RenderedSkill {
```

**Check:** Every item in `ExtractedSkill.functions`, `.classes`, `.types`, `.enums`, `.variables` has a non-empty `description`.

**Maps to:** Function/class/type headings in reference files. Without this, references are just signatures with no context.

---

### Error — LLMs can't write correct code without these

These ensure the reference files have enough detail for an LLM to call your API correctly.

#### E1: `@param` prose on every parameter

Every function parameter must have a JSDoc `@param` tag with a prose description explaining what the parameter controls — not restating the type.

**Bad:**

```typescript
/** @param options The options */
/** @param options */
```

(Restates the name or type — no information added)

**Good:**

```typescript
/** @param options Configuration for rendering — controls token budgets, output format, and example inclusion */
/** @param input Raw TypeScript source text to parse */
```

**Check:** Every parameter in `ExtractedSkill.functions[].parameters` has a non-empty `description` that doesn't trivially restate the parameter name or type.

**Maps to:** Parameter descriptions in references/functions.md. Without this, parameters render as `- \`options: Options\` — ` with nothing after the dash.

#### E2: `@returns` on every non-void function

Every function that returns a value must have a `@returns` tag with prose describing the return value's meaning.

**Bad:**

```typescript
/** @returns The result */
```

**Good:**

```typescript
/** @returns Rendered skill with SKILL.md discovery file and on-demand reference files */
/** @returns Estimated token count (approximately 1 token per 4 characters) */
```

**Check:** Every function in `ExtractedSkill.functions` where `returnType !== 'void'` has a non-empty `returnsDescription`.

**Maps to:** "Returns" line in references/functions.md.

#### E3: JSDoc on every interface and type alias property

Every property on an exported interface or type must have a JSDoc comment.

**Bad:**

```typescript
export interface SkillRenderOptions {
  outDir: string;
  maxTokens: number;
}
```

**Good:**

```typescript
export interface SkillRenderOptions {
  /** Output directory for skill files (default: "skills") */
  outDir: string;
  /** Maximum approximate token budget per reference file (default: 4000) */
  maxTokens: number;
}
```

**Check:** Every property in `ExtractedSkill.types[].properties` has a non-empty `description`.

**Maps to:** Property descriptions in references/types.md. Without this, types list property names with no explanation of what they control.

#### E4: `@example` on at least one primary exported function

At least one key exported function must have an `@example` tag showing real usage. This becomes the Quick Start in the SKILL.md.

**Bad:**

```typescript
/** @example doThing() */
```

(Trivial — doesn't show setup or real usage)

**Good:**

````typescript
/**
 * @example
 * ```typescript
 * import { renderSkills, writeSkills } from '@skillit/core';
 *
 * const rendered = renderSkills(extracted, { maxTokens: 4000 });
 * writeSkills(rendered, { outDir: 'skills' });
 * ```
 */
````

**Check:** `ExtractedSkill.examples.length > 0` OR at least one function in `ExtractedSkill.functions` has a non-empty `examples` array.

**Maps to:** SKILL.md "Quick Start" section, references/examples.md.

#### E5: `package.json` → `repository`

Repository URL must be present.

**Check:** `ExtractedSkill.repository` is non-empty.

**Maps to:** SKILL.md "Links" section.

---

### Warning — Skill works but isn't as good as it could be

These are the difference between a functional skill and an excellent one.

#### W1: `@packageDocumentation` in main index.ts

A module-level JSDoc block with an overview, feature list, and key concepts.

```typescript
/**
 * Procxy enables you to run class instances in isolated child processes
 * while interacting with them as if they were local objects.
 *
 * Key Features:
 * - Type-Safe: Full TypeScript support with mapped types
 * - Fast: V8 serialization by default (10x faster than JSON)
 * - Event Support: EventEmitter forwarding across processes
 *
 * @packageDocumentation
 */
```

**Check:** The module-level `description` on the `ExtractedSkill` (derived from the project/module comment) is non-empty and >50 characters.

**Maps to:** SKILL.md body intro (richest source when present).

#### W2: `@example` on every exported function

Not just the primary function — every exported function should have at least one example.

**Check:** Every function in `ExtractedSkill.functions` has a non-empty `examples` array.

**Maps to:** Per-function examples in references/functions.md, references/examples.md.

#### W3: `@deprecated`, `@since`, `@throws`, `@see` where applicable

Rich metadata tags that help LLMs make decisions:

- `@deprecated` — LLM won't suggest deprecated API
- `@since` — LLM knows version requirements
- `@throws` — LLM adds error handling
- `@see` — LLM discovers related APIs

**Check:** Advisory only — can't programmatically determine where these "should" be. The audit checks whether _any_ are used in the codebase. If zero are used across all exports, flag as warning ("Consider adding @deprecated, @since, @throws, or @see tags where applicable").

**Maps to:** Tag rendering in references/functions.md.

#### W4: 10+ domain-specific keywords

More keywords = richer "When to Use" triggers and better description context.

**Check:** `keywords` array has 10+ entries after filtering generics.

#### W5: README has `## Features` section

A structured feature list that gets extracted into the SKILL.md.

**Check:** README contains a `## Features` or `## Key Features` or `## Highlights` heading (case-insensitive exact match).

**Maps to:** SKILL.md feature summary.

#### W6: README has `## Pitfalls` section

A structured anti-pattern / common mistakes section. This maps directly to skill-judge dimension D3 (Anti-Pattern Quality) — half of expert knowledge is knowing what NOT to do.

**Check:** README contains a `## Pitfalls` or `## Common Mistakes` or `## Gotchas` or `## Caveats` heading (case-insensitive exact match).

**Maps to:** SKILL.md anti-patterns section. Without this, generated skills score ~2/15 on the anti-pattern dimension.

#### W7: `@useWhen` on at least one export

At least one exported function/class should have a `@useWhen` tag with decision triggers.

**Check:** At least one function in `ExtractedSkill.functions` has a non-empty `useWhen` tag.

**Maps to:** SKILL.md "When to Use" section with positive triggers.

#### W8: `@avoidWhen` on at least one export

At least one exported function/class should have an `@avoidWhen` tag with negative triggers.

**Check:** At least one function in `ExtractedSkill.functions` has a non-empty `avoidWhen` tag.

**Maps to:** SKILL.md "When to Use" section with negative triggers (freedom calibration).

#### W9: `@pitfalls` on at least one export

At least one export should have a `@pitfalls` tag with NEVER + BECAUSE anti-patterns.

**Check:** At least one function in `ExtractedSkill.functions` has a non-empty `pitfalls` tag.

**Maps to:** SKILL.md "Pitfalls" section.

#### W10: `@remarks` on complex functions

Functions with 3+ parameters or complex return types should have `@remarks` providing extended expert context.

**Check:** Advisory — flag functions with 3+ parameters and no `@remarks` tag.

**Maps to:** references/functions.md extended description (D1 knowledge delta).

#### W11: `@category` on exports for intentional grouping

Exports should use `@category` tags for author-intentional grouping rather than relying on filename-derived `sourceModule`.

**Check:** Advisory — flag when no `@category` tags are used across all exports.

**Maps to:** SKILL.md Quick Reference grouping and reference file organization.

---

### Alert — Stylistic/quality suggestions

These don't affect functionality but improve the quality of the generated skill.

#### A1: Generic keywords detected

Keywords that are in the generic-filter list and add no triggering value.

**Check:** Any keyword in the list: `typescript`, `javascript`, `node`, `nodejs`, `npm`, `library`, `package`, `utils`, `utility`, `helper`, `tool`, `framework`.

**Suggestion:** "Keyword '{keyword}' is too generic to help LLMs decide when to use this library. Consider replacing with a domain-specific term."

#### A2: `@param` restates the type or name

A parameter description that just says the parameter name or type adds no information.

**Check:** `description` equals or contains only the parameter `name` or `type` (case-insensitive, after stripping articles).

**Suggestion:** "Parameter '{name}' description restates the type. Describe what this parameter controls, not what type it is."

#### A3: `@example` is trivial

An example that's a single function call with no setup or context.

**Check:** Example content is a single line with no imports, no variable assignments, no comments.

**Suggestion:** "Example for '{name}' is trivial. Show a realistic usage with imports, setup, and expected output."

#### A4: README Quick Start is too long

A Quick Start that's >15 lines defeats the purpose of being quick.

**Check:** First fenced code block under `## Quick Start` is >15 lines.

**Suggestion:** "Quick Start example is {N} lines. Keep it under 15 lines — move detailed examples to ## Usage or ## API."

---

## JSDoc Tag Conventions

### Standard Tags (already supported by TypeDoc)

These tags are parsed by TypeDoc and should be used on every exported symbol where applicable:

| Tag                | Purpose                                           | Skill-Judge Mapping              | Generator Renders In                               |
| ------------------ | ------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| `@param`           | Parameter description (prose, not type restating) | D8 (usability)                   | references/functions.md                            |
| `@returns`         | Return value meaning                              | D8 (usability)                   | references/functions.md                            |
| `@example`         | Usage examples with imports and setup             | D8 (usability)                   | SKILL.md Quick Start + references/examples.md      |
| `@remarks`         | Extended expert knowledge beyond the summary      | **D1 (knowledge delta)**         | references/functions.md — after summary            |
| `@category`        | Groups exports into named categories              | **D7 (pattern recognition)**     | SKILL.md Quick Reference + reference file grouping |
| `@deprecated`      | Deprecation notice with migration path            | D3 (anti-patterns)               | references/functions.md                            |
| `@since`           | Version introduced                                | D8 (usability)                   | references/functions.md                            |
| `@throws`          | Error conditions and types                        | D3/D8 (anti-patterns, usability) | references/functions.md                            |
| `@see`             | Cross-references to related symbols               | D7 (cross-references)            | references/functions.md                            |
| `@typeParam`       | Generic type parameter descriptions               | D8 (usability)                   | references/functions.md                            |
| `@defaultValue`    | Default values on properties                      | D8 (usability)                   | references/types.md                                |
| `@alpha` / `@beta` | API stability markers                             | D8 (usability)                   | references — badge after name                      |

### Custom Tags (declared in typedoc.json)

These three custom tags close the skill-judge gaps for D2 (procedures), D3 (anti-patterns), and D6 (freedom calibration). Each is used at most once per JSDoc comment and contains a bullet list.

Add to `typedoc.json`:

```json
{ "blockTags": ["@useWhen", "@avoidWhen", "@pitfalls"] }
```

#### `@useWhen` — Positive decision trigger (D2 + D4)

When should an LLM reach for this function/class? Each bullet is one scenario.

```typescript
/**
 * Run class instances in isolated child processes.
 *
 * @useWhen
 * - You need CPU-intensive work isolated from the main process
 * - You want automatic EventEmitter forwarding across processes
 * - You need to run untrusted code in a sandboxed environment
 */
```

**Check (warning):** At least one exported function should have a `@useWhen` tag.

**Maps to:** SKILL.md "When to Use" section as `- ✅ [text]` items. Aggregated from all exports into a decision guide.

#### `@avoidWhen` — Negative decision trigger (D2 + D6)

When should an LLM NOT use this function/class? Prevents misuse before it happens.

```typescript
/**
 * @avoidWhen
 * - The class uses non-serializable state (closures, WeakMaps, Symbols)
 * - You need sub-millisecond latency — IPC adds ~1ms overhead per call
 * - You want to share mutable state between parent and child
 */
```

**Check (warning):** At least one exported function should have an `@avoidWhen` tag.

**Maps to:** SKILL.md "When to Use" section as `- ❌ [text]` items. Gives LLMs freedom calibration — knowing when NOT to reach for something is as important as knowing when to.

#### `@pitfalls` — Anti-patterns with reasoning (D3)

Explicit NEVER + BECAUSE rules. Each bullet should state what to never do AND why it's dangerous. This is the highest-leverage tag for skill quality — it directly provides expert knowledge that Claude doesn't have.

```typescript
/**
 * @pitfalls
 * - NEVER pass functions as constructor arguments — V8 serialization silently drops them, producing a proxy that appears to work but has undefined methods
 * - NEVER call $terminate() inside a proxied method — creates an IPC deadlock where the child can't respond to its own termination signal
 * - NEVER assume event ordering across IPC — events may arrive out of order under load, use sequence numbers if ordering matters
 */
```

**Check (warning):** At least one export in the package should have a `@pitfalls` tag.

**Maps to:** SKILL.md "Pitfalls" section as `- **NEVER** [text]` items. Also aggregated from README `## Pitfalls` section if both exist.

### Complete JSDoc Example

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
 * - You need sub-millisecond latency — IPC adds ~1ms overhead
 *
 * @pitfalls
 * - NEVER pass functions as constructor args — V8 serialization silently drops them
 * - NEVER call $terminate() inside a proxied method — creates IPC deadlock
 *
 * @param target The class constructor to proxy
 * @param modulePath Path to the module exporting the class (resolved from cwd)
 * @returns Proxied instance where all methods return Promises
 * @throws {ProcxyError} When the child process fails to start or the module can't be loaded
 *
 * @example
 * ```typescript
 * import { procxy } from 'procxy';
 * await using calc = await procxy(Calculator, './calculator.js');
 * const result = await calc.add(2, 3); // runs in child process
 * ```
 *
 * @see sanitizeForV8 — pre-check if values survive V8 serialization
 * @category Core
 * @since 1.0.0
 */
export async function procxy<T>(target: Class<T>, modulePath: string): Promise<Procxy<T>>;
````

### Grouping: `@category` vs `sourceModule`

`@category` is the preferred grouping mechanism. When present, it overrides the automatic `sourceModule` (filename-derived) grouping:

- **`@category`**: Author-intentional. Can group across files. Explicit label.
- **`sourceModule`**: Automatic fallback. Derived from filename. No extra work required.

The generator uses `@category` when any export has it, falls back to `sourceModule` otherwise.

```typescript
// In renderer.ts — grouped under "Rendering" not "renderer"
/** @category Rendering */
export function renderSkill(...) {}

// In writer.ts — also grouped under "Rendering"
/** @category Rendering */
export function writeSkills(...) {}

// In tokens.ts — grouped under "Token Management"
/** @category Token Management */
export function estimateTokens(...) {}
```

### Skill-Judge Score Impact

With full JSDoc convention adoption, the projected scores shift significantly:

| Dimension                  | Without Tags | With Tags    | What Changed                                          |
| -------------------------- | ------------ | ------------ | ----------------------------------------------------- |
| D1: Knowledge Delta        | ~5           | ~14          | `@remarks` adds expert context                        |
| D2: Procedures             | ~3           | ~11          | `@useWhen` / `@avoidWhen` provide decision procedures |
| D3: Anti-Patterns          | ~1           | ~12          | `@pitfalls` provides NEVER + BECAUSE lists            |
| D4: Description            | ~8           | ~13          | `@useWhen` enriches SKILL.md triggers                 |
| D5: Progressive Disclosure | ~10          | ~13          | `@category` improves grouping, loading triggers       |
| D6: Freedom Calibration    | ~5           | ~11          | `@avoidWhen` explicitly constrains when NOT to use    |
| D7: Pattern Recognition    | ~4           | ~8           | `@category` creates clear Tool pattern sections       |
| D8: Usability              | ~6           | ~12          | `@remarks` + `@throws` + `@example` + `@see` together |
| **Total**                  | **~42 (F)**  | **~94 (C+)** | Tags alone lift from F to C — hand-tuning gets to B   |

---

## README Convention

### Required Structure

```markdown
# package-name

> One-sentence description of what this library does and what problem it solves.

First paragraph — expanded explanation with key capabilities. 2-3 sentences
giving an LLM enough context to understand when to reach for this library.

## Quick Start

\`\`\`typescript
import { mainFunction } from 'package-name';

const result = mainFunction(input);
console.log(result);
\`\`\`

## Features

- **Feature One** — what it does and why it matters
- **Feature Two** — what it does and why it matters
- **Feature Three** — what it does and why it matters

## Pitfalls

- **Common Mistake** — what goes wrong and why (maps to skill-judge D3: anti-patterns)
- **NEVER do X** — because [non-obvious reason from experience]
```

### Heading Detection Rules

| Canonical Heading | Also Accepted (case-insensitive)                 |
| ----------------- | ------------------------------------------------ |
| `## Quick Start`  | `## Usage`, `## Getting Started`                 |
| `## Features`     | `## Key Features`, `## Highlights`               |
| `## Pitfalls`     | `## Common Mistakes`, `## Gotchas`, `## Caveats` |

All other headings are ignored by the generator. If the audit detects a heading that looks like it might be intended as one of these (e.g. `## How to Use`, `## Feature List`, `## Overview`), it emits an alert suggesting the canonical name.

### Description Detection Priority

1. **Blockquote** (`> ...`) — first blockquote between `# title` and first `## heading`
2. **First prose paragraph** — first non-heading, non-badge (`[![`), non-image (`![`), non-empty line(s) before first `## heading`

If both exist, blockquote is used for the frontmatter description (concise), and the prose paragraph is used for the SKILL.md body intro (expanded).

---

## Audit Output Format

### Human-Readable (logged during `pnpm typedoc`)

```
📊 Skill Documentation Audit: @my-org/my-lib
   2 fatal · 3 error · 6 warning · 1 alert

🔴 FATAL (2)

  packages/core/package.json
    ⚠ keywords: Only 2 keywords, need 5+ domain-specific
      Has: ["typescript", "utils"]
      Suggestion: Add terms describing what problems this solves

  src/renderer.ts:36
    ⚠ renderSkill() — no JSDoc summary
      Suggestion: /** Render a single extracted skill into SKILL.md + references */

🔴 ERROR (3)

  src/renderer.ts:36
    ⚠ renderSkill() — @returns missing
      Returns: RenderedSkill
      Suggestion: @returns Rendered skill with SKILL.md discovery file and on-demand reference files

  src/types.ts:104
    ⚠ SkillRenderOptions.namePrefix — property JSDoc missing
      Suggestion: /** Custom prefix prepended to skill directory names */

  src/types.ts:108
    ⚠ SkillRenderOptions.license — property JSDoc missing
      Suggestion: /** License identifier for skill frontmatter (default: from package.json) */

🟡 WARNING (6)

  src/index.ts
    ⚠ @packageDocumentation missing
      Suggestion: Add module-level JSDoc with overview and feature list

  src/renderer.ts:27 — renderSkills() — @example missing
  src/renderer.ts:36 — renderSkill() — @example missing
  src/tokens.ts:8 — estimateTokens() — @example missing
  src/tokens.ts:15 — truncateToTokenBudget() — @example missing
  src/llms-txt.ts:37 — renderLlmsTxt() — @example missing

🔵 ALERT (1)

  package.json
    ⚠ Keyword "typescript" is too generic
      Suggestion: Replace with a domain-specific term

✅ PASSING (14 checks)
  ✓ package.json description
  ✓ README blockquote description
  ✓ README first paragraph
  ✓ README ## Quick Start
  ✓ 6/6 exported functions have JSDoc summaries
  ✓ 14/14 exported types have JSDoc summaries
  ...
```

### Machine-Readable (JSON)

```json
{
  "package": "@my-org/my-lib",
  "summary": {
    "fatal": 2,
    "error": 3,
    "warning": 6,
    "alert": 1
  },
  "issues": [
    {
      "severity": "fatal",
      "code": "F2",
      "file": "package.json",
      "line": null,
      "symbol": "keywords",
      "message": "Only 2 keywords, need 5+ domain-specific",
      "suggestion": "Add terms describing what problems this solves"
    },
    {
      "severity": "error",
      "code": "E1",
      "file": "src/renderer.ts",
      "line": 36,
      "symbol": "renderSkill",
      "check": "returns-description",
      "message": "@returns missing",
      "suggestion": "@returns Rendered skill with SKILL.md discovery file and on-demand reference files"
    }
  ],
  "passing": [
    {
      "code": "F1",
      "message": "package.json description",
      "detail": "Generate AI agent skills..."
    },
    { "code": "F3", "message": "README blockquote description" }
  ]
}
```

---

## Integration Points

### TypeDoc Plugin Hook

The audit runs inside the existing `Converter.EVENT_RESOLVE_END` handler in `plugin.ts`, after skill extraction and before rendering. It receives the `ExtractedSkill` data (which already contains all JSDoc-derived info) plus access to package.json and README.md (which the plugin already reads).

```
TypeDoc parse → Extract skills → Run audit → Render skills → Write files
                                    ↑
                              New: audit hook
```

The audit is logged via `app.logger.info` / `app.logger.warn` / `app.logger.error`, matching TypeDoc's existing log format. Fatal/error issues optionally fail the build via a `skillsAuditFailOnError` option (default: false).

### New TypeDoc Options

| Option                   | Type    | Default | Description                                           |
| ------------------------ | ------- | ------- | ----------------------------------------------------- |
| `skillsAudit`            | boolean | `true`  | Run documentation audit during skill generation       |
| `skillsAuditFailOnError` | boolean | `false` | Fail build on fatal or error severity issues          |
| `skillsAuditJson`        | string  | `""`    | Path to write JSON audit report (empty = don't write) |

### Bundled Claude Code Skill

Ships at `skills/to-skills-docs/SKILL.md` inside the `typedoc-plugin-to-skills` npm package. Contains:

- The full conventions reference (what to write and why)
- Instructions for Claude to run `pnpm typedoc` and interpret the audit output
- Fix-it workflow: read each issue, navigate to file:line, add the missing JSDoc/README content
- Examples of good vs bad documentation at each severity level

Triggers on:

- "audit my docs for skill quality"
- "prepare my library for skill generation"
- "fix my JSDoc for better skills"
- "what documentation conventions does to-skills need"
- Running `pnpm typedoc` and seeing audit warnings

---

## What This Does NOT Cover

- **Runtime validation** — the audit is static analysis only, no execution
- **Content quality judgment** — the audit checks presence, not prose quality (except trivial-detection alerts)
- **Cross-package consistency** — each package is audited independently
- **Auto-fix** — the audit suggests but doesn't modify source files (the Claude Code skill does the fixing interactively)

---

## Skill-Judge Alignment

These conventions are designed so that generated skills score well against the [skill-judge evaluation rubric](https://github.com/anthropics/skill-judge) (120 points across 8 dimensions). Here's how each convention tier maps to skill-judge scores:

| Skill-Judge Dimension                | Max     | Minimal Tier                    | Useful Tier                       | Complete Tier                                      |
| ------------------------------------ | ------- | ------------------------------- | --------------------------------- | -------------------------------------------------- |
| D1: Knowledge Delta                  | 20      | ~5 (API ref only)               | ~8 (params + returns add context) | ~14 (@packageDocumentation, @remarks, Pitfalls)    |
| D2: Mindset + Procedures             | 15      | ~3                              | ~5 (@example shows procedures)    | ~10 (@packageDocumentation with decision guidance) |
| D3: Anti-Patterns                    | 15      | ~2 (@deprecated only)           | ~4                                | ~10 (README ## Pitfalls section)                   |
| D4: Description (WHAT/WHEN/KEYWORDS) | 15      | ~8 (pkg description + keywords) | ~11 (+ repository, examples)      | ~14 (+ rich keywords, features)                    |
| D5: Progressive Disclosure           | 15      | ~10 (SKILL.md + refs structure) | ~12 (+ loading triggers)          | ~14 (+ conditional loading guidance)               |
| D6: Freedom Calibration              | 15      | ~8 (API ref = Tool pattern)     | ~10                               | ~12                                                |
| D7: Pattern Recognition              | 10      | ~5 (Tool-ish)                   | ~7 (clear Tool pattern)           | ~9 (with decision trees from @see)                 |
| D8: Practical Usability              | 15      | ~4 (signatures only)            | ~9 (@param, @returns, 1 example)  | ~13 (examples on every fn, error guidance)         |
| **Total**                            | **120** | **~45 (F)**                     | **~66 (D)**                       | **~96 (B)**                                        |

The jump from Minimal to Useful is the biggest quality improvement. Complete approaches hand-crafted skill quality (Grade B). Getting to Grade A requires author expertise in decision guidance and anti-patterns that can't be mechanically checked — but the conventions create the scaffolding for it.

### Key Insight from Skill-Judge

> **Good Skill = Expert-only Knowledge - What Claude Already Knows**

Function signatures and type definitions are things Claude already knows from training data. The _knowledge delta_ comes from:

- **@packageDocumentation**: Expert overview with decision guidance
- **@param/@returns prose**: Semantic meaning, not type restating
- **@throws**: Error conditions only experience teaches
- **@deprecated + reason**: Anti-patterns with non-obvious explanations
- **README ## Pitfalls**: Expert "NEVER do X because Y" knowledge
- **README ## Features**: What makes THIS library different from alternatives

The conventions prioritize these high-delta sources over low-delta ones (signatures, type definitions).
