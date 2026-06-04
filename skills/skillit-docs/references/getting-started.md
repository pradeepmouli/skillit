# Getting Started

# Getting Started

> Install, configure, and generate your first skill in 5 minutes.

## Install

```bash
pnpm add -D typedoc-plugin-skillit
```

TypeDoc auto-discovers the plugin. No config needed for basic usage.

## Configure (optional)

Add options to your `typedoc.json`:

```json
{
  "plugin": ["typedoc-plugin-skillit"],
  "skillsOutDir": "skills",
  "skillsPerPackage": true,
  "skillsAudit": true,
  "blockTags": ["@useWhen", "@avoidWhen", "@pitfalls", "@config"]
}
```

## Generate

```bash
pnpm typedoc
```

Check `skills/<package-name>/SKILL.md` — your first generated skill.

## Next Steps

- [JSDoc Conventions](/guide/conventions) — full tag reference
- [Documentation Audit](/guide/audit) — automated quality checks
- [CLI Extraction](/guide/cli-extraction) — generate skills for CLI tools
