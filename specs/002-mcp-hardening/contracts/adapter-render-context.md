# Contract — `AdapterRenderContext` Discriminated Union

**Owner**: `@skillit/mcp`
**Stability**: stable across `@skillit/mcp@0.x`
**Breaking-change call-out**: yes — third-party adapters that destructure `ctx.launchCommand` directly without checking `ctx.mode` will fail to compile under `@skillit/mcp@0.2.0`.

---

## Type shape

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

## Producer contract (renderer)

The host (`@skillit/core`'s `renderSkill`) builds `ctx` from `SkillRenderOptions` deterministically:

| `SkillRenderOptions` shape     | Produced `mode` | Throws                                                                                                                                                                                                                                           |
| ------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invocationPackageName` only   | `'bundle'`      | —                                                                                                                                                                                                                                                |
| `invocationHttpEndpoint` only  | `'http'`        | —                                                                                                                                                                                                                                                |
| `invocationLaunchCommand` only | `'stdio'`       | —                                                                                                                                                                                                                                                |
| more than one of the three     | n/a             | plain `Error` — message prefix `"AdapterRenderContext: more than one of invocationPackageName, invocationHttpEndpoint, invocationLaunchCommand was set"` (mapped to `TRANSPORT_FAILED` exit code by `@skillit/mcp`'s `bundle.ts::recordFailure`) |
| none of the three              | n/a             | plain `Error` — message prefix `"AdapterRenderContext: missing launch info — set one of invocationPackageName, invocationHttpEndpoint, invocationLaunchCommand"` (mapped to `MISSING_LAUNCH_COMMAND` by the same wrapper)                        |

**Why plain `Error`, not `McpError`**: `@skillit/core` cannot depend on `@skillit/mcp` (the dependency runs the other direction). Core throws structural `Error` with stable message prefixes; the mcp wrapper that calls `renderSkill` translates them to the right `McpError` code at the user-facing boundary.

## Consumer contract (adapter authors)

```ts
async render(skill: ExtractedSkill, ctx: AdapterRenderContext): Promise<RenderedSkill> {
  switch (ctx.mode) {
    case 'bundle':
      // ctx.packageName: string  (narrowed; not optional)
      // ctx.binName: string | undefined
      return this.renderBundle(skill, ctx.packageName, ctx.binName);
    case 'http':
      // ctx.httpEndpoint: HttpLaunchEndpoint
      return this.renderHttp(skill, ctx.httpEndpoint);
    case 'stdio':
      // ctx.launchCommand: StdioLaunchCommand
      return this.renderStdio(skill, ctx.launchCommand);
    default:
      // Exhaustiveness check — TS errors here if a 4th arm is added without updating consumer.
      const _exhaust: never = ctx;
      throw new McpError(`Unhandled adapter mode`, 'TRANSPORT_FAILED');
  }
}
```

## Negative compile-time test (SC-H002)

```ts
// adapter-render-context-types.test-d.ts
import type { AdapterRenderContext } from '@skillit/mcp';
test('rejects two-arms-set construction', () => {
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

## Migration cookbook

**Before (PR 20)**:

```ts
async render(skill, ctx) {
  if (ctx.packageName) { return this.renderBundle(skill, ctx.packageName, ctx.binName); }
  if (ctx.httpEndpoint) { return this.renderHttp(skill, ctx.httpEndpoint); }
  if (ctx.launchCommand) { return this.renderStdio(skill, ctx.launchCommand); }
  throw new McpError('no launch info', 'MISSING_LAUNCH_COMMAND');
}
```

**After (`@skillit/mcp@0.2.0`)**: see Consumer contract above. The runtime throw is removed — the renderer can never produce an invalid `ctx`.
