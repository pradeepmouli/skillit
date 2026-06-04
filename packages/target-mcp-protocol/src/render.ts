/**
 * `McpProtocolAdapter` — default invocation adapter for MCP-native harnesses.
 *
 * Delegates body rendering to `@skillit/core`'s default path and injects the
 * `mcp:` frontmatter that tells OpenCode/Codex/Cursor how to launch the server.
 * Inherits resources/prompts reference emission from core's shared helpers.
 *
 * @module render
 */

import type {
  AdapterFingerprint,
  AdapterRenderContext,
  ExtractedSkill,
  RenderedSkill
} from '@skillit/core';
import { renderSkill } from '@skillit/core';
import type { InvocationAdapter } from '@skillit/mcp';
import { emitMcpFrontmatter, type McpLaunchCommand } from './frontmatter.js';
import { PACKAGE_VERSION } from './version.js';

/**
 * Default invocation adapter: emits SKILL.md with `mcp:` frontmatter that
 * MCP-native agent harnesses parse to launch the server over stdio or
 * connect to it over HTTP.
 *
 * Launch-shape resolution narrows on `ctx.mode` (per data-model.md §1):
 *
 * 1. **`mode: 'bundle'`** — the host bundle command flagged this skill as
 *    self-referential. Emits `command: npx` + `args: [-y, <packageName>]`
 *    (or the multi-bin `--package=<pkg> <bin>` form per FR-034).
 * 2. **`mode: 'http'`** — emits a `{ url, headers? }` shape (no shell launch).
 * 3. **`mode: 'stdio'`** — `ctx.launchCommand` is used verbatim.
 *
 * The renderer's invocation-adapter dispatch in `@skillit/core` guarantees
 * `mode` is always one of these three arms, so the previous runtime
 * `MISSING_LAUNCH_COMMAND` throw is no longer needed at the adapter level.
 * An exhaustive `default` branch is kept for compile-time exhaustiveness.
 *
 * @remarks
 * The adapter does NOT render its own body content — it calls `renderSkill`
 * with `invocation: undefined` to dispatch through core's default synchronous
 * path, then injects the structured frontmatter object via
 * `additionalFrontmatter`. This guarantees parity with non-MCP skills and means
 * future renderer features (Quick Reference enhancements, new sections) work
 * out of the box for MCP skills too.
 */
export class McpProtocolAdapter implements InvocationAdapter {
  readonly target = 'mcp-protocol' as const;
  readonly fingerprint: AdapterFingerprint;

  constructor() {
    this.fingerprint = {
      adapter: '@skillit/target-mcp-protocol',
      version: PACKAGE_VERSION
    };
  }

  /**
   * Render an `ExtractedSkill` into a `RenderedSkill` carrying `mcp:` frontmatter.
   *
   * Narrows on `ctx.mode` to pick the launch shape — see the class-level
   * docstring for the per-arm dialect.
   */
  async render(skill: ExtractedSkill, ctx: AdapterRenderContext): Promise<RenderedSkill> {
    let launchCommand: McpLaunchCommand;
    switch (ctx.mode) {
      case 'bundle':
        // Bundle mode: emit npx-by-name self-reference. When the host also
        // passes binName (multi-bin packages, FR-034), use the explicit
        // `--package=` form so npx invokes the right bin rather than the
        // package's "directories.bin" or single-bin default.
        launchCommand = ctx.binName
          ? { command: 'npx', args: ['-y', `--package=${ctx.packageName}`, ctx.binName] }
          : { command: 'npx', args: ['-y', ctx.packageName] };
        break;
      case 'http':
        // HTTP-extract mode: emit {url, headers} shape. No shell launch.
        launchCommand = ctx.httpEndpoint.headers
          ? { url: ctx.httpEndpoint.url, headers: ctx.httpEndpoint.headers }
          : { url: ctx.httpEndpoint.url };
        break;
      case 'stdio':
        launchCommand = ctx.launchCommand;
        break;
      default: {
        // Exhaustiveness: if a new arm is added to AdapterRenderContext
        // without updating this switch, TypeScript flags `_exhaustive`'s
        // type as non-`never` here.
        const _exhaustive: never = ctx;
        throw new Error(`McpProtocolAdapter.render: unknown ctx.mode (${String(_exhaustive)})`);
      }
    }

    const additionalFrontmatter = emitMcpFrontmatter(ctx.skillName, launchCommand);

    // Delegate body rendering + references emission to core's default path.
    // `invocation: undefined` dispatches the synchronous overload; `namePrefix`
    // ensures core's toSkillName() yields the same skillName the host computed.
    const baseRendered = renderSkill(skill, {
      maxTokens: ctx.maxTokens,
      additionalFrontmatter,
      invocation: undefined,
      namePrefix: ctx.skillName
    });

    return baseRendered;
  }
}
