# Refine Build/Runtime Bifurcation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a clean build/runtime bifurcation in `to-skills refine` so annotations for TypeScript MCP servers you own flow back to source files, while the existing overlay mechanism continues to serve third-party servers.

**Architecture:** Four sequential chunks — (1) update `_meta` wire format to flat strings, (2) restructure `packages/mcp/src/refine/` into `runtime/` + `build/` subdirs and move `jsdoc-edit.ts` to core, (3) implement the TypeScript MCP build path, (4) add context detection and update the CLI entry point.

**Tech Stack:** TypeScript 5, Node.js ≥22, Vitest, pnpm workspaces, `@modelcontextprotocol/sdk`, oxlint/oxfmt.

---

## Chunk 1: Flatten `_meta` wire format

The `_meta` object on MCP tool definitions currently uses a nested `toSkills` key with arrays (`_meta.toSkills.useWhen: string[]`). The new format is flat strings directly on `_meta` (`_meta.useWhen: string`). This chunk updates every file that reads or writes that nested shape.

**Files:**

- Modify: `packages/mcp/src/introspect/tools.ts`
- Modify: `packages/mcp/src/extract.ts`
- Modify: `packages/mcp/src/audit/rule-m3.ts`
- Modify: `packages/mcp/tests/unit/meta-extension.test.ts`
- Modify: `packages/mcp/tests/unit/audit-malformed-meta.test.ts`
- Modify: `packages/mcp/tests/unit/meta-passthrough.test.ts`

### Task 1: Update `readToolMetadata` to read flat `_meta`

**Files:**

- Modify: `packages/mcp/src/introspect/tools.ts`
- Test: `packages/mcp/tests/unit/meta-extension.test.ts`

- [ ] **Step 1.1: Write the failing test**

In `packages/mcp/tests/unit/meta-extension.test.ts`, add a test that passes flat `_meta` strings and expects them in the IR:

```typescript
it('reads flat _meta strings into toSkills IR', () => {
  const tool: Tool = {
    name: 'list_dir',
    description: 'Lists a directory',
    inputSchema: { type: 'object', properties: {} },
    _meta: {
      useWhen: 'When listing directory contents',
      avoidWhen: 'When paths may loop'
    }
  };
  const result = readToolMetadata(tool);
  expect(result.mcpMetadata?.toSkills?.useWhen).toEqual(['When listing directory contents']);
  expect(result.mcpMetadata?.toSkills?.avoidWhen).toEqual(['When paths may loop']);
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
pnpm --filter @skillit/mcp test --run -- meta-extension
```

Expected: FAIL — test reads old nested shape.

- [ ] **Step 1.3: Update `readToolMetadata`**

In `packages/mcp/src/introspect/tools.ts`, find `readToolMetadata`. Replace the block that reads `tool._meta?.['toSkills']` with:

```typescript
const rawMeta = tool._meta;
if (!isPlainObject(rawMeta)) return { tags };

const meta = rawMeta as Record<string, unknown>;
const toSkills: Record<string, string[]> = {};
for (const key of ['useWhen', 'avoidWhen', 'pitfalls', 'remarks', 'example'] as const) {
  const val = meta[key];
  if (typeof val === 'string' && val.trim()) {
    toSkills[key] = [val];
  }
}

if (Object.keys(toSkills).length === 0) return { tags };
return { tags, mcpMetadata: { toSkills } };
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
pnpm --filter @skillit/mcp test --run -- meta-extension
```

Expected: PASS

- [ ] **Step 1.5: Commit**

```bash
git add packages/mcp/src/introspect/tools.ts packages/mcp/tests/unit/meta-extension.test.ts
git commit -m "feat(mcp): read flat _meta strings into toSkills IR"
```

---

### Task 2: Update `extract.ts` and `rule-m3.ts`

**Files:**

- Modify: `packages/mcp/src/extract.ts`
- Modify: `packages/mcp/src/audit/rule-m3.ts`
- Test: `packages/mcp/tests/unit/meta-passthrough.test.ts`
- Test: `packages/mcp/tests/unit/audit-malformed-meta.test.ts`

- [ ] **Step 2.1: Update test fixtures to flat format**

