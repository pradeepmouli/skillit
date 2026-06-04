# Skill Quality Improvements — From API Reference to Useful Skill

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform auto-generated skills from flat API indexes into contextual, useful skill documents that help LLMs understand _what problem a library solves_ and _when to reach for it_, with exports grouped by source module.

**Architecture:** Three data-model additions (`sourceModule` on all extracted items, `packageDescription` on skills, `description` on `PackageMetadata`), then renderer rewrites for description, when-to-use, SKILL.md body, empty-description suppression, and module-grouped references. Plugin.ts reads package.json description and README intro.

**Tech Stack:** TypeScript 5.9, TypeDoc 0.28, Vitest 4.1, pnpm workspaces

---

## File Structure

| File                                        | Responsibility                         | Changes                                                                                                                                     |
| ------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/types.ts`                | Data model                             | Add `sourceModule?` to 5 extracted types, add `packageDescription?` to `ExtractedSkill`                                                     |
| `packages/typedoc/src/extractor.ts`         | TypeDoc → ExtractedSkill               | Extract `sourceModule` from declaration sources, flatten nested submodule children                                                          |
| `packages/typedoc/src/plugin.ts`            | Plugin lifecycle                       | Pass `description` from package.json into metadata, read README first paragraph                                                             |
| `packages/core/src/renderer.ts`             | ExtractedSkill → SKILL.md + references | Rewrite `buildDescription`, `renderWhenToUse`, `renderSkillMd`; add module grouping to all reference renderers; suppress empty descriptions |
| `packages/core/test/renderer.test.ts`       | Tests                                  | New tests for all renderer changes                                                                                                          |
| `packages/core/test/renderer-types.test.ts` | Tests                                  | Update fixtures with new fields                                                                                                             |

---

### Task 1: Add `sourceModule` to extracted types and extract it

Every exported item should carry the source module it came from (e.g. `"renderer"`, `"tokens"`, `"llms-txt"`). TypeDoc provides `decl.sources[0].fileName` on every declaration.

**Files:**

- Modify: `packages/core/src/types.ts`
- Modify: `packages/typedoc/src/extractor.ts`
- Test: `packages/typedoc/test/extractor.test.ts`

- [ ] **Step 1: Add `sourceModule` to all extracted item types**

In `packages/core/src/types.ts`, add to `ExtractedFunction`, `ExtractedClass`, `ExtractedType`, `ExtractedEnum`, and `ExtractedVariable`:

```typescript
/** Source module name derived from file path (e.g. "renderer", "tokens") */
sourceModule?: string;
```

- [ ] **Step 2: Add `getSourceModule` helper in extractor.ts**

```typescript
/** Derive a human-readable module name from a declaration's source file */
function getSourceModule(decl: DeclarationReflection): string | undefined {
  const src = decl.sources?.[0];
  const filePath = src?.fullFileName ?? src?.fileName;
  if (!filePath) return undefined;
  // Extract filename without extension: "src/renderer.ts" → "renderer"
  const basename = filePath
    .split('/')
    .pop()
    ?.replace(/\.[^.]+$/, '');
  // Skip index files — they're barrel re-exports, not real modules
  if (!basename || basename === 'index') return undefined;
  return basename;
}
```

- [ ] **Step 3: Wire `sourceModule` into all extraction functions**

In each `extractFunction`, `extractClass`, `extractType`, `extractEnum`, `extractVariable` — add `sourceModule: getSourceModule(decl)` to the returned object.

For `extractFunction` when called from `extractClass` (for methods), the method's source module is the class's source, so pass the parent decl's source:

```typescript
function extractFunction(
  decl: DeclarationReflection,
  parentDecl?: DeclarationReflection
): ExtractedFunction {
  // ...existing code...
  return {
    // ...existing fields...
    sourceModule: getSourceModule(parentDecl ?? decl)
  };
}
```

Update `extractClass` to pass itself as parentDecl when extracting methods:

```typescript
const methods = children
  .filter((c) => c.kind === ReflectionKind.Method && !c.flags.isPrivate)
  .map((c) => extractFunction(c, decl));
