# Contract — `ParameterPlan` Discriminated Union

**Owner**: `@skillit/mcp`
**Stability**: stable across `@skillit/mcp@0.x`
**Breaking-change call-out**: yes — third-party CLI adapters that import `ParameterPlan` and read `plan.scalarType`/`plan.enum` without narrowing on `plan.type` will fail to compile under `@skillit/mcp@0.2.0`.

---

## Type shape

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

## Invariants (compile-time)

- `scalarType` exists iff `type === 'scalar'`.
- `enum` exists iff `type === 'enum'`.
- `tier === 3` iff `type === 'json'`.
- Excess-property check rejects `{ type: 'scalar', enum: [...] }` etc.

## Producer contract (`classifyParameters`)

`packages/mcp/src/adapter/classify-parameters.ts` returns `ReadonlyMap<string, ParameterPlan>`. Each plan is constructed via the appropriate arm constructor — no producer ever sets two correlated fields simultaneously.

## Consumer contract (`encodeOne` callbacks)

Each CLI adapter implements:

```ts
function encodeOne(plan: ParameterPlan): string {
  const key = plan.path.join('.');
  switch (plan.type) {
    case 'scalar':
      // plan.scalarType narrowed
      return plan.scalarType === 'string' ? `${key}=${value}` : `${key}:=${value}`; // mcpc-style typed marker
    case 'enum':
      // plan.enum narrowed
      return `${key}=<one-of-${plan.enum.join('|')}>`;
    case 'string-array':
      return `${key}:=<json-array>`;
    case 'json':
      // plan.tier === 3 narrowed
      return `--json '<JSON-payload>'`;
    default:
      const _exhaust: never = plan;
      throw new Error(`Unhandled plan.type`);
  }
}
```

## Reader sites updated

- `packages/target-mcpc/src/args.ts::encodeOne` — adapter-specific (`:=` typed marker).
- `packages/target-fastmcp/src/args.ts::encodeOne` — adapter-specific (`=` always).
- `packages/mcp/src/adapter/param-table.ts::encodePlanForTable` — Markdown table cell renderer.
- `packages/mcp/src/adapter/cli-tools-helpers.ts::planForTool` — synthesizer; constructs each arm with the appropriate fields.
- `packages/mcp/src/adapter/classify-parameters.ts` — return type.

## Migration cookbook

**Before (PR 20)** — defensive optional checks:

```ts
function encodeOne(plan: ParameterPlan): string {
  const key = plan.path.join('.');
  if (plan.tier === 3) return `--json '<...>'`;
  if (plan.type === 'scalar') {
    if (plan.scalarType === 'string') return `${key}=<value>`;
    return `${key}:=<value>`; // had to *assume* scalarType was set
  }
  // ... etc
}
```

**After (`@skillit/mcp@0.2.0`)**: see Consumer contract above. TS narrows `plan.scalarType` automatically inside `case 'scalar':`.
