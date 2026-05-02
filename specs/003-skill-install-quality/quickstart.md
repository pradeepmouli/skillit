# Quickstart: 003-skill-install-quality

## Scenario 1: TypeDoc user with install targets

```jsonc
// typedoc.json
{
  "plugin": ["typedoc-plugin-to-skills"],
  "skillsInstallTargets": [".claude/skills", ".agents/skills"]
}
```

```bash
pnpm typedoc
# [skills] rune-langium-core/SKILL.md (~2400 tokens)
# [skills]   └─ references/functions/ (3 files, split by category)
# [skills] Installed to .claude/skills/rune-langium-core/
# [skills] Installed to .agents/skills/rune-langium-core/
# [skills] Installed bundled to-skills-docs (v1.4.0) to .claude/skills/to-skills-docs/
# [skills] Installed bundled to-skills-docs (v1.4.0) to .agents/skills/to-skills-docs/
```

## Scenario 2: MCP extract with install target

```bash
to-skills-mcp extract \
  --command npx --arg -y --arg @modelcontextprotocol/server-filesystem \
  --install-target .claude/skills

# [extract] Extracted filesystem skill (12 tools)
# [extract] Written to skills/filesystem/SKILL.md
# [extract] Installed to .claude/skills/filesystem/
# [extract] Installed bundled to-skills-mcp-docs (v1.0.0) to .claude/skills/to-skills-mcp-docs/
```

## Scenario 3: Curated router preserved

```yaml
# skills/rune-langium/SKILL.md (hand-curated)
---
name: rune-langium
description: 'Router skill for the rune-langium monorepo...'
curated: true
---
# rune-langium
Use this router when...
```

```bash
pnpm typedoc
# [skills] Skipping rune-langium — curated router detected
# [skills] rune-langium-core/SKILL.md (~2400 tokens)
# ...per-package skills generated normally
```

## Scenario 4: Eval loop with audit suggestions

```bash
# Run 1: Initial generation
pnpm typedoc
# [audit] [FATAL] F4: renderSkill — Missing JSDoc
#   Suggested: /** [One sentence: what problem renderSkill solves for the caller] */
# [audit] [ERROR] E1: options — Missing @param description
#   Suggested: @param options — [What the caller controls with this parameter]

# Agent applies suggestions to source...
# Run 2: Regenerate
pnpm typedoc
# [audit] Score estimate: 94/120 (C+) → all fatals/errors resolved
```

## Scenario 5: Bundled skill version upgrade

```bash
# First install: plugin v1.3.0 → to-skills-docs v1.3.0
pnpm typedoc
# [skills] Installed bundled to-skills-docs (v1.3.0)

# Upgrade plugin to v1.4.0 → bundled to-skills-docs v1.4.0
pnpm add -D typedoc-plugin-to-skills@latest
pnpm typedoc
# [skills] Upgraded to-skills-docs from v1.3.0 → v1.4.0

# Re-run without upgrade → no-op
pnpm typedoc
# [skills] to-skills-docs already at v1.4.0 — skipping
```
