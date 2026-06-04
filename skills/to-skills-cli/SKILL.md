---
name: to-skills-cli
description: 'Extract CLI command structure from commander/yargs for AI agent skill generation Use when working with agent-skills, cli, commander, documentation, skill-generation, yargs.'
license: MIT
---

# @skillit/cli

Extract CLI command structure from commander/yargs for AI agent skill generation

## When to Use

- Working with agent-skills, cli, commander, documentation, skill-generation, yargs
- You have a Commander program and want structured option/argument extraction with full fidelity
- Runtime introspection is unavailable (no access to the program object)
- The CLI uses a framework other than Commander (yargs, oclif, custom)
- You have both CLI surfaces (from introspection/help) and typed config interfaces (from TypeDoc)
- You want JSDoc @useWhen/@avoidWhen/@pitfalls tags to appear on CLI options in the generated skill
- You have a Commander program and want to generate a skill from its command structure
- You have raw --help output and no runtime access to the program object

**Avoid when:**

- Your CLI uses yargs, oclif, or another framework — use parseHelpOutput as a fallback instead
- Your CLI is built with a framework other than Commander — use parseHelpOutput directly instead
- API surface: 4 functions

## Pitfalls

- NEVER pass both `program` and `helpTexts` — program takes precedence and helpTexts is silently ignored
- NEVER forget to pass configSurfaces when you have typed option interfaces — JSDoc metadata won't be correlated

## Configuration

**CliExtractionOptions** (4 options — see references/config.md)

## Quick Reference

**Commander:** `introspectCommander`
**Fallback:** `parseHelpOutput`
**Correlation:** `correlateFlags`
**Extraction:** `extractCliSkill`

## Links

- [Repository](https://github.com/pradeepmouli/to-skills)
- Author: Pradeep Mouli
