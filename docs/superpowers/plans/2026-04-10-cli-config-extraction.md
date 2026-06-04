# CLI & Config Surface Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add config surface extraction to core (typed interfaces with `@config` tag or `*Options`/`*Config` suffix), and a new `@skillit/cli` package that extracts CLI command structure from commander/yargs via runtime introspection with `--help` fallback, correlating CLI flags to typed interface properties for JSDoc tag merging.

**Architecture:** Three layers: (1) `ExtractedConfigSurface` types + config renderer in `@skillit/core`, (2) config interface detection in `@skillit/typedoc`, (3) new `@skillit/cli` package with commander introspection, help parser, and flag-to-property correlation. A project like zod-to-form gets two skills: API from TypeDoc, CLI from `@skillit/cli`.

**Tech Stack:** TypeScript 5.9, commander 14.x, Vitest 4.1, pnpm workspaces

---

## File Structure

| File                                             | Responsibility                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `packages/core/src/config-types.ts`              | `ExtractedConfigSurface`, `ExtractedConfigOption`, `ExtractedConfigArgument` |
| `packages/core/src/config-renderer.ts`           | Render config surfaces into SKILL.md sections + references                   |
| `packages/core/src/types.ts`                     | Add `configSurfaces?: ExtractedConfigSurface[]` to `ExtractedSkill`          |
| `packages/core/src/renderer.ts`                  | Wire config renderer into `renderSkillMd` and `renderSkill`                  |
| `packages/core/test/config-renderer.test.ts`     | Tests for config rendering                                                   |
| `packages/typedoc/src/extractor.ts`              | Detect `@config` tag / `*Options` suffix, extract as config surfaces         |
| `packages/typedoc/test/extractor.test.ts`        | Tests for config interface detection                                         |
| `packages/cli/` (NEW package)                    | Entire new package                                                           |
| `packages/cli/src/index.ts`                      | Public API: `extractCliSkill()`                                              |
| `packages/cli/src/introspect-commander.ts`       | Commander runtime introspection                                              |
| `packages/cli/src/help-parser.ts`                | `--help` output parser                                                       |
| `packages/cli/src/correlator.ts`                 | Flag ↔ interface property matching                                           |
| `packages/cli/test/introspect-commander.test.ts` | Tests with real commander programs                                           |
| `packages/cli/test/help-parser.test.ts`          | Tests for help text parsing                                                  |
| `packages/cli/test/correlator.test.ts`           | Tests for flag-to-property correlation                                       |
| `packages/cli/package.json`                      | Package config                                                               |
| `packages/cli/tsconfig.json`                     | TypeScript config                                                            |
| `packages/cli/tsconfig.build.json`               | Build config                                                                 |

---

### Task 1: Config surface types in core

**Files:**

- Create: `packages/core/src/config-types.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create config-types.ts**

```typescript
/** How the user provides configuration values */
export type ConfigSourceType = 'cli' | 'config' | 'env';

/** A configuration surface — CLI commands, config files, or env vars */
export interface ExtractedConfigSurface {
  /** Surface name (e.g. "generate" for CLI command, "ZodFormsConfig" for config file) */
  name: string;
  /** Human-readable description */
  description: string;
  /** How the user provides these options */
  sourceType: ConfigSourceType;
  /** Usage pattern (e.g. "zod-to-form generate [options] <schema>") */
  usage?: string;
  /** The options/flags/keys on this surface */
  options: ExtractedConfigOption[];
  /** Positional arguments (CLI only) */
  arguments?: ExtractedConfigArgument[];
  /** Subcommands (CLI only, recursive) */
  subcommands?: ExtractedConfigSurface[];
  /** Aggregated @useWhen from the command/interface level */
  useWhen?: string[];
  /** Aggregated @avoidWhen from the command/interface level */
  avoidWhen?: string[];
  /** Aggregated @pitfalls from the command/interface level */
  pitfalls?: string[];
  /** Extended description from @remarks */
  remarks?: string;
}

/** A single option/flag/config key */
export interface ExtractedConfigOption {
  /** Property name from the typed interface (e.g. "dryRun") */
  name: string;
  /** CLI flag string (e.g. "--dry-run") — CLI only */
  cliFlag?: string;
  /** Short flag (e.g. "-c") — CLI only */
  cliShort?: string;
  /** Config file key (may differ from property name) */
  configKey?: string;
  /** Environment variable name (e.g. "DRY_RUN") */
  envVar?: string;
  /** TypeScript type */
  type: string;
  /** JSDoc summary description */
  description: string;
  /** Whether this option is required */
  required: boolean;
  /** Default value */
  defaultValue?: string;
  /** Extended description from @remarks */
  remarks?: string;
  /** When to use this option */
  useWhen?: string[];
  /** When NOT to use this option */
  avoidWhen?: string[];
  /** Anti-patterns for this option */
  pitfalls?: string[];
  /** Grouping category */
  category?: string;
}

/** A positional CLI argument */
export interface ExtractedConfigArgument {
  /** Argument name */
  name: string;
  /** Description */
  description: string;
  /** Whether required */
  required: boolean;
  /** Whether variadic (accepts multiple values) */
  variadic: boolean;
  /** Default value */
  defaultValue?: string;
}
```

- [ ] **Step 2: Add `configSurfaces` to `ExtractedSkill`**

In `packages/core/src/types.ts`, add after `pitfalls`:

```typescript
  /** Configuration surfaces (CLI commands, config files) */
  configSurfaces?: ExtractedConfigSurface[];
```

Add the import at the top:

```typescript
import type { ExtractedConfigSurface } from './config-types.js';
```

- [ ] **Step 3: Export from index.ts**

```typescript
export type {
  ConfigSourceType,
  ExtractedConfigSurface,
  ExtractedConfigOption,
  ExtractedConfigArgument
} from './config-types.js';
```

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

All existing tests must still pass (we only added types).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config-types.ts packages/core/src/types.ts packages/core/src/index.ts
git commit -m "feat(core): add ExtractedConfigSurface types for CLI and config extraction"
```

---

### Task 2: Config surface renderer in core

**Files:**

- Create: `packages/core/src/config-renderer.ts`
- Create: `packages/core/test/config-renderer.test.ts`
- Modify: `packages/core/src/renderer.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for config rendering**

Create `packages/core/test/config-renderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderConfigSurfaceSection, renderConfigReference } from '../src/config-renderer.js';
import type { ExtractedConfigSurface } from '../src/config-types.js';

const cliSurface: ExtractedConfigSurface = {
  name: 'generate',
  description: 'Generate form components from Zod schemas',
  sourceType: 'cli',
  usage: 'zod-to-form generate [options] <schema>',
  options: [
    {
      name: 'config',
      cliFlag: '--config',
      type: 'string',
      description: 'Path to config file',
      required: true
    },
    {
      name: 'dryRun',
      cliFlag: '--dry-run',
      type: 'boolean',
      description: 'Preview without writing',
      required: false,
      defaultValue: 'false'
    },
    {
      name: 'out',
      cliFlag: '--out',
      cliShort: '-o',
      type: 'string',
      description: 'Output directory',
      required: false
    }
  ],
  arguments: [{ name: 'schema', description: 'Schema file path', required: true, variadic: false }],
  useWhen: ['You want static form components committed to source control'],
  avoidWhen: ['Your schemas change at runtime'],
  pitfalls: ['NEVER run without --config — defaults may not exist']
};

