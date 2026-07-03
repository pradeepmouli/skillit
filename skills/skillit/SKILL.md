---
name: skillit
description: Generate structured AI agent skills (SKILL.md) and llms.txt from your TypeScript API documentation
license: MIT
---

# skillit

Generate structured AI agent skills (SKILL.md) and llms.txt from your TypeScript API documentation

## When to Use

- You have a Commander program and want structured option/argument extraction with full fidelity
- Runtime introspection is unavailable (no access to the program object)
- The CLI uses a framework other than Commander (yargs, oclif, custom)
- You have both CLI surfaces (from introspection/help) and typed config interfaces (from TypeDoc)
- You want JSDoc @useWhen/@avoidWhen/@never tags to appear on CLI options in the generated skill
- You have a Commander program and want to generate a skill from its command structure
- You have raw --help output and no runtime access to the program object

**Avoid when:**

- Your CLI uses yargs, oclif, or another framework — use parseHelpOutput as a fallback instead
- Your CLI is built with a framework other than Commander — use parseHelpOutput directly instead
- API surface: 4 functions

## NEVER

- NEVER pass both `program` and `helpTexts` — program takes precedence and helpTexts is silently ignored
- NEVER forget to pass configSurfaces when you have typed option interfaces — JSDoc metadata won't be correlated

## Configuration

### CliExtractionOptions

| Key              | Type                                                                                                 | Required | Default | Description                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------- |
| `program`        | `any`                                                                                                | no       | —       | Commander program object (preferred)               |
| `helpTexts`      | `Record<string, string>`                                                                             | no       | —       | Help text per command (fallback)                   |
| `metadata`       | `{ name?: string; description?: string; keywords?: string[]; repository?: string; author?: string }` | no       | —       | Package metadata                                   |
| `configSurfaces` | `ExtractedConfigSurface[]`                                                                           | no       | —       | Config surfaces from TypeDoc for JSDoc correlation |

## Quick Reference

**Commander:** `introspectCommander`
**Fallback:** `parseHelpOutput`
**Correlation:** `correlateFlags`
**Extraction:** `extractCliSkill`

## Links

- [Repository](https://github.com/pradeepmouli/skillit)
- Author: Pradeep Mouli
