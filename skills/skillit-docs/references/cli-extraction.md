# CLI Extraction

# CLI & Config Extraction

> The `@skillit/cli` package extracts CLI command structure and correlates flags with typed interfaces so your skill documents both the CLI and its configuration.

Many libraries have a CLI that users interact with more than the programmatic API. A user running `npx my-tool generate --config config.ts` needs to know command flags, config file structure, and option trade-offs --- not function signatures.

## How It Works

The `@skillit/cli` package extracts CLI command structure via runtime introspection or `--help` parsing, then correlates CLI flags with your typed TypeScript interfaces. The result: each flag gets both its commander metadata (flag syntax, defaults, required) and your JSDoc expert knowledge (`@useWhen`, `@never`, `@remarks`).

```
CLI entry point ─── introspect commander/yargs ───┐
                                                    ├─ merged config surface
TypeDoc interfaces ─── detect @config / *Options ──┘
```

## Commander Introspection (Preferred)

If your CLI uses [commander](https://github.com/tj/commander.js), the extractor imports your program and walks its command tree:

```typescript
import { extractCliSkill } from '@skillit/cli';

const skill = await extractCliSkill({
  entryPoint: './dist/cli.js',
  metadata: {
    name: 'my-tool',
    keywords: ['generate', 'codegen', 'schema'],
    repository: 'https://github.com/org/my-tool'
  },
  strategy: 'introspect' // 'introspect' | 'help' | 'auto'
});
```

The introspector reads commands, options, arguments, and descriptions directly from commander's internal data structures --- no parsing of text output needed.

## `--help` Fallback

For CLIs not built with commander or yargs, the extractor falls back to running `node <entry> --help` and parsing the structured text output:

```typescript
const skill = await extractCliSkill({
  entryPoint: './dist/cli.js',
  metadata: { name: 'my-tool' /* ... */ },
  strategy: 'help' // force --help parsing
});
```

The parser handles standard help format:

```
Usage: my-tool generate [options] <schema>

Generate form components from schemas

Options:
  -c, --config <path>   Path to config file (required)
  --out <path>          Output directory (default: "./src/components")
  --dry-run             Preview without writing files
  -h, --help            Display help
```

## Config Interface Detection

The TypeDoc plugin recognizes config interfaces and extracts them as config surfaces instead of regular types. Detection uses two signals:

**1. The `@config` tag** (explicit, preferred):

```typescript
/**
 * Configuration for the generate command.
 * @config
 */
export interface GenerateOptions {
  /** Path to config file */
  config: string;
  /** Preview without writing files */
  dryRun?: boolean;
}
```

**2. Name suffix** (automatic fallback): interfaces ending with `Options`, `Config`, `Configuration`, or `Settings` at a PascalCase boundary.

Declare the `@config` tag in `typedoc.json`:

```json
{
  "blockTags": ["@useWhen", "@avoidWhen", "@never", "@config"]
}
```

## Flag-to-Property Correlation

This is where the power is. The extractor matches CLI flags to interface properties by camelCase name:

```
CLI flag:    --dry-run     → camelCase → dryRun
Interface:   GenerateOptions.dryRun
```

When a match is found, the JSDoc on the interface property enriches the CLI option:

```typescript
/** @config */
export interface GenerateOptions {
  /**
   * Preview without writing files
   *
   * @remarks
   * Resolved relative to cwd. Skips post-processing hooks,
   * so output may differ slightly from a real run.
   *
   * @useWhen
   * - First time running against a new config --- verify output paths
   * - CI validation --- ensure generation succeeds without modifying the repo
   *
   * @never
   * - NEVER rely on dry-run output matching real output exactly ---
   *   skips post-processing
   *
   * @defaultValue false
   */
  dryRun?: boolean;
}
```

The merged result in the generated skill includes both the CLI syntax (`--dry-run`) and the expert knowledge from JSDoc.

### Naming Convention

The correlator looks for a matching interface by command name:

| Command    | Expected Interface |
| ---------- | ------------------ |
| `generate` | `GenerateOptions`  |
| `build`    | `BuildOptions`     |
| `init`     | `InitConfig`       |

If no matching interface is found, the skill still includes CLI metadata from introspection --- it just won't have the extended JSDoc tags.

## What Gets Rendered

### In SKILL.md

Commands render as a structured section with flags, defaults, and expert guidance:

```markdown
## Commands

### `generate`

Generate form components from Zod schemas

**Usage:** `my-tool generate [options] <schema>`

**Options:**

| Flag              | Type    | Required | Default            | Description            |
| ----------------- | ------- | -------- | ------------------ | ---------------------- |
| `--config <path>` | string  | yes      | ---                | Path to config file    |
| `--out <path>`    | string  | no       | `./src/components` | Output directory       |
| `--dry-run`       | boolean | no       | `false`            | Preview without writes |

**Never:**

- NEVER run without --config --- defaults to config.ts which may not exist
```

### In Reference Files

Detailed per-option documentation goes in `references/commands.md` with full `@useWhen`, `@avoidWhen`, `@never`, and `@remarks` for each option.

## Integration with TypeDoc Plugin

The TypeDoc plugin can automatically invoke `@skillit/cli` when a `bin` field exists in `package.json`:

```typescript
// Happens automatically if @skillit/cli is installed
// The plugin checks:
//   1. Does package.json have a bin field?
//   2. Is @skillit/cli available?
//   3. Are there *Options/*Config interfaces to correlate?
// If yes, a separate CLI skill is generated alongside the API skill.
```

Install the package to enable this:

```bash
pnpm add -D @skillit/cli
```

No additional configuration needed --- the plugin detects it and uses it.