const configSurface: ExtractedConfigSurface = {
  name: 'ZodFormsConfig',
  description: 'Configuration file format for z2f.config.ts',
  sourceType: 'config',
  options: [
    { name: 'preset', type: 'string', description: 'Component preset', required: false },
    {
      name: 'outputDir',
      type: 'string',
      description: 'Output directory',
      required: false,
      defaultValue: './src/components'
    }
  ]
};

describe('renderConfigSurfaceSection', () => {
  it('renders CLI command with usage, options table, and arguments', () => {
    const content = renderConfigSurfaceSection([cliSurface]);
    expect(content).toContain('## Commands');
    expect(content).toContain('### `generate`');
    expect(content).toContain('zod-to-form generate [options] <schema>');
    expect(content).toContain('`--config`');
    expect(content).toContain('`--dry-run`');
    expect(content).toContain('yes'); // required
    expect(content).toContain('`false`'); // default
  });

  it('renders useWhen and avoidWhen on CLI commands', () => {
    const content = renderConfigSurfaceSection([cliSurface]);
    expect(content).toContain('static form components committed to source control');
    expect(content).toContain('schemas change at runtime');
  });

  it('renders pitfalls on CLI commands', () => {
    const content = renderConfigSurfaceSection([cliSurface]);
    expect(content).toContain('NEVER run without --config');
  });

  it('renders config surface with options table', () => {
    const content = renderConfigSurfaceSection([configSurface]);
    expect(content).toContain('## Configuration');
    expect(content).toContain('### `ZodFormsConfig`');
    expect(content).toContain('`preset`');
    expect(content).toContain('`outputDir`');
  });

  it('renders arguments section for CLI commands', () => {
    const content = renderConfigSurfaceSection([cliSurface]);
    expect(content).toContain('`schema`');
    expect(content).toContain('Schema file path');
  });

  it('returns empty string when no surfaces', () => {
    expect(renderConfigSurfaceSection([])).toBe('');
    expect(renderConfigSurfaceSection(undefined as any)).toBe('');
  });
});

