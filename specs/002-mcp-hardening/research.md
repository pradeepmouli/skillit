# Research — `@skillit/mcp` Hardening

**Feature**: `002-mcp-hardening`
**Date**: 2026-04-25
**Inputs resolved**: All NEEDS CLARIFICATION from `plan.md` Phase 0 closed in this document.

---

## R1. Discriminated-Union encoding for `AdapterRenderContext` and `ParameterPlan`

**Decision**: Use literal-string discriminator (`mode` / `type`) with one arm per valid combination. Mark common fields as `readonly`. Export the union as the public type and individual arms as named subtypes for adapter-utils consumers that want to switch on a single arm.

```ts
export interface AdapterRenderContextBase {
  readonly skillName: string;
  readonly maxTokens: number;
  readonly canonicalize: boolean;
}
export interface AdapterRenderContextBundle extends AdapterRenderContextBase {
  readonly mode: 'bundle';
  readonly packageName: string;
  readonly binName?: string;
}
export interface AdapterRenderContextHttp extends AdapterRenderContextBase {
  readonly mode: 'http';
  readonly httpEndpoint: HttpLaunchEndpoint;
}
export interface AdapterRenderContextStdio extends AdapterRenderContextBase {
  readonly mode: 'stdio';
  readonly launchCommand: StdioLaunchCommand;
}
export type AdapterRenderContext =
  | AdapterRenderContextBundle
  | AdapterRenderContextHttp
  | AdapterRenderContextStdio;
```

**Rationale**:

- `switch (ctx.mode) { case 'bundle': ... }` gives TS exhaustiveness with `assertNever(default)` and narrows fields per arm.
- Excess-property check rejects `{ mode: 'bundle', packageName: 'x', launchCommand: ... }` at the call site.
- Common fields stay flat (no `ctx.base.skillName` indirection) because each arm `extends AdapterRenderContextBase`.
- Public-API symmetry with `ParameterPlan`'s 4-arm DU keeps the mental model uniform.

**Alternatives considered**:

- **Branded types** (`packageName: string & { __brand: 'bundle' }`): forces casts at every callsite, not worth the friction for an internal contract.
- **`Either<A, B, C>` library**: introduces a dep + non-idiomatic narrowing patterns; rejected.
- **Runtime guards only** (status quo): the entire reason this spec exists.

**Negative compile-time test**: `*.test-d.ts` file with `// @ts-expect-error` over a deliberately-malformed literal. Vitest typecheck mode runs `tsc --noEmit` over those files and fails if the directive doesn't match a real error.

---

## R2. Stderr ring-buffer implementation

**Decision**: array-of-Buffers with running byte-count. Append-only until total > 64 KiB, then drop chunks from the head. Flush concatenates head→tail and slices the tail-most 64 KiB.

```ts
const MAX_STDERR_BYTES = 64 * 1024;
let bytes = 0;
const chunks: Buffer[] = [];
function append(chunk: Buffer): void {
  chunks.push(chunk);
  bytes += chunk.length;
  while (bytes > MAX_STDERR_BYTES && chunks.length > 1) {
    const dropped = chunks.shift()!;
    bytes -= dropped.length;
  }
  // If a single chunk > MAX_STDERR_BYTES, slice its tail in place.
  if (bytes > MAX_STDERR_BYTES && chunks.length === 1) {
    const tail = chunks[0]!.slice(-MAX_STDERR_BYTES);
    bytes = tail.length;
    chunks[0] = tail;
  }
}
function flush(): string {
  return Buffer.concat(chunks, bytes).toString('utf8');
}
```

**Rationale**:

- O(1) append (push + maybe shift); O(n) flush is acceptable since flush only happens on error or success-end.
- Buffer-level (not string-level) avoids decoder split issues during accumulation; UTF-8 is decoded once at flush. The tail-slice on the single oversized-chunk path may split a multi-byte character — accept that as best-effort diagnostics (the SERVER_EXITED_EARLY message is for humans, not parsers).
- `chunks.length > 1` guard ensures we never drop the only chunk we have (necessary when the first chunk is itself > 64 KiB).
- Existing 2 KiB display-trim runs on the flushed string — both layers coexist without conflict (Edge Case in spec).

**Alternatives considered**:

- **Single contiguous Buffer with `Buffer.concat` + `slice`**: O(n) on every append; quadratic in the worst case.
- **Configurable cap**: adds API surface for no demonstrated need; keep fixed at 64 KiB per Clarifications.

---

## R3. `initializeTimeoutMs` race pattern with `vi.useFakeTimers`

