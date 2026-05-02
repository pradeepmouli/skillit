---
name: to-skills-docs
description: 'Documentation conventions for generating high-quality AI agent skills from TypeScript source. Use when preparing a library for skill generation, auditing JSDoc quality, fixing audit warnings, writing @useWhen/@avoidWhen/@never tags, or asking about documentation conventions for skills.'
version: 1.3.0
toSkills:
  managed: bundled-guidance
---

# Documentation Conventions for Skill Generation

Use this skill when improving TypeScript package metadata, README structure, and public JSDoc so `typedoc-plugin-to-skills` can generate better SKILL.md output.

## Focus Areas

- Package metadata: meaningful `description`, domain keywords, repository URL
- README shape: opening summary, Features, Troubleshooting
- JSDoc coverage: summaries, `@param`, `@returns`, `@remarks`, `@example`
- Skill routing tags: `@useWhen`, `@avoidWhen`, `@never`, `@category`

## Fix Patterns

- Prefer problem-oriented summaries over type restatements
- Write `@param` prose around caller-visible effects
- Use `@never` in `NEVER [action] — [reason]. Fix: [recovery path]` form
- Add 3–5 strong `@useWhen` triggers to important exports
