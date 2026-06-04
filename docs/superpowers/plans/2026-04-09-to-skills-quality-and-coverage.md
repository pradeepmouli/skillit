# to-skills Quality, Coverage & Organization Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix organization/formatting issues, close serious extraction and rendering gaps versus typedoc-plugin-markdown, and improve test coverage for under-tested modules.

**Architecture:** The fix is split into three phases: (1) housekeeping — fix wrong/stale docs and formatting, (2) extraction + rendering — close the content gaps so generated skills are actually useful for LLMs, (3) test coverage — bring plugin.ts, extractor.ts, and llms-txt.ts up to meaningful coverage. Each phase produces independently shippable commits.

**Tech Stack:** TypeScript 5.9, TypeDoc 0.28, Vitest 4.1, pnpm workspaces

---

## Findings Summary

### Organization & Formatting Issues

| Issue                                                                                                     | Location                                   | Severity |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------- |
| CONTRIBUTING.md is entirely for "Procxy" — wrong project name, wrong directory structure, wrong repo URLs | `CONTRIBUTING.md`                          | High     |
| AGENTS.md says "TypeScript template repository" — no mention of to-skills, its packages, or how it works  | `AGENTS.md:7`                              | Medium   |
| README.md overclaims "TypeDoc, Docusaurus, OpenAPI, and more" — only TypeDoc exists                       | `README.md:3`                              | High     |
| Generated `types.md` is skeletal — interfaces listed with no properties or definitions                    | `skills/to-skills/references/types.md`     | High     |
| Generated `functions.md` has empty parameter descriptions (`— `)                                          | `skills/to-skills/references/functions.md` | Medium   |
| No `.size-limit.json` but CI checks for it                                                                | `.github/workflows/ci.yml`                 | Low      |

### Content Gaps vs typedoc-plugin-markdown

These are the things the markdown plugin renders that to-skills silently drops:

| Gap                                                                                                                          | Impact                                                                          | Where to Fix                  |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| **Interface properties not extracted** — `extractType()` only captures `decl.type?.toString()` which is empty for interfaces | Types reference is useless for interfaces — just name + description, no members | `extractor.ts:184-189`        |
| **Variables/constants dropped** — `ReflectionKind.Variable` is never handled                                                 | Exports like `DEFAULT_OVERRIDES`, `builtinProcessors` are silently lost         | `extractor.ts:89-96, 139-146` |
| **Function overloads dropped** — only `signatures?.[0]` is used                                                              | Multi-signature functions lose all but the first overload                       | `extractor.ts:150-151`        |
| **@returns prose not extracted** — return type string is captured, but not the `@returns` JSDoc description                  | Parameter docs say what goes in, but not what comes out                         | `extractor.ts:149-159`        |
| **@deprecated/@since/@see tags extracted but never rendered** — `fn.tags` is populated but renderer ignores it               | Deprecation warnings invisible to LLMs                                          | `renderer.ts:146-179`         |
| **No inheritance info** — classes don't capture `extends`/`implements`                                                       | LLMs can't see class hierarchies                                                | `extractor.ts:162-181`        |
| **No static members** — `extractClass()` filters on `ReflectionKind.Method` but skips statics                                | Static factory methods and constants are invisible                              | `extractor.ts:165-167`        |
| **No accessor (get/set) extraction** — only properties and methods are extracted from classes                                | Computed properties are missed                                                  | `extractor.ts:168-170`        |
| **No source file references** — markdown plugin links to GitHub source lines; skills have none                               | No way for LLMs to find the actual code                                         | `types.ts`, `renderer.ts`     |

### Test Coverage Gaps

| Module         | Current Coverage      | Target                     |
| -------------- | --------------------- | -------------------------- |
| `renderer.ts`  | 86% statements        | Maintain                   |
| `tokens.ts`    | 89% statements        | Maintain                   |
| `llms-txt.ts`  | 1.88% statements      | 80%+                       |
| `extractor.ts` | 0% (integration only) | 70%+                       |
| `plugin.ts`    | 0% (integration only) | Defer (needs TypeDoc mock) |

---

## Phase 1: Housekeeping (Docs & Formatting)

### Task 1: Fix CONTRIBUTING.md

**Files:**

- Modify: `CONTRIBUTING.md` (entire file — currently references "Procxy")

- [ ] **Step 1: Rewrite CONTRIBUTING.md for to-skills**

Replace the entire file. Key changes:

- Project name: "to-skills" (not "Procxy")
- Correct directory structure (monorepo with `packages/core`, `packages/typedoc`, `packages/typedoc-plugin`)
- Correct repo URL: `https://github.com/pradeepmouli/to-skills`
- Correct prerequisites: Node 20+, pnpm 10.6+
- Correct test commands: `pnpm test`, `pnpm test:coverage`
- Correct build: `pnpm build` (uses tsgo)
- Mention the 3 packages and their roles

````markdown
# Contributing to to-skills

Thank you for your interest in contributing to to-skills! This document provides guidelines for contributing.

## Getting Started

### Prerequisites

- Node.js 20+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- pnpm 10.6+ (`npm install -g pnpm`)
- Git

### Setup

```bash
git clone https://github.com/pradeepmouli/to-skills.git
cd to-skills
pnpm install
pnpm build
pnpm test
```
````

## Project Structure

