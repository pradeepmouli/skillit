# Data Model — `@skillit/mcp` Hardening

**Feature**: `002-mcp-hardening`
**Date**: 2026-04-25
**Scope**: Type-shape changes only. No new entities; existing entities are tightened.

---

## 1. `AdapterRenderContext` — refactored to discriminated union (FR-H001)

**Module**: `packages/mcp/src/types.ts`

**Before** (current PR 20 shape — flat record):

```ts
interface AdapterRenderContext {
  readonly skillName: string;
  readonly maxTokens: number;
  readonly canonicalize: boolean;
  readonly packageName?: string;
  readonly binName?: string;
  readonly httpEndpoint?: HttpLaunchEndpoint;
  readonly launchCommand?: StdioLaunchCommand;
}
```

**After**:

```ts
interface AdapterRenderContextBase {
  readonly skillName: string;
  readonly maxTokens: number;
  readonly canonicalize: boolean;
}
interface AdapterRenderContextBundle extends AdapterRenderContextBase {
  readonly mode: 'bundle';
  readonly packageName: string;
  readonly binName?: string;
}
interface AdapterRenderContextHttp extends AdapterRenderContextBase {
  readonly mode: 'http';
  readonly httpEndpoint: HttpLaunchEndpoint;
}
interface AdapterRenderContextStdio extends AdapterRenderContextBase {
  readonly mode: 'stdio';
  readonly launchCommand: StdioLaunchCommand;
}
type AdapterRenderContext =
  | AdapterRenderContextBundle
  | AdapterRenderContextHttp
  | AdapterRenderContextStdio;
```

**Invariants** (now compile-time):

- `mode === 'bundle'` ⟺ `packageName` defined (required, not optional)
- `mode === 'http'` ⟺ `httpEndpoint` defined
- `mode === 'stdio'` ⟺ `launchCommand` defined
- Excess-property check rejects two arms set simultaneously

**State transitions**: none — `AdapterRenderContext` is constructed once per render call.

**Validation**: TS narrowing only. The renderer's invocation-adapter dispatch (`packages/core/src/renderer.ts`) sets `mode` deterministically from `SkillRenderOptions`:

| `SkillRenderOptions` field present | `mode` value                                              |
| ---------------------------------- | --------------------------------------------------------- |
| `invocationPackageName` only       | `'bundle'`                                                |
| `invocationHttpEndpoint` only      | `'http'`                                                  |
| `invocationLaunchCommand` only     | `'stdio'`                                                 |
| more than one of the above         | throws `McpError('TRANSPORT_FAILED', /more than one of/)` |

---

## 2. `ParameterPlan` — refactored to discriminated union (FR-H011)

**Module**: `packages/mcp/src/types.ts`

**Before** (flat with correlated optionals):

```ts
interface ParameterPlan {
  readonly path: string[];
  readonly tier: 1 | 2 | 3;
  readonly type: 'scalar' | 'enum' | 'string-array' | 'json';
  readonly scalarType?: 'string' | 'number' | 'integer' | 'boolean';
  readonly enum?: string[];
}
```

**After**:

```ts
interface ParameterPlanBase {
  readonly path: readonly string[];
}
interface ParameterPlanScalar extends ParameterPlanBase {
  readonly type: 'scalar';
  readonly tier: 1 | 2;
  readonly scalarType: 'string' | 'number' | 'integer' | 'boolean';
}
interface ParameterPlanEnum extends ParameterPlanBase {
  readonly type: 'enum';
  readonly tier: 1 | 2;
  readonly enum: readonly string[];
}
interface ParameterPlanStringArray extends ParameterPlanBase {
  readonly type: 'string-array';
  readonly tier: 1 | 2;
}
interface ParameterPlanJson extends ParameterPlanBase {
  readonly type: 'json';
  readonly tier: 3;
}
type ParameterPlan =
  | ParameterPlanScalar
  | ParameterPlanEnum
  | ParameterPlanStringArray
  | ParameterPlanJson;
```

**Invariants** (now compile-time):

- `scalarType` exists iff `type === 'scalar'`
- `enum` exists iff `type === 'enum'`
- `tier === 3` iff `type === 'json'`

**Reader sites updated** (5 in total):

- `packages/target-mcpc/src/args.ts::encodeOne`
- `packages/target-fastmcp/src/args.ts::encodeOne`
- `packages/mcp/src/adapter/param-table.ts::encodePlanForTable`
- `packages/mcp/src/adapter/classify-parameters.ts` (return type)
- `packages/mcp/src/adapter/cli-tools-helpers.ts::planForTool` (synthesizer)

---

## 3. `ExtractedSkill` — extended with `auditIssues` (FR-H006, US3)

**Module**: `packages/core/src/types.ts`

```ts
interface ExtractedSkill {
  // ... existing fields (name, description, functions, classes, types, ...)
  readonly auditIssues?: readonly AuditIssue[];
}
```

**Semantics**:

- `undefined` — audit was skipped (`options.audit?.skip === true`) or this `ExtractedSkill` came from a non-MCP extractor (TypeDoc, CLI). Callers cannot distinguish "ran clean" from "ran with errors".
- `[]` — audit ran, found no issues.
- `[…]` — audit ran, found issues. Length and `severity` distribution are the gate criteria.

**Validation**: no runtime check — the field's presence/absence IS the signal.

**Population**: only `extractMcpSkill` writes this field today. TypeDoc and CLI extractors leave it undefined.

---

## 4. `McpExtractOptions.transport.stdio` — extended with `initializeTimeoutMs` (FR-H008)

