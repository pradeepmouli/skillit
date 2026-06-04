# @skillit/cli

> Extract CLI command structure from commander/yargs for AI agent skill generation.

Part of the [to-skills](https://github.com/pradeepmouli/to-skills) ecosystem.

## Features

- **Commander introspection** — enumerate commands, options, arguments from a Program object
- **`--help` fallback** — parse standard help text for any CLI framework
- **Flag-to-property correlation** — merge JSDoc tags from typed options interfaces into CLI metadata
- **Token-budgeted output** — generated skills fit LLM context windows

## Install

```bash
pnpm add -D @skillit/cli
```

## Usage

```typescript
import { extractCliSkill, writeCliSkill } from '@skillit/cli';

const skill = await extractCliSkill({
  program, // commander Program object
  metadata: { name: 'my-tool', keywords: ['build', 'deploy'] }
});

console.log(skill.audit); // structured C1-C8 findings with suggestions

writeCliSkill(skill, {
  outDir: 'skills',
  installTargets: ['.claude/skills', '.agents/skills']
});
```

`writeCliSkill()` writes the generated skill, installs it into any configured
agent discovery directories, and adds the bundled `to-skills-cli-docs` guidance
skill to those install targets when install targets are enabled.

## License

MIT
