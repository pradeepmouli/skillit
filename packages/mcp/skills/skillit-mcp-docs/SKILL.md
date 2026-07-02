---
name: skillit-mcp-docs
description: 'MCP server documentation conventions for high-quality generated skills. Use when writing tool descriptions, `_meta` annotations, or input schemas for MCP extraction.'
version: 0.1.0
skillit:
  managed: bundled-guidance
---

# MCP Documentation Conventions

Use this skill when documenting MCP servers for `@skillit/mcp`.

## Focus Areas

- Tool descriptions that explain purpose and invocation scenarios
- Flat `_meta` string fields — `useWhen`, `avoidWhen`, `pitfalls`, `remarks`, `example`
- Parameter and schema descriptions that explain valid inputs and effects
- Stable, specific tool names instead of generic verbs

## Fix Patterns

- Add one-sentence tool descriptions with when-to-call guidance
- Set `_meta.useWhen = "[scenario]"` directly on the tool's `_meta` — not nested under a `toSkills` key, and not an array
- Document each schema property with the effect on server behavior
- Prefer names like `read_project_file` over `get`
