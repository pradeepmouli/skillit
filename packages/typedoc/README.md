# @skillit/typedoc

TypeDoc plugin that generates AI agent skills ([SKILL.md](https://agentskills.io)) and optionally [llms.txt](https://llmstxt.org) from your TypeScript API documentation.

## Install

```bash
pnpm add -D @skillit/typedoc
```

Add to your `typedoc.json`:

```json
{
  "plugin": ["@skillit/typedoc"]
}
```

Or use the auto-discovery wrapper instead — see [`typedoc-plugin-skillit`](../typedoc-plugin).

## What It Does

Hooks into TypeDoc's converter to extract your public API surface and render it as structured SKILL.md files:

- Functions with signatures, parameters, return types
- Classes with constructors, methods, properties
- Interfaces and type aliases
- Enums with members
- Usage examples from `@example` JSDoc tags
- Token-budgeted output (configurable, default 4000)

Output goes to `skills/<package-name>/SKILL.md`, discoverable via `npx skills add`.

## Options

All options can be set in `typedoc.json`:

| Option                    | Default    | Description                          |
| ------------------------- | ---------- | ------------------------------------ |
| `skillsOutDir`            | `"skills"` | Output directory                     |
| `skillsPerPackage`        | `true`     | One skill per package in monorepos   |
| `skillsIncludeExamples`   | `true`     | Include `@example` tags              |
| `skillsIncludeSignatures` | `true`     | Include type signatures              |
| `skillsMaxTokens`         | `4000`     | Token budget per skill               |
| `skillsNamePrefix`        | `""`       | Custom skill name prefix             |
| `skillsLicense`           | auto       | License (reads from package.json)    |
| `llmsTxt`                 | `false`    | Also generate llms.txt/llms-full.txt |
| `llmsTxtOutDir`           | `"."`      | Where to write llms.txt files        |

## Monorepo Support

With `skillsPerPackage: true` (default), each package in a monorepo gets its own skill file. TypeDoc must be configured with multiple entry points:

```json
{
  "entryPoints": ["packages/*/src/index.ts"]
}
```

## License

MIT