describe('renderConfigReference', () => {
  it('renders detailed per-option documentation for CLI', () => {
    const content = renderConfigReference([cliSurface]);
    expect(content).toContain('# Commands');
    expect(content).toContain('## generate');
    expect(content).toContain('#### `--config`');
    expect(content).toContain('(required)');
    expect(content).toContain('#### `--dry-run`');
    expect(content).toContain('**Default:** `false`');
  });

  it('renders per-option useWhen and pitfalls when present', () => {
    const surfaceWithOptionTags: ExtractedConfigSurface = {
      name: 'build',
      description: 'Build the project',
      sourceType: 'cli',
      options: [
        {
          name: 'watch',
          cliFlag: '--watch',
          type: 'boolean',
          description: 'Watch mode',
          required: false,
          useWhen: ['Developing locally'],
          pitfalls: ['NEVER use in CI — creates a hanging process']
        }
      ]
    };
    const content = renderConfigReference([surfaceWithOptionTags]);
    expect(content).toContain('Developing locally');
    expect(content).toContain('NEVER use in CI');
  });

  it('renders config reference with property documentation', () => {
    const content = renderConfigReference([configSurface]);
    expect(content).toContain('# Configuration');
    expect(content).toContain('## ZodFormsConfig');
    expect(content).toContain('#### `preset`');
    expect(content).toContain('Component preset');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- packages/core/test/config-renderer.test.ts
```

- [ ] **Step 3: Implement config-renderer.ts**

Create `packages/core/src/config-renderer.ts`:

```typescript
import type { ExtractedConfigSurface, ExtractedConfigOption } from './config-types.js';

/**
 * Render config surfaces into a SKILL.md section (Commands + Configuration).
 * Used inline in the SKILL.md between Quick Start and Quick Reference.
 */
export function renderConfigSurfaceSection(surfaces: ExtractedConfigSurface[] | undefined): string {
  if (!surfaces || surfaces.length === 0) return '';

  const sections: string[] = [];

  const cliSurfaces = surfaces.filter((s) => s.sourceType === 'cli');
  const configSurfaces = surfaces.filter((s) => s.sourceType === 'config');

  if (cliSurfaces.length > 0) {
    sections.push('## Commands\n');
    for (const surface of cliSurfaces) {
      sections.push(renderCommandSummary(surface));
    }
  }

  if (configSurfaces.length > 0) {
    sections.push('## Configuration\n');
    for (const surface of configSurfaces) {
      sections.push(renderConfigSummary(surface));
    }
  }

  return sections.join('\n');
}

/**
 * Render detailed per-option reference documentation.
 * Used as a reference file (references/commands.md or references/config.md).
 */
export function renderConfigReference(surfaces: ExtractedConfigSurface[] | undefined): string {
  if (!surfaces || surfaces.length === 0) return '';

  const sections: string[] = [];

  const cliSurfaces = surfaces.filter((s) => s.sourceType === 'cli');
  const configSurfaces = surfaces.filter((s) => s.sourceType === 'config');

  if (cliSurfaces.length > 0) {
    sections.push('# Commands\n');
    for (const surface of cliSurfaces) {
      sections.push(renderCommandDetail(surface));
    }
  }

  if (configSurfaces.length > 0) {
    sections.push('# Configuration\n');
    for (const surface of configSurfaces) {
      sections.push(renderConfigDetail(surface));
    }
  }

  return sections.join('\n');
}

// ── Command rendering (CLI) ────────────────────────────────────────────

function renderCommandSummary(surface: ExtractedConfigSurface): string {
  const lines: string[] = [];

  lines.push(`### \`${surface.name}\``);
  if (surface.description) lines.push(surface.description);
  if (surface.usage) lines.push(`\n**Usage:** \`${surface.usage}\``);

  if (surface.useWhen && surface.useWhen.length > 0) {
    lines.push('\n**Use when:**');
    for (const item of surface.useWhen) lines.push(`- ${item}`);
  }

  if (surface.avoidWhen && surface.avoidWhen.length > 0) {
    lines.push('\n**Avoid when:**');
    for (const item of surface.avoidWhen) lines.push(`- ${item}`);
  }

  // Options table
  if (surface.options.length > 0) {
    lines.push('\n**Options:**\n');
    lines.push('| Flag | Type | Required | Default | Description |');
    lines.push('|------|------|----------|---------|-------------|');
    for (const opt of surface.options) {
      const flag = opt.cliFlag ? `\`${opt.cliFlag}\`` : `\`${opt.name}\``;
      const req = opt.required ? 'yes' : 'no';
      const def = opt.defaultValue ? `\`${opt.defaultValue}\`` : '—';
      lines.push(`| ${flag} | ${opt.type} | ${req} | ${def} | ${opt.description} |`);
    }
  }

  // Arguments
  if (surface.arguments && surface.arguments.length > 0) {
    lines.push('\n**Arguments:**');
    for (const arg of surface.arguments) {
      const req = arg.required ? '(required)' : '(optional)';
      lines.push(`- \`${arg.name}\` ${req} — ${arg.description}`);
    }
  }

  if (surface.pitfalls && surface.pitfalls.length > 0) {
    lines.push('\n**Pitfalls:**');
    for (const item of surface.pitfalls) lines.push(`- ${item}`);
  }

  lines.push('');
  return lines.join('\n');
}

function renderCommandDetail(surface: ExtractedConfigSurface): string {
  const lines: string[] = [];

  lines.push(`## ${surface.name}\n`);
  if (surface.description) lines.push(surface.description);
  if (surface.usage) lines.push(`\n**Usage:** \`${surface.usage}\``);
  if (surface.remarks) lines.push(`\n${surface.remarks}`);

  if (surface.options.length > 0) {
    lines.push('\n### Options\n');
    for (const opt of surface.options) {
      renderOptionDetail(opt, lines);
    }
  }

  if (surface.arguments && surface.arguments.length > 0) {
    lines.push('### Arguments\n');
    for (const arg of surface.arguments) {
      const req = arg.required ? ' (required)' : '';
      lines.push(`#### \`${arg.name}\`${req}`);
      if (arg.description) lines.push(arg.description);
      if (arg.defaultValue) lines.push(`\n**Default:** \`${arg.defaultValue}\``);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Config rendering ───────────────────────────────────────────────────

function renderConfigSummary(surface: ExtractedConfigSurface): string {
  const lines: string[] = [];

  lines.push(`### \`${surface.name}\``);
  if (surface.description) lines.push(surface.description);

  if (surface.options.length > 0) {
    lines.push('\n| Key | Type | Required | Default | Description |');
    lines.push('|-----|------|----------|---------|-------------|');
    for (const opt of surface.options) {
      const req = opt.required ? 'yes' : 'no';
      const def = opt.defaultValue ? `\`${opt.defaultValue}\`` : '—';
      lines.push(
        `| \`${opt.configKey || opt.name}\` | ${opt.type} | ${req} | ${def} | ${opt.description} |`
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderConfigDetail(surface: ExtractedConfigSurface): string {
  const lines: string[] = [];

  lines.push(`## ${surface.name}\n`);
  if (surface.description) lines.push(surface.description);
  if (surface.remarks) lines.push(`\n${surface.remarks}`);

  if (surface.options.length > 0) {
    lines.push('\n### Properties\n');
    for (const opt of surface.options) {
      renderOptionDetail(opt, lines);
    }
  }

  return lines.join('\n');
}

// ── Shared option detail ───────────────────────────────────────────────

function renderOptionDetail(opt: ExtractedConfigOption, lines: string[]): void {
  const flag = opt.cliFlag || opt.configKey || opt.name;
  const req = opt.required ? ' (required)' : '';
  lines.push(`#### \`${flag}\`${req}`);
  if (opt.description) lines.push(opt.description);
  if (opt.remarks) lines.push(`\n${opt.remarks}`);
  if (opt.defaultValue) lines.push(`\n**Default:** \`${opt.defaultValue}\``);

  if (opt.useWhen && opt.useWhen.length > 0) {
    lines.push('\n**Use when:**');
    for (const item of opt.useWhen) lines.push(`- ${item}`);
  }

  if (opt.avoidWhen && opt.avoidWhen.length > 0) {
    lines.push('\n**Avoid when:**');
    for (const item of opt.avoidWhen) lines.push(`- ${item}`);
  }

  if (opt.pitfalls && opt.pitfalls.length > 0) {
    lines.push('\n**Pitfalls:**');
    for (const item of opt.pitfalls) lines.push(`- ${item}`);
  }

  lines.push('');
}
```

- [ ] **Step 4: Wire config rendering into renderSkill**

In `packages/core/src/renderer.ts`, add import:

```typescript
import { renderConfigSurfaceSection, renderConfigReference } from './config-renderer.js';
```

In `renderSkillMd`, after the Pitfalls section and before Quick Reference:

```typescript
// Config surfaces (CLI commands, config files)
const configSection = renderConfigSurfaceSection(skill.configSurfaces);
if (configSection) sections.push(configSection);
```

In `renderSkill`, after the variables reference block, add:

```typescript
if (skill.configSurfaces && skill.configSurfaces.length > 0) {
  const cliSurfaces = skill.configSurfaces.filter((s) => s.sourceType === 'cli');
  const cfgSurfaces = skill.configSurfaces.filter((s) => s.sourceType === 'config');

  if (cliSurfaces.length > 0) {
    const content = renderConfigReference(cliSurfaces);
    references.push({
      filename: `${basePath}/references/commands.md`,
      content: truncateToTokenBudget(content, opts.maxTokens),
      tokens: estimateTokens(content)
    });
  }

  if (cfgSurfaces.length > 0) {
    const content = renderConfigReference(cfgSurfaces);
    references.push({
      filename: `${basePath}/references/config.md`,
      content: truncateToTokenBudget(content, opts.maxTokens),
      tokens: estimateTokens(content)
    });
  }
}
```

- [ ] **Step 5: Export from index.ts**

```typescript
export { renderConfigSurfaceSection, renderConfigReference } from './config-renderer.js';
```

- [ ] **Step 6: Run tests**

```bash
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/config-renderer.ts packages/core/src/renderer.ts packages/core/test/config-renderer.test.ts packages/core/src/index.ts
git commit -m "feat(core): add config surface renderer for CLI commands and config files"
```

---

### Task 3: Config interface detection in TypeDoc extractor

Detect interfaces with `@config` tag or `*Options`/`*Config` suffix and extract as `ExtractedConfigSurface`.

**Files:**

- Modify: `packages/typedoc/src/extractor.ts`
- Modify: `packages/typedoc/test/extractor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('extractSkills — config interface detection', () => {
  it('detects @config tag on interface', () => {
    const iface = mockDecl('AppSettings', ReflectionKind.Interface, {
      comment: {
        summary: [{ text: 'Application settings' }],
        getTags: (tag: string) => (tag === '@config' ? [{ content: [] }] : []),
        getTag: (tag: string) => (tag === '@config' ? { content: [] } : undefined),
        blockTags: [{ tag: '@config', content: [] }]
      },
      children: [
        mockDecl('port', ReflectionKind.Property, {
          type: { toString: () => 'number' },
          flags: { isOptional: false },
          comment: {
            summary: [{ text: 'Server port' }],
            getTags: () => [],
            getTag: () => undefined,
            blockTags: []
          }
        })
      ]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toBeDefined();
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('AppSettings');
    expect(skill.configSurfaces![0].sourceType).toBe('config');
    expect(skill.configSurfaces![0].options).toHaveLength(1);
    expect(skill.configSurfaces![0].options[0].name).toBe('port');
  });

  it('detects *Options suffix as config interface', () => {
    const iface = mockDecl('GenerateOptions', ReflectionKind.Interface, {
      children: [
        mockDecl('dryRun', ReflectionKind.Property, {
          type: { toString: () => 'boolean' },
          flags: { isOptional: true }
        })
      ]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toBeDefined();
    expect(skill.configSurfaces![0].name).toBe('GenerateOptions');
  });

  it('detects *Config suffix', () => {
    const iface = mockDecl('ZodFormsConfig', ReflectionKind.Interface, {
      children: [
        mockDecl('preset', ReflectionKind.Property, {
          type: { toString: () => 'string' },
          flags: { isOptional: true }
        })
      ]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces).toBeDefined();
    expect(skill.configSurfaces![0].name).toBe('ZodFormsConfig');
  });

  it('does NOT detect OptionsParser as config (suffix must be at word boundary)', () => {
    const iface = mockDecl('OptionsParser', ReflectionKind.Interface, {
      children: []
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    expect(skill.configSurfaces ?? []).toHaveLength(0);
  });

  it('extracts @useWhen/@pitfalls from config interface properties', () => {
    const iface = mockDecl('BuildOptions', ReflectionKind.Interface, {
      comment: {
        summary: [{ text: 'Build config' }],
        getTags: (tag: string) => (tag === '@config' ? [{ content: [] }] : []),
        getTag: (tag: string) => (tag === '@config' ? { content: [] } : undefined),
        blockTags: [{ tag: '@config', content: [] }]
      },
      children: [
        mockDecl('watch', ReflectionKind.Property, {
          type: { toString: () => 'boolean' },
          flags: { isOptional: true },
          comment: {
            summary: [{ text: 'Watch mode' }],
            getTags: (tag: string) => {
              if (tag === '@useWhen') return [{ content: [{ text: '- Developing locally' }] }];
              if (tag === '@pitfalls') return [{ content: [{ text: '- NEVER use in CI' }] }];
              return [];
            },
            getTag: () => undefined,
            blockTags: [
              { tag: '@useWhen', content: [{ text: '- Developing locally' }] },
              { tag: '@pitfalls', content: [{ text: '- NEVER use in CI' }] }
            ]
          }
        })
      ]
    });
    const project = mockProject([iface]);
    const [skill] = extractSkills(project, false);
    const opt = skill.configSurfaces![0].options[0];
    expect(opt.useWhen).toContain('Developing locally');
    expect(opt.pitfalls).toContain('NEVER use in CI');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test
```

- [ ] **Step 3: Implement config interface detection**

In `packages/typedoc/src/extractor.ts`, add:

```typescript
import type { ExtractedConfigSurface, ExtractedConfigOption } from '@skillit/core';

/** Config interface name suffix patterns (must be at word boundary — PascalCase end) */
const CONFIG_SUFFIXES = ['Options', 'Config', 'Configuration', 'Settings'];

/** Check if an interface is a config surface */
function isConfigInterface(decl: DeclarationReflection): boolean {
  // Explicit @config tag
  if (decl.comment?.getTag('@config')) return true;

  // Name suffix match at PascalCase word boundary
  const name = decl.name;
  return CONFIG_SUFFIXES.some(
    (suffix) =>
      name.endsWith(suffix) &&
      name.length > suffix.length &&
      (name[name.length - suffix.length - 1] ===
        name[name.length - suffix.length - 1]?.toLowerCase()) ===
        false
  );
}
```

Actually, simpler PascalCase boundary check:

```typescript
function isConfigInterface(decl: DeclarationReflection): boolean {
  if (decl.comment?.getTag('@config')) return true;
  const name = decl.name;
  for (const suffix of CONFIG_SUFFIXES) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      // Character before suffix must be lowercase (PascalCase boundary)
      // "GenerateOptions" → 'e' before 'Options' → match
      // "OptionsParser" → doesn't end with suffix → no match
      const charBefore = name[name.length - suffix.length - 1];
      if (charBefore && charBefore === charBefore.toLowerCase()) return true;
    }
  }
  return false;
}
```

Extract config surface from interface:

```typescript
function extractConfigSurface(decl: DeclarationReflection): ExtractedConfigSurface {
  const options: ExtractedConfigOption[] = [];

  for (const child of decl.children ?? []) {
    if (child.kind === ReflectionKind.Property) {
      const comment = child.comment;
      const useWhenTag = comment?.getTag('@useWhen');
      const avoidWhenTag = comment?.getTag('@avoidWhen');
      const pitfallsTag = comment?.getTag('@pitfalls');
      const remarksTag = comment?.getTag('@remarks');

      options.push({
        name: child.name,
        type: child.type?.toString() ?? 'unknown',
        description: getCommentText(child.comment),
        required: !child.flags.isOptional,
        defaultValue: child.defaultValue,
        remarks: remarksTag
          ? remarksTag.content
              .map((p) => p.text)
              .join('')
              .trim() || undefined
          : undefined,
        useWhen: useWhenTag
          ? parseBulletList(useWhenTag.content.map((p) => p.text).join(''))
          : undefined,
        avoidWhen: avoidWhenTag
          ? parseBulletList(avoidWhenTag.content.map((p) => p.text).join(''))
          : undefined,
        pitfalls: pitfallsTag
          ? parseBulletList(pitfallsTag.content.map((p) => p.text).join(''))
          : undefined,
        category: getCategory(child.comment)
      });
    }
  }

  const comment = decl.comment;
  const useWhenTag = comment?.getTag('@useWhen');
  const avoidWhenTag = comment?.getTag('@avoidWhen');
  const pitfallsTag = comment?.getTag('@pitfalls');

  return {
    name: decl.name,
    description: getCommentText(decl.comment),
    sourceType: 'config',
    options,
    useWhen: useWhenTag
      ? parseBulletList(useWhenTag.content.map((p) => p.text).join(''))
      : undefined,
    avoidWhen: avoidWhenTag
      ? parseBulletList(avoidWhenTag.content.map((p) => p.text).join(''))
      : undefined,
    pitfalls: pitfallsTag
      ? parseBulletList(pitfallsTag.content.map((p) => p.text).join(''))
      : undefined,
    remarks:
      comment
        ?.getTag('@remarks')
        ?.content.map((p) => p.text)
        .join('')
        .trim() || undefined
  };
}
```

Wire into `extractModule` and `mergeModules` — after extracting types, filter out config interfaces from the types list and add as config surfaces:

```typescript
// In extractModule, after the types filter:
const allInterfaces = children.filter(
  (c) => c.kind === ReflectionKind.Interface || c.kind === ReflectionKind.TypeAlias
);
const configInterfaces = allInterfaces.filter((c) => c.kind === ReflectionKind.Interface && isConfigInterface(c));
const regularTypes = allInterfaces.filter((c) => !(c.kind === ReflectionKind.Interface && isConfigInterface(c)));

// In the return object:
types: regularTypes.map(extractType),
configSurfaces: configInterfaces.length > 0 ? configInterfaces.map(extractConfigSurface) : undefined,
```

Same pattern in `mergeModules`.

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/typedoc/src/extractor.ts packages/typedoc/test/extractor.test.ts
git commit -m "feat(typedoc): detect @config interfaces and extract as config surfaces"
```

---

### Task 4: Scaffold `@skillit/cli` package

**Files:**

- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsconfig.build.json`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@skillit/cli",
  "version": "0.1.0",
  "description": "Extract CLI command structure from commander/yargs for AI agent skill generation",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsgo -p tsconfig.build.json",
    "type-check": "tsgo --noEmit"
  },
  "keywords": ["cli", "commander", "yargs", "documentation", "skill-generation", "agent-skills"],
  "license": "MIT",
  "repository": "https://github.com/pradeepmouli/to-skills",
  "author": "Pradeep Mouli",
  "dependencies": {
    "@skillit/core": "workspace:*"
  },
  "peerDependencies": {
    "commander": ">=12.0.0"
  },
  "peerDependenciesMeta": {
    "commander": { "optional": true }
  },
  "devDependencies": {
    "commander": "^14.0.0",
    "typescript": "^5.9.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Step 3: Create tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["test/**/*"]
}
```

- [ ] **Step 4: Create src/index.ts stub**

```typescript
export { introspectCommander } from './introspect-commander.js';
export { parseHelpOutput } from './help-parser.js';
export { correlateFlags } from './correlator.js';
export { extractCliSkill } from './extract.js';
```

- [ ] **Step 5: Install dependencies and verify workspace**

```bash
pnpm install
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/
git commit -m "chore: scaffold @skillit/cli package"
```

---

### Task 5: Commander introspection

**Files:**

- Create: `packages/cli/src/introspect-commander.ts`
- Create: `packages/cli/test/introspect-commander.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { introspectCommander } from '../src/introspect-commander.js';

describe('introspectCommander', () => {
  it('extracts command name and description', () => {
    const program = new Command();
    program.command('generate').description('Generate components');
    const surfaces = introspectCommander(program);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].name).toBe('generate');
    expect(surfaces[0].description).toBe('Generate components');
    expect(surfaces[0].sourceType).toBe('cli');
  });

  it('extracts options with flags, types, required, defaults', () => {
    const program = new Command();
    program
      .command('build')
      .requiredOption('--config <path>', 'Config file path')
      .option('--dry-run', 'Preview mode', false)
      .option('-o, --out <dir>', 'Output directory');
    const surfaces = introspectCommander(program);
    const opts = surfaces[0].options;
    expect(opts).toHaveLength(3);

    const config = opts.find((o) => o.name === 'config');
    expect(config!.cliFlag).toBe('--config');
    expect(config!.required).toBe(true);
    expect(config!.type).toBe('string');

    const dryRun = opts.find((o) => o.name === 'dryRun');
    expect(dryRun!.cliFlag).toBe('--dry-run');
    expect(dryRun!.required).toBe(false);
    expect(dryRun!.defaultValue).toBe('false');
    expect(dryRun!.type).toBe('boolean');

    const out = opts.find((o) => o.name === 'out');
    expect(out!.cliShort).toBe('-o');
  });

  it('extracts positional arguments', () => {
    const program = new Command();
    program
      .command('init')
      .argument('<name>', 'Project name')
      .argument('[template]', 'Template to use');
    const surfaces = introspectCommander(program);
    expect(surfaces[0].arguments).toHaveLength(2);
    expect(surfaces[0].arguments![0].name).toBe('name');
    expect(surfaces[0].arguments![0].required).toBe(true);
    expect(surfaces[0].arguments![1].name).toBe('template');
    expect(surfaces[0].arguments![1].required).toBe(false);
  });

  it('generates usage string', () => {
    const program = new Command().name('my-cli');
    program.command('deploy').option('--env <name>', 'Environment');
    const surfaces = introspectCommander(program);
    expect(surfaces[0].usage).toBeDefined();
  });

  it('handles nested subcommands', () => {
    const program = new Command();
    const parent = program.command('db');
    parent.command('migrate').description('Run migrations');
    parent.command('seed').description('Seed data');
    const surfaces = introspectCommander(program);
    expect(surfaces[0].name).toBe('db');
    expect(surfaces[0].subcommands).toHaveLength(2);
    expect(surfaces[0].subcommands![0].name).toBe('migrate');
  });

  it('returns empty array for program with no commands', () => {
    const program = new Command();
    const surfaces = introspectCommander(program);
    expect(surfaces).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement introspect-commander.ts**

```typescript
import type {
  ExtractedConfigSurface,
  ExtractedConfigOption,
  ExtractedConfigArgument
} from '@skillit/core';

/**
 * Introspect a commander Program object and extract all command definitions.
 * Returns one ExtractedConfigSurface per command.
 */
export function introspectCommander(program: any): ExtractedConfigSurface[] {
  const commands: any[] = program.commands ?? [];
  if (commands.length === 0) return [];

  return commands.map((cmd) => extractCommand(cmd, program.name?.() ?? ''));
}

function extractCommand(cmd: any, programName: string): ExtractedConfigSurface {
  const options: ExtractedConfigOption[] = (cmd.options ?? []).map((opt: any) => {
    const longFlag = opt.long?.replace(/^--/, '');
    const name = longFlag ? toCamelCase(longFlag) : (opt.short?.replace(/^-/, '') ?? '');

    return {
      name,
      cliFlag: opt.long ? `--${longFlag}` : undefined,
      cliShort: opt.short ?? undefined,
      type: inferOptionType(opt.flags ?? ''),
      description: opt.description ?? '',
      required: !!(opt.required || opt.mandatory),
      defaultValue: opt.defaultValue !== undefined ? String(opt.defaultValue) : undefined,
      envVar: opt.envVar ?? undefined
    };
  });

  const args: ExtractedConfigArgument[] = (cmd.registeredArguments ?? cmd._args ?? []).map(
    (arg: any) => ({
      name: typeof arg.name === 'function' ? arg.name() : (arg._name ?? arg.name ?? ''),
      description: arg.description ?? '',
      required: arg.required ?? false,
      variadic: arg.variadic ?? false,
      defaultValue: arg.defaultValue !== undefined ? String(arg.defaultValue) : undefined
    })
  );

  const subcommands =
    (cmd.commands ?? []).length > 0
      ? (cmd.commands as any[]).map((sub: any) => extractCommand(sub, programName))
      : undefined;

  const cmdName = typeof cmd.name === 'function' ? cmd.name() : (cmd._name ?? '');
  const cmdDesc = typeof cmd.description === 'function' ? cmd.description() : '';
  const cmdUsage = typeof cmd.usage === 'function' ? cmd.usage() : undefined;

  return {
    name: cmdName,
    description: cmdDesc,
    sourceType: 'cli',
    usage: cmdUsage ? `${programName} ${cmdName} ${cmdUsage}`.trim() : undefined,
    options,
    arguments: args.length > 0 ? args : undefined,
    subcommands
  };
}

/** Convert kebab-case to camelCase: "dry-run" → "dryRun" */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** Infer option type from flags string: "<path>" → string, no arg → boolean */
function inferOptionType(flags: string): string {
  if (flags.includes('<') || flags.includes('[')) return 'string';
  return 'boolean';
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- packages/cli/test/introspect-commander.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/introspect-commander.ts packages/cli/test/introspect-commander.test.ts
git commit -m "feat(cli): commander runtime introspection"
```

---

### Task 6: `--help` output parser

**Files:**

- Create: `packages/cli/src/help-parser.ts`
- Create: `packages/cli/test/help-parser.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { parseHelpOutput } from '../src/help-parser.js';

const SAMPLE_HELP = `Usage: zod-to-form generate [options] <schema>

Generate form components from Zod v4 schemas

Options:
  --config <path>          Path to config file (required)
  -o, --out <dir>          Output directory
  --dry-run                Preview without writing (default: false)
  --server-action          Generate Next.js server action (default: false)
  -h, --help               display help for command
`;

describe('parseHelpOutput', () => {
  it('extracts command description', () => {
    const surface = parseHelpOutput(SAMPLE_HELP, 'generate');
    expect(surface.description).toBe('Generate form components from Zod v4 schemas');
  });

  it('extracts usage string', () => {
    const surface = parseHelpOutput(SAMPLE_HELP, 'generate');
    expect(surface.usage).toContain('zod-to-form generate');
  });

  it('extracts options with flags and descriptions', () => {
    const surface = parseHelpOutput(SAMPLE_HELP, 'generate');
    expect(surface.options.length).toBeGreaterThanOrEqual(3);

    const config = surface.options.find((o) => o.name === 'config');
    expect(config).toBeDefined();
    expect(config!.cliFlag).toBe('--config');
    expect(config!.description).toContain('Path to config');
  });

  it('detects short flags', () => {
    const surface = parseHelpOutput(SAMPLE_HELP, 'generate');
    const out = surface.options.find((o) => o.name === 'out');
    expect(out!.cliShort).toBe('-o');
  });

  it('detects default values in parentheses', () => {
    const surface = parseHelpOutput(SAMPLE_HELP, 'generate');
    const dryRun = surface.options.find((o) => o.name === 'dryRun');
    expect(dryRun!.defaultValue).toBe('false');
  });

  it('detects required flag in description', () => {
    const surface = parseHelpOutput(SAMPLE_HELP, 'generate');
    const config = surface.options.find((o) => o.name === 'config');
    expect(config!.required).toBe(true);
  });

  it('skips -h/--help option', () => {
    const surface = parseHelpOutput(SAMPLE_HELP, 'generate');
    const help = surface.options.find((o) => o.name === 'help');
    expect(help).toBeUndefined();
  });

  it('extracts positional arguments from usage line', () => {
    const surface = parseHelpOutput(SAMPLE_HELP, 'generate');
    expect(surface.arguments).toBeDefined();
    expect(surface.arguments![0].name).toBe('schema');
    expect(surface.arguments![0].required).toBe(true);
  });

  it('handles empty help output', () => {
    const surface = parseHelpOutput('', 'unknown');
    expect(surface.name).toBe('unknown');
    expect(surface.options).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement help-parser.ts**

```typescript
import type {
  ExtractedConfigSurface,
  ExtractedConfigOption,
  ExtractedConfigArgument
} from '@skillit/core';

/**
 * Parse --help text output into an ExtractedConfigSurface.
 * Works with any CLI framework that produces standard help format.
 */
export function parseHelpOutput(text: string, commandName: string): ExtractedConfigSurface {
  const lines = text.split('\n');
  const options: ExtractedConfigOption[] = [];
  const args: ExtractedConfigArgument[] = [];
  let description = '';
  let usage: string | undefined;
  let inOptions = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Usage line
    if (trimmed.startsWith('Usage:')) {
      usage = trimmed.replace(/^Usage:\s*/, '');
      // Extract positional args from usage: <required> [optional]
      const argMatches = usage.matchAll(/<(\w+)>|\[(\w+)]/g);
      for (const match of argMatches) {
        const name = match[1] || match[2];
        if (name && name !== 'options') {
          args.push({
            name,
            description: '',
            required: !!match[1], // <> = required, [] = optional
            variadic: false
          });
        }
      }
      continue;
    }

    // Options header
    if (trimmed === 'Options:' || trimmed === 'Options') {
      inOptions = true;
      continue;
    }

    // Blank line after usage = description
    if (
      !inOptions &&
      trimmed &&
      !description &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('Usage:')
    ) {
      description = trimmed;
      continue;
    }

    // Parse option lines
    if (inOptions && trimmed.startsWith('-')) {
      const parsed = parseOptionLine(trimmed);
      if (parsed && parsed.name !== 'help' && parsed.name !== 'version') {
        options.push(parsed);
      }
    }

    // End of options section
    if (inOptions && !trimmed && options.length > 0) {
      inOptions = false;
    }
  }

  return {
    name: commandName,
    description,
    sourceType: 'cli',
    usage,
    options,
    arguments: args.length > 0 ? args : undefined
  };
}

/** Parse a single option line: "  -o, --out <dir>   Output directory (default: false)" */
function parseOptionLine(line: string): ExtractedConfigOption | undefined {
  // Match: optional short flag, long flag, optional arg, description
  const match = line.match(/^\s*(?:(-\w),\s*)?(-[-\w]+)(?:\s+[<[]\w+[>\]])?\s{2,}(.+)/);
  if (!match) return undefined;

  const short = match[1] ?? undefined;
  const long = match[2] ?? '';
  let desc = match[3]?.trim() ?? '';
  const longClean = long.replace(/^--/, '');

  // Detect type from flag format
  const hasArg = line.includes('<') || line.includes('[');
  const type = hasArg ? 'string' : 'boolean';

  // Extract default value: (default: value)
  let defaultValue: string | undefined;
  const defaultMatch = desc.match(/\(default:\s*(.+?)\)/);
  if (defaultMatch) {
    defaultValue = defaultMatch[1]?.trim();
    desc = desc.replace(/\(default:\s*.+?\)/, '').trim();
  }

  // Detect required
  const required = /\(required\)/i.test(desc);
  if (required) {
    desc = desc.replace(/\(required\)/i, '').trim();
  }

  return {
    name: toCamelCase(longClean),
    cliFlag: `--${longClean}`,
    cliShort: short,
    type,
    description: desc,
    required,
    defaultValue
  };
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- packages/cli/test/help-parser.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/help-parser.ts packages/cli/test/help-parser.test.ts
git commit -m "feat(cli): --help output parser for framework-agnostic extraction"
```

---

### Task 7: Flag-to-property correlator

**Files:**

- Create: `packages/cli/src/correlator.ts`
- Create: `packages/cli/test/correlator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { correlateFlags } from '../src/correlator.js';
import type { ExtractedConfigSurface } from '@skillit/core';

describe('correlateFlags', () => {
  it('merges JSDoc tags from config interface into CLI options', () => {
    const cliSurface: ExtractedConfigSurface = {
      name: 'build',
      description: 'Build project',
      sourceType: 'cli',
      options: [
        {
          name: 'dryRun',
          cliFlag: '--dry-run',
          type: 'boolean',
          description: 'Preview mode',
          required: false
        },
        {
          name: 'config',
          cliFlag: '--config',
          type: 'string',
          description: 'Config path',
          required: true
        }
      ]
    };

    const configSurface: ExtractedConfigSurface = {
      name: 'BuildOptions',
      description: 'Build configuration',
      sourceType: 'config',
      options: [
        {
          name: 'dryRun',
          type: 'boolean',
          description: '',
          required: false,
          useWhen: ['Testing locally'],
          pitfalls: ['NEVER use in CI']
        },
        {
          name: 'config',
          type: 'string',
          description: 'Path to config',
          required: true,
          remarks: 'Resolved from cwd'
        }
      ]
    };

    const merged = correlateFlags(cliSurface, configSurface);
    const dryRun = merged.options.find((o) => o.name === 'dryRun');
    expect(dryRun!.useWhen).toContain('Testing locally');
    expect(dryRun!.pitfalls).toContain('NEVER use in CI');
    // CLI description wins over config description
    expect(dryRun!.description).toBe('Preview mode');

    const config = merged.options.find((o) => o.name === 'config');
    expect(config!.remarks).toBe('Resolved from cwd');
  });

  it('uses config description when CLI description is empty', () => {
    const cli: ExtractedConfigSurface = {
      name: 'cmd',
      description: '',
      sourceType: 'cli',
      options: [{ name: 'verbose', type: 'boolean', description: '', required: false }]
    };
    const cfg: ExtractedConfigSurface = {
      name: 'CmdOptions',
      description: '',
      sourceType: 'config',
      options: [
        { name: 'verbose', type: 'boolean', description: 'Enable verbose logging', required: false }
      ]
    };
    const merged = correlateFlags(cli, cfg);
    expect(merged.options[0].description).toBe('Enable verbose logging');
  });

  it('merges command-level tags from config interface', () => {
    const cli: ExtractedConfigSurface = {
      name: 'deploy',
      description: 'Deploy app',
      sourceType: 'cli',
      options: []
    };
    const cfg: ExtractedConfigSurface = {
      name: 'DeployOptions',
      description: '',
      sourceType: 'config',
      options: [],
      useWhen: ['Ready for production'],
      pitfalls: ['NEVER deploy on Friday']
    };
    const merged = correlateFlags(cli, cfg);
    expect(merged.useWhen).toContain('Ready for production');
    expect(merged.pitfalls).toContain('NEVER deploy on Friday');
  });

  it('returns CLI surface unchanged when no config surface', () => {
    const cli: ExtractedConfigSurface = {
      name: 'cmd',
      description: 'A command',
      sourceType: 'cli',
      options: [{ name: 'flag', type: 'boolean', description: 'A flag', required: false }]
    };
    const merged = correlateFlags(cli, undefined);
    expect(merged).toEqual(cli);
  });

  it('handles case-insensitive property matching', () => {
    const cli: ExtractedConfigSurface = {
      name: 'cmd',
      description: '',
      sourceType: 'cli',
      options: [
        { name: 'serverAction', type: 'boolean', description: 'Generate action', required: false }
      ]
    };
    const cfg: ExtractedConfigSurface = {
      name: 'CmdOptions',
      description: '',
      sourceType: 'config',
      options: [
        {
          name: 'serverAction',
          type: 'boolean',
          description: '',
          required: false,
          pitfalls: ['NEVER use without Next.js']
        }
      ]
    };
    const merged = correlateFlags(cli, cfg);
    expect(merged.options[0].pitfalls).toContain('NEVER use without Next.js');
  });
});
```

- [ ] **Step 2: Implement correlator.ts**

```typescript
import type { ExtractedConfigSurface, ExtractedConfigOption } from '@skillit/core';

/**
 * Correlate CLI flags with typed interface properties.
 * Merges JSDoc tags from config interface into CLI option metadata.
 * CLI metadata (flags, defaults, required) is preserved; JSDoc tags are added.
 */
export function correlateFlags(
  cliSurface: ExtractedConfigSurface,
  configSurface: ExtractedConfigSurface | undefined
): ExtractedConfigSurface {
  if (!configSurface) return cliSurface;

  // Build lookup: lowercase property name → config option
  const propLookup = new Map<string, ExtractedConfigOption>();
  for (const opt of configSurface.options) {
    propLookup.set(opt.name.toLowerCase(), opt);
  }

  // Merge JSDoc into CLI options
  for (const cliOpt of cliSurface.options) {
    const prop = propLookup.get(cliOpt.name.toLowerCase());
    if (prop) {
      cliOpt.remarks ??= prop.remarks;
      cliOpt.useWhen ??= prop.useWhen;
      cliOpt.avoidWhen ??= prop.avoidWhen;
      cliOpt.pitfalls ??= prop.pitfalls;
      cliOpt.category ??= prop.category;
      if (!cliOpt.description && prop.description) {
        cliOpt.description = prop.description;
      }
    }
  }

  // Merge command-level tags
  cliSurface.useWhen ??= configSurface.useWhen;
  cliSurface.avoidWhen ??= configSurface.avoidWhen;
  cliSurface.pitfalls ??= configSurface.pitfalls;
  cliSurface.remarks ??= configSurface.remarks;

  return cliSurface;
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- packages/cli/test/correlator.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/correlator.ts packages/cli/test/correlator.test.ts
git commit -m "feat(cli): flag-to-property correlator for JSDoc merging"
```

---

### Task 8: `extractCliSkill` orchestrator

Ties together introspection, help parsing, and correlation into a single entry point.

**Files:**

- Create: `packages/cli/src/extract.ts`
- Create: `packages/cli/test/extract.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { extractCliSkill } from '../src/extract.js';

describe('extractCliSkill', () => {
  it('extracts skill from commander program', async () => {
    const program = new Command().name('my-tool');
    program
      .command('build')
      .description('Build the project')
      .option('--watch', 'Watch mode', false);

    const skill = await extractCliSkill({
      program,
      metadata: { name: 'my-tool', keywords: ['build', 'watch'] }
    });

    expect(skill.name).toBe('my-tool');
    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('build');
    expect(skill.configSurfaces![0].options[0].name).toBe('watch');
  });

  it('merges config surfaces when provided', async () => {
    const program = new Command().name('my-tool');
    program.command('build').description('Build').option('--watch', 'Watch mode', false);

    const skill = await extractCliSkill({
      program,
      metadata: { name: 'my-tool' },
      configSurfaces: [
        {
          name: 'BuildOptions',
          description: '',
          sourceType: 'config',
          options: [
            {
              name: 'watch',
              type: 'boolean',
              description: '',
              required: false,
              pitfalls: ['NEVER use in CI']
            }
          ]
        }
      ]
    });

    const watchOpt = skill.configSurfaces![0].options[0];
    expect(watchOpt.pitfalls).toContain('NEVER use in CI');
  });

  it('extracts from help text when program not provided', async () => {
    const helpText = `Usage: tool build [options]

Build the project

Options:
  --watch                Watch mode (default: false)
  -h, --help             display help for command
`;

    const skill = await extractCliSkill({
      helpTexts: { build: helpText },
      metadata: { name: 'my-tool' }
    });

    expect(skill.configSurfaces).toHaveLength(1);
    expect(skill.configSurfaces![0].name).toBe('build');
    expect(skill.configSurfaces![0].options[0].name).toBe('watch');
  });
});
```

- [ ] **Step 2: Implement extract.ts**

```typescript
import type { ExtractedSkill, ExtractedConfigSurface } from '@skillit/core';
import { introspectCommander } from './introspect-commander.js';
import { parseHelpOutput } from './help-parser.js';
import { correlateFlags } from './correlator.js';

export interface CliExtractionOptions {
  /** Commander program object (preferred — runtime introspection) */
  program?: any;
  /** Help text per command (fallback — text parsing) */
  helpTexts?: Record<string, string>;
  /** Package metadata */
  metadata?: {
    name?: string;
    description?: string;
    keywords?: string[];
    repository?: string;
    author?: string;
  };
  /** Config surfaces from TypeDoc for JSDoc correlation */
  configSurfaces?: ExtractedConfigSurface[];
}

/**
 * Extract a CLI skill from a commander/yargs program or --help text.
 * Correlates CLI flags with typed interface properties when configSurfaces are provided.
 */
export async function extractCliSkill(options: CliExtractionOptions): Promise<ExtractedSkill> {
  let cliSurfaces: ExtractedConfigSurface[] = [];

  // Phase 1: Extract command structure
  if (options.program) {
    // Runtime introspection (preferred)
    cliSurfaces = introspectCommander(options.program);
  } else if (options.helpTexts) {
    // --help fallback
    cliSurfaces = Object.entries(options.helpTexts).map(([name, text]) =>
      parseHelpOutput(text, name)
    );
  }

  // Phase 2: Correlate with typed interfaces
  if (options.configSurfaces && options.configSurfaces.length > 0) {
    // Build lookup: PascalCase command name + "Options" → config surface
    const configLookup = new Map<string, ExtractedConfigSurface>();
    for (const cs of options.configSurfaces) {
      configLookup.set(cs.name.toLowerCase(), cs);
    }

    cliSurfaces = cliSurfaces.map((cli) => {
      // Try: "generate" → "GenerateOptions" or "generateoptions"
      const optionsName = `${cli.name}options`;
      const configName = `${cli.name}config`;
      const match = configLookup.get(optionsName) || configLookup.get(configName);
      return correlateFlags(cli, match);
    });
  }

  // Collect non-CLI config surfaces (config files) from configSurfaces
  const fileSurfaces = (options.configSurfaces ?? []).filter((s) => s.sourceType === 'config');
  const allSurfaces = [...cliSurfaces, ...fileSurfaces];

  // Phase 3: Build ExtractedSkill
  const meta = options.metadata ?? {};
  return {
    name: meta.name ?? 'cli',
    description: meta.description ?? '',
    packageDescription: meta.description,
    keywords: meta.keywords,
    repository: meta.repository,
    author: meta.author,
    functions: [],
    classes: [],
    types: [],
    enums: [],
    variables: [],
    examples: [],
    configSurfaces: allSurfaces.length > 0 ? allSurfaces : undefined
  };
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm test -- packages/cli/test/extract.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/extract.ts packages/cli/test/extract.test.ts packages/cli/src/index.ts
git commit -m "feat(cli): extractCliSkill orchestrator — introspection + help + correlation"
```

---

### Task 9: Build, test, publish

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

- [ ] **Step 2: Build all packages**

```bash
pnpm build
```

- [ ] **Step 3: Test against real CLI (zod-to-form)**

```bash
node --input-type=module -e "
import { extractCliSkill } from './packages/cli/dist/index.js';
import { renderSkill } from './packages/core/dist/index.js';
import { Command } from 'commander';

// Simulate zod-to-form CLI
const program = new Command().name('zod-to-form');
program.command('generate')
  .description('Generate form components from Zod v4 schemas')
  .requiredOption('--config <path>', 'Path to config file')
  .requiredOption('--schema <path>', 'Schema file path')
  .option('--out <path>', 'Output directory')
  .option('--dry-run', 'Preview without writing', false);

const skill = await extractCliSkill({
  program,
  metadata: { name: 'zod-to-form-cli', keywords: ['zod', 'forms', 'codegen'] },
});

const rendered = renderSkill(skill);
console.log(rendered.skill.content);
console.log('---');
for (const ref of rendered.references) {
  console.log(ref.filename);
  console.log(ref.content.slice(0, 200));
  console.log('...');
}
"
```

- [ ] **Step 4: Create changeset, version, push**

```bash
cat > .changeset/cli-config-extraction.md << 'EOF'
---
'@skillit/core': minor
'@skillit/typedoc': minor
'@skillit/cli': minor
---

CLI & config surface extraction

- ExtractedConfigSurface types and config renderer in core
- @config tag and *Options/*Config suffix detection in TypeDoc extractor
- New @skillit/cli package: commander introspection, --help parser, flag-to-property correlator
- Config surfaces render as Commands and Configuration sections in SKILL.md
- Detailed per-option documentation in references/commands.md and references/config.md
EOF

npx changeset version
git add -A
git commit -m "chore: version packages"
git push
```

---

## Summary

| Task | What                                  | Files                                      |
| ---- | ------------------------------------- | ------------------------------------------ |
| 1    | Config surface types in core          | `config-types.ts`, `types.ts`, `index.ts`  |
| 2    | Config surface renderer               | `config-renderer.ts`, `renderer.ts`, tests |
| 3    | Config interface detection in TypeDoc | `extractor.ts`, tests                      |
| 4    | Scaffold `@skillit/cli` package       | `packages/cli/*`                           |
| 5    | Commander runtime introspection       | `introspect-commander.ts`, tests           |
| 6    | `--help` output parser                | `help-parser.ts`, tests                    |
| 7    | Flag-to-property correlator           | `correlator.ts`, tests                     |
| 8    | `extractCliSkill` orchestrator        | `extract.ts`, tests                        |
| 9    | Build, test, publish                  | —                                          |
