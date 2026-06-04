# Contract — `@skillit/mcp/adapter-utils` Subpath Module

**Owner**: `@skillit/mcp`
**Stability**: public-stable across `@skillit/mcp@0.x`. Major bump to break.
**Subpath import**: `import { ... } from '@skillit/mcp/adapter-utils'`

---

## Why this module exists

Three CLI invocation adapters (`target-mcpc`, `target-fastmcp`, hypothetical third parties) share ~100 lines of byte-identical helper code. This module is the single source of truth — adapters import from here instead of copying.

The host-side `@skillit/mcp` is not the natural place for these helpers from the user's perspective (they're adapter-author concerns), so they live under a subpath that consumers reach explicitly.

## Exported symbols

| Export                     | Purpose                                                                       | Stability |
| -------------------------- | ----------------------------------------------------------------------------- | --------- |
| `resolveLaunchCommand`     | Pick stdio vs. HTTP launch shape from `AdapterRenderContext`                  | stable    |
| `formatCliMarker`          | `'mcpc@^2.1'` → `'mcpc 2.1.x'` for the human-readable fingerprint trace line  | stable    |
| `shellQuote`               | Minimal POSIX shell quoting for tokens emitted into copy/paste-ready commands | stable    |
| `collapseTrailingNewlines` | Trim runs of trailing `\n` to a single `\n` (CodeQL ReDoS-safe)               | stable    |
| `renderToolsBody`          | Shared Markdown-body emitter for CLI Tools sections                           | stable    |
| `planForTool`              | Synthesize `Map<string, ParameterPlan>` from `ExtractedFunction`              | stable    |
| `parameterToSchema`        | `ExtractedParameter` → minimal `JSONSchema7` for `classifyParameters`         | stable    |

## `renderToolsBody` signature

```ts
export function renderToolsBody(
  functions: readonly ExtractedFunction[],
  skillName: string, // currently reserved; the shared body composes the
  // command line via cliVerb + encodeArgv, but per-tool
  // future variations may need it
  encodeOne: (plan: ParameterPlan) => string,
  encodeArgv: (
    plans: ReadonlyMap<string, ParameterPlan>,
    encodeOne: (p: ParameterPlan) => string
  ) => string,
  cliVerb: string // already-interpolated, e.g. 'mcpc my-skill tools-call' or 'pyfastmcp call'
): string;
```

Each adapter passes:

- `encodeOne` — per-arg encoder (mcpc uses `:=` typed marker for non-string scalars; fastmcp uses `=` always).
- `encodeArgv` — per-CLI argv builder; differs because mcpc emits Tier-3 fallback as a single trailing `--json '...'` token while fastmcp emits `--input-json '...'`.
- `cliVerb` — fully-interpolated command prefix (callsite formats `${skillName}` into the right slot).

Everything else — function header, description block, command line wrapping, parameters table — comes from the shared body.

**Behavioral guarantee**: byte-identical to the inline implementations in PR 20. Existing inline-snapshot tests in `target-mcpc` and `target-fastmcp` MUST continue to pass without snapshot updates.

## `package.json` exports declaration

```jsonc
{
  "name": "@skillit/mcp",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./adapter-utils": {
      "types": "./dist/adapter/cli-tools-helpers.d.ts",
      "import": "./dist/adapter/cli-tools-helpers.js"
    }
  }
}
```

## Versioning policy

- New symbols added: minor version bump.
- Signature changes: major version bump.
- Removal of a stable symbol: major version bump + 1-version deprecation window in CHANGELOG.

## Consumer adapters in-tree

- `packages/target-mcpc/src/render.ts` — uses all 7 exports.
- `packages/target-fastmcp/src/render.ts` — uses all 7 exports.
- `packages/target-mcp-protocol/src/render.ts` — does NOT consume this module (it doesn't render CLI tool tables).
