# Audit Engine & Bundled Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a documentation audit engine that checks extracted skills against the conventions spec (fatal/error/warning/alert), integrated into the TypeDoc plugin lifecycle, plus a bundled Claude Code skill that documents conventions and helps fix issues.

**Architecture:** The audit engine lives in `@skillit/core` as a pure function `auditSkill(skill, context) → AuditResult`. The plugin calls it after extraction and logs results via TypeDoc's logger. The README parser lives in core too (reusable). The bundled skill is a SKILL.md file in the typedoc-plugin package.

**Tech Stack:** TypeScript 5.9, TypeDoc 0.28, Vitest 4.1, pnpm workspaces

**Prerequisite:** The skill quality improvements plan (`2026-04-10-skill-quality-improvements.md`) should be completed first — it adds `sourceModule` and `packageDescription` which the audit checks reference. However, this plan can be implemented independently — audit checks that reference those fields will simply not find them until that plan lands.

---

## File Structure

| File                                                     | Responsibility                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/core/src/audit.ts`                             | Pure audit engine — `auditSkill()` function, all check implementations                        |
| `packages/core/src/audit-types.ts`                       | `AuditResult`, `AuditIssue`, `AuditContext`, severity types                                   |
| `packages/core/src/readme-parser.ts`                     | Parse README.md into structured sections (blockquote, first paragraph, Quick Start, Features) |
| `packages/core/test/audit.test.ts`                       | Tests for all 18 checks                                                                       |
| `packages/core/test/readme-parser.test.ts`               | Tests for README parsing                                                                      |
| `packages/typedoc/src/plugin.ts`                         | Wire audit into EVENT_RESOLVE_END, add 3 new options                                          |
| `packages/typedoc-plugin/skills/to-skills-docs/SKILL.md` | Bundled Claude Code skill                                                                     |

---

### Task 1: Define audit types

**Files:**

- Create: `packages/core/src/audit-types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create audit-types.ts**

```typescript
/** Severity levels for audit checks */
export type AuditSeverity = 'fatal' | 'error' | 'warning' | 'alert';

/** A single audit issue found during checking */
export interface AuditIssue {
  /** Severity level */
  severity: AuditSeverity;
  /** Check code (e.g. "F1", "E2", "W3", "A1") */
  code: string;
  /** File path relative to project root */
  file: string;
  /** Line number (null for package.json-level issues) */
  line: number | null;
  /** Symbol name (function, class, property, etc.) */
  symbol: string;
  /** Human-readable description of the issue */
  message: string;
  /** Actionable suggestion for how to fix */
  suggestion: string;
}

/** A passing check */
export interface AuditPass {
  /** Check code */
  code: string;
  /** Human-readable description */
  message: string;
  /** Detail (e.g. the actual description found) */
  detail?: string;
}

/** Context needed by the audit engine beyond ExtractedSkill */
export interface AuditContext {
  /** package.json description field */
  packageDescription?: string;
  /** package.json keywords array */
  keywords?: string[];
  /** package.json repository URL */
  repository?: string;
  /** Parsed README sections */
  readme?: ParsedReadme;
}

/** Structured README content extracted by the parser */
export interface ParsedReadme {
  /** Blockquote after title (preferred description) */
  blockquote?: string;
  /** First prose paragraph (fallback description) */
  firstParagraph?: string;
  /** Content under ## Quick Start / ## Usage / ## Getting Started */
  quickStart?: string;
  /** Content under ## Features / ## Key Features / ## Highlights */
  features?: string;
}

/** Complete audit result */
export interface AuditResult {
  /** Package name */
  package: string;
  /** Issue counts by severity */
  summary: Record<AuditSeverity, number>;
  /** All issues found */
  issues: AuditIssue[];
  /** All passing checks */
  passing: AuditPass[];
}
```

- [ ] **Step 2: Export from index.ts**

Add to `packages/core/src/index.ts`:

```typescript
export type {
  AuditSeverity,
  AuditIssue,
  AuditPass,
  AuditContext,
  ParsedReadme,
  AuditResult
} from './audit-types.js';
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/audit-types.ts packages/core/src/index.ts
git commit -m "feat(core): add audit type definitions"
```

---

### Task 2: README parser

A pure function that extracts structured sections from a README markdown string. This is used by both the audit (to check for F3, W5) and by the renderer (to extract packageDescription, Quick Start, Features).

**Files:**

- Create: `packages/core/src/readme-parser.ts`
- Create: `packages/core/test/readme-parser.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for README parser**

```typescript
import { describe, it, expect } from 'vitest';
import { parseReadme } from '../src/readme-parser.js';