**Module**: `packages/mcp/src/types.ts`

```ts
interface McpStdioTransportOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly initializeTimeoutMs?: number; // default 30_000; <=0 disables the race
}
```

**Default**: 30 000 ms (30 s) — chosen to comfortably absorb `npx -y` cold starts on fresh CI runners while catching genuinely stuck servers.

**Throws on timeout**: `McpError('INITIALIZE_FAILED', /timed out after \\d+ms/)`.

---

## 5. `McpServerConfig` — boundary-only type (FR-H012)

**Module**: `packages/mcp/src/types.ts` (stays) + `packages/mcp/src/config-file-reader.ts` (return shape changes)

`McpServerConfig` itself is unchanged — it remains the un-validated wire shape from `mcp.json` / `claude_desktop_config.json`. What changes is the boundary:

- `readMcpConfigFile(path): Promise<readonly ConfigEntry[]>` — returns the parsed shape directly:

  ```ts
  interface ConfigEntry {
    readonly name: string;
    readonly transport: McpTransport;
    readonly disabled?: boolean;
  }
  ```

- `cli.ts::runConfigEntry` no longer narrows at runtime (the "Defensive" comment block is removed). If a config entry fails validation, `readMcpConfigFile` throws `McpError('CONFIG_INVALID', ...)` before any downstream code sees it.

---

## 6. `WrittenSkill`, `AuditResult` — readonly array tightening (FR-H015)

**Module**: `packages/core/src/types.ts` and `packages/mcp/src/types.ts`

```ts
interface WrittenSkill {
  readonly directory: string;
  readonly files: readonly WrittenFile[]; // was: WrittenFile[]
}
interface AuditResult {
  readonly worstSeverity: AuditSeverity;
  readonly issues: readonly AuditIssue[]; // was: AuditIssue[]
}
interface ParameterPlan {
  readonly path: readonly string[]; // was: string[] (also covered by §2)
}
```

**Behavior change**: callers that previously did `result.issues.push(...)` now fail to compile. No internal mutation site does this; the audit-engine builds a local `const issues: AuditIssue[] = []` and returns it as `readonly` via the type widening at function exit.

---

## 7. `CliToolsHelpers` shared module — new exports (FR-H004, FR-H005)

**Module**: `packages/mcp/src/adapter/cli-tools-helpers.ts` (NEW)

Exports moved from `target-mcpc/src/render.ts` (and removed from `target-fastmcp/src/render.ts`):

| Export                     | Signature (sketch)                                                        |
| -------------------------- | ------------------------------------------------------------------------- |
| `resolveLaunchCommand`     | `(ctx: AdapterRenderContext) => StdioLaunchCommand \| HttpLaunchEndpoint` |
| `formatCliMarker`          | `(targetCliRange: string \| undefined) => string`                         |
| `shellQuote`               | `(token: string) => string`                                               |
| `collapseTrailingNewlines` | `(s: string) => string`                                                   |
| `renderToolsBody`          | `(fns, skillName, encodeOne, cliVerb) => string`                          |
| `planForTool`              | `(fn: ExtractedFunction) => Map<string, ParameterPlan>`                   |
| `parameterToSchema`        | `(p: ExtractedParameter) => JSONSchema7`                                  |

**Subpath export**: `@skillit/mcp/adapter-utils` (declared in `packages/mcp/package.json`'s `exports` field).

**Stability**: documented in `contracts/adapter-utils.md`. Public-stable for the lifetime of `@skillit/mcp@0.x` major. Bump major to break.

---

## 8. M3 audit rule sub-case — malformed `_meta.toSkills` sentinel (FR-H010)

**Module**: `packages/mcp/src/audit.ts` + introspector that fills `tool.tags.metaToSkillsMalformed`

**Schema**: `ExtractedFunction.tags?: Record<string, string>` already exists. New convention:

- Key: `metaToSkillsMalformed`
- Value: human-readable reason (e.g., `'useWhen must be string[], got string'`).

**Audit emission**:

```ts
if (fn.tags?.metaToSkillsMalformed) {
  issues.push({
    code: 'M3',
    severity: 'warning',
    tool: fn.name,
    message: `malformed _meta.toSkills annotation: ${fn.tags.metaToSkillsMalformed}`
  });
}
```

No new audit code; M3 already covers "annotation not honored" semantics (per Clarifications).

---

## Summary — what changed, what didn't

| Entity                              | Change kind                     | Public-API impact                                    |
| ----------------------------------- | ------------------------------- | ---------------------------------------------------- |
| `AdapterRenderContext`              | DU refactor                     | Breaking for adapter authors (US1, FR-H019)          |
| `ParameterPlan`                     | DU refactor                     | Breaking for third-party CLI adapters (US7)          |
| `ExtractedSkill`                    | additive `auditIssues?`         | Backward-compat (optional field)                     |
| `McpExtractOptions.transport.stdio` | additive `initializeTimeoutMs?` | Backward-compat (optional field)                     |
| `McpServerConfig`                   | location-only                   | Internal refactor — no public-API change             |
| `WrittenSkill.files`                | readonly tightening             | Breaks callers that mutate (no in-tree consumers do) |
| `AuditResult.issues`                | readonly tightening             | Same                                                 |
| `ParameterPlan.path`                | readonly tightening             | Same (also part of §2 DU)                            |
| `CliToolsHelpers` module            | new module                      | Additive (subpath export)                            |
| Audit M3 rule                       | sub-case extension              | New issue class but same code/severity               |
