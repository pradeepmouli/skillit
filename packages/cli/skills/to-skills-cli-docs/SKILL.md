---
name: to-skills-cli-docs
description: 'CLI documentation conventions for generated skills. Use when improving Commander descriptions, help text, positional argument docs, and config-surface correlation.'
version: 0.3.13
toSkills:
  managed: bundled-guidance
---

# CLI Documentation Conventions

Use this skill when documenting command-line programs for `@to-skills/cli`.

## Focus Areas

- `.description()` text on commands and subcommands
- `.option()` and `--help` descriptions for every flag
- `.argument()` descriptions for positional inputs
- `.usage()` strings and example help text
- Environment-variable documentation and config-surface JSDoc correlation

## Fix Patterns

- Describe command intent in one sentence, not just the verb
- Explain what each option changes in behavior
- Document positional arguments with expected format or values
- Mention env vars explicitly when an option supports them