describe('parseReadme', () => {
  it('extracts blockquote after title', () => {
    const md = `# my-lib\n\n> A fast HTTP client for TypeScript.\n\nSome other text.\n`;
    const result = parseReadme(md);
    expect(result.blockquote).toBe('A fast HTTP client for TypeScript.');
  });

  it('extracts first prose paragraph when no blockquote', () => {
    const md = `# my-lib\n\nThis library does amazing things.\nIt also does other things.\n\n## Install\n`;
    const result = parseReadme(md);
    expect(result.blockquote).toBeUndefined();
    expect(result.firstParagraph).toBe(
      'This library does amazing things. It also does other things.'
    );
  });

  it('prefers blockquote and still extracts first paragraph', () => {
    const md = `# my-lib\n\n> Short description.\n\nLonger explanation of the library with more detail.\n\n## Quick Start\n`;
    const result = parseReadme(md);
    expect(result.blockquote).toBe('Short description.');
    expect(result.firstParagraph).toBe('Longer explanation of the library with more detail.');
  });

  it('skips badges and images before first paragraph', () => {
    const md = `# my-lib\n\n[![Build](https://img.shields.io/badge)]\n![Logo](logo.png)\n\nActual description here.\n\n## Install\n`;
    const result = parseReadme(md);
    expect(result.firstParagraph).toBe('Actual description here.');
  });

  it('extracts Quick Start section', () => {
    const md = `# my-lib\n\n> Desc.\n\n## Quick Start\n\n\`\`\`ts\nimport { foo } from 'my-lib';\nfoo();\n\`\`\`\n\n## API\n`;
    const result = parseReadme(md);
    expect(result.quickStart).toContain("import { foo } from 'my-lib'");
  });

  it('accepts Usage as Quick Start variant', () => {
    const md = `# my-lib\n\n> Desc.\n\n## Usage\n\n\`\`\`ts\nuse();\n\`\`\`\n`;
    const result = parseReadme(md);
    expect(result.quickStart).toContain('use()');
  });

  it('accepts Getting Started as Quick Start variant', () => {
    const md = `# my-lib\n\n> Desc.\n\n## Getting Started\n\nSome text.\n`;
    const result = parseReadme(md);
    expect(result.quickStart).toContain('Some text');
  });

  it('extracts Features section', () => {
    const md = `# my-lib\n\n> Desc.\n\n## Features\n\n- **Fast** — very fast\n- **Safe** — very safe\n\n## API\n`;
    const result = parseReadme(md);
    expect(result.features).toContain('**Fast**');
    expect(result.features).toContain('**Safe**');
  });

  it('accepts Key Features as Features variant', () => {
    const md = `# my-lib\n\n## Key Features\n\n- Feature A\n`;
    const result = parseReadme(md);
    expect(result.features).toContain('Feature A');
  });

  it('accepts Highlights as Features variant', () => {
    const md = `# my-lib\n\n## Highlights\n\n- Highlight A\n`;
    const result = parseReadme(md);
    expect(result.features).toContain('Highlight A');
  });

  it('returns empty object for empty README', () => {
    const result = parseReadme('');
    expect(result.blockquote).toBeUndefined();
    expect(result.firstParagraph).toBeUndefined();
    expect(result.quickStart).toBeUndefined();
    expect(result.features).toBeUndefined();
  });

  it('handles case-insensitive heading matching', () => {
    const md = `# my-lib\n\n## quick start\n\nContent.\n`;
    const result = parseReadme(md);
    expect(result.quickStart).toContain('Content');
  });

  it('stops first paragraph at next heading', () => {
    const md = `# my-lib\n\nFirst line.\nSecond line.\n\n## Install\n\nNot part of intro.\n`;
    const result = parseReadme(md);
    expect(result.firstParagraph).toBe('First line. Second line.');
    expect(result.firstParagraph).not.toContain('Not part');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- packages/core/test/readme-parser.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement parseReadme**

Create `packages/core/src/readme-parser.ts`:

```typescript
import type { ParsedReadme } from './audit-types.js';

/** Heading patterns for Quick Start section (case-insensitive) */
const QUICK_START_HEADINGS = ['quick start', 'usage', 'getting started'];

/** Heading patterns for Features section (case-insensitive) */
const FEATURES_HEADINGS = ['features', 'key features', 'highlights'];

/** Parse a README markdown string into structured sections for skill generation */
export function parseReadme(markdown: string): ParsedReadme {
  if (!markdown.trim()) return {};

  const lines = markdown.split('\n');
  const result: ParsedReadme = {};

  // Phase 1: Extract blockquote and first paragraph (before any ## heading)
  let pastTitle = false;
  let foundBlockquote = false;
  let paragraphLines: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip until we're past the # title
    if (!pastTitle) {
      if (trimmed.startsWith('# ')) {
        pastTitle = true;
      }
      continue;
    }

    // Stop at first ## heading
    if (trimmed.match(/^##\s/)) break;

    // Blockquote detection
    if (!foundBlockquote && trimmed.startsWith('> ')) {
      result.blockquote = trimmed.replace(/^>\s*/, '').trim();
      foundBlockquote = true;
      continue;
    }

    // Skip badges and images
    if (trimmed.startsWith('[![') || trimmed.startsWith('![') || trimmed.startsWith('[!')) continue;

    // First paragraph detection
    if (!inParagraph) {
      if (!trimmed) continue; // skip blank lines
      inParagraph = true;
    }

    if (inParagraph) {
      if (!trimmed) break; // end of paragraph
      paragraphLines.push(trimmed);
    }
  }

  if (paragraphLines.length > 0) {
    result.firstParagraph = paragraphLines.join(' ');
  }

  // Phase 2: Extract named sections
  result.quickStart = extractSection(lines, QUICK_START_HEADINGS);
  result.features = extractSection(lines, FEATURES_HEADINGS);

  return result;
}

/** Extract content under a ## heading matching one of the given names */
function extractSection(lines: string[], headingNames: string[]): string | undefined {
  let capturing = false;
  const contentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.match(/^##\s/)) {
      if (capturing) break; // hit next ## heading, stop

      const headingText = trimmed.replace(/^##\s+/, '').toLowerCase();
      if (headingNames.includes(headingText)) {
        capturing = true;
        continue;
      }
    }

    if (capturing) {
      contentLines.push(line);
    }
  }

  const content = contentLines.join('\n').trim();
  return content || undefined;
}
```

- [ ] **Step 4: Export from index.ts**

Add to `packages/core/src/index.ts`:

```typescript
export { parseReadme } from './readme-parser.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/readme-parser.ts packages/core/test/readme-parser.test.ts packages/core/src/index.ts
git commit -m "feat(core): add README parser for structured section extraction"
```

---

### Task 3: Audit engine — fatal checks (F1-F4)

The audit engine is a pure function that takes an `ExtractedSkill` + `AuditContext` and returns an `AuditResult`. We build it incrementally — fatal checks first.

**Files:**

- Create: `packages/core/src/audit.ts`
- Create: `packages/core/test/audit.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for fatal checks**

```typescript
import { describe, it, expect } from 'vitest';
import { auditSkill } from '../src/audit.js';
import type { ExtractedSkill, AuditContext } from '../src/index.js';

function makeSkill(overrides: Partial<ExtractedSkill> = {}): ExtractedSkill {
  return {
    name: 'test-lib',
    description: '',
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    ...overrides
  };
}

function makeContext(overrides: Partial<AuditContext> = {}): AuditContext {
  return {
    packageDescription: 'A test library for testing',
    keywords: ['testing', 'mock', 'assert', 'spy', 'fixture'],
    repository: 'https://github.com/test/test',
    readme: {
      blockquote: 'A test library.',
      firstParagraph: 'Extended description.'
    },
    ...overrides
  };
}

describe('auditSkill — fatal checks', () => {
  it('F1: flags missing package.json description', () => {
    const result = auditSkill(makeSkill(), makeContext({ packageDescription: undefined }));
    const f1 = result.issues.find((i) => i.code === 'F1');
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe('fatal');
  });

  it('F1: flags too-short description', () => {
    const result = auditSkill(makeSkill(), makeContext({ packageDescription: 'A lib' }));
    const f1 = result.issues.find((i) => i.code === 'F1');
    expect(f1).toBeDefined();
  });

  it('F1: passes for good description', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({
        packageDescription: 'Generate AI agent skills from TypeScript API documentation'
      })
    );
    const f1 = result.issues.find((i) => i.code === 'F1');
    expect(f1).toBeUndefined();
    expect(result.passing.find((p) => p.code === 'F1')).toBeDefined();
  });

  it('F2: flags fewer than 5 keywords', () => {
    const result = auditSkill(makeSkill(), makeContext({ keywords: ['typescript', 'lib'] }));
    const f2 = result.issues.find((i) => i.code === 'F2');
    expect(f2).toBeDefined();
    expect(f2!.severity).toBe('fatal');
  });

  it('F2: flags keywords that are all generic', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ keywords: ['typescript', 'javascript', 'node', 'npm', 'library'] })
    );
    const f2 = result.issues.find((i) => i.code === 'F2');
    expect(f2).toBeDefined();
  });

  it('F2: passes for 5+ domain-specific keywords', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ keywords: ['proxy', 'ipc', 'child-process', 'worker', 'rpc'] })
    );
    const f2 = result.issues.find((i) => i.code === 'F2');
    expect(f2).toBeUndefined();
  });

  it('F3: flags missing README description', () => {
    const result = auditSkill(makeSkill(), makeContext({ readme: {} }));
    const f3 = result.issues.find((i) => i.code === 'F3');
    expect(f3).toBeDefined();
    expect(f3!.severity).toBe('fatal');
  });

  it('F3: passes with blockquote', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ readme: { blockquote: 'A library for doing things well.' } })
    );
    const f3 = result.issues.find((i) => i.code === 'F3');
    expect(f3).toBeUndefined();
  });

  it('F3: passes with first paragraph fallback', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ readme: { firstParagraph: 'This library solves a specific problem.' } })
    );
    const f3 = result.issues.find((i) => i.code === 'F3');
    expect(f3).toBeUndefined();
  });

  it('F4: flags exported functions with no description', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'doStuff',
          description: '',
          signature: 'doStuff(): void',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        },
        {
          name: 'doMore',
          description: 'Does more stuff',
          signature: 'doMore(): void',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const f4issues = result.issues.filter((i) => i.code === 'F4');
    expect(f4issues).toHaveLength(1);
    expect(f4issues[0].symbol).toBe('doStuff');
    expect(f4issues[0].severity).toBe('fatal');
  });

  it('F4: checks classes, types, enums, variables too', () => {
    const skill = makeSkill({
      classes: [
        {
          name: 'MyClass',
          description: '',
          constructorSignature: '',
          methods: [],
          properties: [],
          examples: []
        }
      ],
      types: [{ name: 'MyType', description: '', definition: '' }],
      enums: [{ name: 'MyEnum', description: '', members: [] }],
      variables: [{ name: 'MY_CONST', description: '', type: 'string', isConst: true }]
    });
    const result = auditSkill(skill, makeContext());
    const f4issues = result.issues.filter((i) => i.code === 'F4');
    expect(f4issues).toHaveLength(4);
  });

  it('summary counts are correct', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ packageDescription: undefined, keywords: [], readme: undefined })
    );
    expect(result.summary.fatal).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- packages/core/test/audit.test.ts
