---
name: skillit-core
description: 'Shared types, SKILL.md renderer, and token budgeting for skillit plugins'
license: MIT
---

# @skillit/core

Shared types, SKILL.md renderer, and token budgeting for skillit plugins

## When to Use

- You have one or more ExtractedSkill objects and need SKILL.md + references/ output
- Building a custom extraction pipeline that bypasses the TypeDoc plugin
- You need fine-grained control over rendering a single skill
- You have RenderedSkill objects from renderSkills() and need to persist them to the filesystem
- Building a custom pipeline that separates rendering from writing (e.g., for preview or dry-run)
- You need structured README sections for audit context or skill enrichment
- The audit engine calls this to check for Features and Troubleshooting sections
- You want programmatic quality feedback on JSDoc coverage before publishing skills
- Building a CI gate that blocks PRs with undocumented exports
- You have hand-written prose docs (tutorials, guides, architecture) in a docs/ directory
- You want these docs included alongside API skills for richer agent context
- You have ParsedMarkdownDoc objects from scanDocs() and need to attach them to an ExtractedSkill
- You want to include well-known root-level markdown files (ARCHITECTURE.md, MIGRATION.md, CONTRIBUTING.md) as documents
- Supplementing API skills with project-level documentation context
- You have an `examples/` directory alongside source code
- You want to link example files to the exported symbols they demonstrate
- You have scanned examples with `scanExamples` and want to attach them to
- the relevant exported symbols inside an `ExtractedSkill`

**Avoid when:**

- Rapid local iteration where audit noise slows you down — use the skillsAudit: false option instead
- Your docs/ directory contains only auto-generated API docs — they duplicate the TypeDoc output
- Your root directory has many auto-generated or release-tracking markdown files — use explicit include lists instead
- Your examples are embedded as
- API surface: 18 functions, 25 types

## NEVER

- NEVER set maxTokens below 500 — reference files become truncated mid-signature, producing broken code blocks that confuse LLMs
- NEVER pass skills with empty `name` — the output directory becomes a bare `/` path
- NEVER set maxTokens below 500 — reference files become truncated mid-signature, producing broken code blocks

## Configuration

3 configuration interfaces — see references/config.md for details.

- **SkillRenderOptions** — Options controlling skill rendering
- **LlmsTxtOptions**
- **DocsExtractionOptions** — Configuration options that control how a docs directory is scanned and which
  markdown files are included in the extraction.

## Quick Reference

**Rendering:** `renderSkills`, `renderSkill`
**I/O:** `writeSkills`
**Token Management:** `estimateTokens`, `truncateToTokenBudget`
**llms-txt:** `renderLlmsTxt`, `LlmsTxtResult`
**Parsing:** `parseReadme`, `parseMarkdownDoc`, `scanDocs`, `docsToExtractedDocuments`, `scanRootDocs`, `scanExamples`, `linkExamplesToSkill`
**Audit:** `auditSkill`, `formatAuditText`, `formatAuditJson`
**config-renderer:** `renderConfigSurfaceSection`, `renderConfigReference`
**types:** `ExtractedSkill`, `ExtractedFunction`, `ExtractedClass`, `ExtractedType`, `ExtractedEnum`, `ExtractedParameter`, `ExtractedProperty`, `ExtractedVariable`, `ExtractedDocument`, `RenderedFile`, `RenderedSkill`
**audit-types:** `AuditSeverity`, `AuditIssue`, `AuditPass`, `AuditContext`, `ParsedReadme`, `AuditResult`
**config-types:** `ConfigSourceType`, `ExtractedConfigSurface`, `ExtractedConfigOption`, `ExtractedConfigArgument`
**markdown-types:** `ParsedSection`, `ParsedMarkdownDoc`
**examples-scanner:** `ParsedExample`

## Links

- [Repository](https://github.com/pradeepmouli/skillit)
- Author: Pradeep Mouli
