# CLI & Config Surface Extraction — Design Spec

## Problem

to-skills generates skills from TypeScript API documentation via TypeDoc. But many libraries have a CLI and/or config file interface that users interact with more than the programmatic API. A user running `npx zod-to-form generate --config z2f.config.ts` needs to know command flags, config file structure, and option trade-offs — not function signatures.

TypeDoc extracts from TypeScript types and JSDoc. CLI commands (commander/yargs definitions) and config file formats aren't TypeScript types — they're runtime constructs. The current generator silently ignores them.

## Solution

Three additions:

1. **`ExtractedConfigSurface` in `@skillit/core`** — a new data type representing any configuration surface (CLI flags, config file keys, env vars). Typed interfaces with JSDoc become config surfaces. Core gains a config renderer that produces structured option documentation.

2. **Config interface detection in `@skillit/typedoc`** — recognizes interfaces tagged with `@config` (or matching `*Options`/`*Config` suffix) and extracts them as `ExtractedConfigSurface` instead of regular types. Per-property JSDoc (`@useWhen`, `@avoidWhen`, `@pitfalls`, `@remarks`) flows through to each config option.

3. **`@skillit/cli` (new package)** — extracts CLI command structure via runtime introspection (commander/yargs) or `--help` fallback. Correlates CLI flags to typed interface properties by camelCase name matching, merging commander metadata (flags, defaults, required) with TypeDoc JSDoc (expert knowledge tags).

## Architecture

```
@skillit/core
  ├── ExtractedSkill, renderer, audit, writer (existing)
  ├── ExtractedConfigSurface type (NEW)
  └── Config surface renderer (NEW)

@skillit/typedoc
  ├── API extraction (existing)
  └── Config interface detection → ExtractedConfigSurface (NEW)

@skillit/cli (NEW package)
  ├── Commander runtime introspection
  ├── Yargs runtime introspection
  ├── --help fallback parser
  └── Flag ↔ interface property correlation
```

A project like zod-to-form produces:

- `zod-to-form-core` skill — API reference from TypeDoc (existing)
- `zod-to-form-cli` skill — CLI command reference + config reference from `@skillit/cli` (new)

---

## Data Model

### ExtractedConfigSurface

```typescript
/** A configuration surface — CLI commands, config files, or env vars */
export interface ExtractedConfigSurface {
  /** Surface name (e.g. "generate" for CLI command, "ZodFormsConfig" for config file) */
  name: string;
  /** Human-readable description */
  description: string;
  /** How the user provides these options */
  sourceType: 'cli' | 'config' | 'env';
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
  /** Short flag (e.g. "-d") — CLI only */
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

### Addition to ExtractedSkill

```typescript
export interface ExtractedSkill {
  // ... existing fields ...
  /** Configuration surfaces (CLI commands, config files) */
  configSurfaces?: ExtractedConfigSurface[];
}
```

---

## Config Interface Detection

### Convention

An interface is a config surface when:

1. **`@config` tag** (preferred, explicit):

   ```typescript
   /**
    * Configuration for the form generation CLI.
    * @config
    */
   export interface ZodFormsConfig { ... }
   ```

2. **Name suffix fallback**: interface name ends with `Options`, `Config`, `Configuration`, or `Settings` (case-sensitive). The suffix must follow a PascalCase word boundary — `GenerateOptions` matches, `OptionsParser` does not.

Detection priority: `@config` tag if present, else name suffix match. Interfaces matching neither are treated as regular types (existing behavior).

### What Gets Extracted

For each config interface, every property becomes an `ExtractedConfigOption`:

```typescript
/**
 * @config
 */
export interface GenerateOptions {
  /**
   * Path to z2f.config.ts
   *
   * @remarks
   * Resolved relative to cwd. Supports .ts, .js, and .json extensions.
   * The file must export a valid ZodFormsConfig.
   *
   * @useWhen
   * - You have a custom config location outside the project root
   *
   * @pitfalls
   * - NEVER use a relative path that traverses above cwd — resolution is sandboxed
   */
  config: string;

  /**
   * Preview without writing files
   *
   * @useWhen
   * - First time running against a new config — verify output paths
   * - CI validation — ensure generation succeeds without modifying the repo
   *
   * @pitfalls
   * - NEVER rely on dry-run output matching real output exactly — skips post-processing
   *
   * @defaultValue false
   */
  dryRun?: boolean;
}
```

Extracted as:

```json
{
  "name": "GenerateOptions",
  "sourceType": "config",
  "options": [
    {
      "name": "config",
      "type": "string",
      "description": "Path to z2f.config.ts",
      "required": true,
      "remarks": "Resolved relative to cwd...",
      "useWhen": ["You have a custom config location outside the project root"],
      "pitfalls": ["NEVER use a relative path that traverses above cwd — resolution is sandboxed"]
    },
    {
      "name": "dryRun",
      "type": "boolean",
      "description": "Preview without writing files",
      "required": false,
      "defaultValue": "false",
      "useWhen": [
        "First time running against a new config — verify output paths",
        "CI validation — ensure generation succeeds without modifying the repo"
      ],
      "pitfalls": [
        "NEVER rely on dry-run output matching real output exactly — skips post-processing"
      ]
    }
  ]
}
```

---

## CLI Extraction (`@skillit/cli`)

### Package Structure

```
packages/cli/
  src/
    index.ts              # Public API: extractCliSkill()
    introspect.ts         # Runtime introspection (commander/yargs)
    help-parser.ts        # --help output parser
    correlator.ts         # Flag ↔ interface property matching
  test/
    introspect.test.ts
    help-parser.test.ts
    correlator.test.ts
  package.json            # pnpm package: @skillit/cli