```

- [ ] **Step 3: Implement audit engine with fatal checks**

Create `packages/core/src/audit.ts`:

```typescript
import type { ExtractedSkill } from './types.js';
import type {
  AuditContext,
  AuditIssue,
  AuditPass,
  AuditResult,
  AuditSeverity
} from './audit-types.js';

/** Generic keywords filtered from skill triggers */
const GENERIC_KEYWORDS = new Set([
  'typescript',
  'javascript',
  'node',
  'nodejs',
  'npm',
  'library',
  'package',
  'utils',
  'utility',
  'helper',
  'tool',
  'framework'
]);

/** Run all audit checks against an extracted skill */
export function auditSkill(skill: ExtractedSkill, context: AuditContext): AuditResult {
  const issues: AuditIssue[] = [];
  const passing: AuditPass[] = [];

  // Fatal checks
  checkF1(context, issues, passing);
  checkF2(context, issues, passing);
  checkF3(context, issues, passing);
  checkF4(skill, issues, passing);

  const summary: Record<AuditSeverity, number> = { fatal: 0, error: 0, warning: 0, alert: 0 };
  for (const issue of issues) {
    summary[issue.severity]++;
  }

  return { package: skill.name, summary, issues, passing };
}

function checkF1(context: AuditContext, issues: AuditIssue[], passing: AuditPass[]): void {
  const desc = context.packageDescription;
  if (!desc || desc.trim().length <= 10) {
    issues.push({
      severity: 'fatal',
      code: 'F1',
      file: 'package.json',
      line: null,
      symbol: 'description',
      message: desc
        ? `Description too short (${desc.length} chars, need >10)`
        : 'Missing package.json description',
      suggestion:
        'Add a one-sentence description answering "what does this library do?" e.g. "Generate AI agent skills from TypeScript API documentation"'
    });
  } else {
    passing.push({ code: 'F1', message: 'package.json description', detail: desc });
  }
}

