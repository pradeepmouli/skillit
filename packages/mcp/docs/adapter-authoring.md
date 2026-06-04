# Building a custom invocation adapter for `@skillit/mcp`

`@skillit/mcp` extracts a target-agnostic `ExtractedSkill` IR from a live MCP server. **Invocation adapters** decide how that IR becomes a `SKILL.md`. Three are shipped:

- [`@skillit/target-mcp-protocol`](../../target-mcp-protocol/) — `mcp:` frontmatter for MCP-native harnesses (default).
- [`@skillit/target-mcpc`](../../target-mcpc/) — shell commands routed through Apify's `mcpc` CLI.
- [`@skillit/target-fastmcp`](../../target-fastmcp/) — shell commands routed through the Python `fastmcp` CLI.

If you ship a different MCP CLI (or a wholly different target — say, a Lua REPL bridge), you can publish a third-party adapter and `@skillit/mcp` will load it on demand. This guide walks through the contract, the loader, and the testing/publishing checklist.

---

## 1. Package naming

The loader resolves `--invocation <target>` to an npm package name. Two target shapes are accepted:

| Target syntax               | Resolves to (in order)                                 |
| --------------------------- | ------------------------------------------------------ |
| `--invocation mcp-protocol` | `@skillit/target-mcp-protocol` (single canonical name) |
| `--invocation cli:<name>`   | `@skillit/target-<name>`, then `skillit-target-<name>` |

Bare names without the `cli:` prefix (other than the literal `mcp-protocol`) are **rejected** with `UNKNOWN_TARGET` — the loader does not auto-prefix arbitrary `--invocation foo` to `cli:foo`. Always pass `cli:<name>` for third-party adapters.

So a third-party adapter for, say, the hypothetical `mcp-runner` CLI would be published as either:

- `@your-org/skillit-target-mcp-runner` — _not yet supported_ (only the `@skillit/` namespace and the unscoped `skillit-target-*` form resolve today; arbitrary scopes can install but you'll need to import + pass programmatically). For most third parties, **use the unscoped `skillit-target-<name>` form** so the loader picks it up.

Pick the unscoped form unless you intend to have `@skillit/mcp` users import your adapter explicitly.

---

## 2. Required exports

Your adapter package must expose **two** export shapes so both the loader (default-export style) and direct programmatic users (named-export style) work:

```ts
// src/index.ts
import { MyAdapter } from './render.js';

export { MyAdapter };
export const adapter = new MyAdapter();
export default adapter; // ← the loader looks here
export { fingerprint } from './fingerprint.js'; // re-export for convenience
```

The `default` export must be a singleton instance of your adapter class (so loader cache hits return the same object) — not the class constructor.

---

## 3. The `InvocationAdapter` contract

```ts
import type {
  InvocationAdapter,
  AdapterFingerprint,
  AdapterRenderContext,
  ExtractedSkill,
  RenderedSkill
} from '@skillit/core';

export class MyAdapter implements InvocationAdapter {
  readonly target = 'cli:my-runner' as const;

  readonly fingerprint: AdapterFingerprint = {
    adapter: 'skillit-target-my-runner',
    version: PACKAGE_VERSION, // import from your version.ts
    targetCliRange: 'mcp-runner@^1' // omit if you target a non-CLI surface
  };

  async render(skill: ExtractedSkill, ctx: AdapterRenderContext): Promise<RenderedSkill> {
    // Two design choices live here. Pick one:
    //
    // A) Frontmatter-only: delegate body rendering to core's default path,
    //    inject your own frontmatter via `additionalFrontmatter`. This is what
    //    `@skillit/target-mcp-protocol` does.
    //
    // B) Full body override: render SKILL.md + references yourself. This is
    //    what the CLI-as-proxy adapters do — they replace the Tools section
    //    with command-shape rows.
    //
    // Either way, return a RenderedSkill with `skill: { filename, content }`
    // and the (possibly empty) `references: RenderedFile[]` array.

    // ... your rendering logic ...

    return { skill: { filename: `${ctx.skillName}/SKILL.md`, content }, references };
  }
}
```

### `AdapterRenderContext` highlights

| Field           | Meaning                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `skillName`     | Output directory name (kebab-case). Use as the unique label in CLI commands.                          |
| `launchCommand` | `{ command, args?, env? }` — set in stdio extract mode.                                               |
| `httpEndpoint`  | `{ url, headers? }` — set in HTTP extract mode.                                                       |
| `packageName`   | Set in bundle mode — emit `npx -y <packageName>` style invocations.                                   |
| `binName`       | Set in bundle mode for multi-`bin` packages — emit `npx --package=<pkg> <bin>`.                       |
| `maxTokens`     | Per reference-file ceiling. The host truncates if you exceed; staying under it avoids surprises.      |
| `canonicalize`  | When `false`, the host has already requested the wrapper to canonicalize; you can skip your own pass. |

---

## 4. Fingerprinting

CLI-as-proxy adapters (`cli:<name>`) **should** carry a `generated-by:` frontmatter block so the M5 freshness audit can detect drift between rendered output and the installed adapter version. The MCP-protocol adapter does **not** emit this block — there is no upstream CLI shape to track for drift, so the fingerprint is exposed only programmatically. The convention applies to CLI adapters:

```yaml
generated-by:
  adapter: 'skillit-target-my-runner'
  version: '1.0.3'
  target-cli-range: 'mcp-runner@^1'
```

Bump `version` whenever your renderer's output changes shape — that's what tells consumers their `skills/` checked-in copy may be stale. Bump `targetCliRange` when the upstream CLI changes its argument shape in a way that would break copy-pasted commands from old SKILL.md files.

---

## 5. How `loadAdapterAsync` resolves your package

Source: [`packages/mcp/src/adapter/loader.ts`](../src/adapter/loader.ts).

1. The host parses `--invocation <target>`.
2. For each candidate package name (per Section 1), `loadAdapterAsync` runs `await import(pkgName)`.
3. The first candidate that resolves wins. The default export is read; if it's an object with `target` and `render`, it's cached and returned.
4. If no candidate resolves, the host throws `McpError('ADAPTER_NOT_FOUND')` with an enumeration of installed adapters and an `npm install` hint.

The cache is per-process — a single `skillit mcp extract --invocation X --invocation Y` invocation imports each package exactly once.

---

## 6. Testing your adapter

Mirror the test layout in [`packages/target-mcpc/tests/`](../../target-mcpc/tests/):

- **`render.test.ts`** — feeds a hand-built `ExtractedSkill` through `adapter.render(skill, ctx)` and asserts on `rendered.skill.content` and `rendered.references[].content`.
- **`args.test.ts`** (if your adapter has CLI argument encoding) — pure-function tests on the encoder.
- **Integration test in the host** — add a fixture under `packages/mcp/tests/fixtures/<your-adapter>-server/` and a test that runs `skillit mcp extract --invocation <target> --command node --arg <fixture>` end-to-end.

For the renderer test, the smallest viable skeleton is:

```ts
import { describe, expect, it } from 'vitest';
import type { AdapterRenderContext, ExtractedSkill } from '@skillit/core';
import { MyAdapter } from '../src/render.js';

const skill: ExtractedSkill = {
  name: 'demo',
  description: 'demo',
  functions: [
    {
      name: 'do_thing',
      description: 'Does the thing.',
      signature: 'do_thing(x: string)',
      parameters: [{ name: 'x', type: 'string', description: '', optional: false }],
      returnType: 'unknown',
      examples: [],
      tags: {}
    }
  ],
  classes: [],
  types: [],
  enums: [],
  variables: [],
  examples: []
};

const ctx: AdapterRenderContext = {
  skillName: 'demo',
  maxTokens: 4000,
  canonicalize: true,
  launchCommand: { command: 'node', args: ['./server.js'] }
};

describe('MyAdapter', () => {
  const adapter = new MyAdapter();

  it('renders a SKILL.md with a Setup section and a Tools entry', async () => {
    const rendered = await adapter.render(skill, ctx);
    expect(rendered.skill.filename).toBe('demo/SKILL.md');
    expect(rendered.skill.content).toContain('do_thing');
  });
});
```

---

## 7. Publishing checklist

Before `npm publish`:

- [ ] `target` literal is unique across your toolchain (clash with built-ins is a hard error in the loader).
- [ ] `default` export is a singleton instance of the adapter class.
- [ ] `fingerprint.version` reads from `package.json` (so consumers can detect drift on every release).
- [ ] `fingerprint.targetCliRange` (if applicable) reflects the actual upstream CLI shape; bump on any breaking arg change.
- [ ] Unit tests cover empty skills, schema-cycle tools (`tags.schemaError === 'true'`), and bundle-mode (`packageName` set).
- [ ] README documents the install command, the `--invocation` flag value users should pass, and the upstream CLI install steps.

Once published, end-users can install your adapter alongside `@skillit/mcp` and it works without any host-side change:

```bash
npm install --save-dev @skillit/mcp skillit-target-my-runner
npx skillit mcp extract --command "..." --invocation cli:my-runner
```

---

## See also

- [`@skillit/core` — `InvocationAdapter` and `AdapterRenderContext` types](../../core/src/types.ts).
- [Source: `target-mcp-protocol`](../../target-mcp-protocol/src/render.ts) — frontmatter-only adapter (delegates body to core).
- [Source: `target-mcpc`](../../target-mcpc/src/render.ts) — full-body adapter overriding the Tools section.
- [Source: `target-fastmcp`](../../target-fastmcp/src/render.ts) — full-body adapter for a Python CLI surface.
