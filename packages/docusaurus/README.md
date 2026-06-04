# @skillit/docusaurus

> Extract Docusaurus documentation structure for AI agent skill generation.

Part of the [to-skills](https://github.com/pradeepmouli/to-skills) ecosystem.

## Features

- **Docusaurus conventions** — reads `_category_.json`, `sidebar_position` frontmatter
- **Markdown parsing** — extracts titles, descriptions, sections, code blocks
- **Ordered output** — documents sorted by sidebar position, filename prefix, or alphabetically
- **Token-budgeted** — each doc becomes a reference file within the skill's token budget

## Install

```bash
pnpm add -D @skillit/docusaurus
```

## Usage

```typescript
import { extractDocusaurusDocs } from '@skillit/docusaurus';

const docs = extractDocusaurusDocs({ projectRoot: '.' });
// Returns ExtractedDocument[] — merge into your skill
```

## License

MIT