function checkF2(context: AuditContext, issues: AuditIssue[], passing: AuditPass[]): void {
  const keywords = context.keywords ?? [];
  const domainSpecific = keywords.filter((k) => !GENERIC_KEYWORDS.has(k.toLowerCase()));

  if (keywords.length < 5) {
    issues.push({
      severity: 'fatal',
      code: 'F2',
      file: 'package.json',
      line: null,
      symbol: 'keywords',
      message: `Only ${keywords.length} keywords, need 5+`,
      suggestion:
        'Add domain-specific keywords describing what problems this solves, not what language it uses'
    });
  } else if (domainSpecific.length < 3) {
    issues.push({
      severity: 'fatal',
      code: 'F2',
      file: 'package.json',
      line: null,
      symbol: 'keywords',
      message: `Only ${domainSpecific.length} domain-specific keywords (${domainSpecific.join(', ')}), need 3+. Generic keywords filtered: ${keywords.filter((k) => GENERIC_KEYWORDS.has(k.toLowerCase())).join(', ')}`,
      suggestion:
        'Replace generic keywords (typescript, library, utils) with terms that describe what problems this library solves'
    });
  } else {
    passing.push({
      code: 'F2',
      message: `${domainSpecific.length} domain-specific keywords`,
      detail: domainSpecific.join(', ')
    });
  }
}

function checkF3(context: AuditContext, issues: AuditIssue[], passing: AuditPass[]): void {
  const readme = context.readme;
  const desc = readme?.blockquote || readme?.firstParagraph;

  if (!desc || desc.length < 20) {
    issues.push({
      severity: 'fatal',
      code: 'F3',
      file: 'README.md',
      line: null,
      symbol: 'description',
      message: desc
        ? `README description too short (${desc.length} chars)`
        : 'No description found in README (need blockquote or first paragraph before ## heading)',
      suggestion:
        'Add a > blockquote after the # title with a one-sentence problem statement, e.g. "> Map process.env to strongly-typed nested config objects."'
    });
  } else {
    const source = readme?.blockquote ? 'blockquote' : 'first paragraph';
    passing.push({ code: 'F3', message: `README ${source} description`, detail: desc });
  }
}

function checkF4(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const allExports = [
    ...skill.functions.map((f) => ({
      name: f.name,
      description: f.description,
      kind: 'function',
      sourceModule: (f as any).sourceModule
    })),
    ...skill.classes.map((c) => ({
      name: c.name,
      description: c.description,
      kind: 'class',
      sourceModule: undefined
    })),
    ...skill.types.map((t) => ({
      name: t.name,
      description: t.description,
      kind: 'type',
      sourceModule: undefined
    })),
    ...skill.enums.map((e) => ({
      name: e.name,
      description: e.description,
      kind: 'enum',
      sourceModule: undefined
    })),
    ...(skill.variables ?? []).map((v) => ({
      name: v.name,
      description: v.description,
      kind: 'variable',
      sourceModule: undefined
    }))
  ];

  const undocumented = allExports.filter((e) => !e.description);

  if (undocumented.length > 0) {
    for (const item of undocumented) {
      issues.push({
        severity: 'fatal',
        code: 'F4',
        file: item.sourceModule ? `src/${item.sourceModule}.ts` : 'src/',
        line: null,
        symbol: item.name,
        message: `${item.kind} ${item.name}() — no JSDoc summary`,
        suggestion: `/** <one-sentence description of what ${item.name} does> */`
      });
    }
  }

  const documented = allExports.length - undocumented.length;
  if (documented > 0) {
    passing.push({
      code: 'F4',
      message: `${documented}/${allExports.length} exports have JSDoc summaries`
    });
  }
}
```

- [ ] **Step 4: Export from index.ts**

```typescript
export { auditSkill } from './audit.js';
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/audit.ts packages/core/test/audit.test.ts packages/core/src/index.ts
git commit -m "feat(core): audit engine with fatal checks (F1-F4)"
```

---

### Task 4: Audit engine — error checks (E1-E5)

**Files:**

- Modify: `packages/core/src/audit.ts`
- Modify: `packages/core/test/audit.test.ts`

- [ ] **Step 1: Write failing tests for error checks**

````typescript
describe('auditSkill — error checks', () => {
  it('E1: flags parameters with empty descriptions', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'render',
          description: 'Renders stuff',
          signature: 'render(opts: Options): void',
          parameters: [{ name: 'opts', type: 'Options', description: '', optional: false }],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const e1 = result.issues.find((i) => i.code === 'E1');
    expect(e1).toBeDefined();
    expect(e1!.severity).toBe('error');
    expect(e1!.symbol).toBe('render.opts');
  });

  it('E1: flags parameters that restate the name', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'render',
          description: 'Renders stuff',
          signature: 'render(options: Options): void',
          parameters: [
            { name: 'options', type: 'Options', description: 'The options', optional: false }
          ],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const e1 = result.issues.find((i) => i.code === 'E1');
    expect(e1).toBeDefined();
  });

  it('E2: flags non-void functions without @returns', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'calculate',
          description: 'Calculates something',
          signature: 'calculate(): number',
          parameters: [],
          returnType: 'number',
          examples: [],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const e2 = result.issues.find((i) => i.code === 'E2');
    expect(e2).toBeDefined();
    expect(e2!.severity).toBe('error');
  });

  it('E2: skips void functions', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'init',
          description: 'Initializes',
          signature: 'init(): void',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const e2 = result.issues.find((i) => i.code === 'E2');
    expect(e2).toBeUndefined();
  });

  it('E3: flags interface properties without descriptions', () => {
    const skill = makeSkill({
      types: [
        {
          name: 'Config',
          description: 'Configuration',
          definition: '',
          properties: [
            { name: 'host', type: 'string', description: 'Server hostname', optional: false },
            { name: 'port', type: 'number', description: '', optional: false }
          ]
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const e3 = result.issues.filter((i) => i.code === 'E3');
    expect(e3).toHaveLength(1);
    expect(e3[0].symbol).toBe('Config.port');
  });

  it('E4: flags no examples anywhere', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'fn',
          description: 'Does stuff',
          signature: 'fn(): void',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const e4 = result.issues.find((i) => i.code === 'E4');
    expect(e4).toBeDefined();
    expect(e4!.severity).toBe('error');
  });

  it('E4: passes when skill has module-level examples', () => {
    const skill = makeSkill({ examples: ['```ts\nimport ...\n```'] });
    const result = auditSkill(skill, makeContext());
    const e4 = result.issues.find((i) => i.code === 'E4');
    expect(e4).toBeUndefined();
  });

  it('E5: flags missing repository', () => {
    const result = auditSkill(makeSkill(), makeContext({ repository: undefined }));
    const e5 = result.issues.find((i) => i.code === 'E5');
    expect(e5).toBeDefined();
    expect(e5!.severity).toBe('error');
  });
});
````

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement error checks in audit.ts**

Add to the `auditSkill` function, after fatal checks:

```typescript
// Error checks
checkE1(skill, issues, passing);
checkE2(skill, issues, passing);
checkE3(skill, issues, passing);
checkE4(skill, issues, passing);
checkE5(context, issues, passing);
```

Then implement each:

```typescript
function checkE1(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let total = 0;
  let undocumented = 0;

  for (const fn of skill.functions) {
    for (const param of fn.parameters) {
      total++;
      const desc = param.description.trim().toLowerCase();
      const name = param.name.toLowerCase();
      const type = param.type.toLowerCase();

      // Empty, or trivially restates name/type
      const isTrivial =
        !desc || desc === name || desc === `the ${name}` || desc === type || desc === `the ${type}`;

      if (isTrivial) {
        undocumented++;
        issues.push({
          severity: 'error',
          code: 'E1',
          file: (fn as any).sourceModule ? `src/${(fn as any).sourceModule}.ts` : 'src/',
          line: null,
          symbol: `${fn.name}.${param.name}`,
          message: !desc
            ? `@param ${param.name} — missing description`
            : `@param ${param.name} — restates name/type ("${param.description}")`,
          suggestion: `@param ${param.name} <describe what this parameter controls, not what type it is>`
        });
      }
    }
  }

  if (total > 0 && undocumented === 0) {
    passing.push({ code: 'E1', message: `${total}/${total} parameters have @param descriptions` });
  }
}