```

### Extraction Pipeline

```
Step 1: Detect CLI framework
  ├── Check package.json dependencies for commander/yargs
  ├── Identify CLI entry point (bin field in package.json)
  └── Determine extraction strategy

Step 2: Extract command structure
  ├── Runtime introspection (preferred)
  │   ├── Dynamic import of CLI module
  │   ├── Find exported Program/Command object
  │   └── Enumerate commands, options, arguments recursively
  └── --help fallback
      ├── Execute: node <entry> --help
      ├── Parse structured text output
      └── Execute per-subcommand: node <entry> <cmd> --help

Step 3: Correlate with typed interfaces
  ├── For each command, find matching *Options interface
  │   └── Convention: command "generate" → GenerateOptions
  ├── For each CLI flag, match to interface property
  │   └── --dry-run → camelCase → dryRun → GenerateOptions.dryRun
  └── Merge: commander metadata + TypeDoc JSDoc

Step 4: Produce ExtractedConfigSurface[]
  └── One surface per command, with merged option metadata
```

### Runtime Introspection: Commander

```typescript
import { Command } from 'commander';

export function introspectCommander(program: Command): ExtractedConfigSurface[] {
  return program.commands.map((cmd) => ({
    name: cmd.name(),
    description: cmd.description(),
    sourceType: 'cli' as const,
    usage: cmd.usage(),
    options: cmd.options.map((opt) => ({
      name: camelCase(opt.long?.replace(/^--/, '') ?? opt.short?.replace(/^-/, '') ?? ''),
      cliFlag: opt.long ? `--${opt.long.replace(/^--/, '')}` : undefined,
      cliShort: opt.short ?? undefined,
      type: inferTypeFromFlag(opt.flags), // <path> → string, no arg → boolean
      description: opt.description,
      required: opt.required || opt.mandatory,
      defaultValue: opt.defaultValue !== undefined ? String(opt.defaultValue) : undefined,
      envVar: opt.envVar ?? undefined
    })),
    arguments: cmd.registeredArguments.map((arg) => ({
      name: arg.name(),
      description: arg.description,
      required: arg.required,
      variadic: arg.variadic,
      defaultValue: arg.defaultValue !== undefined ? String(arg.defaultValue) : undefined
    })),
    subcommands:
      cmd.commands.length > 0 ? introspectCommander(cmd as unknown as Command) : undefined
  }));
}
```

### Runtime Introspection: Yargs

```typescript
// Yargs stores commands differently — use .getInternalMethods() or parse .help() output
// Less clean than commander but achievable
export function introspectYargs(yargs: any): ExtractedConfigSurface[] {
  // Yargs exposes .getUsageInstance() and .getCommandInstance()
  // Fallback: call yargs.getHelp() which returns the help string, then parse it
  const helpText = yargs.getHelp();
  return parseHelpOutput(helpText);
}
```

### `--help` Fallback Parser

```typescript
export function parseHelpOutput(text: string): ExtractedConfigSurface {
  // Parse structured help text:
  //   Usage: <program> <command> [options]
  //   <description>
  //   Options:
  //     -c, --config <path>   Description (required)
  //     --dry-run             Description (default: false)

  const lines = text.split('\n');
  // Extract: usage line, description, options block, arguments
  // Return: ExtractedConfigSurface with parsed metadata
}
```

### Flag ↔ Property Correlation

```typescript
export function correlateFlags(
  cliSurface: ExtractedConfigSurface,
  configSurface: ExtractedConfigSurface | undefined
): ExtractedConfigSurface {
  if (!configSurface) return cliSurface;

  // Build lookup: property name → config option (with JSDoc tags)
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
      // CLI description wins over interface description (more specific)
      // But if CLI description is empty, use interface
      if (!cliOpt.description && prop.description) {
        cliOpt.description = prop.description;
      }
    }
  }

  // Merge command-level tags from interface
  cliSurface.useWhen ??= configSurface.useWhen;
  cliSurface.avoidWhen ??= configSurface.avoidWhen;
  cliSurface.pitfalls ??= configSurface.pitfalls;
  cliSurface.remarks ??= configSurface.remarks;

  return cliSurface;
}
```

---

## Rendering

### Config Surface in SKILL.md

Config surfaces render as a new section in SKILL.md, between Quick Start and Quick Reference:

```markdown
## Commands

### `generate`

Generate form components from Zod v4 schemas

**Usage:** `zod-to-form generate [options] <schema>`

**Use when:**

- You want static, hand-readable form components committed to source control
- You need zero-runtime-dependency form generation

**Avoid when:**

