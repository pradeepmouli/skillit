# @skillit/vitepress

> VitePress plugin for AI agent skill generation — uses sidebar for document ordering.

Part of the [skillit](https://github.com/pradeepmouli/skillit) ecosystem.

## Install

```bash
pnpm add -D @skillit/vitepress
```

## Usage

```typescript
// .vitepress/config.mts
import { defineConfig } from 'vitepress'
import { skillit } from '@skillit/vitepress'

export default defineConfig({
  vite: {
    plugins: [skillit({ skillsOutDir: 'skills' })]
  },
  themeConfig: { sidebar: [...] }
})
```

## License

MIT
