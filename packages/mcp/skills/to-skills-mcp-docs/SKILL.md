---
name: to-skills-mcp-docs
description: 'MCP server documentation conventions for high-quality generated skills. Use when writing tool descriptions, `_meta.toSkills` annotations, or input schemas for MCP extraction.'
version: 0.1.0
toSkills:
  managed: bundled-guidance
---

# MCP Documentation Conventions

Use this skill when documenting MCP servers for `@skillit/mcp`.

## Focus Areas

- Tool descriptions that explain purpose and invocation scenarios
- `_meta.toSkills` structure with `useWhen`, `avoidWhen`, and `remarks`
- Parameter and schema descriptions that explain valid inputs and effects
- Stable, specific tool names instead of generic verbs

## Fix Patterns

- Add one-sentence tool descriptions with when-to-call guidance
- Use `_meta.toSkills.useWhen = ["[scenario]"]`, not a bare string
- Document each schema property with the effect on server behavior
- Prefer names like `read_project_file` over `get`
