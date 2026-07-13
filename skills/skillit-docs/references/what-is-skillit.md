# What is skillit?

# skillit

> Generate AI agent skills from your TypeScript documentation.

skillit is a plugin ecosystem that transforms your existing JSDoc, CLI definitions, and prose docs into structured [SKILL.md](https://agentskills.io) files that LLMs can discover and use.

## Why?

LLMs are great at code — but they don't know YOUR library's API, trade-offs, and pitfalls. Skills bridge that gap by extracting expert knowledge from your documentation and packaging it for agent consumption.

## How It Works

1. **Write JSDoc** with convention tags (`@useWhen`, `@avoidWhen`, `@never`)
2. **Run TypeDoc** — the plugin extracts and generates skills automatically
3. **LLMs discover your library** via the structured SKILL.md

## Quick Install

```bash
pnpm add -D typedoc-plugin-skillit
pnpm typedoc
```

That's it. Skills are written to `skills/<package-name>/SKILL.md`.