```

- [ ] **Step 4: Write test for sourceModule extraction**

Add to `packages/typedoc/test/extractor.test.ts`:

```typescript
describe('sourceModule extraction', () => {
  it('extracts sourceModule from declaration sources', () => {
    const fn = mockDecl('doStuff', ReflectionKind.Function, {
      signatures: [mockSig([], 'void')],
      sources: [{ fullFileName: '/project/src/utils.ts', fileName: 'src/utils.ts' }]
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].sourceModule).toBe('utils');
  });

  it('skips sourceModule for index files', () => {
    const fn = mockDecl('main', ReflectionKind.Function, {
      signatures: [mockSig([], 'void')],
      sources: [{ fullFileName: '/project/src/index.ts', fileName: 'src/index.ts' }]
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].sourceModule).toBeUndefined();
  });

  it('returns undefined when no sources', () => {
    const fn = mockDecl('noSrc', ReflectionKind.Function, {
      signatures: [mockSig([], 'void')]
    });
    const project = mockProject([fn]);
    const [skill] = extractSkills(project, false);
    expect(skill.functions[0].sourceModule).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/typedoc/src/extractor.ts packages/typedoc/test/extractor.test.ts
git commit -m "feat(typedoc): extract sourceModule from declaration source files"
```

---

### Task 2: Add `packageDescription` and pass it through from plugin

The plugin already reads `package.json` but only passes `name`, `keywords`, `repository`, `author`. It should also pass `description`. Additionally, read the first paragraph of README.md as a richer intro.

**Files:**

- Modify: `packages/core/src/types.ts` — add `packageDescription` to `ExtractedSkill`
- Modify: `packages/typedoc/src/extractor.ts` — add `description` to `PackageMetadata`, pass to skill
- Modify: `packages/typedoc/src/plugin.ts` — read description from package.json, read README intro

- [ ] **Step 1: Add `packageDescription` to `ExtractedSkill`**

In `types.ts`:

```typescript
export interface ExtractedSkill {
  // ...existing fields...
  /** Package description from package.json or README intro — used for SKILL.md description and body */
  packageDescription?: string;
}
```

- [ ] **Step 2: Add `description` to `PackageMetadata` in extractor.ts**

```typescript
export interface PackageMetadata {
  name?: string;
  /** Package description from package.json */
  description?: string;
  keywords?: string[];
  repository?: string;
  author?: string;
}
```

Wire it in `extractModule` and `mergeModules` — set `packageDescription: metadata?.description` in the returned `ExtractedSkill`.

- [ ] **Step 3: Update plugin.ts to pass description and read README**

In `plugin.ts`, the metadata passed to `extractSkills` should include description:

```typescript
const skills = extractSkills(project, perPackage, {
  name: pkg.name,
  description: pkg.description, // NEW
  keywords: pkg.keywords,
  repository: normalizeRepoUrl(pkg.repository),
  author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name
});
```

Also add a function to read the first paragraph of README.md:

```typescript
function readReadmeIntro(): string | undefined {
  const readmePaths = ['README.md', 'readme.md', 'Readme.md'];
  for (const name of readmePaths) {
    const readmePath = join(process.cwd(), name);
    if (existsSync(readmePath)) {
      try {
        const content = readFileSync(readmePath, 'utf-8');
        return extractFirstParagraph(content);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Extract first non-heading, non-badge paragraph from README */
function extractFirstParagraph(markdown: string): string | undefined {
  const lines = markdown.split('\n');
  let paragraph = '';
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headings, badges, empty lines at start
    if (!inParagraph) {
      if (
        !trimmed ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('[!') ||
        trimmed.startsWith('[![') ||
        trimmed.startsWith('![') ||
        trimmed.startsWith('> ')
      )
        continue;
      inParagraph = true;
    }
    if (inParagraph) {
      if (!trimmed) break; // end of paragraph
      paragraph += (paragraph ? ' ' : '') + trimmed;
    }
  }

  return paragraph || undefined;
}
```

Use the README intro as the description if package.json description is generic or missing:

```typescript
const readmeIntro = readReadmeIntro();
const description = pkg.description || readmeIntro;
```

Pass both as `description` in metadata. Store `readmeIntro` separately if it provides more context than pkg.description.

- [ ] **Step 4: Update existing tests that construct ExtractedSkill to include `packageDescription`**

Add `packageDescription: undefined` or appropriate values to test fixtures.

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/typedoc/src/extractor.ts packages/typedoc/src/plugin.ts packages/core/test/ packages/typedoc/test/
git commit -m "feat: extract packageDescription from package.json and README intro"
```

---

### Task 3: Rewrite `buildDescription` and `renderWhenToUse` for contextual output

This is the highest-impact change. The description should answer "what problem does this solve?" and the When to Use should list _contexts_, not function names.

**Files:**

- Modify: `packages/core/src/renderer.ts`
- Test: `packages/core/test/renderer.test.ts`

- [ ] **Step 1: Write failing tests for new description behavior**

```typescript
describe('buildDescription — contextual', () => {
  it('uses packageDescription as primary description', () => {
    const skill: ExtractedSkill = {
      name: 'my-lib',
      description: '',
      packageDescription: 'A fast, type-safe HTTP client for TypeScript',
      functions: [],
      classes: [],
      types: [],
      enums: [],
      variables: [],
      examples: []
    };
    const result = renderSkill(skill);
    // Description should use packageDescription, not "API reference for my-lib"
    expect(result.skill.content).toContain('A fast, type-safe HTTP client for TypeScript');
    expect(result.skill.content).not.toContain('API reference for');
  });

  it('generates problem-oriented When to Use from keywords', () => {
    const skill: ExtractedSkill = {
      name: 'my-lib',
      description: '',
      packageDescription: 'Type-safe HTTP client',
      keywords: ['http', 'fetch', 'rest', 'api-client'],
      functions: [
        {
          name: 'get',
          description: 'Send GET request',
          signature: '',
          parameters: [],
          returnType: 'Response',
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
    const content = result.skill.content;
    // Should NOT contain "Calling `get()`"
    expect(content).not.toContain('Calling `get()`');
    // Should contain contextual triggers
    expect(content).toMatch(/http|fetch|rest|api/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

- [ ] **Step 3: Rewrite `buildDescription`**

```typescript
function buildDescription(skill: ExtractedSkill): string {
  // Use packageDescription as the core — it answers "what does this do?"
  const desc = skill.packageDescription || skill.description || `API reference for ${skill.name}`;

  const parts: string[] = [desc];

  // Add keyword-based context for triggering
  if (skill.keywords && skill.keywords.length > 0) {
    const useful = skill.keywords.filter(
      (k) =>
        !['typescript', 'javascript', 'node', 'nodejs', 'npm', 'library', 'package'].includes(
          k.toLowerCase()
        )
    );
    if (useful.length > 0) {
      parts.push(`Use when working with ${useful.join(', ')}.`);
    }
  }

  return truncateDescription(parts.join(' '), DESCRIPTION_MAX);
}
```

- [ ] **Step 4: Rewrite `renderWhenToUse` for contextual triggers**

```typescript
function renderWhenToUse(skill: ExtractedSkill): string {
  const triggers: string[] = [];

  // Lead with problem-oriented triggers from keywords
  if (skill.keywords && skill.keywords.length > 0) {
    const useful = skill.keywords.filter(
      (k) =>
        !['typescript', 'javascript', 'node', 'nodejs', 'npm', 'library', 'package'].includes(
          k.toLowerCase()
        )
    );
    if (useful.length > 0) {
      triggers.push(`- Working with ${useful.join(', ')}`);
    }
  }

  // Summarize what's available by category (not by listing every name)
  const categories: string[] = [];
  if (skill.functions.length > 0) categories.push(`${skill.functions.length} functions`);
  if (skill.classes.length > 0) categories.push(`${skill.classes.length} classes`);
  if (skill.types.length > 0) categories.push(`${skill.types.length} types`);
  if (skill.enums.length > 0) categories.push(`${skill.enums.length} enums`);
  if (skill.variables && skill.variables.length > 0)
    categories.push(`${skill.variables.length} constants`);
  if (categories.length > 0) {
    triggers.push(`- API surface: ${categories.join(', ')}`);
  }

  // Add @see links if any
  for (const fn of skill.functions) {
    if (fn.tags['see']) {
      triggers.push(`- See also: ${fn.tags['see']}`);
      break;
    }
  }

  if (triggers.length === 0) return '';
  return '## When to Use\n\n' + triggers.join('\n');
}
```

- [ ] **Step 5: Update `renderSkillMd` to include packageDescription and examples**

```typescript
function renderSkillMd(skill: ExtractedSkill, skillName: string, opts: SkillRenderOptions): string {
  const sections: string[] = [];

  // Frontmatter
  const description = buildDescription(skill);
  sections.push(renderFrontmatter(skillName, description, opts.license || skill.license || ''));

  // Title
  sections.push(`# ${skill.name}`);

  // Package description (the "what does this do" intro)
  if (skill.packageDescription) {
    sections.push(skill.packageDescription);
  } else if (skill.description) {
    sections.push(skill.description);
  }

  // Quick Start example (first module-level example)
  if (opts.includeExamples && skill.examples.length > 0) {
    sections.push('## Quick Start\n\n' + skill.examples[0]);
  }

  // When to Use
  const whenToUse = renderWhenToUse(skill);
  if (whenToUse) sections.push(whenToUse);

  // Quick Reference — just the names, no details
  const quickRef = renderQuickReference(skill);
  if (quickRef) sections.push(quickRef);

  // Links
  const links = renderLinks(skill);
  if (links) sections.push(links);

  return sections.join('\n\n');
}
```

- [ ] **Step 6: Run tests**

```bash
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/renderer.ts packages/core/test/
git commit -m "feat(core): contextual descriptions, problem-oriented When to Use, Quick Start examples"
```

---

### Task 4: Suppress empty descriptions and group references by source module

Two improvements to reference files:

1. Don't render trailing `—` when description is empty
2. Group functions/classes/types/etc by their `sourceModule`

**Files:**

- Modify: `packages/core/src/renderer.ts`
- Test: `packages/core/test/renderer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('renderSkill — empty description suppression', () => {
  it('does not render trailing dash for empty parameter descriptions', () => {
    const skill: ExtractedSkill = {
      name: 'test',
      description: 'Test',
      functions: [
        {
          name: 'fn',
          description: 'Does stuff',
          signature: 'fn(x: string): void',
          parameters: [{ name: 'x', type: 'string', description: '', optional: false }],
          returnType: 'void',
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
    // Should NOT have trailing " — " with nothing after it
    expect(fnsRef!.content).not.toMatch(/— $/m);
    expect(fnsRef!.content).not.toMatch(/— \n/);
  });
});

describe('renderSkill — module grouping', () => {
  it('groups functions by sourceModule in reference file', () => {
    const skill: ExtractedSkill = {
      name: 'test',
      description: 'Test',
      functions: [
        {
          name: 'renderSkill',
          description: 'Render',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {},
          sourceModule: 'renderer'
        },
        {
          name: 'renderSkills',
          description: 'Render all',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {},
          sourceModule: 'renderer'
        },
        {
          name: 'estimateTokens',
          description: 'Estimate',
          signature: '',
          parameters: [],
          returnType: 'number',
          examples: [],
          tags: {},
          sourceModule: 'tokens'
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
    const content = fnsRef!.content;
    // Should have module headers
    expect(content).toContain('## renderer');
    expect(content).toContain('## tokens');
    // renderer functions should appear before tokens
    const rendererPos = content.indexOf('## renderer');
    const tokensPos = content.indexOf('## tokens');
    expect(rendererPos).toBeLessThan(tokensPos);
  });

  it('skips module headers when all items have no sourceModule', () => {
    const skill: ExtractedSkill = {
      name: 'test',
      description: 'Test',
      functions: [
        {
          name: 'fn1',
          description: 'A',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        },
        {
          name: 'fn2',
          description: 'B',
          signature: '',
          parameters: [],
          returnType: 'void',
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
    // No module headers when sourceModule is undefined
    expect(fnsRef!.content).not.toMatch(/^## [a-z]/m);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

- [ ] **Step 3: Fix empty description suppression**

Create a helper function and use it everywhere descriptions are rendered:

```typescript
/** Format description suffix — returns " — desc" or empty string, never trailing " — " */
function descSuffix(description: string | undefined): string {
  return description ? ` — ${description}` : '';
}
```

Replace all occurrences of patterns like:

```typescript
// Before:
lines.push(`- \`${p.name}: ${p.type}\`${opt}${def} — ${p.description || ''}`);
// After:
lines.push(`- \`${p.name}: ${p.type}\`${opt}${def}${descSuffix(p.description)}`);
```

Apply in: `renderFunctionsRef` (parameters, method descriptions), `renderClassesRef` (properties, methods), `renderTypesRef` (properties, enum members), `renderVariablesRef`.

- [ ] **Step 4: Add module grouping helper**

```typescript
/** Group items by sourceModule, preserving order. Items without sourceModule go in "(ungrouped)" */
function groupByModule<T extends { sourceModule?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.sourceModule || '';
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

/** Check if any items in the collection have a sourceModule */
function hasModuleInfo<T extends { sourceModule?: string }>(items: T[]): boolean {
  return items.some((item) => !!item.sourceModule);
}
```

- [ ] **Step 5: Rewrite `renderFunctionsRef` with module grouping**

````typescript
function renderFunctionsRef(fns: ExtractedFunction[], opts: SkillRenderOptions): string {
  const lines = ['# Functions\n'];
  const useModules = hasModuleInfo(fns);

  if (useModules) {
    const grouped = groupByModule(fns);
    for (const [moduleName, moduleFns] of grouped) {
      if (moduleName) lines.push(`## ${moduleName}\n`);
      for (const fn of moduleFns) {
        renderSingleFunction(fn, opts, lines);
      }
    }
  } else {
    for (const fn of fns) {
      renderSingleFunction(fn, opts, lines);
    }
  }

  return lines.join('\n');
}

function renderSingleFunction(
  fn: ExtractedFunction,
  opts: SkillRenderOptions,
  lines: string[]
): void {
  const heading = hasModuleInfo([fn]) ? `### \`${fn.name}\`` : `## \`${fn.name}\``;
  lines.push(heading);
  if (fn.description) lines.push(fn.description);

  if (opts.includeSignatures && fn.signature) {
    lines.push('```ts', fn.signature, '```');
  }

  if (fn.parameters.length > 0) {
    lines.push('**Parameters:**');
    for (const p of fn.parameters) {
      const opt = p.optional ? ' (optional)' : '';
      const def = p.defaultValue ? ` — default: \`${p.defaultValue}\`` : '';
      lines.push(`- \`${p.name}: ${p.type}\`${opt}${def}${descSuffix(p.description)}`);
    }
  }

  if (fn.returnType && fn.returnType !== 'void') {
    const desc = fn.returnsDescription ? ` — ${fn.returnsDescription}` : '';
    lines.push(`**Returns:** \`${fn.returnType}\`${desc}`);
  }

  if (fn.tags['deprecated']) lines.push(`> **Deprecated:** ${fn.tags['deprecated']}`);
  if (fn.tags['since']) lines.push(`**Since:** \`${fn.tags['since']}\``);
  if (fn.tags['throws']) lines.push(`**Throws:** ${fn.tags['throws']}`);
  if (fn.tags['see']) lines.push(`**See:** ${fn.tags['see']}`);

  if (opts.includeSignatures && fn.overloads && fn.overloads.length > 0) {
    lines.push('**Overloads:**');
    for (const overload of fn.overloads) {
      lines.push('```ts', overload, '```');
    }
  }

  if (opts.includeExamples && fn.examples.length > 0) {
    for (const ex of fn.examples) {
      lines.push(ex);
    }
  }

  lines.push('');
}
````

- [ ] **Step 6: Apply same module grouping to `renderClassesRef`, `renderTypesRef`, `renderVariablesRef`**

Same pattern: check `hasModuleInfo`, if true use `groupByModule` with `## moduleName` headers and `###` for items; otherwise render flat with `##` for items.

- [ ] **Step 7: Update Quick Reference to group by module too**

```typescript
function renderQuickReference(skill: ExtractedSkill): string {
  const items: string[] = [];

  // Collect all items with source modules for grouping
  const allItems = [
    ...skill.functions.map((f) => ({ name: f.name, kind: 'fn' as const, mod: f.sourceModule })),
    ...skill.classes.map((c) => ({ name: c.name, kind: 'class' as const, mod: c.sourceModule })),
    ...skill.types.map((t) => ({ name: t.name, kind: 'type' as const, mod: t.sourceModule })),
    ...skill.enums.map((e) => ({ name: e.name, kind: 'enum' as const, mod: e.sourceModule })),
    ...(skill.variables ?? []).map((v) => ({
      name: v.name,
      kind: 'var' as const,
      mod: v.sourceModule
    }))
  ];

  const hasModules = allItems.some((i) => !!i.mod);

  if (hasModules) {
    // Group by module
    const byModule = new Map<string, typeof allItems>();
    for (const item of allItems) {
      const key = item.mod || '';
      const existing = byModule.get(key);
      if (existing) existing.push(item);
      else byModule.set(key, [item]);
    }

    for (const [mod, modItems] of byModule) {
      if (mod) items.push(`**${mod}:** ${modItems.map((i) => `\`${i.name}\``).join(', ')}`);
      else items.push(modItems.map((i) => `\`${i.name}\``).join(', '));
    }
  } else {
    // Flat by kind (existing behavior)
    if (skill.functions.length > 0) {
      items.push(
        `**${skill.functions.length} functions** — ${skill.functions.map((f) => `\`${f.name}\``).join(', ')}`
      );
    }
    if (skill.classes.length > 0) {
      items.push(
        `**${skill.classes.length} classes** — ${skill.classes.map((c) => `\`${c.name}\``).join(', ')}`
      );
    }
    if (skill.types.length > 0) {
      items.push(
        `**${skill.types.length} types** — ${skill.types.map((t) => `\`${t.name}\``).join(', ')}`
      );
    }
    if (skill.enums.length > 0) {
      items.push(
        `**${skill.enums.length} enums** — ${skill.enums.map((e) => `\`${e.name}\``).join(', ')}`
      );
    }
    if (skill.variables && skill.variables.length > 0) {
      items.push(
        `**${skill.variables.length} variables** — ${skill.variables.map((v) => `\`${v.name}\``).join(', ')}`
      );
    }
  }

  if (items.length === 0) return '';
  return '## Quick Reference\n\n' + items.join('\n');
}
```

- [ ] **Step 8: Run all tests**

```bash
pnpm test
```

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/renderer.ts packages/core/test/
git commit -m "feat(core): group references by source module, suppress empty descriptions"
```

---

### Task 5: Extract nested submodule children properly

When TypeDoc creates submodules from barrel re-exports (`export * from './array'`), the children of those submodules aren't extracted — the extractor only looks at direct children of the top-level module. This task flattens nested module children, preserving their sourceModule.

**Files:**

- Modify: `packages/typedoc/src/extractor.ts`
- Test: `packages/typedoc/test/extractor.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
it('extracts children from nested submodules', () => {
  // Simulates: export * from './utils' where utils has functions
  const submod = mockDecl('utils', ReflectionKind.Module, {
    children: [
      mockDecl('helper', ReflectionKind.Function, {
        signatures: [mockSig([], 'void')],
        sources: [{ fullFileName: '/project/src/utils.ts' }]
      })
    ]
  });
  const rootMod = mockDecl('my-pkg', ReflectionKind.Module, {
    children: [
      submod,
      mockDecl('main', ReflectionKind.Function, {
        signatures: [mockSig([], 'void')],
        sources: [{ fullFileName: '/project/src/index.ts' }]
      })
    ]
  });
  const project = mockProject([rootMod]);
  const [skill] = extractSkills(project, true);
  // Both the direct child 'main' and nested submodule child 'helper' should be extracted
  expect(skill.functions.map((f) => f.name)).toContain('main');
  expect(skill.functions.map((f) => f.name)).toContain('helper');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test
```

- [ ] **Step 3: Add child flattening to `mergeModules` and `extractModule`**

Add a helper that recursively collects all non-module children:

```typescript
/** Recursively collect all exportable children, flattening nested modules */
function collectChildren(mod: DeclarationReflection): DeclarationReflection[] {
  const result: DeclarationReflection[] = [];
  for (const child of mod.children ?? []) {
    if (child.kind === ReflectionKind.Module || child.kind === ReflectionKind.Namespace) {
      // Recurse into submodules
      result.push(...collectChildren(child));
    } else {
      result.push(child);
    }
  }
  return result;
}
```

Replace `mod.children ?? []` with `collectChildren(mod)` in both `extractModule` and the loop inside `mergeModules`.

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/typedoc/src/extractor.ts packages/typedoc/test/extractor.test.ts
git commit -m "feat(typedoc): flatten nested submodule children during extraction"
```

---

### Task 6: Export `sourceModule` types, build, regenerate, publish, update repos

**Files:**

- Modify: `packages/core/src/index.ts` — ensure new fields are exported (no new types to add, just fields on existing interfaces)
- Modify: `packages/core/src/llms-txt.ts` — update to use `descSuffix` pattern for consistency

- [ ] **Step 1: Update llms-txt.ts to suppress empty descriptions**

Apply the same `descSuffix` pattern: don't render `—` when description is empty.

- [ ] **Step 2: Build**

```bash
pnpm build
```

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

- [ ] **Step 4: Regenerate dogfood output**

```bash
pnpm typedoc
```

Verify the generated output:

- `skills/to-skills/SKILL.md` should have the package description as intro
- `skills/to-skills/references/functions.md` should group by module (renderer, tokens, llms-txt, writer)
- No trailing `—` with empty descriptions

- [ ] **Step 5: Commit regenerated output**

```bash
git add skills/ llms.txt llms-full.txt
git commit -m "chore: regenerate skills with contextual descriptions and module grouping"
```

- [ ] **Step 6: Create changeset, version, push (CI publishes)**

```bash
# Create changeset
cat > .changeset/skill-quality.md << 'EOF'
---
'@skillit/core': minor
'@skillit/typedoc': minor
'typedoc-plugin-to-skills': patch
---

Improve skill quality: contextual descriptions, module-grouped references, empty description suppression
EOF

npx changeset version
git add -A
git commit -m "chore: version packages"
git push
```

- [ ] **Step 7: Wait for CI to publish, then update all 11 repos**

Same process as before: update version, regenerate skills, commit, push.

---

## Summary

| Task | What Changes                                                     | Impact                                                             |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1    | Extract `sourceModule` from declaration sources                  | Data plumbing for grouping                                         |
| 2    | Extract `packageDescription` from package.json/README            | Data plumbing for descriptions                                     |
| 3    | Rewrite `buildDescription` + `renderWhenToUse` + add Quick Start | **P0** — descriptions answer "what problem?" not "what functions?" |
| 4    | Module grouping + empty description suppression                  | **P1** — organized references, no trailing `—`                     |
| 5    | Flatten nested submodule children                                | Fix missing exports from barrel re-exports                         |
| 6    | Build, regenerate, publish, update repos                         | Ship it                                                            |

## Expected Output Comparison

**Before (to-skills SKILL.md):**

```markdown
---
name: to-skills
description: 'API reference for to-skills Use when working with renderSkills, renderSkill, writeSkills...'
---

# to-skills

## When to Use

- Calling `renderSkills()`, `renderSkill()`, `writeSkills()`...
```

**After:**

```markdown
---
name: to-skills
description: 'Generate structured AI agent skills (SKILL.md) and llms.txt from your TypeScript API documentation. Use when working with typedoc, agent skills, llms-txt.'
---

# to-skills

Generate structured AI agent skills (SKILL.md) and llms.txt from your TypeScript API documentation.

## When to Use

- Working with typedoc, agent skills, llms-txt
- API surface: 6 functions, 14 types

## Quick Reference

**renderer:** `renderSkills`, `renderSkill`
**tokens:** `estimateTokens`, `truncateToTokenBudget`
**llms-txt:** `renderLlmsTxt`
**writer:** `writeSkills`
```

**Before (references/functions.md):**

```markdown
# Functions

## `renderSkills`

...

## `renderSkill`

...

## `estimateTokens`

...
```

**After:**

```markdown
# Functions

## renderer

### `renderSkills`

...

### `renderSkill`

...

## tokens

### `estimateTokens`

...

### `truncateToTokenBudget`

...

## llms-txt

### `renderLlmsTxt`

...

## writer

### `writeSkills`

...
```
