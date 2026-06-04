# Configuration

## SkillRenderOptions

Options controlling skill rendering

### Properties

#### outDir

Output directory for skill files (default: ".github/skills")

**Type:** `string`

**Required:** yes

#### includeExamples

Include usage examples (default: true)

**Type:** `boolean`

**Required:** yes

#### includeSignatures

Include type signatures (default: true)

**Type:** `boolean`

**Required:** yes

#### maxTokens

Maximum approximate token budget per skill (default: 4000)

**Type:** `number`

**Required:** yes

#### namePrefix

Custom name prefix

**Type:** `string`

**Required:** yes

#### license

License to include in frontmatter (default: read from package.json)

**Type:** `string`

**Required:** yes

## LlmsTxtOptions

### Properties

#### projectName

Project name (falls back to first skill name)

**Type:** `string`

**Required:** yes

#### projectDescription

Project description

**Type:** `string`

**Required:** yes

## DocsExtractionOptions

Configuration options that control how a docs directory is scanned and which
markdown files are included in the extraction.

### Properties

#### docsDir

Absolute or relative path to the directory containing markdown documentation files

**Type:** `string`

**Required:** yes

#### include

Glob pattern selecting files to include; when `undefined` all `.md` files are included

**Type:** `string | undefined`

**Required:** yes

#### exclude

Glob patterns for files to exclude from extraction; `undefined` means no exclusions

**Type:** `string[] | undefined`

**Required:** yes

#### maxDocs

Maximum number of documents to return; `undefined` means no limit

**Type:** `number | undefined`

**Required:** yes