In `packages/mcp/tests/unit/meta-passthrough.test.ts`, change every fixture from:

```typescript
_meta: {
  toSkills: {
    useWhen: ['When listing'];
  }
}
```

to:

```typescript
_meta: {
  useWhen: 'When listing';
}
```

In `packages/mcp/tests/unit/audit-malformed-meta.test.ts`, update similarly.

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
pnpm --filter @skillit/mcp test --run -- meta-passthrough audit-malformed
```

Expected: FAIL

- [ ] **Step 2.3: Update `readServerMetaToSkills` in `extract.ts`**

Find `readServerMetaToSkills`. The function currently returns `meta.toSkills`. Change it to return `meta` directly:

```typescript
function readServerMetaToSkills(meta: unknown): ToSkillsMeta | undefined {
  if (!isPlainObject(meta)) return undefined;
  const m = meta as Record<string, unknown>;
  const result: ToSkillsMeta = {};
  for (const key of ['useWhen', 'avoidWhen', 'pitfalls', 'remarks', 'example'] as const) {
    const val = m[key];
    if (typeof val === 'string' && val.trim()) {
      result[key] = [val];
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
```

Also update `collectMetaEnrichment` — replace array iteration with string check:

```typescript
function collectMetaEnrichment(tool: Tool): Partial<ExtractedSkill> {
  const meta = readServerMetaToSkills(tool._meta);
  if (!meta) return {};
  return { mcpMetadata: { toSkills: meta } };
}
```

- [ ] **Step 2.4: Update suggestion messages in `rule-m3.ts`**

Find every string in `packages/mcp/src/audit/rule-m3.ts` that mentions `_meta.toSkills` and update to flat format. For example:

```typescript
// Before
`Add _meta.toSkills.useWhen to tool '${name}'`
// After
`Add _meta.useWhen to tool '${name}'`;
```

- [ ] **Step 2.5: Run tests to verify they pass**

```bash
pnpm --filter @skillit/mcp test --run -- meta-passthrough audit-malformed
pnpm --filter @skillit/mcp test --run
```

Expected: all PASS

- [ ] **Step 2.6: Commit**

```bash
git add packages/mcp/src/extract.ts packages/mcp/src/audit/rule-m3.ts \
        packages/mcp/tests/unit/meta-passthrough.test.ts \
        packages/mcp/tests/unit/audit-malformed-meta.test.ts
git commit -m "feat(mcp): switch _meta wire format to flat strings"
```

---

## Chunk 2: Structural refactoring

Move `jsdoc-edit.ts` to `@skillit/core` and reorganize `packages/mcp/src/refine/` into `runtime/` and `build/` subdirectories.

**Files:**

- Create: `packages/core/src/refine/jsdoc-edit.ts`
- Modify: `packages/core/src/refine/index.ts`
- Modify: `packages/typedoc/src/refine/typedoc-source.ts`
- Modify: `packages/typedoc/src/refine/index.ts`
- Create: `packages/mcp/src/refine/runtime/mcp-source.ts` (moved)
- Create: `packages/mcp/src/refine/runtime/overlay.ts` (moved)
- Create: `packages/mcp/src/refine/runtime/merge-overlay.ts` (moved)
- Modify: `packages/mcp/src/refine/index.ts`

### Task 3: Move `jsdoc-edit.ts` to `@skillit/core`

**Files:**

- Create: `packages/core/src/refine/jsdoc-edit.ts`
- Modify: `packages/core/src/refine/index.ts`
- Modify: `packages/typedoc/src/refine/typedoc-source.ts`
- Modify: `packages/typedoc/src/refine/index.ts`
- Delete: `packages/typedoc/src/refine/jsdoc-edit.ts` (after updating imports)

- [ ] **Step 3.1: Write test verifying `insertJsDocTag` is exported from core**

In a new file `packages/core/tests/unit/jsdoc-edit.test.ts`:

```typescript
import { insertJsDocTag } from '../../src/refine/jsdoc-edit.js';
import { describe, it, expect } from 'vitest';

describe('insertJsDocTag', () => {
  it('inserts a tag into a new JSDoc block', () => {
    const source = `export function greet(name: string) {}\n`;
    const result = insertJsDocTag(source, 'greet', 'useWhen', 'greeting a user');
    expect(result).toContain('@useWhen greeting a user');
    expect(result).toContain('/**');
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
pnpm --filter @skillit/core test --run -- jsdoc-edit
```

Expected: FAIL — module not found.

- [ ] **Step 3.3: Copy `jsdoc-edit.ts` to core**

Copy the contents of `packages/typedoc/src/refine/jsdoc-edit.ts` verbatim to `packages/core/src/refine/jsdoc-edit.ts`.

- [ ] **Step 3.4: Export from `packages/core/src/refine/index.ts`**

Add to the existing exports:

```typescript
export { insertJsDocTag } from './jsdoc-edit.js';
```

- [ ] **Step 3.5: Update `@skillit/typedoc` imports**

In `packages/typedoc/src/refine/typedoc-source.ts`, change:

```typescript
import { insertJsDocTag } from './jsdoc-edit.js';
```

to:

```typescript
import { insertJsDocTag } from '@skillit/core';
```

In `packages/typedoc/src/refine/index.ts`, remove the `insertJsDocTag` re-export (it now lives in core).

- [ ] **Step 3.6: Delete the old file**

```bash
rm packages/typedoc/src/refine/jsdoc-edit.ts
```

- [ ] **Step 3.7: Run all tests**

```bash
pnpm --filter @skillit/core test --run -- jsdoc-edit
pnpm --filter @skillit/typedoc test --run
```

Expected: all PASS

- [ ] **Step 3.8: Commit**

```bash
git add packages/core/src/refine/jsdoc-edit.ts packages/core/src/refine/index.ts \
        packages/core/tests/unit/jsdoc-edit.test.ts \
        packages/typedoc/src/refine/typedoc-source.ts \
        packages/typedoc/src/refine/index.ts
git rm packages/typedoc/src/refine/jsdoc-edit.ts
git commit -m "refactor: move jsdoc-edit to @skillit/core"
```

---

### Task 4: Reorganize `packages/mcp/src/refine/` into `runtime/`

**Files:**

- Create: `packages/mcp/src/refine/runtime/mcp-source.ts`
- Create: `packages/mcp/src/refine/runtime/overlay.ts`
- Create: `packages/mcp/src/refine/runtime/merge-overlay.ts`
- Modify: `packages/mcp/src/refine/index.ts`
- Delete: `packages/mcp/src/refine/mcp-source.ts`, `overlay.ts`, `merge-overlay.ts`

- [ ] **Step 4.1: Move files to `runtime/` subdirectory**

```bash
mkdir -p packages/mcp/src/refine/runtime
mv packages/mcp/src/refine/mcp-source.ts packages/mcp/src/refine/runtime/mcp-source.ts
mv packages/mcp/src/refine/overlay.ts packages/mcp/src/refine/runtime/overlay.ts
mv packages/mcp/src/refine/merge-overlay.ts packages/mcp/src/refine/runtime/merge-overlay.ts
```

- [ ] **Step 4.2: Update relative imports within moved files**

In each moved file, update any relative imports that reference sibling files to use the new relative paths (they are now all in the same `runtime/` dir, so sibling imports remain `./file.js`).

- [ ] **Step 4.3: Update `packages/mcp/src/refine/index.ts`**

Replace old paths with new ones:

```typescript
export * from './runtime/overlay.js';
export * from './runtime/merge-overlay.js';
export { McpRefineSource } from './runtime/mcp-source.js';
```

- [ ] **Step 4.4: Update any imports of moved files elsewhere**

Search for imports of the old paths:

```bash
grep -r "from '.*refine/mcp-source\|from '.*refine/overlay\|from '.*refine/merge-overlay" packages/
```

Update each to point through `./runtime/` or via the barrel `index.ts`.

- [ ] **Step 4.5: Run full test suite**

```bash
pnpm --filter @skillit/mcp test --run
```

Expected: all PASS

- [ ] **Step 4.6: Commit**

```bash
git add packages/mcp/src/refine/
git commit -m "refactor(mcp): move runtime refine files to runtime/ subdir"
```

---

## Chunk 3: TypeScript MCP build path

Implement `tool-discovery.ts`, `meta-edit.ts`, and `TypeScriptMcpRefineSource` in `packages/mcp/src/refine/build/`.

**Files:**

- Create: `packages/mcp/src/refine/build/tool-discovery.ts`
- Create: `packages/mcp/src/refine/build/meta-edit.ts`
- Create: `packages/mcp/src/refine/build/ts-mcp-source.ts`
- Modify: `packages/mcp/src/refine/index.ts`
- Create: `packages/mcp/tests/unit/tool-discovery.test.ts`
- Create: `packages/mcp/tests/unit/meta-edit.test.ts`
- Create: `packages/mcp/tests/integration/ts-mcp-source.test.ts`

### Task 5: `tool-discovery.ts`

Scans TypeScript source files for `server.tool('name', { ... }, schema, handler)` and returns a map of tool name → file location.

- [ ] **Step 5.1: Write failing unit tests**

Create `packages/mcp/tests/unit/tool-discovery.test.ts`:

```typescript
import { discoverTools } from '../../src/refine/build/tool-discovery.js';
import { describe, it, expect } from 'vitest';

const FIXTURE_ONE = `
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const server = new McpServer({ name: 'test', version: '1' });
server.tool(
  'list_dir',
  { description: 'Lists a directory' },
  schema,
  handler
);
`;

const FIXTURE_TWO_TOOLS = `
server.tool('tool_a', { description: 'A' }, schema, handler);
server.tool('tool_b', { description: 'B' }, schema, handler);
`;

const FIXTURE_MINIMAL = `
server.tool('minimal_tool', schema, handler);
`;

describe('discoverTools', () => {
  it('finds a single tool in a file', () => {
    const result = discoverTools('test.ts', FIXTURE_ONE);
    expect(result.tools.get('list_dir')).toEqual({ file: 'test.ts', line: expect.any(Number) });
  });

  it('finds multiple tools in one file', () => {
    const result = discoverTools('test.ts', FIXTURE_TWO_TOOLS);
    expect(result.tools.has('tool_a')).toBe(true);
    expect(result.tools.has('tool_b')).toBe(true);
  });

  it('skips minimal two-argument form and emits a warning', () => {
    const result = discoverTools('test.ts', FIXTURE_MINIMAL);
    expect(result.tools.has('minimal_tool')).toBe(false);
    expect(result.warnings.some((w) => w.includes('minimal_tool'))).toBe(true);
  });

  it('returns empty map for source with no tool calls', () => {
    const result = discoverTools('test.ts', 'const x = 1;');
    expect(result.tools.size).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });
});
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
pnpm --filter @skillit/mcp test --run -- tool-discovery
```

Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement `tool-discovery.ts`**

Create `packages/mcp/src/refine/build/tool-discovery.ts`:

```typescript
export interface ToolLocation {
  file: string;
  line: number;
}

export interface DiscoveryResult {
  tools: Map<string, ToolLocation>;
  warnings: string[];
}

// Matches: server.tool( 'name', ...
// Capture group 1: tool name
const TOOL_CALL_RE = /server\.tool\(\s*['"]([^'"]+)['"]\s*,\s*/g;

// Matches an options object as the next token after the tool name
const OPTIONS_OBJ_RE = /^\{/;

export function discoverTools(file: string, source: string): DiscoveryResult {
  const tools = new Map<string, ToolLocation>();
  const warnings: string[] = [];

  for (const match of source.matchAll(TOOL_CALL_RE)) {
    const name = match[1]!;
    const afterComma = source.slice(match.index! + match[0].length).trimStart();

    if (!OPTIONS_OBJ_RE.test(afterComma)) {
      warnings.push(
        `tool '${name}' uses minimal form; add a metadata object to enable annotation.`
      );
      continue;
    }

    const lineNumber = source.slice(0, match.index).split('\n').length;
    tools.set(name, { file, line: lineNumber });
  }

  return { tools, warnings };
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

```bash
pnpm --filter @skillit/mcp test --run -- tool-discovery
```

Expected: all PASS

- [ ] **Step 5.5: Commit**

```bash
git add packages/mcp/src/refine/build/tool-discovery.ts \
        packages/mcp/tests/unit/tool-discovery.test.ts
git commit -m "feat(mcp): add tool-discovery for TypeScript MCP build path"
```

---

### Task 6: `meta-edit.ts`

String-based editor that writes or updates `_meta` fields in a `server.tool(...)` call.

- [ ] **Step 6.1: Write failing unit tests**

Create `packages/mcp/tests/unit/meta-edit.test.ts`:

```typescript
import { applyMetaEdit } from '../../src/refine/build/meta-edit.js';
import { describe, it, expect } from 'vitest';

const BASE = `server.tool(
  'list_dir',
  { description: 'Lists a directory' },
  schema,
  handler
);`;

const WITH_META = `server.tool(
  'list_dir',
  {
    description: 'Lists a directory',
    _meta: { useWhen: 'Old value' }
  },
  schema,
  handler
);`;

describe('applyMetaEdit', () => {
  it('inserts a new _meta block when none exists', () => {
    const result = applyMetaEdit(BASE, 'list_dir', 4, 'useWhen', 'When listing dir contents');
    expect(result).toContain('_meta:');
    expect(result).toContain("useWhen: 'When listing dir contents'");
  });

  it('updates an existing _meta field', () => {
    const result = applyMetaEdit(WITH_META, 'list_dir', 1, 'useWhen', 'New value');
    expect(result).toContain("useWhen: 'New value'");
    expect(result).not.toContain("useWhen: 'Old value'");
  });

  it('adds a new field to existing _meta', () => {
    const result = applyMetaEdit(WITH_META, 'list_dir', 1, 'avoidWhen', 'When paths loop');
    expect(result).toContain('useWhen:');
    expect(result).toContain("avoidWhen: 'When paths loop'");
  });

  it('returns source unchanged when tool not found', () => {
    const result = applyMetaEdit(BASE, 'missing_tool', 1, 'useWhen', 'x');
    expect(result).toBe(BASE);
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

```bash
pnpm --filter @skillit/mcp test --run -- meta-edit
```

Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement `meta-edit.ts`**

Create `packages/mcp/src/refine/build/meta-edit.ts`:

```typescript
import type { RefineTag } from '@skillit/core';

// Finds the options object `{` after server.tool('name', and returns its start index.
function findOptionsStart(source: string, toolName: string, hintLine: number): number {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const callRe = new RegExp(`server\\.tool\\(\\s*['"]${escaped}['"]\\s*,\\s*`);
  const lines = source.split('\n');

  // Search within a window around the hint line
  const windowStart = Math.max(0, hintLine - 3);
  const windowEnd = Math.min(lines.length, hintLine + 5);
  const window = lines.slice(windowStart, windowEnd).join('\n');
  const offsetToWindow = lines.slice(0, windowStart).join('\n').length + (windowStart > 0 ? 1 : 0);

  const m = window.match(callRe);
  if (!m || m.index === undefined) return -1;
  return offsetToWindow + m.index + m[0].length;
}

// Finds the closing `}` of the options object starting at `start`.
function findOptionsEnd(source: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      if (--depth === 0) return i;
    }
  }
  return -1;
}

export function applyMetaEdit(
  source: string,
  toolName: string,
  hintLine: number,
  tag: RefineTag,
  value: string
): string {
  const optStart = findOptionsStart(source, toolName, hintLine);
  if (optStart === -1) return source;

  const optEnd = findOptionsEnd(source, optStart);
  if (optEnd === -1) return source;

  const optionsContent = source.slice(optStart, optEnd + 1);

  // Check whether _meta block already exists
  const metaRe = /_meta\s*:\s*\{/;
  const metaMatch = optionsContent.match(metaRe);

  if (metaMatch && metaMatch.index !== undefined) {
    // _meta block exists — update or insert the tag
    const metaStart = optStart + metaMatch.index + metaMatch[0].length;
    const metaEnd = findOptionsEnd(source, metaStart - 1); // -1 to include the opening {

    const fieldRe = new RegExp(`(${tag}\\s*:\\s*)(['"])([^'"]*?)\\2`);
    const metaBlock = source.slice(metaStart - 1, metaEnd + 1);

    if (fieldRe.test(metaBlock)) {
      // Update existing field
      const newMetaBlock = metaBlock.replace(fieldRe, `$1'${value}'`);
      return source.slice(0, metaStart - 1) + newMetaBlock + source.slice(metaEnd + 1);
    }

    // Insert new field before closing `}`
    const insertAt = metaEnd;
    const indent = '      ';
    return (
      source.slice(0, insertAt) + `\n${indent}${tag}: '${value}',\n    ` + source.slice(insertAt)
    );
  }

  // No _meta block — insert one before the options closing `}`
  const indent = '    ';
  const metaBlock = `\n${indent}_meta: { ${tag}: '${value}' },`;
  return source.slice(0, optEnd) + metaBlock + '\n  ' + source.slice(optEnd);
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

```bash
pnpm --filter @skillit/mcp test --run -- meta-edit
```

Expected: all PASS

- [ ] **Step 6.5: Commit**

```bash
git add packages/mcp/src/refine/build/meta-edit.ts \
        packages/mcp/tests/unit/meta-edit.test.ts
git commit -m "feat(mcp): add meta-edit for TypeScript MCP build path"
```

---

### Task 7: `TypeScriptMcpRefineSource`

Implements `RefineSource` for the build path: spawns the server to extract, edits TypeScript source for `applyFixes`.

- [ ] **Step 7.1: Write integration test with a fixture server**

Create `packages/mcp/tests/integration/ts-mcp-source.test.ts`:

```typescript
import { TypeScriptMcpRefineSource } from '../../src/refine/build/ts-mcp-source.js';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { describe, it, expect, afterEach } from 'vitest';

// Points to the fixture server directory in tests/fixtures/
const FIXTURE_DIR = join(import.meta.dirname, '../fixtures/ts-mcp-server');

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('TypeScriptMcpRefineSource', () => {
  it('applyFixes writes _meta into the source file', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ts-mcp-'));
    await cp(FIXTURE_DIR, tmpDir, { recursive: true });

    const source = new TypeScriptMcpRefineSource({
      command: 'node',
      args: [join(tmpDir, 'server.js')],
      sourceGlob: join(tmpDir, '*.ts')
    });

    await source.applyFixes([
      { toolName: 'list_dir', tag: 'useWhen', value: 'When listing directory contents' }
    ]);

    const updated = await readFile(join(tmpDir, 'server.ts'), 'utf8');
    expect(updated).toContain("useWhen: 'When listing directory contents'");
  });
});
```

Also create a minimal fixture at `packages/mcp/tests/fixtures/ts-mcp-server/server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'fixture', version: '1.0.0' });

server.tool(
  'list_dir',
  { description: 'Lists a directory' },
  { path: z.string() },
  async ({ path }) => ({ content: [{ type: 'text', text: `listed ${path}` }] })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
pnpm --filter @skillit/mcp test --run -- ts-mcp-source
```

Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement `ts-mcp-source.ts`**

Create `packages/mcp/src/refine/build/ts-mcp-source.ts`:

```typescript
import { glob } from 'node:fs/promises';
import { readFile, writeFile } from 'node:fs/promises';
import type { ExtractedSkill, AuditContext, DraftedFix, RefineSource } from '@skillit/core';
import { discoverTools } from './tool-discovery.js';
import { applyMetaEdit } from './meta-edit.js';
import { McpRefineSource } from '../runtime/mcp-source.js';

interface TypeScriptMcpRefineSourceOptions {
  command: string;
  args: string[];
  sourceGlob: string;
  env?: NodeJS.ProcessEnv;
}

export class TypeScriptMcpRefineSource implements RefineSource {
  private readonly runtime: McpRefineSource;

  constructor(private readonly opts: TypeScriptMcpRefineSourceOptions) {
    this.runtime = new McpRefineSource({ command: opts.command, args: opts.args, env: opts.env });
  }

  extract(): Promise<ExtractedSkill> {
    return this.runtime.extract();
  }

  auditContext(skill: ExtractedSkill): AuditContext {
    return this.runtime.auditContext(skill);
  }

  async applyFixes(fixes: readonly DraftedFix[]): Promise<void> {
    const sourceFiles = await Array.fromAsync(glob(this.opts.sourceGlob));
    const allTools = new Map<string, { file: string; line: number }>();
    const allWarnings: string[] = [];

    for (const file of sourceFiles) {
      const source = await readFile(file, 'utf8');
      const { tools, warnings } = discoverTools(file, source);
      for (const [name, loc] of tools) allTools.set(name, loc);
      allWarnings.push(...warnings);
    }

    for (const warning of allWarnings) {
      process.stderr.write(`[to-skills] ${warning}\n`);
    }

    const byFile = new Map<string, DraftedFix[]>();
    for (const fix of fixes) {
      const loc = allTools.get(fix.toolName);
      if (!loc) {
        process.stderr.write(
          `[to-skills] tool '${fix.toolName}' not found in source files; skipping.\n`
        );
        continue;
      }
      const group = byFile.get(loc.file) ?? [];
      group.push(fix);
      byFile.set(loc.file, group);
    }

    for (const [file, fileFixes] of byFile) {
      let source = await readFile(file, 'utf8');
      for (const fix of fileFixes) {
        const loc = allTools.get(fix.toolName)!;
        source = applyMetaEdit(source, fix.toolName, loc.line, fix.tag, fix.value);
      }
      await writeFile(file, source, 'utf8');
      process.stderr.write(`[to-skills] updated ${file}\n`);
    }
  }
}
```

- [ ] **Step 7.4: Export from `packages/mcp/src/refine/index.ts`**

Add:

```typescript
export { TypeScriptMcpRefineSource } from './build/ts-mcp-source.js';
```

- [ ] **Step 7.5: Run all mcp tests**

```bash
pnpm --filter @skillit/mcp test --run
```

Expected: all PASS

- [ ] **Step 7.6: Commit**

```bash
git add packages/mcp/src/refine/build/ packages/mcp/src/refine/index.ts \
        packages/mcp/tests/integration/ts-mcp-source.test.ts \
        packages/mcp/tests/fixtures/ts-mcp-server/
git commit -m "feat(mcp): add TypeScriptMcpRefineSource for build-mode refine"
```

---

## Chunk 4: Context detection and CLI update

**Files:**

- Create: `packages/client/src/detect-mode.ts`
- Modify: `packages/client/src/commands/refine.ts`
- Create: `packages/client/tests/unit/detect-mode.test.ts`

### Task 8: `detectRefineMode`

- [ ] **Step 8.1: Write failing unit tests**

Create `packages/client/tests/unit/detect-mode.test.ts`:

```typescript
import { detectRefineMode } from '../../src/detect-mode.js';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';

let tmpDir: string;

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe('detectRefineMode', () => {
  it('returns build when package.json has MCP SDK dependency', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } })
    );
    expect(await detectRefineMode(tmpDir)).toBe('build');
  });

  it('returns runtime when mcp.json found in ancestor', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    const sub = join(tmpDir, 'project');
    await mkdir(sub, { recursive: true });
    await writeFile(join(tmpDir, 'mcp.json'), '{}');
    expect(await detectRefineMode(sub)).toBe('runtime');
  });

  it('returns ambiguous when both signals present', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } })
    );
    await writeFile(join(tmpDir, 'mcp.json'), '{}');
    expect(await detectRefineMode(tmpDir)).toBe('ambiguous');
  });

  it('returns ambiguous when neither signal present', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'detect-'));
    expect(await detectRefineMode(tmpDir)).toBe('ambiguous');
  });
});
```

- [ ] **Step 8.2: Run tests to verify they fail**

```bash
pnpm --filter @skillit/client test --run -- detect-mode
```

Expected: FAIL — module not found.

- [ ] **Step 8.3: Implement `detect-mode.ts`**

Create `packages/client/src/detect-mode.ts`:

```typescript
import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const MCP_SDK_PACKAGES = ['@modelcontextprotocol/sdk', 'fastmcp'];

async function hasMcpSdkDep(cwd: string): Promise<boolean> {
  try {
    const raw = await readFile(join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = {
      ...(pkg['dependencies'] as Record<string, string> | undefined),
      ...(pkg['devDependencies'] as Record<string, string> | undefined)
    };
    return MCP_SDK_PACKAGES.some((name) => name in deps);
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hasMcpConfig(cwd: string): Promise<boolean> {
  const home = homedir();
  let dir = cwd;
  while (dir !== home && dir !== dirname(dir)) {
    if (
      (await fileExists(join(dir, 'mcp.json'))) ||
      (await fileExists(join(dir, 'claude_desktop_config.json')))
    ) {
      return true;
    }
    dir = dirname(dir);
  }
  return false;
}

export async function detectRefineMode(cwd: string): Promise<'build' | 'runtime' | 'ambiguous'> {
  const [hasBuild, hasRuntime] = await Promise.all([hasMcpSdkDep(cwd), hasMcpConfig(cwd)]);

  if (hasBuild && !hasRuntime) return 'build';
  if (hasRuntime && !hasBuild) return 'runtime';
  return 'ambiguous';
}
```

- [ ] **Step 8.4: Run tests to verify they pass**

```bash
pnpm --filter @skillit/client test --run -- detect-mode
```

Expected: all PASS

- [ ] **Step 8.5: Commit**

```bash
git add packages/client/src/detect-mode.ts packages/client/tests/unit/detect-mode.test.ts
git commit -m "feat(client): add detectRefineMode context detection"
```

---

### Task 9: Update `refine` command

Wire `detectRefineMode` and `TypeScriptMcpRefineSource` into the CLI refine command.

**Files:**

- Modify: `packages/client/src/commands/refine.ts`

- [ ] **Step 9.1: Read the existing refine command**

```bash
cat packages/client/src/commands/refine.ts
```

Note the current shape: how `McpRefineSource` is instantiated and how `--mode` might already be threaded in.

- [ ] **Step 9.2: Add `--mode` option and mode detection**

In `packages/client/src/commands/refine.ts`, update the command definition to:

1. Accept `--mode build|runtime` option.
2. If `--mode` not provided, call `detectRefineMode(process.cwd())`.
3. If result is `'ambiguous'`, print the disambiguation message and exit 1:

```typescript
if (mode === 'ambiguous') {
  console.error(`Cannot determine refine mode.
Use --mode build  (TypeScript MCP server you own)
     --mode runtime  (consuming project, any MCP server)`);
  process.exit(1);
}
```

4. Print the detected mode before starting the loop:

```typescript
if (mode === 'build') {
  console.log('Refining in build mode (TypeScript MCP)');
} else {
  console.log('Refining in runtime mode (overlay)');
}
```

5. In build mode, instantiate `TypeScriptMcpRefineSource`; in runtime mode, keep `McpRefineSource`.

6. On completion in build mode, print the list of modified files (captured from `applyFixes` — may require a small interface extension, or simply relay the stderr output already emitted by `TypeScriptMcpRefineSource`).

- [ ] **Step 9.3: Run full test suite**

```bash
pnpm test
pnpm run type-check
```

Expected: all PASS, no type errors.

- [ ] **Step 9.4: Commit**

```bash
git add packages/client/src/commands/refine.ts
git commit -m "feat(client): wire build/runtime mode detection into refine command"
```

---

### Task 10: Final integration check

- [ ] **Step 10.1: Run complete test suite**

```bash
pnpm test
pnpm run type-check
pnpm run lint
```

Expected: all PASS, no lint errors.

- [ ] **Step 10.2: Manual smoke test — runtime mode**

In a directory that has `mcp.json`:

```bash
to-skills refine <server-name>
```

Expected output begins: `Refining in runtime mode (overlay)`

- [ ] **Step 10.3: Manual smoke test — build mode**

In a directory with `@modelcontextprotocol/sdk` in `package.json`:

```bash
to-skills refine <server-name>
```

Expected output begins: `Refining in build mode (TypeScript MCP)`

- [ ] **Step 10.4: Final commit**

```bash
git add -u
git commit -m "chore: final cleanup for build/runtime bifurcation"
```