```
to-skills/
├── packages/
│   ├── core/                  # Shared types, renderers, token budgeting
│   │   ├── src/
│   │   │   ├── types.ts       # ExtractedSkill interface hierarchy
│   │   │   ├── renderer.ts    # SKILL.md + references/ rendering
│   │   │   ├── llms-txt.ts    # llms.txt / llms-full.txt rendering
│   │   │   ├── tokens.ts      # Token estimation and budgeting
│   │   │   └── writer.ts      # Filesystem I/O
│   │   └── test/
│   ├── typedoc/               # TypeDoc plugin (extraction + hooks)
│   │   └── src/
│   │       ├── plugin.ts      # TypeDoc lifecycle hooks, option declarations
│   │       └── extractor.ts   # Reflection tree → ExtractedSkill
│   └── typedoc-plugin/        # Auto-discovery wrapper (npm: typedoc-plugin-to-skills)
│       └── src/
│           └── index.ts       # Re-exports @skillit/typedoc
├── skills/                    # Generated output (dogfooding)
├── docs/                      # Generated TypeDoc HTML
└── scripts/
```

## Development Workflow

```bash
pnpm build            # Build all packages (tsgo)
pnpm test             # Run tests (vitest)
pnpm test:coverage    # Tests with coverage report
pnpm lint             # Lint (oxlint)
pnpm format           # Format (oxfmt)
pnpm type-check       # TypeScript strict checking
```

## Coding Standards

See [AGENTS.md](./AGENTS.md) for comprehensive guidelines.

Key points:

- TypeScript strict mode, explicit return types, no `any`
- 2-space indentation, single quotes, semicolons, no trailing commas
- JSDoc on public APIs only
- Vitest for tests, oxlint for linting, oxfmt for formatting

## Submitting Changes

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes following the coding standards
3. Add tests for new functionality
4. Run all checks: `pnpm type-check && pnpm lint && pnpm test`
5. Create a changeset: `pnpm changeset` (select version bump, describe changes)
6. Commit using conventional commits: `feat(core): add interface property extraction`
7. Open a Pull Request

## Version Management

