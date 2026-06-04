# Functions

## Commander

### `introspectCommander`

Introspects a commander Program object and extracts all top-level command
definitions as ExtractedConfigSurface[].

```ts
introspectCommander(program: any): ExtractedConfigSurface[]
```

**Parameters:**

- `program: any` — A commander `Command` instance (typed as `any` to avoid
  a hard dependency on the commander package at the call site).
  **Returns:** `ExtractedConfigSurface[]` — An array of extracted config surfaces, one per top-level command.
  Returns an empty array if the program has no subcommands.

## Fallback

### `parseHelpOutput`

Parse standard `--help` text output into an ExtractedConfigSurface.

This is the framework-agnostic fallback used when runtime introspection of a
commander/yargs program is not available.

```ts
parseHelpOutput(text: string, commandName: string): ExtractedConfigSurface
```

**Parameters:**

- `text: string` — Raw text emitted by `program --help`
- `commandName: string` — Canonical name for this surface (e.g. `"generate"`)
  **Returns:** `ExtractedConfigSurface`

## Correlation

### `correlateFlags`

Merges JSDoc tag metadata from a typed config interface surface into CLI
option metadata extracted from commander/--help output.

The CLI surface is treated as authoritative for structural fields (flags,
description, required, defaultValue). The config surface contributes rich
JSDoc metadata (remarks, useWhen, avoidWhen, pitfalls, category) that the
CLI help text does not capture.

```ts
correlateFlags(cliSurface: ExtractedConfigSurface, configSurface: ExtractedConfigSurface | undefined): ExtractedConfigSurface
```

**Parameters:**

- `cliSurface: ExtractedConfigSurface` — The surface extracted from CLI introspection/help parsing
- `configSurface: ExtractedConfigSurface | undefined` — The surface extracted from a typed config interface (optional)
  **Returns:** `ExtractedConfigSurface` — A new ExtractedConfigSurface combining both sources

## Extraction

### `extractCliSkill`

Extract a structured skill from a CLI program.

Runs the three-phase pipeline: introspect (or parse help) → correlate with typed interfaces → produce ExtractedSkill.

```ts
extractCliSkill(options: CliExtractionOptions): Promise<ExtractedSkill>
```

**Parameters:**

- `options: CliExtractionOptions`
  **Returns:** `Promise<ExtractedSkill>`
