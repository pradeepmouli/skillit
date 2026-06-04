# Types & Enums

## types

### `ExtractedSkill`

Extracted API surface for a single package/module
**Properties:**

- `name: string` — Package or module name
- `description: string` — Package description
- `license: string` (optional) — License identifier (e.g. "MIT", "Apache-2.0")
- `keywords: string[]` (optional) — Keywords from package.json — used to enrich trigger descriptions
- `repository: string` (optional) — Repository URL
- `author: string` (optional) — Author name
- `packageDescription: string` (optional) — Package description from package.json or README intro — used for SKILL.md description and body
- `documents: ExtractedDocument[]` (optional) — Additional documentation content (from projectDocuments, README, etc.)
- `functions: ExtractedFunction[]` — Exported functions
- `classes: ExtractedClass[]` — Exported classes
- `types: ExtractedType[]` — Exported interfaces and type aliases
- `enums: ExtractedEnum[]` — Exported enums
- `variables: ExtractedVariable[]` — Exported variables and constants
- `examples: string[]` — Usage examples from
- `useWhen: string[]` (optional) — Aggregated
- `avoidWhen: string[]` (optional) — Aggregated
- `pitfalls: string[]` (optional) — Aggregated
- `configSurfaces: ExtractedConfigSurface[]` (optional) — Configuration surfaces (CLI commands, config files)

### `ExtractedFunction`

**Properties:**

