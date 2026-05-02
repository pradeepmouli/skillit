# Quickstart: 003-skill-install-quality

## Scenario 1: TypeDoc user with install targets

```jsonc
// typedoc.json
{
  // Optional when the package is installed normally — TypeDoc auto-discovers it.
  "plugin": ["typedoc-plugin-to-skills"],
  "skillsInstallTargets": [".claude/skills", ".agents/skills"]
}
```

```bash
pnpm typedoc
# [skills] rune-langium-core/SKILL.md (~2400 tokens)
# [skills]   └─ rune-langium-core/references/functions.md (~900 tokens)

# Files written:
#   skills/rune-langium-core/SKILL.md
#   .claude/skills/rune-langium-core/SKILL.md
#   .agents/skills/rune-langium-core/SKILL.md
#   .claude/skills/to-skills-docs/SKILL.md
#   .agents/skills/to-skills-docs/SKILL.md
```

## Scenario 2: MCP extract with install target

```bash
to-skills-mcp extract \
  --command npx --arg -y --arg @modelcontextprotocol/server-filesystem --arg /tmp \
  --install-target .claude/skills

# Wrote skills/filesystem/SKILL.md
#
# Files installed:
#   .claude/skills/filesystem/SKILL.md
#   .claude/skills/to-skills-mcp-docs/SKILL.md
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
# Existing curated router stays unchanged.
# Per-package outputs under skills/rune-langium-core/ still refresh normally.
```

## Scenario 4: Eval loop with audit suggestions

```bash
# Run 1: Initial generation
pnpm typedoc
# Audit output includes actionable FATAL / ERROR lines with concrete suggestions.

# Agent applies suggestions to source...
# Run 2: Regenerate
pnpm typedoc
# Re-run after fixes: fatal/error findings clear and the score estimate improves.
```

## Scenario 5: Bundled skill version upgrade

```bash
# First install: plugin v1.3.0 → to-skills-docs v1.3.0
pnpm typedoc
# Result: .claude/skills/to-skills-docs/SKILL.md contains version 1.3.0

# Upgrade plugin to v1.4.0 → bundled to-skills-docs v1.4.0
pnpm add -D typedoc-plugin-to-skills@latest
pnpm typedoc
# Result: installed bundled guidance updates to version 1.4.0

# Re-run without upgrade → no-op
pnpm typedoc
# Result: installed bundled guidance stays unchanged at version 1.4.0
```

## Scenario 6: CLI extraction with installed guidance

```typescript
import { Command } from 'commander';
import { extractCliSkill, writeCliSkill } from '@to-skills/cli';

const program = new Command().name('demo');
program.command('build').description('Build the project');

const skill = await extractCliSkill({
  program,
  metadata: { name: 'demo' }
});

writeCliSkill(skill, {
  outDir: 'skills',
  installTargets: ['.claude/skills']
});

// skills/demo/SKILL.md
// .claude/skills/demo/SKILL.md
// .claude/skills/to-skills-cli-docs/SKILL.md
// (no skills/to-skills-cli-docs copy is written)
```