function checkE2(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let total = 0;
  let missing = 0;

  for (const fn of skill.functions) {
    if (fn.returnType && fn.returnType !== 'void') {
      total++;
      if (!fn.returnsDescription) {
        missing++;
        issues.push({
          severity: 'error',
          code: 'E2',
          file: (fn as any).sourceModule ? `src/${(fn as any).sourceModule}.ts` : 'src/',
          line: null,
          symbol: fn.name,
          message: `${fn.name}() — @returns missing (returns ${fn.returnType})`,
          suggestion: `@returns <describe what the ${fn.returnType} return value represents>`
        });
      }
    }
  }

  if (total > 0 && missing === 0) {
    passing.push({ code: 'E2', message: `${total}/${total} non-void functions have @returns` });
  }
}

function checkE3(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  let total = 0;
  let missing = 0;

  for (const t of skill.types) {
    if (!t.properties) continue;
    for (const prop of t.properties) {
      total++;
      if (!prop.description) {
        missing++;
        issues.push({
          severity: 'error',
          code: 'E3',
          file: (t as any).sourceModule ? `src/${(t as any).sourceModule}.ts` : 'src/',
          line: null,
          symbol: `${t.name}.${prop.name}`,
          message: `${t.name}.${prop.name} — property JSDoc missing`,
          suggestion: `/** <describe what ${prop.name} controls> */`
        });
      }
    }
  }

  if (total > 0 && missing === 0) {
    passing.push({ code: 'E3', message: `${total}/${total} interface properties have JSDoc` });
  }
}

function checkE4(skill: ExtractedSkill, issues: AuditIssue[], passing: AuditPass[]): void {
  const hasModuleExamples = skill.examples.length > 0;
  const hasFunctionExamples = skill.functions.some((f) => f.examples.length > 0);

  if (!hasModuleExamples && !hasFunctionExamples) {
    issues.push({
      severity: 'error',
      code: 'E4',
      file: 'src/',
      line: null,
      symbol: '',
      message: 'No @example tags found on any export',
      suggestion: 'Add @example to at least one primary function showing a realistic usage pattern'
    });
  } else {
    passing.push({ code: 'E4', message: '1+ function has @example' });
  }
}

