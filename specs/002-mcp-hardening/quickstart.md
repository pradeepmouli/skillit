# Quickstart — Adopter Migration to `@skillit/mcp@0.2.0`

**Audience**: anyone consuming `@skillit/mcp` programmatically, or maintaining a third-party invocation adapter.
**Effort**: 5–15 minutes for typical adopters.
**Prerequisites**: install `@skillit/mcp@0.2.0` and rebuild.

This is the breaking-change cookbook for the discriminated-union migrations and the additive `auditIssues` / `initializeTimeoutMs` features.

---

## §1. Migrating `AdapterRenderContext` consumers (US1, FR-H001)

If you wrote a custom invocation adapter that destructures `ctx.launchCommand` or checks `ctx.packageName != null`, you need to switch to `ctx.mode`.

**Before**:

```ts
class MyAdapter implements InvocationAdapter {
  async render(skill, ctx) {
    if (ctx.packageName) return this.bundle(skill, ctx.packageName, ctx.binName);
    if (ctx.httpEndpoint) return this.http(skill, ctx.httpEndpoint);
    if (ctx.launchCommand) return this.stdio(skill, ctx.launchCommand);
    throw new Error('no launch info');
  }
}
```

**After**:

```ts
class MyAdapter implements InvocationAdapter {
  async render(skill, ctx) {
    switch (ctx.mode) {
      case 'bundle':
        return this.bundle(skill, ctx.packageName, ctx.binName);
      case 'http':
        return this.http(skill, ctx.httpEndpoint);
      case 'stdio':
        return this.stdio(skill, ctx.launchCommand);
      default:
        const _: never = ctx;
        throw new Error('unhandled mode');
    }
  }
}
```

Compile and run your tests — TS narrows each arm correctly; the runtime "no launch info" throw is no longer reachable.

---

## §2. Migrating `ParameterPlan` consumers (US7, FR-H011)

If you wrote a custom CLI invocation adapter that reads `plan.scalarType` or `plan.enum` without first checking `plan.type`, you need to narrow.

**Before**:

```ts
function encodeOne(plan: ParameterPlan): string {
  const key = plan.path.join('.');
  if (plan.tier === 3) return `--json '<...>'`;
  if (plan.scalarType === 'string') return `${key}=<value>`;
  if (plan.scalarType) return `${key}:=<value>`;
  if (plan.enum) return `${key}=<one-of-${plan.enum.join('|')}>`;
  return `${key}:=<value>`;
}
```

**After**:

```ts
function encodeOne(plan: ParameterPlan): string {
  const key = plan.path.join('.');
  switch (plan.type) {
    case 'scalar':
      return plan.scalarType === 'string' ? `${key}=<value>` : `${key}:=<value>`;
    case 'enum':
      return `${key}=<one-of-${plan.enum.join('|')}>`;
    case 'string-array':
      return `${key}:=<json-array>`;
    case 'json':
      return `--json '<...>'`;
  }
}
```

---

## §3. Adopting `extractMcpSkill().auditIssues` (US3, FR-H006)

Programmatic callers can now read structured audit findings directly off the return value.

**Use case — CI gate**:

```ts
import { extractMcpSkill } from '@skillit/mcp';

const skill = await extractMcpSkill({
  transport: { type: 'stdio', command: 'npx', args: ['-y', '@my-org/server'] }
});

const fatal =
  skill.auditIssues?.filter((i) => i.severity === 'fatal' || i.severity === 'error') ?? [];
if (fatal.length > 0) {
  console.error(`Audit failed:`);
  for (const issue of fatal) console.error(`  [${issue.code}] ${issue.tool}: ${issue.message}`);
  process.exit(3);
}
```

**Tri-state semantics** — if you set `audit: { skip: true }`, `auditIssues` will be `undefined` (not `[]`), so callers can distinguish "didn't run" from "ran clean".

---

## §4. Adopting `initializeTimeoutMs` (US4, FR-H008)

If you've ever had a stuck stdio server hang `extractMcpSkill` indefinitely, the new option is for you.

**Default behavior** (no change required): 30 s timeout.

**Custom timeouts**:

```ts
// Generous for cold-starting npx-y servers
const skill = await extractMcpSkill({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'slow-server'],
    initializeTimeoutMs: 60_000
  }
});

// Aggressive for fast-handshake servers in CI
const skill = await extractMcpSkill({
  transport: { type: 'stdio', command: './bin/server', initializeTimeoutMs: 5_000 }
});

// Disable entirely (PR 20 behavior — not recommended)
const skill = await extractMcpSkill({
  transport: { type: 'stdio', command: '...', initializeTimeoutMs: 0 }
});
```

On timeout, expect:

```text
McpError: MCP server initialize handshake timed out after 30000ms
  code: 'INITIALIZE_FAILED'
```

---

## §5. Helper consolidation — third-party CLI adapter authors (US2, FR-H004/H005)

If you maintain a CLI invocation adapter (e.g., `@yourorg/target-foo`), you can now slim it down.

**Before** — copy the helpers from `target-mcpc`:

```ts
// target-foo/src/render.ts
function shellQuote(...) { /* 3 lines */ }
function collapseTrailingNewlines(...) { /* 5 lines */ }
function planForTool(...) { /* 15 lines */ }
function parameterToSchema(...) { /* 10 lines */ }
function renderToolsBody(...) { /* 35 lines */ }
// ... your encodeOne ...
```

**After** — import them:

```ts
import {
  resolveLaunchCommand,
  formatCliMarker,
  shellQuote,
  collapseTrailingNewlines,
  renderToolsBody,
  planForTool,
  parameterToSchema
} from '@skillit/mcp/adapter-utils';

class FooAdapter implements InvocationAdapter {
  readonly target = 'cli:foo' as const;
  readonly fingerprint = {
    /* ... */
  };

  async render(skill, ctx) {
    const launchCommand = resolveLaunchCommand(ctx);
    const body = renderToolsBody(skill.functions, ctx.skillName, this.encodeOne, 'foo call');
    // ... wrap in frontmatter, etc.
  }

  private encodeOne(plan: ParameterPlan): string {
    /* your CLI's per-arg syntax */
  }
}
```

Net effect: ~80 lines deleted from your adapter (matches SC-H003).

---

## §6. Verifying the migration

```bash
pnpm install @skillit/mcp@0.2.0
pnpm run type-check    # expect 0 errors
pnpm test              # expect: all green
```

If type-check fails, the most likely cause is one of the patterns in §1 or §2. The compiler error message will name the file and line — apply the migration above.

---

## §7. Where to ask questions

- Spec: `specs/002-mcp-hardening/spec.md`
- Data model: `specs/002-mcp-hardening/data-model.md`
- Contracts: `specs/002-mcp-hardening/contracts/`
- CHANGELOG entries (FR-H019): see `CHANGELOG.md` for the `0.2.0` section.
