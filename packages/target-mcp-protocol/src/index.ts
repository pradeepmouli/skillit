/**
 * `@skillit/target-mcp-protocol` — default invocation-target adapter.
 *
 * Resolved by `@skillit/mcp`'s adapter loader when the `mcp-protocol` target
 * is requested. Emits SKILL.md with `mcp:` frontmatter that MCP-native agent
 * harnesses (OpenCode, Codex, Cursor) parse to launch the server over stdio.
 *
 * @packageDocumentation
 */

export { McpProtocolAdapter } from './render.js';
export { emitMcpFrontmatter } from './frontmatter.js';
export type {
  McpLaunchCommand,
  McpStdioLaunchCommand,
  McpHttpLaunchCommand
} from './frontmatter.js';
export { PACKAGE_VERSION } from './version.js';

import { McpProtocolAdapter } from './render.js';

const adapter = new McpProtocolAdapter();

/**
 * Default export — singleton adapter instance resolved by the adapter loader.
 *
 * @example
 * ```ts
 * import adapter from '@skillit/target-mcp-protocol';
 * await adapter.render(skill, ctx);
 * ```
 */
export default adapter;
