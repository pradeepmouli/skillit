# Functions

## Rendering

### `renderSkills`

Render multiple extracted skills into progressive disclosure file sets.

```ts
renderSkills(skills: ExtractedSkill[], options?: Partial<SkillRenderOptions>): RenderedSkill[]
```

**Parameters:**

- `skills: ExtractedSkill[]`
- `options: Partial<SkillRenderOptions>` (optional)
  **Returns:** `RenderedSkill[]`

### `renderSkill`

Render a single skill into SKILL.md + references/.

```ts
renderSkill(skill: ExtractedSkill, options?: Partial<SkillRenderOptions>): RenderedSkill
```

**Parameters:**

- `skill: ExtractedSkill`
- `options: Partial<SkillRenderOptions>` (optional)
  **Returns:** `RenderedSkill`

## I/O

### `writeSkills`

Write rendered skill file sets to disk (SKILL.md + references/).

```ts
writeSkills(skills: RenderedSkill[], options: Pick<SkillRenderOptions, "outDir">): void
```

**Parameters:**

- `skills: RenderedSkill[]`
- `options: Pick<SkillRenderOptions, "outDir">`

## Token Management

### `estimateTokens`

Rough token estimate: ~4 chars per token for English/code.
Not exact, but good enough for budgeting skill file sizes.

```ts
estimateTokens(text: string): number
```

**Parameters:**

- `text: string`
  **Returns:** `number`

### `truncateToTokenBudget`

Truncate text to fit within a token budget, preserving complete lines.

```ts
truncateToTokenBudget(text: string, maxTokens: number): string
```

**Parameters:**

- `text: string`
- `maxTokens: number`
  **Returns:** `string`

## llms-txt

### `renderLlmsTxt`

Render llms.txt and llms-full.txt from extracted skills

```ts
renderLlmsTxt(skills: ExtractedSkill[], options: LlmsTxtOptions): LlmsTxtResult
```

**Parameters:**

- `skills: ExtractedSkill[]`
- `options: LlmsTxtOptions`
  **Returns:** `LlmsTxtResult`

## Parsing

### `parseReadme`

Parse a README markdown string and extract structured sections.

Extraction rules:

- **blockquote** – first `> …` line between `# title` and the first `## heading`.
- **firstParagraph** – first prose lines before the first `## heading` that are
  not a heading, badge (`[![`), image (`![`), blockquote, or blank.
  Consecutive lines are joined with a single space.
- **quickStart** – content under `## Quick Start`, `## Usage`, or `## Getting Started`.
- **features** – content under `## Features`, `## Key Features`, or `## Highlights`.
- **troubleshooting** – content under `## Troubleshooting`, `## Common Issues`, `## Common Errors`,
  or `## FAQ`.

```ts
parseReadme(markdown: string): ParsedReadme
```

**Parameters:**

- `markdown: string`
  **Returns:** `ParsedReadme`

### `parseMarkdownDoc`

Parse a markdown document string into a structured `ParsedMarkdownDoc`.

```ts
parseMarkdownDoc(markdown: string, filePath: string): ParsedMarkdownDoc
```

**Parameters:**

- `markdown: string` — Raw markdown source text.
- `filePath: string` — File path used for `relativePath`, title fallback, and order fallback.
  **Returns:** `ParsedMarkdownDoc`

### `scanDocs`

Scan a docs directory and return parsed markdown documents.

- Returns `[]` when `docsDir` does not exist.
- Recursively collects `.md` / `.mdx` files, honouring exclude patterns.
- Default exclusions: **/api/**, **/node_modules/**, **/.specify/**, **/superpowers/**.
- Sorts ascending by `order`, then alphabetically by `title`.
- Truncates to `maxDocs` (default 20).

```ts
scanDocs(options: DocsExtractionOptions): ParsedMarkdownDoc[]
```

**Parameters:**

- `options: DocsExtractionOptions`
  **Returns:** `ParsedMarkdownDoc[]`

### `docsToExtractedDocuments`

Convert parsed markdown documents to the generic `ExtractedDocument` shape.

```ts
docsToExtractedDocuments(docs: ParsedMarkdownDoc[]): ExtractedDocument[]
```

**Parameters:**

- `docs: ParsedMarkdownDoc[]`
  **Returns:** `ExtractedDocument[]`

### `scanRootDocs`

Scan root-level .md files that contain useful documentation.
Skips README.md (parsed separately), LICENSE, CODE_OF_CONDUCT.md.

```ts
scanRootDocs(projectRoot: string): ParsedMarkdownDoc[]
```

**Parameters:**

- `projectRoot: string`
  **Returns:** `ParsedMarkdownDoc[]`

### `scanExamples`

Scan an examples directory for `.ts`/`.js`/`.tsx`/`.jsx` files and parse
their import statements and top-level comments.

```ts
scanExamples(examplesDir: string): ParsedExample[]
```

**Parameters:**

- `examplesDir: string`
  **Returns:** `ParsedExample[]`

```ts
JSDoc tags (use TypeDoc extraction instead)
```

### `linkExamplesToSkill`

Mutate an `ExtractedSkill` in place by linking each example to the first
matching exported function or class. Falls back to `skill.examples` when no
symbol matches any export.

```ts
linkExamplesToSkill(examples: ParsedExample[], skill: ExtractedSkill): void
```

**Parameters:**

- `examples: ParsedExample[]`
- `skill: ExtractedSkill`

## Audit

### `auditSkill`

Run the documentation audit on a single extracted skill.

Executes 20+ checks across fatal/error/warning/alert severity levels and returns
a structured result with issues, passing checks, and summary counts.

```ts
auditSkill(skill: ExtractedSkill, context: AuditContext): AuditResult
```

**Parameters:**

- `skill: ExtractedSkill`
- `context: AuditContext`
  **Returns:** `AuditResult`

### `formatAuditText`

Format an AuditResult as human-readable text suitable for TypeDoc logs.

Output groups issues by severity (fatal → error → warning → alert),
then lists passing checks at the end. Empty severity groups are omitted.

```ts
formatAuditText(result: AuditResult): string
```

**Parameters:**

- `result: AuditResult`
  **Returns:** `string`

### `formatAuditJson`

Format an AuditResult as pretty-printed JSON for machine consumption.

Returns the full result object serialized with 2-space indentation so it
can be parsed by downstream tooling without any further transformation.

```ts
formatAuditJson(result: AuditResult): string
```

**Parameters:**

- `result: AuditResult`
  **Returns:** `string`

## config-renderer

### `renderConfigSurfaceSection`

Render ExtractedConfigSurface[] as SKILL.md inline sections.

CLI surfaces → ## Commands
Config/env surfaces → ## Configuration

```ts
renderConfigSurfaceSection(surfaces: ExtractedConfigSurface[] | undefined): string
```

**Parameters:**

- `surfaces: ExtractedConfigSurface[] | undefined`
  **Returns:** `string`

### `renderConfigReference`

Render ExtractedConfigSurface[] as per-option detail for reference files.

CLI surfaces → # Commands with ## commandName / #### --flag
Config/env surfaces → # Configuration with ## InterfaceName / #### propertyName

```ts
renderConfigReference(surfaces: ExtractedConfigSurface[] | undefined): string
```

**Parameters:**

- `surfaces: ExtractedConfigSurface[] | undefined`
  **Returns:** `string`
