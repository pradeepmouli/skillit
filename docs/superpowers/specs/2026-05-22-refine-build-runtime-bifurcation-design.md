# Refine Build/Runtime Bifurcation — Design

- **Date:** 2026-05-22
- **Status:** Approved
- **Owner:** Pradeep Mouli

## Summary

Introduce a clean bifurcation between build-time and runtime annotation modes in
`to-skills refine`. Build-time targets sources you own (TypeDoc, CLI, VitePress,
Docusaurus, TypeScript MCP servers); runtime targets any MCP server via a local
overlay. A single `to-skills refine` command auto-detects the mode from project
context, with `--mode` as an explicit override.

## Motivation

Phase 0 shipped `to-skills refine` with only a runtime (overlay) path for MCP
servers. Improvements from refining a third-party server stay local — other
consumers never benefit. For servers you own, improvements should flow back into
the source so they are versioned, distributed, and available to all consumers
automatically. The system currently has no way to express or enforce this
distinction.

## Goals

1. Make build-time vs runtime a first-class concept across architecture, UX, and
   loop dispatch.
2. Add a TypeScript MCP build path that writes flat `_meta` annotations
   directly into tool definition source files.
3. Single CLI entry point with smart context detection and an explicit override.
4. Move shared JSDoc editing utility to `@to-skills/core` for use by all packages.

## Non-Goals

- Python MCP server build path (overlay / runtime only for non-TypeScript servers).
- Auto-detection of MCP SDK version or schema format beyond the positional
  `server.tool()` pattern.
- Modifying upstream third-party server source code.

---

## Architecture

### Mode concept

Two modes, first-class everywhere:

| Mode        | Who owns the server | Where improvements land                      |
| ----------- | ------------------- | -------------------------------------------- |
| **build**   | You                 | TypeScript source, versioned with the server |
| **runtime** | Anyone              | Local overlay in the consuming project       |

The `RefineSource` interface in `@to-skills/core` is **unchanged** — the loop
engine never needs to know the mode. Mode is an implementation detail of the
source adapter and a display concern for the CLI.

### Package structure changes

```
packages/core/src/
  refine/
    jsdoc-edit.ts          ← moved from @to-skills/typedoc (shared utility)
    loop.ts, types.ts, …   (unchanged)

packages/mcp/src/refine/
  runtime/                 ← existing files moved here
    mcp-source.ts
    overlay.ts
    merge-overlay.ts
  build/                   ← new
    ts-mcp-source.ts
    tool-discovery.ts
    meta-edit.ts
  index.ts                 ← re-exports both paths

packages/typedoc/src/refine/
  typedoc-source.ts        ← imports jsdoc-edit from @to-skills/core
  …

packages/client/src/
  detect-mode.ts           ← new
  commands/refine.ts       ← updated
```

---

## Context Detection

`detectRefineMode(cwd: string): Promise<'build' | 'runtime' | 'ambiguous'>`
lives in `packages/client/src/detect-mode.ts`.

**Detection order:**

1. **Build signal** — `package.json` in `cwd` has `@modelcontextprotocol/sdk`,
   `@modelcontextprotocol/server-*`, or `fastmcp` in `dependencies` or
   `devDependencies` → `'build'`

2. **Runtime signal** — `mcp.json` or `claude_desktop_config.json` found in `cwd`
   or any ancestor directory up to (but not including) the home directory → `'runtime'`

3. **Both or neither** → `'ambiguous'`

**Constraints:**

- Reads only `package.json` from `cwd`; never traverses `node_modules`.
- A consuming project with MCP SDK as a transitive (not direct) dependency
  correctly resolves as `'runtime'`.
- `--mode build|runtime` always overrides detection entirely.

---

## TypeScript MCP Build Path

### `tool-discovery.ts`

Scans TypeScript source files for the positional `server.tool(` pattern with an
options/metadata object as the second argument:

```typescript
server.tool(
  'tool-name',
  {
    /* options with _meta */
  },
  schema,
  handler
);
```

Builds `Map<toolName, { file: string; line: number }>`. Tools using the minimal
two-argument form `server.tool('name', schema, handler)` — which has no options
object — are skipped with a warning:

```
tool 'name' uses minimal form; add a metadata object to enable annotation.
```

If a tool name cannot be located at all, that fix is also skipped with a warning.
Neither case is a crash.

### `meta-edit.ts`

String-based editor (no full AST dependency). Given a source file, a tool name,
and a `DraftedFix`, it:

1. Finds the `server.tool('tool-name', ...)` call at the discovered line.
2. Locates or creates the `_meta` property in the options object (second argument).
3. Sets the field directly on `_meta` — no `toSkills` nesting.

**`_meta` format** — flat, strings (congruent with JSDoc tag semantics):

```typescript
server.tool(
  'list_directory',
  {
    description: 'Lists files in a directory',
    _meta: {
      useWhen: 'When listing directory contents to find files',
      avoidWhen: 'When paths contain symlinks that may loop'
    }
  },
  schema,
  handler
);
```

This replaces the previous `_meta.toSkills.*` nesting entirely. Extraction adapters
read `_meta.useWhen` etc. directly from `tools/list` responses and map them into
the internal `mcpMetadata.toSkills` representation on `ExtractedSkill` — the
internal IR is unchanged; only the external wire/source format changes.

### `ts-mcp-source.ts` — `TypeScriptMcpRefineSource implements RefineSource`

- `extract()` — spawns the server, calls `tools/list`, reads flat `_meta.*` fields
  from the response (no overlay file in build mode).
- `applyFixes(fixes)` — runs tool discovery, applies each fix via `meta-edit.ts`,
  writes modified files back. Reports which files were changed.
- `auditContext()` — same as `McpRefineSource`.

The loop closes naturally: write to source → server re-reads source at next
start → `tools/list` returns updated `_meta.*` → `extract()` picks it up.

---

## CLI UX

Single command, unchanged signature:

```
to-skills refine [server-name] [--mode build|runtime] [--iterations N]
```

**Startup sequence:**

1. If `--mode` provided → use it, skip detection.
2. Otherwise run `detectRefineMode(cwd)`.
3. `'ambiguous'` → exit with:
   ```
   Cannot determine refine mode.
   Use --mode build  (TypeScript MCP server you own)
        --mode runtime  (consuming project, any MCP server)
   ```
4. Print mode before loop starts:
   ```
   Refining in build mode (TypeScript MCP)
   ```
   or
   ```
   Refining in runtime mode (overlay)
   ```

**On completion:**

- Build mode: lists modified source files.
- Runtime mode: shows overlay path (existing behavior).

---

## Shared JSDoc Utility

`jsdoc-edit.ts` moves from `packages/typedoc/src/refine/` to
`packages/core/src/refine/`. All imports in `@to-skills/typedoc` update
accordingly. The MCP build path does not use `jsdoc-edit.ts` (it uses
`meta-edit.ts` instead), but the move makes the utility available to any future
package without creating a cross-package dependency on `@to-skills/typedoc`.

---

## Testing

- `tool-discovery.ts` — unit tests with fixture TypeScript source strings
  covering: positional pattern found, tool not found (graceful skip), multiple
  tools in one file.
- `meta-edit.ts` — unit tests: insert new `_meta` block, update existing field,
  add new field to existing `_meta`, no-op when tool not found, safe bail-out on
  non-quoted existing values, no false match on `_metadata` property.
- `detectRefineMode` — unit tests with temp directories: build signal only,
  runtime signal only, both signals, neither.
- Integration: `TypeScriptMcpRefineSource` with a minimal fixture MCP server
  (same pattern as existing `McpRefineSource` tests).
