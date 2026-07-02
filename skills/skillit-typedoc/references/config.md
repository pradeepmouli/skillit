# Configuration

## SkillsPluginOptions

Configuration options for typedoc-plugin-skillit.

### Properties

#### skillsOutDir

Output directory for generated skill files

**Type:** `string`

#### skillsPerPackage

Emit one skill per package in a monorepo

**Type:** `boolean`

**Use when:**

- Your project is a monorepo with multiple packages

**Avoid when:**

- Single-package project — leave as default

#### skillsIncludeExamples

Include usage examples from

**Type:** `boolean`

#### skillsIncludeSignatures

Include type signatures in skill output

**Type:** `boolean`

#### skillsMaxTokens

Maximum approximate token budget per skill file

**Type:** `number`

**Never:**

- NEVER set below 500 — reference files become truncated mid-signature, producing broken code blocks

#### skillsNamePrefix

Custom prefix for skill names

**Type:** `string`

#### skillsLicense

License for generated skills (reads from package.json if empty)

**Type:** `string`

#### llmsTxt

Generate llms.txt and llms-full.txt alongside skills

**Type:** `boolean`

**Use when:**

- You want LLM-friendly API documentation following the llmstxt.org spec

#### llmsTxtOutDir

Output directory for llms.txt files

**Type:** `string`

#### skillsAudit

Run documentation audit during skill generation

**Type:** `boolean`

**Use when:**

- You want feedback on JSDoc quality during typedoc build

**Avoid when:**

- You find audit output noisy during rapid iteration — disable temporarily

#### skillsAuditFailOnError

Fail build on fatal or error severity audit issues

**Type:** `boolean`

**Use when:**

- CI enforcement — block PRs with undocumented exports

**Never:**

- NEVER enable during local development — it blocks all typedoc output on audit failures

#### skillsAuditJson

Path to write JSON audit report (empty = don't write)

**Type:** `string`

#### skillsIncludeDocs

Include prose docs from docs/ directory alongside API skills

**Type:** `boolean`

**Use when:**

- You have hand-written docs in a docs/ directory (tutorials, guides, architecture)

#### skillsDocsDir

Directory containing prose documentation

**Type:** `string`
