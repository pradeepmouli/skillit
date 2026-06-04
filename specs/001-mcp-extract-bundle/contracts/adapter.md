# Contract: Invocation Adapter Plugin Interface

**For**: third-party package authors who want to contribute a new invocation target.

**Package naming**: `@skillit/target-<name>` (scoped, preferred) or `to-skills-target-<name>` (unscoped fallback).

**Required export**: default export must be an `InvocationAdapter`.

---

## Interface

```typescript
import type { ExtractedSkill, RenderedSkill } from '@skillit/core';
import type {
  InvocationAdapter,
  AdapterContext,
  AdapterFingerprint,
  InvocationTarget
} from '@skillit/mcp';

export default class MyAdapter implements InvocationAdapter {
  readonly target: InvocationTarget = 'cli:myname';
  readonly fingerprint: AdapterFingerprint = {
    adapter: '@skillit/target-myname',
    version: '1.0.0', // MUST match package.json version at build time
    targetCliRange: 'myname@^2' // semver range of the underlying CLI
  };

  async render(skill: ExtractedSkill, ctx: AdapterContext): Promise<RenderedSkill> {
    // 1. Build SKILL.md body
    //    - Use ctx.skillName for the frontmatter `name`
    //    - Emit `setup:` section if CLI-based (do NOT emit `mcp:` frontmatter)
    //    - Embed this.fingerprint in the Setup section for FR-IT-012
    // 2. Build references/tools.md, references/resources.md, references/prompts.md
    //    - Use the tier classifier (helper exported from @skillit/mcp) to decide per-parameter encoding
    // 3. Return RenderedSkill
  }
}
```

---

## Rules

### MUST

- Export the adapter as `default` from the package entry point.
- Set `target` to match the resolver form (`'mcp-protocol'` or `'cli:<n>'`) — the host uses this for output-directory disambiguation.
- Set `fingerprint.adapter` to the npm package name exactly as published.
- Set `fingerprint.version` to the package's own semver at build time. The host does not introspect this — the adapter is responsible for keeping it truthful, typically via a build-time code generator or `require('../package.json').version`.
- Embed `fingerprint` in the rendered SKILL.md Setup section AND in the frontmatter under `generated-by` (per FR-IT-012).
- Use the host-provided `classifyParameters(tool.inputSchema)` helper to decide which parameters render natively vs fall back to JSON. This ensures consistent behavior across adapters (Research §6).
- Emit a `setup` block (via `ExtractedSkill.setup` or via Markdown in the body) for CLI-based targets. MCP-protocol adapters MAY omit `setup` and MUST emit `mcp:` frontmatter.
- Token-budget reference files — the host runs the budget pass after return, but adapters should emit reasonable sizes to avoid aggressive truncation.

### MUST NOT

- Invoke any MCP tool, read any resource, or execute any prompt. Adapters only see `ExtractedSkill` — they have no live connection.
- Modify the `ExtractedSkill` passed in. Adapters produce new output; they don't mutate input.
- Emit `mcp:` frontmatter when `target.startsWith('cli:')`. CLI targets proxy through the external CLI; embedding `mcp:` would confuse consuming harnesses.
- Depend on `@skillit/core` internals beyond the exported types (`ExtractedSkill`, `ExtractedResource`, `ExtractedPrompt`, `RenderedSkill`, `RenderedFile`). Use the public surface only.

### SHOULD

- Export named helpers for unit testing (e.g., `encodeParameter(plan)` — so a third party can assert on encoding without running a full render).
- Include a README.md in the adapter package documenting the target CLI's expected version range and any known incompatibilities.
- Pin the adapter's `@skillit/core` peer dependency to the same major version the adapter was built against.

---

## `classifyParameters` helper (host-exported)

```typescript
export function classifyParameters(inputSchema: JSONSchema7): Map<string, ParameterPlan>;

export interface ParameterPlan {
  /** Dot-notation path, e.g. ["user", "email"] */
  path: string[];
  /** Rendering tier (see Research §6) */
  tier: 1 | 2 | 3;
  /** Structural type */
  type: 'scalar' | 'enum' | 'string-array' | 'object' | 'json';
  /** Whether this parameter is required */
  required: boolean;
  /** Optional enum values (only when type === 'enum') */
  enum?: string[];
}
```

Adapters convert `ParameterPlan` to their CLI's syntax in a loop. The host guarantees:

- All Tier 1 params are representable as a single key=value pair in any CLI convention.
- All Tier 2 params are representable as a dotted key=value pair.
- Tier 3 params MUST render as a single JSON-valued argument under whatever flag the CLI reserves for structured payloads (e.g., `--json`).

---

## Testing expectations

A conformant adapter SHOULD include:

1. **Snapshot test** against a fixed `ExtractedSkill` fixture (use the same fixture the host ships at `packages/mcp/tests/fixtures/server-everything.json` for cross-adapter comparability).
2. **Fingerprint test** — verify `fingerprint.version` matches the package's own `package.json` version (catch drift).
3. **Tier round-trip tests** — for each tier, produce output that round-trips through the target CLI's argument parser (mock or real).

---

## Adapter registration — there is none

Adapters are NOT registered in any config file. Installation is the registration:

```bash
npm install @skillit/target-myname
to-skills-mcp extract --command "..." --invocation cli:myname
```

The host resolves `cli:myname` → `@skillit/target-myname` via `require.resolve()` at runtime (Research §5). If resolution fails, the host emits `McpError` with code `ADAPTER_NOT_FOUND` listing the candidates it tried.
