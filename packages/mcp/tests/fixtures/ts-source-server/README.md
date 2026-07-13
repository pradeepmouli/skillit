# ts-source-server fixture

Editable-TypeScript-source MCP server for testing `TypeScriptMcpRefineSource` in build mode.

## Structure

| File             | Role                                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| `dist/server.js` | Compiled server — spawned via stdio for `extract()`                            |
| `src/server.ts`  | TypeScript source — scanned by `discoverTools()` and patched by `applyFixes()` |

`dist/server.js` is hand-written (not built from `src/`) so the fixture needs no build step in CI.

## Tools exposed

| Tool         | Description                            |
| ------------ | -------------------------------------- |
| `compute`    | Compute a result from the given input. |
| `list_items` | List all available items.              |

Both tools are intentionally left without `_meta.toSkills` annotations. The integration test (`ts-source-build-mode.test.ts`) verifies that `applyFixes()` can inject them.

## Build-mode dogfood loop

This fixture enables the full enrichment loop:

```
1. skillit gen  --source mcp --mcp <path>/mcp.json --mode build
2. skillit audit --source mcp --mcp <path>/mcp.json --mode build --json
3. skillit fix  --source mcp --mcp <path>/mcp.json --mode build   ← writes _meta into src/server.ts
4. tsc src/server.ts --outDir dist                                 ← recompile
5. repeat from 1 — grade should improve
```

## Notes

`src/server.ts` uses `@ts-nocheck` because the `{ description }` options-object calling convention
(required by `applyMetaEdit`) is not a valid `McpServer.tool()` overload in SDK ≥1.x. The file is
a source-scanning surface, not compiled output — `dist/server.js` is what actually runs.
