---
'@skillit/core': patch
'@skillit/cli': patch
'@skillit/mcp': patch
'@skillit/client': patch
'@skillit/typedoc': patch
'@skillit/docusaurus': patch
'@skillit/vitepress': patch
'@skillit/target-mcpc': patch
'@skillit/target-mcp-protocol': patch
'@skillit/target-fastmcp': patch
'typedoc-plugin-skillit': patch
---

Rebrand `@to-skills` → `@skillit`: package scope, a single `skillit` CLI (MCP commands now mounted as `skillit mcp …`), bundled skill names (`skillit-cli-docs`/`skillit-docs`/`skillit-mcp-docs`), and the `package.json` config key (`skillit.mcp`). No API or behavior changes.