We use [Changesets](https://github.com/changesets/changesets). After making changes:

1. Run `pnpm changeset`
2. Select affected packages and version bump type
3. Commit the generated changeset file

## License

By contributing, you agree your contributions will be licensed under the MIT License.

````

- [ ] **Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: rewrite CONTRIBUTING.md for to-skills (was Procxy boilerplate)"
````

---

### Task 2: Fix AGENTS.md project overview

**Files:**

- Modify: `AGENTS.md:1-10`

- [ ] **Step 1: Replace the generic project overview**

Change lines 1-10 from the generic "TypeScript template repository" description to an accurate one:

```markdown
# Agent Instructions

This document provides guidelines and instructions for AI coding agents working with this TypeScript project. These instructions are designed to work with multiple agents including GitHub Copilot, Claude Code, Gemini Code Assist, and Codex.

## Project Overview

to-skills is a TypeDoc plugin ecosystem that generates structured AI agent skills (SKILL.md files following the agentskills.io spec) and llms.txt documentation from TypeScript API docs. It's a pnpm monorepo with three packages:

- **`@skillit/core`** — Shared types (`ExtractedSkill` hierarchy), SKILL.md renderer (progressive disclosure), llms.txt renderer, token budgeting
- **`@skillit/typedoc`** — TypeDoc plugin that extracts from the reflection tree and hooks into the TypeDoc lifecycle
- **`typedoc-plugin-to-skills`** — Auto-discovery wrapper (just `pnpm add -D` and TypeDoc finds it)

The extraction pipeline: TypeDoc parses TS source → `extractor.ts` walks the reflection tree → `ExtractedSkill` intermediate representation → `renderer.ts` produces SKILL.md + references/ files → `writer.ts` writes to disk.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md project overview for to-skills"
```

---

### Task 3: Fix README.md overclaim

**Files:**

- Modify: `README.md:3`

- [ ] **Step 1: Remove the "Docusaurus, OpenAPI, and more" claim**

Change line 3 from:

```markdown
Generate structured AI agent skills ([SKILL.md](https://agentskills.io)) and [llms.txt](https://llmstxt.org) from your documentation sources.
```

To:

```markdown
Generate structured AI agent skills ([SKILL.md](https://agentskills.io)) and [llms.txt](https://llmstxt.org) from your TypeScript API documentation.
```

Also fix the tagline description in root `package.json` if it has the same overclaim.

- [ ] **Step 2: Commit**

```bash
git add README.md package.json
git commit -m "docs: fix README overclaim — only TypeDoc is supported today"
```

---

## Phase 2: Extraction & Rendering Gaps

### Task 4: Extract interface properties

This is the highest-impact gap. Currently `extractType()` captures `decl.type?.toString()` which returns empty string for interfaces (interfaces have children, not a `.type`). The markdown plugin renders every property with its type, description, and optionality.

**Files:**

- Modify: `packages/core/src/types.ts` — add `properties` field to `ExtractedType`
- Modify: `packages/typedoc/src/extractor.ts:184-189` — extract interface children
- Modify: `packages/core/src/renderer.ts:224-252` — render interface properties in types.md
- Create: `packages/core/test/renderer-types.test.ts` — test interface rendering
- Modify: `packages/typedoc/test/extractor.test.ts` (create if needed) — test interface extraction

- [ ] **Step 1: Add `properties` to `ExtractedType`**

In `packages/core/src/types.ts`, add an optional `properties` field:

```typescript
export interface ExtractedType {
  name: string;
  description: string;
  definition: string;
  /** Interface properties (empty for type aliases) */
  properties?: ExtractedProperty[];
}
```

- [ ] **Step 2: Write the failing test for interface property rendering**

Create `packages/core/test/renderer-types.test.ts`:

````typescript
import { describe, it, expect } from 'vitest';
import { renderSkill } from '../src/renderer.js';
import type { ExtractedSkill } from '../src/types.js';

describe('renderSkill — interface types', () => {
  it('renders interface properties in types reference', () => {
    const skill: ExtractedSkill = {
      name: 'test-pkg',
      description: 'Test',
      functions: [],
      classes: [],
      types: [
        {
          name: 'UserConfig',
          description: 'Configuration options',
          definition: '',
          properties: [
            { name: 'host', type: 'string', description: 'Server hostname', optional: false },
            { name: 'port', type: 'number', description: 'Server port', optional: true }
          ]
        }
      ],
      enums: [],
      examples: []
    };

    const result = renderSkill(skill);
    const typesRef = result.references.find((r) => r.filename.includes('types.md'));
    expect(typesRef).toBeDefined();
    expect(typesRef!.content).toContain('`host: string`');
    expect(typesRef!.content).toContain('`port: number`');
    expect(typesRef!.content).toContain('(optional)');
    expect(typesRef!.content).toContain('Server hostname');
  });

  it('renders type alias definition when no properties', () => {
    const skill: ExtractedSkill = {
      name: 'test-pkg',
      description: 'Test',
      functions: [],
      classes: [],
      types: [
        {
          name: 'Status',
          description: 'Request status',
          definition: '"ok" | "error"'
        }
      ],
      enums: [],
      examples: []
    };

    const result = renderSkill(skill);
    const typesRef = result.references.find((r) => r.filename.includes('types.md'));
    expect(typesRef!.content).toContain('```ts');
    expect(typesRef!.content).toContain('"ok" | "error"');
  });
});
````

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/to-skills
pnpm test -- packages/core/test/renderer-types.test.ts
```

Expected: FAIL — `properties` doesn't exist on type, rendering doesn't include properties.

- [ ] **Step 4: Update `renderTypesRef` to render interface properties**

In `packages/core/src/renderer.ts`, update the types rendering function:

````typescript
function renderTypesRef(types: ExtractedType[], enums: ExtractedEnum[]): string {
  const lines = ['# Types & Enums\n'];

  if (types.length > 0) {
    lines.push('## Types\n');
    for (const t of types) {
      lines.push(`### \`${t.name}\``);
      if (t.description) lines.push(t.description);

      // Interface with properties
      if (t.properties && t.properties.length > 0) {
        lines.push('**Properties:**');
        for (const p of t.properties) {
          const opt = p.optional ? ' (optional)' : '';
          lines.push(`- \`${p.name}: ${p.type}\`${opt} — ${p.description || ''}`);
        }
      }

      // Type alias with definition
      if (t.definition) {
        lines.push('```ts', t.definition, '```');
      }
      lines.push('');
    }
  }

  if (enums.length > 0) {
    lines.push('## Enums\n');
    for (const e of enums) {
      lines.push(`### \`${e.name}\``);
      if (e.description) lines.push(e.description);
      for (const m of e.members) {
        lines.push(`- \`${m.name}\` = \`${m.value}\` — ${m.description || ''}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
````

- [ ] **Step 5: Update `extractType` in extractor.ts to extract interface children**

In `packages/typedoc/src/extractor.ts`:

```typescript
function extractType(decl: DeclarationReflection): ExtractedType {
  // For interfaces, extract properties from children
  const properties: ExtractedProperty[] = [];
  if (decl.kind === ReflectionKind.Interface && decl.children) {
    for (const child of decl.children) {
      if (child.kind === ReflectionKind.Property || child.kind === ReflectionKind.Accessor) {
        properties.push(extractProperty(child));
      }
    }
  }

  return {
    name: decl.name,
    description: getCommentText(decl.comment),
    definition: decl.type?.toString() ?? '',
    properties: properties.length > 0 ? properties : undefined
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm test
```

Expected: All tests pass including the new interface property tests.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/renderer.ts packages/typedoc/src/extractor.ts packages/core/test/renderer-types.test.ts
git commit -m "feat(core): extract and render interface properties in types reference"
```

---

### Task 5: Extract and render variables/constants

Currently `ReflectionKind.Variable` is never handled — exports like `DEFAULT_OVERRIDES` are silently dropped.

**Files:**

- Modify: `packages/core/src/types.ts` — add `ExtractedVariable` and `variables` field
- Modify: `packages/typedoc/src/extractor.ts` — extract variables
- Modify: `packages/core/src/renderer.ts` — render variables in a new reference section
- Modify: `packages/core/src/llms-txt.ts` — include variables in llms.txt output
- Test: `packages/core/test/renderer.test.ts` — add variable rendering tests

- [ ] **Step 1: Add `ExtractedVariable` type and `variables` field**

In `packages/core/src/types.ts`:

```typescript
export interface ExtractedVariable {
  name: string;
  type: string;
  description: string;
  /** Whether this is a const declaration */
  isConst: boolean;
}
```

Add to `ExtractedSkill`:

```typescript
export interface ExtractedSkill {
  // ... existing fields ...
  /** Exported variables and constants */
  variables: ExtractedVariable[];
  // ... rest ...
}
```

- [ ] **Step 2: Write failing test for variable rendering**

Add to `packages/core/test/renderer.test.ts`:

```typescript
it('renders variables in a reference file', () => {
  const skill: ExtractedSkill = {
    name: 'test-pkg',
    description: 'Test',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [
      {
        name: 'DEFAULT_CONFIG',
        type: 'Config',
        description: 'Default configuration',
        isConst: true
      },
      { name: 'VERSION', type: 'string', description: 'Library version', isConst: true }
    ],
    examples: []
  };

  const result = renderSkill(skill);
  const varsRef = result.references.find((r) => r.filename.includes('variables.md'));
  expect(varsRef).toBeDefined();
  expect(varsRef!.content).toContain('DEFAULT_CONFIG');
  expect(varsRef!.content).toContain('Config');
  expect(varsRef!.content).toContain('Default configuration');
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test -- packages/core/test/renderer.test.ts
```

Expected: FAIL — `variables` doesn't exist on type, no variables.md generated.

- [ ] **Step 4: Implement variable extraction in extractor.ts**

In `packages/typedoc/src/extractor.ts`, add `extractVariable` function:

```typescript
function extractVariable(decl: DeclarationReflection): ExtractedVariable {
  return {
    name: decl.name,
    type: decl.type?.toString() ?? 'unknown',
    description: getCommentText(decl.comment),
    isConst: decl.flags.isConst
  };
}
```

Add to the extraction filters in `extractModule()` and `mergeModules()`:

```typescript
// In extractModule:
variables: children.filter((c) => c.kind === ReflectionKind.Variable).map(extractVariable),

// In mergeModules:
const allVariables: ExtractedVariable[] = [];
// ... inside the loop:
allVariables.push(...children.filter((c) => c.kind === ReflectionKind.Variable).map(extractVariable));
// ... in the return:
variables: allVariables,
```

- [ ] **Step 5: Implement variable rendering in renderer.ts**

Add `renderVariablesRef` function and call it from `renderSkill`:

````typescript
function renderVariablesRef(variables: ExtractedVariable[]): string {
  const lines = ['# Variables & Constants\n'];
  for (const v of variables) {
    const prefix = v.isConst ? 'const' : 'let';
    lines.push(`## \`${v.name}\``);
    if (v.description) lines.push(v.description);
    lines.push('```ts', `${prefix} ${v.name}: ${v.type}`, '```');
    lines.push('');
  }
  return lines.join('\n');
}
````

In `renderSkill()`, add after the enums block:

```typescript
if (skill.variables.length > 0) {
  const content = renderVariablesRef(skill.variables);
  references.push({
    filename: `${basePath}/references/variables.md`,
    content: truncateToTokenBudget(content, opts.maxTokens),
    tokens: estimateTokens(content)
  });
}
```

Also update `renderQuickReference` and `renderWhenToUse` to include variables.

- [ ] **Step 6: Update llms-txt.ts to include variables**

In `renderSummarySections` and `renderFull`, add a variables section between functions/classes and types:

````typescript
// In renderSummarySections:
for (const v of skill.variables) {
  const desc = truncateDescription(v.description);
  primary.push(`- \`${v.name}\`${desc ? `: ${desc}` : ''}`);
}

// In renderFull:
for (const v of skill.variables) {
  lines.push(`### ${v.name}\n`);
  if (v.description) lines.push(`${v.description}\n`);
  const prefix = v.isConst ? 'const' : 'let';
  lines.push('```ts', `${prefix} ${v.name}: ${v.type}`, '```\n');
}
````

- [ ] **Step 7: Fix all existing tests that construct `ExtractedSkill` without `variables`**

Add `variables: []` to every `ExtractedSkill` literal in existing tests.

- [ ] **Step 8: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/renderer.ts packages/typedoc/src/extractor.ts packages/core/src/llms-txt.ts packages/core/test/
git commit -m "feat(core): extract and render variables/constants"
```

---

### Task 6: Extract function overloads

Currently only `signatures?.[0]` is used — multi-signature functions lose all but the first overload.

**Files:**

- Modify: `packages/core/src/types.ts` — add `overloads` field to `ExtractedFunction`
- Modify: `packages/typedoc/src/extractor.ts:149-159` — extract all signatures
- Modify: `packages/core/src/renderer.ts:146-179` — render overloads
- Test: `packages/core/test/renderer.test.ts`

- [ ] **Step 1: Add `overloads` field to `ExtractedFunction`**

```typescript
export interface ExtractedFunction {
  name: string;
  description: string;
  signature: string;
  parameters: ExtractedParameter[];
  returnType: string;
  examples: string[];
  tags: Record<string, string>;
  /** Additional overload signatures (if function has multiple signatures) */
  overloads?: string[];
}
```

- [ ] **Step 2: Write failing test**

```typescript
it('renders function overloads', () => {
  const skill: ExtractedSkill = {
    name: 'test-pkg',
    description: 'Test',
    functions: [
      {
        name: 'parse',
        description: 'Parse input',
        signature: 'parse(input: string): Result',
        parameters: [{ name: 'input', type: 'string', description: 'The input', optional: false }],
        returnType: 'Result',
        examples: [],
        tags: {},
        overloads: ['parse(input: string, strict: true): StrictResult']
      }
    ],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };

  const result = renderSkill(skill);
  const fnsRef = result.references.find((r) => r.filename.includes('functions.md'));
  expect(fnsRef!.content).toContain('parse(input: string): Result');
  expect(fnsRef!.content).toContain('parse(input: string, strict: true): StrictResult');
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test
```

- [ ] **Step 4: Implement overload extraction**

In `packages/typedoc/src/extractor.ts`, update `extractFunction`:

```typescript
function extractFunction(decl: DeclarationReflection): ExtractedFunction {
  const sig = decl.signatures?.[0];
  const overloads = (decl.signatures ?? []).slice(1).map((s) => formatSignature(decl.name, s));

  return {
    name: decl.name,
    description: getCommentText(sig?.comment ?? decl.comment),
    signature: formatSignature(decl.name, sig),
    parameters: (sig?.parameters ?? []).map(extractParameter),
    returnType: sig?.type?.toString() ?? 'void',
    examples: getExamples(sig?.comment ?? decl.comment),
    tags: getTagMap(sig?.comment ?? decl.comment),
    overloads: overloads.length > 0 ? overloads : undefined
  };
}
```

- [ ] **Step 5: Render overloads in functions reference**

In `renderFunctionsRef`, after the main signature block:

````typescript
if (opts.includeSignatures && fn.overloads && fn.overloads.length > 0) {
  lines.push('**Overloads:**');
  for (const overload of fn.overloads) {
    lines.push('```ts', overload, '```');
  }
}
````

- [ ] **Step 6: Run tests**

```bash
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/renderer.ts packages/typedoc/src/extractor.ts packages/core/test/
git commit -m "feat(core): extract and render function overloads"
```

---

### Task 7: Render extracted tags (@deprecated, @since, @see, @throws)

Tags are already extracted into `fn.tags` by `getTagMap()` but the renderer completely ignores them. This is low-hanging fruit.

**Files:**

- Modify: `packages/core/src/renderer.ts:146-179` — render tags in function reference
- Test: `packages/core/test/renderer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('renders @deprecated and @since tags on functions', () => {
  const skill: ExtractedSkill = {
    name: 'test-pkg',
    description: 'Test',
    functions: [
      {
        name: 'oldMethod',
        description: 'Does something',
        signature: 'oldMethod(): void',
        parameters: [],
        returnType: 'void',
        examples: [],
        tags: {
          deprecated: 'Use newMethod() instead',
          since: '1.0.0',
          throws: 'Error if input is invalid'
        }
      }
    ],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };

  const result = renderSkill(skill);
  const fnsRef = result.references.find((r) => r.filename.includes('functions.md'));
  expect(fnsRef!.content).toContain('**Deprecated:**');
  expect(fnsRef!.content).toContain('Use newMethod() instead');
  expect(fnsRef!.content).toContain('**Since:** `1.0.0`');
  expect(fnsRef!.content).toContain('**Throws:**');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test
```

- [ ] **Step 3: Add tag rendering to `renderFunctionsRef`**

In `renderer.ts`, add after the return type block inside `renderFunctionsRef`:

```typescript
// Render important tags
if (fn.tags.deprecated) {
  lines.push(`> **Deprecated:** ${fn.tags.deprecated}`);
}
if (fn.tags.since) {
  lines.push(`**Since:** \`${fn.tags.since}\``);
}
if (fn.tags.throws) {
  lines.push(`**Throws:** ${fn.tags.throws}`);
}
if (fn.tags.see) {
  lines.push(`**See:** ${fn.tags.see}`);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/renderer.ts packages/core/test/
git commit -m "feat(core): render @deprecated, @since, @throws, @see tags in function references"
```

---

### Task 8: Extract @returns description and class inheritance

**Files:**

- Modify: `packages/core/src/types.ts` — add `returnsDescription` to `ExtractedFunction`, `extends`/`implements` to `ExtractedClass`
- Modify: `packages/typedoc/src/extractor.ts` — extract @returns text and class hierarchy
- Modify: `packages/core/src/renderer.ts` — render return descriptions and inheritance
- Test: `packages/core/test/renderer.test.ts`

- [ ] **Step 1: Add fields to types**

In `types.ts`:

```typescript
export interface ExtractedFunction {
  // ... existing ...
  /** Prose description from @returns JSDoc tag */
  returnsDescription?: string;
}

export interface ExtractedClass {
  // ... existing ...
  /** Parent class name */
  extends?: string;
  /** Implemented interface names */
  implements?: string[];
}
```

- [ ] **Step 2: Write failing tests**

```typescript
it('renders @returns description', () => {
  const skill: ExtractedSkill = {
    name: 'test-pkg',
    description: 'Test',
    functions: [
      {
        name: 'fetchData',
        description: 'Fetches data',
        signature: 'fetchData(): Promise<Data>',
        parameters: [],
        returnType: 'Promise<Data>',
        returnsDescription: 'The fetched data object, or null if not found',
        examples: [],
        tags: {}
      }
    ],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };

  const result = renderSkill(skill);
  const fnsRef = result.references.find((r) => r.filename.includes('functions.md'));
  expect(fnsRef!.content).toContain('Promise<Data>');
  expect(fnsRef!.content).toContain('The fetched data object, or null if not found');
});

it('renders class inheritance', () => {
  const skill: ExtractedSkill = {
    name: 'test-pkg',
    description: 'Test',
    functions: [],
    classes: [
      {
        name: 'HttpClient',
        description: 'HTTP client',
        constructorSignature: 'constructor()',
        methods: [],
        properties: [],
        examples: [],
        extends: 'BaseClient',
        implements: ['Disposable', 'Cacheable']
      }
    ],
    types: [],
    enums: [],
    variables: [],
    examples: []
  };

  const result = renderSkill(skill);
  const classesRef = result.references.find((r) => r.filename.includes('classes.md'));
  expect(classesRef!.content).toContain('extends `BaseClient`');
  expect(classesRef!.content).toContain('implements `Disposable`, `Cacheable`');
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm test
```

- [ ] **Step 4: Implement extraction**

In `extractor.ts`, update `extractFunction`:

```typescript
// Add after returnType:
returnsDescription: getReturnsDescription(sig?.comment ?? decl.comment),
```

Add helper:

```typescript
function getReturnsDescription(comment: Comment | undefined): string | undefined {
  if (!comment) return undefined;
  const returnsTag = comment.getTag('@returns');
  if (!returnsTag) return undefined;
  const text = returnsTag.content
    .map((part) => part.text)
    .join('')
    .trim();
  return text || undefined;
}
```

Update `extractClass`:

```typescript
function extractClass(decl: DeclarationReflection): ExtractedClass {
  // ... existing code ...

  // Extract inheritance
  const extendedTypes = decl.extendedTypes?.map((t) => t.toString());
  const implementedTypes = decl.implementedTypes?.map((t) => t.toString());

  return {
    // ... existing fields ...
    extends: extendedTypes?.[0],
    implements: implementedTypes && implementedTypes.length > 0 ? implementedTypes : undefined
  };
}
```

- [ ] **Step 5: Update renderer**

In `renderFunctionsRef`, change the return type rendering:

```typescript
if (fn.returnType && fn.returnType !== 'void') {
  const desc = fn.returnsDescription ? ` — ${fn.returnsDescription}` : '';
  lines.push(`**Returns:** \`${fn.returnType}\`${desc}`);
}
```

In `renderClassesRef`, add after the class name/description:

```typescript
if (cls.extends) {
  lines.push(`*extends \`${cls.extends}\`*`);
}
if (cls.implements && cls.implements.length > 0) {
  lines.push(`*implements ${cls.implements.map((i) => `\`${i}\``).join(', ')}*`);
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/renderer.ts packages/typedoc/src/extractor.ts packages/core/test/
git commit -m "feat(core): extract @returns descriptions and class inheritance"
```

---

## Phase 3: Test Coverage

### Task 9: Add llms-txt.ts tests

This module is at 1.88% coverage. It renders two output formats (summary + full) with section ordering, truncation, and multi-skill support.

**Files:**

- Create: `packages/core/test/llms-txt.test.ts`

- [ ] **Step 1: Write comprehensive tests for llms-txt rendering**

```typescript
import { describe, it, expect } from 'vitest';
import { renderLlmsTxt } from '../src/llms-txt.js';
import type { ExtractedSkill } from '../src/types.js';

function makeSkill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: 'test-lib',
    description: 'A test library',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    ...overrides
  };
}

describe('renderLlmsTxt', () => {
  it('renders project name and description in summary', () => {
    const result = renderLlmsTxt([makeSkill()], {
      projectName: 'my-project',
      projectDescription: 'Does things'
    });
    expect(result.summary).toContain('# my-project');
    expect(result.summary).toContain('> Does things');
  });

  it('renders functions in summary API section', () => {
    const result = renderLlmsTxt(
      [
        makeSkill({
          functions: [
            {
              name: 'parse',
              description: 'Parse input',
              signature: '',
              parameters: [],
              returnType: 'void',
              examples: [],
              tags: {}
            }
          ]
        })
      ],
      { projectName: 'test', projectDescription: '' }
    );
    expect(result.summary).toContain('### API');
    expect(result.summary).toContain('`parse`');
    expect(result.summary).toContain('Parse input');
  });

  it('renders types in Optional section', () => {
    const result = renderLlmsTxt(
      [
        makeSkill({
          types: [{ name: 'Config', description: 'Configuration', definition: '' }]
        })
      ],
      { projectName: 'test', projectDescription: '' }
    );
    expect(result.summary).toContain('## Optional');
    expect(result.summary).toContain('### Types');
    expect(result.summary).toContain('`Config`');
  });

  it('renders full API with signatures and parameters', () => {
    const result = renderLlmsTxt(
      [
        makeSkill({
          functions: [
            {
              name: 'connect',
              description: 'Open connection',
              signature: 'connect(url: string): Connection',
              parameters: [
                { name: 'url', type: 'string', description: 'The URL', optional: false }
              ],
              returnType: 'Connection',
              examples: [],
              tags: {}
            }
          ]
        })
      ],
      { projectName: 'test', projectDescription: '' }
    );
    expect(result.full).toContain('### connect');
    expect(result.full).toContain('connect(url: string): Connection');
    expect(result.full).toContain('`url: string`');
    expect(result.full).toContain('**Returns:** `Connection`');
  });

  it('handles multiple skills with separators', () => {
    const result = renderLlmsTxt([makeSkill({ name: 'pkg-a' }), makeSkill({ name: 'pkg-b' })], {
      projectName: 'mono',
      projectDescription: ''
    });
    expect(result.full).toContain('## pkg-a');
    expect(result.full).toContain('## pkg-b');
    expect(result.full).toContain('---');
  });

  it('truncates long descriptions in summary', () => {
    const longDesc = 'A'.repeat(200);
    const result = renderLlmsTxt(
      [
        makeSkill({
          functions: [
            {
              name: 'fn',
              description: longDesc,
              signature: '',
              parameters: [],
              returnType: 'void',
              examples: [],
              tags: {}
            }
          ]
        })
      ],
      { projectName: 'test', projectDescription: '' }
    );
    // Summary description should be truncated to ~150 chars
    const fnLine = result.summary.split('\n').find((l) => l.includes('`fn`'));
    expect(fnLine!.length).toBeLessThan(200);
  });

  it('returns token estimates', () => {
    const result = renderLlmsTxt([makeSkill()], {
      projectName: 'test',
      projectDescription: 'desc'
    });
    expect(result.summaryTokens).toBeGreaterThan(0);
    expect(result.fullTokens).toBeGreaterThan(0);
  });

  it('renders classes in full output with constructor and methods', () => {
    const result = renderLlmsTxt(
      [
        makeSkill({
          classes: [
            {
              name: 'Client',
              description: 'HTTP client',
              constructorSignature: 'constructor(url: string)',
              properties: [
                { name: 'url', type: 'string', description: 'Base URL', optional: false }
              ],
              methods: [
                {
                  name: 'get',
                  description: 'GET request',
                  signature: 'get(path: string): Response',
                  parameters: [],
                  returnType: 'Response',
                  examples: [],
                  tags: {}
                }
              ],
              examples: []
            }
          ]
        })
      ],
      { projectName: 'test', projectDescription: '' }
    );
    expect(result.full).toContain('### Client');
    expect(result.full).toContain('constructor(url: string)');
    expect(result.full).toContain('`url: string`');
    expect(result.full).toContain('get(path: string): Response');
  });

  it('renders enums in full output', () => {
    const result = renderLlmsTxt(
      [
        makeSkill({
          enums: [
            {
              name: 'Status',
              description: 'Request status',
              members: [
                { name: 'Ok', value: '"ok"', description: 'Success' },
                { name: 'Error', value: '"error"', description: 'Failure' }
              ]
            }
          ]
        })
      ],
      { projectName: 'test', projectDescription: '' }
    );
    expect(result.full).toContain('### Status');
    expect(result.full).toContain('`Ok`');
    expect(result.full).toContain('`Error`');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test -- packages/core/test/llms-txt.test.ts
```

Expected: All pass (these test existing behavior, not new features).

- [ ] **Step 3: Run coverage to verify improvement**

```bash
pnpm test:coverage
```

Expected: `llms-txt.ts` coverage should jump from 1.88% to 80%+.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/llms-txt.test.ts
git commit -m "test(core): add comprehensive llms-txt rendering tests"
```

---

### Task 10: Add extractor unit tests

Currently 0% coverage. These tests need to construct TypeDoc-like reflection objects. We test the pure extraction functions by mocking the reflection tree shape.

**Files:**

- Create: `packages/typedoc/test/extractor.test.ts`

- [ ] **Step 1: Write extractor tests with mock reflections**

````typescript
import { describe, it, expect, vi } from 'vitest';
import { extractSkills } from '../src/extractor.js';
import { ReflectionKind } from 'typedoc';

// Minimal mock of TypeDoc's reflection types — just enough for extractSkills
function mockProject(children: any[] = [], documents?: any[]) {
  return {
    name: 'test-project',
    comment: undefined,
    children,
    documents
  } as any;
}

function mockDeclaration(name: string, kind: ReflectionKind, overrides: any = {}) {
  return {
    name,
    kind,
    comment: overrides.comment ?? undefined,
    children: overrides.children ?? undefined,
    signatures: overrides.signatures ?? undefined,
    sources: overrides.sources ?? undefined,
    type: overrides.type ?? undefined,
    flags: overrides.flags ?? {},
    extendedTypes: overrides.extendedTypes ?? undefined,
    implementedTypes: overrides.implementedTypes ?? undefined,
    ...overrides
  };
}

function mockSignature(params: any[] = [], returnType = 'void', comment?: any) {
  return {
    parameters: params,
    type: { toString: () => returnType },
    comment,
    typeParameters: undefined
  };
}

function mockParam(name: string, type: string, optional = false) {
  return {
    name,
    type: { toString: () => type },
    flags: { isOptional: optional },
    comment: undefined,
    defaultValue: undefined
  };
}

describe('extractSkills', () => {
  it('extracts functions from project root', () => {
    const fn = mockDeclaration('doStuff', ReflectionKind.Function, {
      signatures: [mockSignature([mockParam('input', 'string')], 'boolean')]
    });

    const [skill] = extractSkills(mockProject([fn]), false);
    expect(skill.functions).toHaveLength(1);
    expect(skill.functions[0].name).toBe('doStuff');
    expect(skill.functions[0].returnType).toBe('boolean');
    expect(skill.functions[0].parameters[0].name).toBe('input');
  });

  it('extracts classes with methods and properties', () => {
    const cls = mockDeclaration('Parser', ReflectionKind.Class, {
      children: [
        mockDeclaration('constructor', ReflectionKind.Constructor, {
          signatures: [mockSignature()]
        }),
        mockDeclaration('parse', ReflectionKind.Method, {
          flags: {},
          signatures: [mockSignature([mockParam('input', 'string')], 'AST')]
        }),
        mockDeclaration('options', ReflectionKind.Property, {
          type: { toString: () => 'Options' },
          flags: { isOptional: true }
        })
      ]
    });

    const [skill] = extractSkills(mockProject([cls]), false);
    expect(skill.classes).toHaveLength(1);
    expect(skill.classes[0].name).toBe('Parser');
    expect(skill.classes[0].methods).toHaveLength(1);
    expect(skill.classes[0].properties).toHaveLength(1);
    expect(skill.classes[0].properties[0].optional).toBe(true);
  });

  it('extracts interfaces as types', () => {
    const iface = mockDeclaration('Config', ReflectionKind.Interface, {
      comment: { summary: [{ text: 'Configuration options' }], getTags: () => [], blockTags: [] }
    });

    const [skill] = extractSkills(mockProject([iface]), false);
    expect(skill.types).toHaveLength(1);
    expect(skill.types[0].name).toBe('Config');
    expect(skill.types[0].description).toBe('Configuration options');
  });

  it('extracts enums with members', () => {
    const enumDecl = mockDeclaration('LogLevel', ReflectionKind.Enum, {
      children: [
        mockDeclaration('Debug', ReflectionKind.EnumMember, {
          type: { toString: () => '0' }
        }),
        mockDeclaration('Info', ReflectionKind.EnumMember, {
          type: { toString: () => '1' }
        })
      ]
    });

    const [skill] = extractSkills(mockProject([enumDecl]), false);
    expect(skill.enums).toHaveLength(1);
    expect(skill.enums[0].members).toHaveLength(2);
    expect(skill.enums[0].members[0].name).toBe('Debug');
  });

  it('skips private class members', () => {
    const cls = mockDeclaration('Foo', ReflectionKind.Class, {
      children: [
        mockDeclaration('publicMethod', ReflectionKind.Method, {
          flags: {},
          signatures: [mockSignature()]
        }),
        mockDeclaration('privateMethod', ReflectionKind.Method, {
          flags: { isPrivate: true },
          signatures: [mockSignature()]
        })
      ]
    });

    const [skill] = extractSkills(mockProject([cls]), false);
    expect(skill.classes[0].methods).toHaveLength(1);
    expect(skill.classes[0].methods[0].name).toBe('publicMethod');
  });

  it('uses package metadata when provided', () => {
    const [skill] = extractSkills(mockProject([]), false, {
      name: 'my-lib',
      keywords: ['parser', 'ast'],
      repository: 'https://github.com/me/my-lib',
      author: 'Me'
    });

    expect(skill.name).toBe('my-lib');
    expect(skill.keywords).toEqual(['parser', 'ast']);
    expect(skill.repository).toBe('https://github.com/me/my-lib');
    expect(skill.author).toBe('Me');
  });

  it('handles perPackage grouping with modules', () => {
    const mod1 = mockDeclaration('src/a', ReflectionKind.Module, {
      children: [
        mockDeclaration('fnA', ReflectionKind.Function, {
          signatures: [mockSignature()]
        })
      ]
    });
    const mod2 = mockDeclaration('src/b', ReflectionKind.Module, {
      children: [
        mockDeclaration('fnB', ReflectionKind.Function, {
          signatures: [mockSignature()]
        })
      ]
    });

    // Without per-package resolution, modules get grouped by name
    const skills = extractSkills(mockProject([mod1, mod2]), true);
    // Each module becomes its own skill since they can't resolve package names (no sources)
    expect(skills.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts @example tags', () => {
    const fn = mockDeclaration('render', ReflectionKind.Function, {
      signatures: [
        mockSignature([], 'string', {
          summary: [{ text: 'Render output' }],
          getTags: (tag: string) =>
            tag === '@example' ? [{ content: [{ text: '```ts\nrender()\n```' }] }] : [],
          blockTags: []
        })
      ]
    });

    const [skill] = extractSkills(mockProject([fn]), false);
    expect(skill.functions[0].examples).toHaveLength(1);
    expect(skill.functions[0].examples[0]).toContain('render()');
  });
});
````

- [ ] **Step 2: Run tests**

```bash
pnpm test -- packages/typedoc/test/extractor.test.ts
```

Note: You may need to adjust the mock shapes to match what TypeDoc actually returns. The mock structure above follows the TypeDoc API — adjust if type errors occur.

- [ ] **Step 3: Run coverage**

```bash
pnpm test:coverage
```

- [ ] **Step 4: Commit**

```bash
git add packages/typedoc/test/extractor.test.ts
git commit -m "test(typedoc): add extractor unit tests with mock reflections"
```

---

### Task 11: Regenerate dogfood output

After all the extraction and rendering improvements, regenerate the project's own skills to verify the improvements are visible.

**Files:**

- Modify: `skills/to-skills/SKILL.md` (regenerated)
- Modify: `skills/to-skills/references/*.md` (regenerated)
- Modify: `llms.txt`, `llms-full.txt` (regenerated)

- [ ] **Step 1: Build the project**

```bash
pnpm build
```

- [ ] **Step 2: Regenerate skills**

```bash
pnpm docs:md
```

Or if that doesn't trigger skills generation, run TypeDoc directly:

```bash
pnpm typedoc
```

- [ ] **Step 3: Verify improvements**

Check the generated output:

- `skills/to-skills/references/types.md` should now show interface properties
- `skills/to-skills/references/functions.md` should show @returns descriptions
- `skills/to-skills/references/variables.md` should exist (if there are exported variables)
- `llms.txt` and `llms-full.txt` should be updated

- [ ] **Step 4: Commit regenerated output**

```bash
git add skills/ llms.txt llms-full.txt
git commit -m "chore: regenerate skills with improved extraction and rendering"
```

---

## Summary of Changes

| Phase                               | Tasks      | What Changes                                                                                               |
| ----------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| **Phase 1: Housekeeping**           | Tasks 1-3  | Fix CONTRIBUTING.md (was Procxy), update AGENTS.md overview, fix README overclaim                          |
| **Phase 2: Extraction & Rendering** | Tasks 4-8  | Interface properties, variables/constants, function overloads, tag rendering, @returns + class inheritance |
| **Phase 3: Test Coverage**          | Tasks 9-10 | llms-txt.ts tests (1.88% → 80%+), extractor.ts tests (0% → 70%+)                                           |
| **Phase 4: Dogfood**                | Task 11    | Regenerate project's own skills to verify improvements                                                     |

## Not In Scope (Future Work)

These are real gaps but are larger efforts that deserve their own plans:

- **Per-item reference files** — splitting `functions.md` into one file per function (like the markdown plugin). This is an architectural change to how progressive disclosure works.
- **Source file links** — adding GitHub source line references to rendered output. Requires URL template configuration.
- **Static class members and accessors** — minor extraction gap, can be added incrementally.
- **Dual-plugin documentation** — documenting how to run both typedoc-plugin-markdown and typedoc-plugin-to-skills together (common pattern in sibling repos).
- **Plugin.ts test coverage** — requires mocking the full TypeDoc application lifecycle, which is complex.