- Your schemas change frequently at runtime — use the React runtime instead

**Options:**

| Flag              | Type    | Required | Default            | Description                   |
| ----------------- | ------- | -------- | ------------------ | ----------------------------- |
| `--config <path>` | string  | yes      | —                  | Path to z2f.config.ts         |
| `--out <path>`    | string  | no       | `./src/components` | Output directory              |
| `--dry-run`       | boolean | no       | `false`            | Preview without writing files |

**Pitfalls:**

- NEVER run without --config — defaults to z2f.config.ts which may not exist
- NEVER use --out pointing at source root — overwrites without warning

## Configuration

### `ZodFormsConfig`

Configuration file format for z2f.config.ts

| Key                    | Type   | Required | Default | Description                      |
| ---------------------- | ------ | -------- | ------- | -------------------------------- |
| `preset`               | string | no       | —       | Component preset (e.g. "shadcn") |
| `components.overrides` | object | no       | —       | Per-component prop mappings      |
| `fields`               | object | no       | —       | Global field config by dot-path  |
```

### Config Surface in Reference Files

Detailed per-option documentation goes in `references/commands.md` and `references/config.md`:

```markdown
# Commands

## generate

Generate form components from Zod v4 schemas

**Usage:** `zod-to-form generate [options] <schema>`

### Options

#### `--config <path>` (required)

Path to z2f.config.ts

Resolved relative to cwd. Supports .ts, .js, and .json extensions.

**Use when:**

- You have a custom config location outside the project root

**Pitfalls:**

- NEVER use a relative path that traverses above cwd — resolution is sandboxed

#### `--dry-run`

Preview without writing files

**Default:** `false`

**Use when:**

- First time running against a new config — verify output paths
- CI validation — ensure generation succeeds without modifying the repo

**Pitfalls:**

- NEVER rely on dry-run output matching real output exactly — skips post-processing
```

---

## Audit Additions

### Config Surface Checks

| Code | Severity | Check                                                      |
| ---- | -------- | ---------------------------------------------------------- |
| CF1  | fatal    | Every CLI command must have a description                  |
| CF2  | fatal    | Every CLI option must have a description                   |
| CF3  | error    | Config interface properties must have JSDoc (same as E3)   |
| CF4  | error    | At least one command or config surface must have @pitfalls |
| CW1  | warning  | @useWhen on at least one option                            |
| CW2  | warning  | @avoidWhen on at least one option                          |
| CW3  | warning  | @remarks on options with complex behavior                  |

### Naming Convention Check

| Code | Severity | Check                                                                           |
| ---- | -------- | ------------------------------------------------------------------------------- |
| CA1  | alert    | Command `X` has no matching `XOptions` interface — JSDoc correlation won't work |

---

## User-Facing API

### @skillit/cli

```typescript
import { extractCliSkill } from '@skillit/cli';

const skill = await extractCliSkill({
  // CLI entry point (bin field from package.json)
  entryPoint: './packages/cli/dist/index.js',
  // Package metadata (same as TypeDoc plugin)
  metadata: { name: 'zod-to-form', keywords: [...], repository: '...' },
  // Config surfaces from TypeDoc (optional — for correlation)
  configSurfaces: extractedConfigSurfaces,
  // Strategy preference
  strategy: 'introspect',  // 'introspect' | 'help' | 'auto' (default: 'auto')
});

// skill is an ExtractedSkill with configSurfaces populated
// Feed to core renderer as usual
const rendered = renderSkill(skill);
```

### Integration with TypeDoc Plugin

The TypeDoc plugin can optionally invoke `@skillit/cli` if installed:

```typescript
// In plugin.ts, after API skill extraction:
try {
  const { extractCliSkill } = await import('@skillit/cli');
  const binEntries = pkg.bin;
  if (binEntries) {
    const cliSkill = await extractCliSkill({
      entryPoint: typeof binEntries === 'string' ? binEntries : Object.values(binEntries)[0],
      metadata: { name: pkg.name, ... },
      configSurfaces,  // from TypeDoc config interface detection
      strategy: 'auto',
    });
    // Render as separate skill
    const rendered = renderSkill(cliSkill);
    writeSkills([rendered], { outDir });
  }
} catch {
  // @skillit/cli not installed — skip CLI extraction
}
```

---

## Custom Tag Declaration

Projects using the CLI extractor add to `typedoc.json`:

```json
{
  "blockTags": ["@useWhen", "@avoidWhen", "@pitfalls", "@config"]
}
```

`@config` is declared alongside the existing custom tags. TypeDoc will parse it and the extractor reads it.

---

## What This Does NOT Cover

- **Non-TypeScript CLIs** — the `--help` fallback works for any CLI, but JSDoc correlation requires TypeScript interfaces
- **Interactive prompts** — CLIs that use `inquirer`/`prompts` for interactive input aren't captured
- **Dynamic command generation** — commands built at runtime from plugins/config can't be statically introspected
- **Config file validation** — the extractor documents the structure, not runtime validation behavior
- **`@skillit/markdown` extractor** — the fallback for prose docs, tutorials, and anything that isn't typed. Separate spec.