function checkE5(context: AuditContext, issues: AuditIssue[], passing: AuditPass[]): void {
  if (!context.repository) {
    issues.push({
      severity: 'error',
      code: 'E5',
      file: 'package.json',
      line: null,
      symbol: 'repository',
      message: 'Missing package.json repository',
      suggestion: 'Add "repository": "https://github.com/<org>/<repo>" to package.json'
    });
  } else {
    passing.push({ code: 'E5', message: 'package.json repository' });
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/audit.ts packages/core/test/audit.test.ts
git commit -m "feat(core): audit engine error checks (E1-E5)"
```

---

### Task 5: Audit engine — warning and alert checks (W1-W5, A1-A4)

**Files:**

- Modify: `packages/core/src/audit.ts`
- Modify: `packages/core/test/audit.test.ts`

- [ ] **Step 1: Write failing tests for warning and alert checks**

````typescript
describe('auditSkill — warning checks', () => {
  it('W1: flags missing @packageDocumentation', () => {
    const skill = makeSkill({ description: '' });
    const result = auditSkill(skill, makeContext());
    const w1 = result.issues.find((i) => i.code === 'W1');
    expect(w1).toBeDefined();
    expect(w1!.severity).toBe('warning');
  });

  it('W1: passes for long module description', () => {
    const skill = makeSkill({
      description:
        'This is a comprehensive module that provides rendering capabilities for SKILL.md files with progressive disclosure support.'
    });
    const result = auditSkill(skill, makeContext());
    const w1 = result.issues.find((i) => i.code === 'W1');
    expect(w1).toBeUndefined();
  });

  it('W2: flags functions without @example', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'fn1',
          description: 'Does stuff',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        },
        {
          name: 'fn2',
          description: 'Does more',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: ['```ts\nfn2()\n```'],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const w2 = result.issues.filter((i) => i.code === 'W2');
    expect(w2).toHaveLength(1);
    expect(w2[0].symbol).toBe('fn1');
  });

  it('W3: flags when no tags are used at all', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'fn',
          description: 'Does stuff',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const w3 = result.issues.find((i) => i.code === 'W3');
    expect(w3).toBeDefined();
    expect(w3!.severity).toBe('warning');
  });

  it('W3: passes when at least one tag is used', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'fn',
          description: 'Does stuff',
          signature: '',
          parameters: [],
          returnType: 'void',
          examples: [],
          tags: { since: '1.0.0' }
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const w3 = result.issues.find((i) => i.code === 'W3');
    expect(w3).toBeUndefined();
  });

  it('W4: flags fewer than 10 domain-specific keywords', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ keywords: ['proxy', 'ipc', 'worker', 'rpc', 'async'] })
    );
    const w4 = result.issues.find((i) => i.code === 'W4');
    expect(w4).toBeDefined();
    expect(w4!.severity).toBe('warning');
  });

  it('W5: flags missing README Features section', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ readme: { blockquote: 'Desc.', firstParagraph: 'More.' } })
    );
    const w5 = result.issues.find((i) => i.code === 'W5');
    expect(w5).toBeDefined();
  });

  it('W5: passes with Features section', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ readme: { blockquote: 'Desc.', features: '- Fast\n- Safe' } })
    );
    const w5 = result.issues.find((i) => i.code === 'W5');
    expect(w5).toBeUndefined();
  });
});

describe('auditSkill — alert checks', () => {
  it('A1: flags generic keywords', () => {
    const result = auditSkill(
      makeSkill(),
      makeContext({ keywords: ['typescript', 'proxy', 'ipc', 'worker', 'rpc'] })
    );
    const a1 = result.issues.filter((i) => i.code === 'A1');
    expect(a1).toHaveLength(1);
    expect(a1[0].severity).toBe('alert');
    expect(a1[0].symbol).toBe('typescript');
  });

  it('A2: flags @param that restates type', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'fn',
          description: 'Does stuff',
          signature: 'fn(count: number): void',
          parameters: [
            { name: 'count', type: 'number', description: 'The number', optional: false }
          ],
          returnType: 'void',
          examples: [],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const a2 = result.issues.find((i) => i.code === 'A2');
    expect(a2).toBeDefined();
    expect(a2!.severity).toBe('alert');
  });

  it('A3: flags trivial single-line examples', () => {
    const skill = makeSkill({
      functions: [
        {
          name: 'fn',
          description: 'Does stuff',
          signature: 'fn(): void',
          parameters: [],
          returnType: 'void',
          examples: ['fn()'],
          tags: {}
        }
      ]
    });
    const result = auditSkill(skill, makeContext());
    const a3 = result.issues.find((i) => i.code === 'A3');
    expect(a3).toBeDefined();
    expect(a3!.severity).toBe('alert');
  });

  it('A4: flags verbose Quick Start', () => {
    const longExample = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const result = auditSkill(
      makeSkill(),
      makeContext({
        readme: { blockquote: 'Desc.', quickStart: '```ts\n' + longExample + '\n```' }
      })
    );
    const a4 = result.issues.find((i) => i.code === 'A4');
    expect(a4).toBeDefined();
    expect(a4!.severity).toBe('alert');
  });
});
````

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement warning and alert checks**

Add to `auditSkill` function:

```typescript
// Warning checks
checkW1(skill, issues, passing);
checkW2(skill, issues, passing);
checkW3(skill, issues, passing);
checkW4(context, issues, passing);
checkW5(context, issues, passing);

// Alert checks
checkA1(context, issues, passing);
checkA2(skill, issues, passing);
checkA3(skill, issues, passing);
checkA4(context, issues, passing);
```

Then implement each function following the same pattern as F1-F4 and E1-E5. The implementations are:

- **W1**: Check `skill.description.length > 50` (module-level JSDoc from @packageDocumentation)
- **W2**: For each function, check `fn.examples.length > 0`
- **W3**: Check if any function has any non-empty tag in `fn.tags`
- **W4**: Check domain-specific keyword count >= 10
- **W5**: Check `context.readme?.features` exists
- **A1**: For each keyword in the generic list, emit alert
- **A2**: For each param where description trivially matches type name (but not empty — E1 catches empty), emit alert. Check: `desc.toLowerCase() === 'the ' + type.toLowerCase()` or similar patterns
- **A3**: For each function example that is a single line with no `import`, no `=`, no `//`, emit alert
- **A4**: Count lines in quickStart code block, emit alert if >15

Note: A2 should NOT fire if E1 already fired for the same parameter (empty description). Check that description is non-empty before applying A2 logic.

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/audit.ts packages/core/test/audit.test.ts
git commit -m "feat(core): audit engine warning (W1-W5) and alert (A1-A4) checks"
```

---

### Task 6: Audit formatting — human-readable and JSON output

**Files:**

- Create: `packages/core/src/audit-formatter.ts`
- Create: `packages/core/test/audit-formatter.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { formatAuditText, formatAuditJson } from '../src/audit-formatter.js';
import type { AuditResult } from '../src/index.js';

const mockResult: AuditResult = {
  package: '@my-org/my-lib',
  summary: { fatal: 1, error: 1, warning: 0, alert: 0 },
  issues: [
    {
      severity: 'fatal',
      code: 'F1',
      file: 'package.json',
      line: null,
      symbol: 'description',
      message: 'Missing description',
      suggestion: 'Add one'
    },
    {
      severity: 'error',
      code: 'E2',
      file: 'src/renderer.ts',
      line: 36,
      symbol: 'renderSkill',
      message: '@returns missing',
      suggestion: 'Add @returns'
    }
  ],
  passing: [{ code: 'F2', message: '5 domain-specific keywords' }]
};

describe('formatAuditText', () => {
  it('includes package name and summary counts', () => {
    const text = formatAuditText(mockResult);
    expect(text).toContain('@my-org/my-lib');
    expect(text).toContain('1 fatal');
    expect(text).toContain('1 error');
  });

  it('groups issues by severity', () => {
    const text = formatAuditText(mockResult);
    expect(text).toContain('FATAL');
    expect(text).toContain('ERROR');
    expect(text.indexOf('FATAL')).toBeLessThan(text.indexOf('ERROR'));
  });

  it('includes file:line references', () => {
    const text = formatAuditText(mockResult);
    expect(text).toContain('src/renderer.ts:36');
  });

  it('includes suggestions', () => {
    const text = formatAuditText(mockResult);
    expect(text).toContain('Add @returns');
  });

  it('includes passing checks', () => {
    const text = formatAuditText(mockResult);
    expect(text).toContain('PASSING');
    expect(text).toContain('5 domain-specific keywords');
  });
});

describe('formatAuditJson', () => {
  it('returns valid JSON string', () => {
    const json = formatAuditJson(mockResult);
    const parsed = JSON.parse(json);
    expect(parsed.package).toBe('@my-org/my-lib');
    expect(parsed.summary.fatal).toBe(1);
    expect(parsed.issues).toHaveLength(2);
    expect(parsed.passing).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement formatter**

Create `packages/core/src/audit-formatter.ts`:

```typescript
import type { AuditResult, AuditSeverity } from './audit-types.js';

const SEVERITY_ICONS: Record<AuditSeverity, string> = {
  fatal: '🔴 FATAL',
  error: '🔴 ERROR',
  warning: '🟡 WARNING',
  alert: '🔵 ALERT'
};

const SEVERITY_ORDER: AuditSeverity[] = ['fatal', 'error', 'warning', 'alert'];

/** Format audit result as human-readable text */
export function formatAuditText(result: AuditResult): string {
  const lines: string[] = [];

  // Header
  const counts = SEVERITY_ORDER.filter((s) => result.summary[s] > 0)
    .map((s) => `${result.summary[s]} ${s}`)
    .join(' · ');

  lines.push(`📊 Skill Documentation Audit: ${result.package}`);
  lines.push(`   ${counts || 'All checks passing!'}`);
  lines.push('');

  // Issues grouped by severity
  for (const severity of SEVERITY_ORDER) {
    const issues = result.issues.filter((i) => i.severity === severity);
    if (issues.length === 0) continue;

    lines.push(`${SEVERITY_ICONS[severity]} (${issues.length})`);
    lines.push('');

    for (const issue of issues) {
      const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
      lines.push(`  ${location}`);
      lines.push(`    ⚠ ${issue.message}`);
      lines.push(`      Suggestion: ${issue.suggestion}`);
      lines.push('');
    }
  }

  // Passing checks
  if (result.passing.length > 0) {
    lines.push(`✅ PASSING (${result.passing.length} checks)`);
    for (const pass of result.passing) {
      const detail = pass.detail ? ` — ${pass.detail}` : '';
      lines.push(`  ✓ ${pass.message}${detail}`);
    }
  }

  return lines.join('\n');
}

/** Format audit result as JSON string */
export function formatAuditJson(result: AuditResult): string {
  return JSON.stringify(result, null, 2);
}
```

- [ ] **Step 3: Export and run tests**

Add to index.ts:

```typescript
export { formatAuditText, formatAuditJson } from './audit-formatter.js';
```

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/audit-formatter.ts packages/core/test/audit-formatter.test.ts packages/core/src/index.ts
git commit -m "feat(core): audit result formatter (human-readable text + JSON)"
```

---

### Task 7: Wire audit into TypeDoc plugin

**Files:**

- Modify: `packages/typedoc/src/plugin.ts`

- [ ] **Step 1: Add 3 new TypeDoc options**

After the existing option declarations (line ~68), add:

```typescript
app.options.addDeclaration({
  name: 'skillsAudit',
  help: '[Skills] Run documentation audit during skill generation',
  type: ParameterType.Boolean,
  defaultValue: true
});

app.options.addDeclaration({
  name: 'skillsAuditFailOnError',
  help: '[Skills] Fail build on fatal or error severity audit issues',
  type: ParameterType.Boolean,
  defaultValue: false
});

app.options.addDeclaration({
  name: 'skillsAuditJson',
  help: "[Skills] Path to write JSON audit report (empty = don't write)",
  type: ParameterType.String,
  defaultValue: ''
});
```

- [ ] **Step 2: Add audit imports**

```typescript
import { auditSkill, formatAuditText, formatAuditJson, parseReadme } from '@skillit/core';
import type { AuditContext } from '@skillit/core';
```

- [ ] **Step 3: Wire audit into EVENT_RESOLVE_END handler**

After the skill rendering and writing block (after `writeSkills(rendered, { outDir })`), add:

```typescript
// --- Audit ---
const auditEnabled = app.options.getValue('skillsAudit') as boolean;
if (auditEnabled) {
  const readmeContent = readReadmeFile();
  const readme = readmeContent ? parseReadme(readmeContent) : undefined;

  const auditContext: AuditContext = {
    packageDescription: pkg.description,
    keywords: pkg.keywords,
    repository: normalizeRepoUrl(pkg.repository),
    readme
  };

  for (const skill of skills) {
    const auditResult = auditSkill(skill, auditContext);

    // Log results
    const text = formatAuditText(auditResult);
    for (const line of text.split('\n')) {
      if (line.includes('FATAL') || line.includes('ERROR')) {
        app.logger.warn(line);
      } else {
        app.logger.info(line);
      }
    }

    // Write JSON if requested
    const jsonPath = app.options.getValue('skillsAuditJson') as string;
    if (jsonPath) {
      const json = formatAuditJson(auditResult);
      writeFileSync(jsonPath, json, 'utf-8');
      app.logger.info(`[audit] JSON report written to ${jsonPath}`);
    }

    // Fail build if configured
    const failOnError = app.options.getValue('skillsAuditFailOnError') as boolean;
    if (failOnError && (auditResult.summary.fatal > 0 || auditResult.summary.error > 0)) {
      app.logger.error(
        `[audit] Build failed: ${auditResult.summary.fatal} fatal, ${auditResult.summary.error} error issues`
      );
    }
  }
}
```

Add the README file reader:

```typescript
function readReadmeFile(): string | undefined {
  const names = ['README.md', 'readme.md', 'Readme.md'];
  for (const name of names) {
    const readmePath = join(process.cwd(), name);
    if (existsSync(readmePath)) {
      try {
        return readFileSync(readmePath, 'utf-8');
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Build and test manually**

```bash
pnpm build
pnpm typedoc
```

Verify that audit output appears in the TypeDoc log after the `[skills]` output.

- [ ] **Step 5: Commit**

```bash
git add packages/typedoc/src/plugin.ts
git commit -m "feat(typedoc): wire audit into TypeDoc plugin lifecycle with 3 new options"
```

---

### Task 8: Bundled Claude Code skill

**Files:**

- Create: `packages/typedoc-plugin/skills/to-skills-docs/SKILL.md`

- [ ] **Step 1: Create the skill file**

````markdown
---
name: to-skills-docs
description: "Documentation conventions for generating high-quality AI agent skills from TypeScript source. Use when preparing a library for skill generation, auditing JSDoc quality, fixing audit warnings from typedoc-plugin-to-skills, or asking about documentation conventions for skills. Use this even if the user just says 'audit my docs' or 'improve my documentation for AI agents'."
---

# Documentation Conventions for Skill Generation

typedoc-plugin-to-skills generates AI agent skills (SKILL.md) from your TypeScript documentation. The quality of the generated skill depends entirely on what you write in your source docs. This guide defines the conventions that produce excellent skills.

## How It Works

When you run `pnpm typedoc`, the plugin:

1. Extracts JSDoc, README, and package.json metadata
2. Runs an audit checking your docs against these conventions
3. Generates SKILL.md + reference files from the extracted data

The audit reports issues at four severity levels: **fatal** (skill is broken), **error** (LLMs can't write correct code), **warning** (skill isn't as good as it could be), **alert** (stylistic suggestion).

Run the audit: `pnpm typedoc` (audit runs automatically)

## Fixing Audit Issues

When you see audit warnings, fix them in this order — fatals first, then errors, then warnings.

### Fatal — Fix These First

**F1: package.json description** — Add a one-sentence problem statement:

```json
{ "description": "Generate AI agent skills from TypeScript API documentation" }
```
````

Not a tagline ("Fast and lightweight") — a problem statement ("what does this DO").

**F2: package.json keywords** — Add 5+ domain-specific words:

```json
{ "keywords": ["proxy", "ipc", "child-process", "worker", "type-safe", "rpc"] }
```

Not tech-stack words (typescript, library, npm) — problem-domain words.

**F3: README description** — Add a blockquote after the title:

```markdown
# my-lib

> Map process.env to strongly-typed nested config objects with camelCase fields.

Extended explanation with more detail about capabilities.
```

**F4: JSDoc on exports** — Every exported function/class/type needs a summary:

```typescript
/** Render a single extracted skill into SKILL.md + progressive disclosure references */
export function renderSkill(skill: ExtractedSkill): RenderedSkill {
```

### Error — Fix These Next

**E1: @param descriptions** — Describe what each parameter controls:

```typescript
/** @param options Configuration for rendering — controls token budgets and output format */
```

Not: `@param options The options` (restates the name, adds nothing).

**E2: @returns on non-void functions** — Describe the return value:

```typescript
/** @returns Rendered skill with SKILL.md discovery file and on-demand reference files */
```

**E3: Interface property JSDoc** — Every property needs a comment:

```typescript
export interface Config {
  /** Maximum token budget per reference file (default: 4000) */
  maxTokens: number;
}
```

**E4: At least one @example** — Add a realistic usage example:

````typescript
/**
 * @example
 * ```typescript
 * import { renderSkills, writeSkills } from '@skillit/core';
 * const rendered = renderSkills(extracted, { maxTokens: 4000 });
 * writeSkills(rendered, { outDir: 'skills' });
 * ```
 */
````

**E5: package.json repository** — Add the repo URL.

### Warning — Polish

**W1:** Add `@packageDocumentation` to index.ts with an overview and feature list.
**W2:** Add `@example` to every exported function (not just one).
**W3:** Use `@deprecated`, `@since`, `@throws`, `@see` tags where applicable.
**W4:** Add 10+ domain-specific keywords.
**W5:** Add a `## Features` section to README.

## README Structure

The plugin extracts specific sections by heading name:

```markdown
# package-name

> One-sentence problem statement. (→ becomes SKILL.md description)

Extended explanation. (→ becomes SKILL.md body intro)

## Quick Start ← exact heading required

\`\`\`typescript ← first code block extracted
import { main } from 'pkg';
main();
\`\`\`

## Features ← exact heading required

- **Feature** — description ← becomes SKILL.md feature list
```

Accepted heading variants (case-insensitive):

- `## Quick Start` / `## Usage` / `## Getting Started`
- `## Features` / `## Key Features` / `## Highlights`

Other headings are ignored by the generator.

## Workflow

1. Run `pnpm typedoc` — see audit output
2. Fix fatals first, then errors
3. Re-run — verify issues are resolved
4. Optionally fix warnings for maximum skill quality
5. Check generated `skills/<name>/SKILL.md` — does it look useful?

````

- [ ] **Step 2: Commit**

```bash
git add packages/typedoc-plugin/skills/to-skills-docs/SKILL.md
git commit -m "feat: add bundled Claude Code skill for documentation conventions"
````

---

### Task 9: Build, test, regenerate, publish, update repos

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 2: Build**

```bash
pnpm build
```

- [ ] **Step 3: Regenerate dogfood output**

```bash
pnpm typedoc
```

Verify: audit output appears in the TypeDoc log showing the to-skills project's own doc quality.

- [ ] **Step 4: Create changeset, version, push**

```bash
cat > .changeset/audit-engine.md << 'EOF'
---
'@skillit/core': minor
'@skillit/typedoc': minor
'typedoc-plugin-to-skills': minor
---

Add documentation audit engine with 18 checks (F1-F4, E1-E5, W1-W5, A1-A4), README parser, and bundled Claude Code skill for documentation conventions
EOF

npx changeset version
git add -A
git commit -m "chore: version packages"
git push
```

CI publishes automatically.

- [ ] **Step 5: Update all 11 repos**

After CI publishes, update all repos to the new version, regenerate skills (which now includes audit output), commit and push.

---

## Summary

| Task | What                                  | Files                        |
| ---- | ------------------------------------- | ---------------------------- |
| 1    | Audit type definitions                | `audit-types.ts`, `index.ts` |
| 2    | README parser                         | `readme-parser.ts`, tests    |
| 3    | Fatal checks (F1-F4)                  | `audit.ts`, tests            |
| 4    | Error checks (E1-E5)                  | `audit.ts`, tests            |
| 5    | Warning + alert checks (W1-W5, A1-A4) | `audit.ts`, tests            |
| 6    | Audit formatter (text + JSON)         | `audit-formatter.ts`, tests  |
| 7    | Wire into TypeDoc plugin              | `plugin.ts`                  |
| 8    | Bundled Claude Code skill             | `SKILL.md`                   |
| 9    | Build, publish, update repos          | —                            |
