# Contract: Programmatic API

**Package**: `@skillit/mcp`
**Entry point**: `packages/mcp/src/index.ts`

---

## `extractMcpSkill(options)`

**FR references**: FR-028, US6 AC1/AC2/AC5.

```typescript
export function extractMcpSkill(options: McpExtractOptions): Promise<ExtractedSkill>;
```

**Contract**:

1. MUST perform the MCP `initialize` handshake before listing anything.
2. MUST paginate `tools/list`, `resources/list`, `prompts/list` until exhausted (FR-006, FR-007).
3. MUST NOT invoke any tool or read any resource (FR-008).
4. MUST resolve all in-document `$ref` pointers in `inputSchema`; on cycle, raise `McpError` with code `SCHEMA_REF_CYCLE` (caller may choose to downgrade to audit warning).
5. MUST close the transport cleanly on success or failure.
6. Returned `ExtractedSkill` is target-agnostic — it does NOT yet contain any `mcp:` frontmatter or CLI setup. Those are added by the adapter at render time.
7. On transport failure, MUST reject with `McpError` (code one of `TRANSPORT_FAILED`, `INITIALIZE_FAILED`, `SERVER_EXITED_EARLY`, `PROTOCOL_VERSION_UNSUPPORTED`). Partial results MUST NOT be returned.

**Example**:

```typescript
import { extractMcpSkill } from '@skillit/mcp';

const skill = await extractMcpSkill({
  transport: { type: 'stdio', command: 'node', args: ['./server.js'] }
});
console.log(skill.functions.length); // tools
console.log(skill.resources?.length); // resources
console.log(skill.prompts?.length); // prompts
```

---

## `bundleMcpSkill(options)`

**FR references**: FR-037, US6 AC3/AC4.

```typescript
export function bundleMcpSkill(options?: McpBundleOptions): Promise<BundleResult>;
```

**Contract**:

1. MUST read `package.json` from `options.packageRoot ?? process.cwd()`.
2. MUST parse `to-skills.mcp` as either single object or array.
3. For each (server, target) pair:
   - derive launch command (from config or package `bin` per FR-031);
   - call `extractMcpSkill` with derived transport;
   - call `renderSkill` with the target's adapter;
   - write to `<outDir>/<skillName>[-<target>]/`.
4. MUST verify (not modify) `package.json.files` includes both `dist/` (or detected output dir) and `skills/`. Missing entries produce warnings in `BundleResult.packageJsonWarnings`, never errors (FR-035).
5. MUST run audit on each rendered skill unless `options.skipAudit` is true.
6. Returns `BundleResult` with per-skill `WrittenSkill` entries keyed by skill directory name.
7. Content-identical idempotency: MUST canonicalize output before writing (per Research §2).

**Example**:

```typescript
import { bundleMcpSkill } from '@skillit/mcp';

const result = await bundleMcpSkill({ packageRoot: process.cwd() });
for (const [name, skill] of Object.entries(result.skills)) {
  console.log(`${name}: ${skill.files.length} files, audit=${skill.audit.worstSeverity}`);
}
```

---

## `loadAdapter(target)`

**FR references**: FR-IT-004, FR-IT-005.

```typescript
export function loadAdapter(target: InvocationTarget): InvocationAdapter;
```

**Contract**:

1. For `'mcp-protocol'`, returns the default export of `@skillit/target-mcp-protocol`.
2. For `cli:<name>`, attempts `require.resolve('@skillit/target-<name>')` then `require.resolve('to-skills-target-<name>')`. Returns the default export of the first one found.
3. On failure, throws `McpError` with code `ADAPTER_NOT_FOUND` and a message listing the attempted candidates.
4. Results cached per-process — calling twice with the same target returns the same adapter instance.

---

## `renderSkill` — extended signature

**FR references**: FR-IT-010.

**Package**: `@skillit/core` (extended, not new).

```typescript
export function renderSkill(
  skill: ExtractedSkill,
  options: SkillRenderOptions & { invocation?: InvocationAdapter }
): Promise<RenderedSkill>;
```

**Contract**:

1. When `invocation` is absent, behaves exactly as today (default TypeDoc/CLI-extractor shape, no `mcp:` frontmatter, no Setup).
2. When `invocation` is present, delegates to `invocation.render(skill, ctx)`. Core still contributes the token-budget pass (FR-021, FR-022) — adapters focus on dialect-specific rendering, not token counting.
3. Canonicalization pass runs after adapter return, always.

---

## Error types

All errors thrown by the programmatic API are instances of `McpError`:

```typescript
export class McpError extends Error {
  readonly code: string;
  readonly cause?: unknown;
}
```

Callers can distinguish recoverable from fatal by inspecting `code`. `MISSING_LAUNCH_COMMAND`, `UNKNOWN_TARGET`, `ADAPTER_NOT_FOUND`, `DUPLICATE_SKILL_NAME` are user-correctable. `TRANSPORT_FAILED`, `SERVER_EXITED_EARLY` are environmental. `SCHEMA_REF_CYCLE` is server-caused.