- `name: string`
- `description: string`
- `signature: string`
- `parameters: ExtractedParameter[]`
- `returnType: string`
- `returnsDescription: string` (optional) — Prose description from
- `remarks: string` (optional) — Extended description from
- `examples: string[]`
- `tags: Record<string, string>`
- `overloads: string[]` (optional) — Additional overload signatures (if function has multiple signatures)
- `sourceModule: string` (optional) — Source module name derived from file path (e.g. "renderer", "tokens")
- `category: string` (optional) — Category for grouping (from

### `ExtractedClass`

**Properties:**

- `name: string`
- `description: string`
- `constructorSignature: string`
- `methods: ExtractedFunction[]`
- `properties: ExtractedProperty[]`
- `examples: string[]`
- `extends: string` (optional) — Base class name (from `extends`)
- `implements: string[]` (optional) — Implemented interface names (from `implements`)
- `sourceModule: string` (optional) — Source module name derived from file path (e.g. "renderer", "tokens")
- `category: string` (optional) — Category for grouping (from

### `ExtractedType`

**Properties:**

- `name: string`
- `description: string`
- `definition: string`
- `properties: ExtractedProperty[]` (optional)
- `sourceModule: string` (optional) — Source module name derived from file path (e.g. "renderer", "tokens")
- `category: string` (optional) — Category for grouping (from

### `ExtractedEnum`

**Properties:**

- `name: string`
- `description: string`
- `members: { name: string; value: string; description: string }[]`
- `sourceModule: string` (optional) — Source module name derived from file path (e.g. "renderer", "tokens")
- `category: string` (optional) — Category for grouping (from

### `ExtractedParameter`

**Properties:**

- `name: string`
- `type: string`
- `description: string`
- `optional: boolean`
- `defaultValue: string` (optional)

### `ExtractedProperty`

**Properties:**

- `name: string`
- `type: string`
- `description: string`
- `optional: boolean`

### `ExtractedVariable`

**Properties:**

- `name: string`
- `type: string`
- `description: string`
- `isConst: boolean`
- `sourceModule: string` (optional) — Source module name derived from file path (e.g. "renderer", "tokens")
- `category: string` (optional) — Category for grouping (from

### `ExtractedDocument`

**Properties:**

- `title: string` — Document title
- `content: string` — Document content (markdown)

### `RenderedFile`

A single rendered file
**Properties:**

- `filename: string` — File path relative to output dir
- `content: string` — File content
- `tokens: number` (optional) — Estimated token count

### `RenderedSkill`

A rendered skill with progressive disclosure structure
**Properties:**

- `skill: RenderedFile` — The SKILL.md discovery file (lean — frontmatter, overview, quick ref)
- `references: RenderedFile[]` — Reference files loaded on demand (functions, classes, types, etc.)

## llms-txt

### `LlmsTxtResult`

**Properties:**

- `summary: string` — llms.txt content (summary index)
- `full: string` — llms-full.txt content (complete API)
- `summaryTokens: number` — Estimated tokens for summary
- `fullTokens: number` — Estimated tokens for full

## audit-types

### `AuditSeverity`

Severity levels for audit issues, ordered from most to least severe.

- `fatal`: Disqualifying problems that prevent the skill from being used safely
- `error`: Serious problems that significantly degrade skill quality
- `warning`: Moderate problems that reduce skill effectiveness
- `alert`: Minor issues or suggestions for improvement

```ts
'fatal' | 'error' | 'warning' | 'alert';
```

### `AuditIssue`

A single audit finding that identifies a problem in the skill package.
**Properties:**

- `severity: AuditSeverity` — Severity level of this issue
- `code: string` — Short rule code, e.g. "F1", "E2", "W3", "A1"
- `file: string` — Relative path to the file containing the issue
- `line: number | null` — Line number within the file, or null if not applicable
- `symbol: string` — Name of the function, class, or property related to the issue
- `message: string` — Human-readable description of the problem
- `suggestion: string` — Actionable suggestion for how to fix the issue

### `AuditPass`

A check that the audit engine ran and the skill package passed.
**Properties:**

- `code: string` — Short rule code corresponding to the passed check
- `message: string` — Human-readable description of what was checked
- `detail: string` (optional) — Optional additional detail about the passing result

### `AuditContext`

Contextual metadata about the package being audited, used to evaluate
relevance and quality of skill content.
**Properties:**

- `packageDescription: string` (optional) — Description field from package.json
- `keywords: string[]` (optional) — Keywords from package.json
- `repository: string` (optional) — Repository URL from package.json
- `readme: ParsedReadme` (optional) — Parsed sections of the package README

### `ParsedReadme`

Structured representation of key sections extracted from a package README.
**Properties:**

- `blockquote: string` (optional) — Leading blockquote, often used as a one-liner summary
- `firstParagraph: string` (optional) — First prose paragraph after any heading or blockquote
- `quickStart: string` (optional) — Quick-start or getting-started section content
- `features: string` (optional) — Features or capabilities section content
- `pitfalls: string` (optional) — Pitfalls, caveats, or anti-patterns section content (maps to skill-judge D3)

### `AuditResult`

The complete output of an audit run against a single skill package.
**Properties:**

- `package: string` — Package name being audited
- `summary: Record<AuditSeverity, number>` — Count of issues found at each severity level
- `issues: AuditIssue[]` — All issues found during the audit
- `passing: AuditPass[]` — All checks that the package passed

## config-types

### `ConfigSourceType`

The source type of a configuration surface:

- 'cli' — a command-line command or subcommand
- 'config' — a configuration file (e.g. JSON, YAML, TOML)
- 'env' — environment variables

```ts
'cli' | 'config' | 'env';
```

### `ExtractedConfigSurface`

Describes a single configuration surface: a CLI command, config file schema,
or environment-variable group that an agent may need to invoke or populate.
**Properties:**

- `name: string` — Human-readable name of this surface (e.g. "build", "jest.config.ts")
- `description: string` — Short prose description of what this surface controls or triggers
- `sourceType: ConfigSourceType` — The kind of surface: CLI command/subcommand, config file, or env-var group.
  Agents use this to decide how to surface the information (flag syntax vs key
  path vs environment variable name).
- `usage: string` (optional) — Optional canonical usage example (e.g. `pnpm build --watch`).
  Shown verbatim so agents can copy-paste directly.
- `options: ExtractedConfigOption[]` — All options (flags, config keys, env vars) accepted by this surface
- `arguments: ExtractedConfigArgument[]` (optional) — Positional arguments accepted by this CLI surface, in order
- `subcommands: ExtractedConfigSurface[]` (optional) — Nested subcommands of this CLI surface (recursive)
- `useWhen: string[]` (optional) — Conditions under which an agent should prefer this surface.
  Mirrors the
- `avoidWhen: string[]` (optional) — Conditions under which an agent should avoid this surface.
  Mirrors the
- `pitfalls: string[]` (optional) — Known pitfalls, footguns, or common mistakes for this surface.
  Mirrors the
- `remarks: string` (optional) — Extended expert notes about this surface — edge cases, interaction effects,
  or nuances not captured by the description. Mirrors the

### `ExtractedConfigOption`

A single configurable option within a surface: a CLI flag, a config-file key,
or an environment variable (or any combination of the three).
**Properties:**

- `name: string` — Canonical name for this option (used as the display key)
- `cliFlag: string` (optional) — The long CLI flag for this option, including leading dashes
  (e.g. `--output-dir`). Omit if this option is not exposed via CLI.
- `cliShort: string` (optional) — The short CLI flag alias (e.g. `-o`).
  Omit if there is no short form.
- `configKey: string` (optional) — The dot-notation key path in a config file (e.g. `output.dir`).
  Omit if this option is not settable in a config file.
- `envVar: string` (optional) — The environment variable name that sets this option (e.g. `OUTPUT_DIR`).
  Omit if this option is not settable via environment variable.
- `type: string` — TypeScript-style type expression for the accepted value
  (e.g. `string`, `number`, `boolean`, `'esm' | 'cjs'`).
- `description: string` — Short prose description of what this option controls
- `required: boolean` — Whether this option must be supplied for the surface to function
- `defaultValue: string` (optional) — The default value when the option is not explicitly set.
  Serialised as a string (e.g. `"true"`, `"4000"`, `"\"dist\""`).
- `remarks: string` (optional) — Extended expert notes about this option — interaction effects, precedence
  rules, or platform-specific behaviour.
- `useWhen: string[]` (optional) — Conditions under which an agent should set this option.
  Mirrors the
- `avoidWhen: string[]` (optional) — Conditions under which an agent should avoid setting this option.
  Mirrors the
- `pitfalls: string[]` (optional) — Known pitfalls or common mistakes when using this option.
  Mirrors the
- `category: string` (optional) — Logical grouping label for this option (e.g. "Output", "Performance").
  Agents can use this to cluster related options in generated documentation.

### `ExtractedConfigArgument`

A positional command-line argument accepted by a CLI surface.
Positional arguments are ordered and do not use flag prefixes.
**Properties:**

- `name: string` — Symbolic name of this argument as shown in usage strings (e.g. `<file>`)
- `description: string` — Short prose description of what this argument represents
- `required: boolean` — Whether the caller must supply this argument
- `variadic: boolean` — Whether this argument is variadic (accepts one or more values,
  typically represented as `...<files>` in usage strings).
- `defaultValue: string` (optional) — The default value used when the argument is omitted (only meaningful
  when `required` is false). Serialised as a string.

## markdown-types

### `ParsedSection`

A single section extracted from a markdown document, corresponding to one
heading and all content that follows it until the next heading.
**Properties:**

- `heading: string` — The text content of the section heading, without the `#` prefix characters
- `level: number` — The heading depth: 1 for `#`, 2 for `##`, 3 for `###`, etc.
- `content: string` — All prose content within the section, excluding code blocks
- `codeBlocks: string[]` — Source text of every fenced code block found within the section

### `ParsedMarkdownDoc`

A fully parsed markdown document with structured metadata and sections.
**Properties:**

- `frontmatter: Record<string, unknown> | undefined` — Parsed YAML/TOML front-matter key-value pairs, or `undefined` if the document has none
- `title: string` — Document title, typically derived from the first `#`-level heading or front-matter
- `description: string | undefined` — Short description of the document, or `undefined` if none could be determined
- `relativePath: string` — File path to the document relative to the docs root directory
- `sections: ParsedSection[]` — Ordered list of sections extracted from the document body
- `rawContent: string` — Original unmodified markdown source text of the document
- `order: number` — Zero-based sort order used to sequence this document within a collection
