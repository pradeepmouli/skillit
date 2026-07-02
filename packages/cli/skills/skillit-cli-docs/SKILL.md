---
name: skillit-cli-docs
description: 'CLI documentation conventions for generated skills. Use when improving Commander descriptions, help text, positional argument docs, and config-surface correlation.'
version: 0.3.13
skillit:
  managed: bundled-guidance
---

# CLI Documentation Conventions

Use this skill when documenting command-line programs for `@skillit/cli`.

## Focus Areas

- `.description()` text on commands and subcommands
- `.option()` and `--help` descriptions for every flag
- `.argument()` descriptions for positional inputs
- `.usage()` strings and example help text
- Environment-variable documentation and config-surface JSDoc correlation

## Routing Tags via Option Interfaces

For routing tags (`@useWhen`, `@avoidWhen`, `@never`), add them as JSDoc on
a `<PascalCommandName>Options` interface in a TypeScript source file.
The interface needs no properties — only the JSDoc block matters:

```typescript
/**
 * @useWhen - Server advertises callHierarchyProvider capability
 * @avoidWhen - Server doesn't support call hierarchy; lsproxy will error
 * @never - NEVER invoke without verifying server supports this capability. Fix: check --help output or use `lsproxy call` to probe the server first
 */
interface CallHierarchyOptions {}
```

`CliRefineSource` discovers these interfaces via the source glob (`**/*.ts`) and
correlates their tags onto the corresponding command in the generated skill.
Create one per command that needs routing guidance; the filename is arbitrary
(e.g. `src/command-options.ts`). After adding the interface, re-run `skillit gen`
to regenerate — `resolveTargetLocation` will now resolve and `skillit refine`
can write tags into the interface directly.

## Fix Patterns

- Describe command intent in one sentence, not just the verb
- Explain what each option changes in behavior
- Document positional arguments with expected format or values
- Mention env vars explicitly when an option supports them
