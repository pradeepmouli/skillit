# @skillit/core

Shared types, renderers, and utilities for the [skillit](https://github.com/pradeepmouli/skillit) plugin ecosystem.

## Usage

This package is used by source adapters (like `@skillit/typedoc`) to render extracted API info into SKILL.md and llms.txt files. You typically don't install this directly — it's a dependency of the plugins.

```ts
import {
  renderSkills,
  renderSkill,
  writeSkills,
  renderLlmsTxt,
  estimateTokens
} from '@skillit/core';

// Render extracted skills into SKILL.md files
const rendered = renderSkills(extractedSkills, {
  outDir: 'skills',
  maxTokens: 4000,
  license: 'MIT'
});

// Write to disk
writeSkills(rendered, { outDir: 'skills' });

// Optionally render llms.txt
const llms = renderLlmsTxt(extractedSkills, {
  projectName: 'my-lib',
  projectDescription: 'A great library'
});
```

## API

### `renderSkills(skills, options?)` / `renderSkill(skill, options?)`

Renders extracted API data into SKILL.md content with agentskills.io-compliant frontmatter.

### `renderLlmsTxt(skills, options)`

Renders llms.txt (summary index) and llms-full.txt (complete API) following the llmstxt.org spec.

### `writeSkills(rendered, options)`

Writes rendered skill files to disk.

### `estimateTokens(text)` / `truncateToTokenBudget(text, maxTokens)`

Token budgeting utilities (~4 chars/token estimation).

## License

MIT