**Decision**: race `client.connect()` Promise against a `setTimeout`-driven rejection. Use `AbortController` to cancel the connect when the timeout fires (best-effort — SDK doesn't yet honor signals consistently, but cancel is idempotent). Always clear the timer in a `finally`.

```ts
async function connectWithTimeout(
  client: Client,
  transport: Transport,
  timeoutMs: number
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new McpError(
                `MCP server initialize handshake timed out after ${timeoutMs}ms`,
                'INITIALIZE_FAILED'
              )
            ),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

**Rationale**:

- Vitest's `vi.useFakeTimers()` patches `setTimeout`/`clearTimeout` globally; `vi.advanceTimersByTime(timeoutMs + 1)` fires the rejection deterministically.
- `Promise.race` ensures whichever resolves/rejects first wins; the late `connect` Promise becomes uncovered but doesn't crash (V8 unhandled-rejection warning suppressed via the `client.connect()` consumer eventually settling — verify in test).
- `finally` runs on both branches, so the timer is always cleared even on connect-success.

**Alternatives considered**:

- **AbortController only**: SDK doesn't fully honor signals on stdio transport — would let the connect Promise hang past test-end.
- **Custom timer thread**: overkill for a single Promise.

**Edge case**: if `timeoutMs <= 0`, treat as "no timeout" and skip the race entirely — preserves the existing behavior for users who explicitly opt out via `0`. (This is documentation, not a runtime branch needed today; default of 30 000 means the option is opt-in for shorter, not disabling.)

---

## R4. `EventEmitter.removeListener` correctness pattern

**Decision**: declare the listener as a named arrow constant captured in the local scope, attach in the try-block, remove in the finally-block.

```ts
const onStderr = (chunk: Buffer): void => append(chunk);
try {
  transport.stderr?.on('data', onStderr);
  // ... extract work ...
} finally {
  transport.stderr?.removeListener('data', onStderr);
}
```

**Rationale**:

- `EventEmitter.removeListener` finds the listener by reference identity, not by source-equality. Anonymous `transport.stderr?.on('data', (c) => append(c))` cannot be removed because no reference is retained.
- `?.` chaining handles the (rare) case where `transport.stderr` is undefined (HTTP transports).

**Alternatives considered**:

- **`once('end', () => stderr.removeAllListeners('data'))`**: removes user listeners too; rejected.
- **`Symbol`-keyed listener**: doesn't help — `removeListener` still wants the same function reference.

**Test**: 30-iteration loop calling `extractStdio` against a mock with a real `EventEmitter` for stderr; assert `listenerCount('data') === 0` after each iteration.

---

## R5. `@ts-expect-error` for compile-time DU assertions

**Decision**: Use Vitest's typecheck mode (`vitest --typecheck`) over `*.test-d.ts` files with `// @ts-expect-error` directives. Add a typecheck-only npm script and (optionally) a CI step.

```ts
// adapter-render-context-types.test-d.ts
import type { AdapterRenderContext } from '@skillit/mcp';
import { test } from 'vitest';

test('AdapterRenderContext rejects two-arms-set construction', () => {
  // @ts-expect-error — bundle arm cannot also carry launchCommand
  const _bad: AdapterRenderContext = {
    mode: 'bundle',
    skillName: 'x',
    maxTokens: 4000,
    canonicalize: true,
    packageName: 'pkg',
    launchCommand: { command: 'node' }
  };
});
```

**Rationale**:

- Vitest 2.x ships built-in typecheck support (no `tsd` dep).
- `// @ts-expect-error` fails the test if the line _does_ compile — tightening the DU later won't silently weaken the test.
- Single-file change to `vitest.config.ts` enables typecheck mode for matching files.

**Alternatives considered**:

- **`tsd`**: extra dep, separate runner; rejected.
- **`expectTypeOf` from vitest**: better for positive assertions; for negative compile-error checks, `@ts-expect-error` is more direct.

---

## R6. Subpath export for `@skillit/mcp/adapter-utils`

**Decision**: Add an `exports` subpath in `packages/mcp/package.json` so adapter packages can `import { resolveLaunchCommand } from '@skillit/mcp/adapter-utils'`.

```jsonc
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./adapter-utils": {
      "types": "./dist/adapter/cli-tools-helpers.d.ts",
      "import": "./dist/adapter/cli-tools-helpers.js"
    }
  }
}
```

**Rationale**:

- Subpath exports keep the main entrypoint clean — adapter-internals don't pollute `@skillit/mcp`'s public README surface.
- TypeScript respects `exports` subpaths since 4.7 (with `"moduleResolution": "Bundler"` or `"NodeNext"`); the workspace already uses NodeNext-compatible config.
- Stability docs go in `contracts/adapter-utils.md`: which symbols are stable vs. internal. Three CLI adapters (target-mcpc, target-fastmcp, hypothetical target-foo) consume it; bumping the major-version of the subpath is decoupled from the main package's version.

**Alternatives considered**:

- **Re-export from `@skillit/mcp` main**: would make every helper part of the public surface forever; rejected.
- **Separate `@skillit/adapter-utils` package**: adds release ceremony for what's effectively three function helpers; rejected (FR-H004 explicitly says "shared module under `@skillit/mcp/adapter-utils`").

---

## R7. Encoder-callback drift between target-mcpc and target-fastmcp

**Decision**: `renderToolsBody` accepts `encodeOne: (plan: ParameterPlan) => string` as a required callback. Each adapter passes its own implementation. The shared module never imports adapter-specific encoders.

```ts
// packages/mcp/src/adapter/cli-tools-helpers.ts
export function renderToolsBody(
  functions: readonly ExtractedFunction[],
  skillName: string,
  encodeOne: (plan: ParameterPlan) => string,
  cliVerb: string // 'mcpc tools-call' vs 'pyfastmcp call'
): string {
  /* shared body */
}
```

**Rationale**:

- The DU refactor (R1) makes `encodeOne`'s narrowing trivial: each arm of `ParameterPlan` has a known shape.
- Inline-snapshot tests in both target packages already pin the rendered output byte-for-byte. Any drift between mcpc's `:=` and fastmcp's `=` shows up immediately.
- `cliVerb` parameterizes the per-row command line ("mcpc <name> tools-call <tool>" vs "pyfastmcp call <tool>") so the shared body emits whichever the adapter requested.

**Alternatives considered**:

- **Strategy pattern (interface with multiple methods)**: more ceremony for one varying point; rejected.
- **Default `encodeOne` and override via subclass**: forces classes; current design is functional.

---

## R8. Audit M3 sub-rule for malformed `_meta.toSkills`

**Decision**: Detection lives in the _introspector_ (the code that reads `tool._meta` from the SDK response). When shape validation fails (e.g., `useWhen` is a string instead of `string[]`), set `tool.tags.metaToSkillsMalformed = '<reason>'` so the IR carries a sentinel. The audit engine then emits an M3 issue when it sees this sentinel.

```ts
// In audit.ts, alongside existing M3 (missing useWhen) rule:
if (fn.tags?.metaToSkillsMalformed) {
  issues.push({
    code: 'M3',
    severity: 'warning',
    tool: fn.name,
    message: `malformed _meta.toSkills annotation: ${fn.tags.metaToSkillsMalformed}`
  });
}
```

**Rationale**:

- Keeps the audit engine pure (operates on IR, no protocol coupling).
- `tags` is already the IR's free-form annotation surface; adding one sentinel key doesn't grow the schema.
- Severity stays `warning` (matches existing M3) — the failure is "annotation not honored", not a fatal extraction error.
- Reuses existing M3 code → no audit-engine version bump and no new public symbol; matches Clarifications decision.

**Alternatives considered**:

- **New M6 code**: rejected per Clarifications (M3 already covers "annotation not honored" semantics).
- **Throw at extract time**: too aggressive — the user can still ship the skill; the warning communicates what happened.

---

## R9. `readMcpConfigFile` parsed return shape (FR-H012)

**Decision**: `readMcpConfigFile(path): Promise<readonly ConfigEntry[]>` where:

```ts
interface ConfigEntry {
  readonly name: string;
  readonly transport: McpTransport; // already-validated discriminated union
  readonly disabled?: boolean;
}
```

The runtime narrowing (the "Defensive" branch in `cli.ts::runConfigEntry`) is removed; if the file shape doesn't match, `readMcpConfigFile` throws `McpError('CONFIG_INVALID', ...)`. Existing `tests/unit/config-file-reader.test.ts` cases stay green because the validation logic doesn't change — only its location does.

**Rationale**:

- Parse-don't-validate at the boundary: once past `readMcpConfigFile`, downstream code never sees the `McpServerConfig` un-validated wire shape.
- Error-first: malformed entries fail loudly with a code that maps to the existing CLI exit-code table.
- Backward-compat: same input file shape, same error messages — only the reader's return type changes.

**Alternatives considered**:

- **Return both shapes**: defeats the purpose; rejected.
- **Zod schema runtime validation**: existing custom validation is sufficient; adding Zod is scope creep.

---

## Open questions — none

All R-items resolved at authoring time. No remaining NEEDS CLARIFICATION markers.
